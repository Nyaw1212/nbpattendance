const REFERENCE_CACHE_SECONDS_ = 3600;
const REFERENCE_CACHE_PREFIX_ = 'reference:v1:';
const REFERENCE_PERSONNEL_CHUNK_SIZE_ = 250;

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('GOOGLE_SHEET_ID');
  if (!id) throw new Error('Set GOOGLE_SHEET_ID in Apps Script Script Properties.');
  return SpreadsheetApp.openById(id);
}

function getReferenceCache_() {
  return CacheService.getScriptCache();
}

function clearReferenceDataCache() {
  const cache = getReferenceCache_();
  const manifestText = cache.get(REFERENCE_CACHE_PREFIX_ + 'manifest');
  if (manifestText) {
    try {
      const manifest = JSON.parse(manifestText);
      const keys = [
        REFERENCE_CACHE_PREFIX_ + 'manifest',
        REFERENCE_CACHE_PREFIX_ + 'offices',
        REFERENCE_CACHE_PREFIX_ + 'leaveTypes'
      ];
      for (let i = 0; i < Number(manifest.personnelChunks || 0); i++) {
        keys.push(REFERENCE_CACHE_PREFIX_ + 'personnel:' + i);
      }
      cache.removeAll(keys);
    } catch (ignore) {
      cache.remove(REFERENCE_CACHE_PREFIX_ + 'manifest');
    }
  } else {
    cache.remove(REFERENCE_CACHE_PREFIX_ + 'manifest');
  }
  console.log('Reference cache cleared.');
  return true;
}

function readReferenceDataCache_(perf) {
  const cache = getReferenceCache_();
  const started = Date.now();
  const manifestText = cache.get(REFERENCE_CACHE_PREFIX_ + 'manifest');
  perf.referenceCacheLookupMs = Date.now() - started;
  if (!manifestText) {
    perf.referenceCacheHit = false;
    return null;
  }

  try {
    const manifest = JSON.parse(manifestText);
    const keys = [REFERENCE_CACHE_PREFIX_ + 'offices', REFERENCE_CACHE_PREFIX_ + 'leaveTypes'];
    for (let i = 0; i < manifest.personnelChunks; i++) {
      keys.push(REFERENCE_CACHE_PREFIX_ + 'personnel:' + i);
    }

    const values = cache.getAll(keys);
    if (!values[REFERENCE_CACHE_PREFIX_ + 'offices'] || !values[REFERENCE_CACHE_PREFIX_ + 'leaveTypes']) {
      perf.referenceCacheHit = false;
      return null;
    }

    const personnel = [];
    for (let i = 0; i < manifest.personnelChunks; i++) {
      const k = REFERENCE_CACHE_PREFIX_ + 'personnel:' + i;
      if (!values[k]) {
        perf.referenceCacheHit = false;
        return null;
      }
      Array.prototype.push.apply(personnel, JSON.parse(values[k]));
    }

    const offices = JSON.parse(values[REFERENCE_CACHE_PREFIX_ + 'offices']);
    const leaveTypes = JSON.parse(values[REFERENCE_CACHE_PREFIX_ + 'leaveTypes']);
    perf.referenceCacheHit = true;
    perf.referenceCacheReadMs = Date.now() - started;
    perf.personnelCount = personnel.length;
    perf.officeCount = offices.length;
    perf.leaveTypeCount = leaveTypes.length;
    console.log('Reference cache hit: personnel=' + personnel.length + ', offices=' + offices.length + ', leaveTypes=' + leaveTypes.length);
    return { personnel: personnel, offices: offices, leaveTypes: leaveTypes };
  } catch (err) {
    perf.referenceCacheHit = false;
    console.log('Reference cache read failed: ' + err.message);
    return null;
  }
}

function writeReferenceDataCache_(data, perf) {
  const cache = getReferenceCache_();
  const started = Date.now();
  try {
    const chunks = [];
    for (let i = 0; i < data.personnel.length; i += REFERENCE_PERSONNEL_CHUNK_SIZE_) {
      chunks.push(data.personnel.slice(i, i + REFERENCE_PERSONNEL_CHUNK_SIZE_));
    }

    const values = {};
    values[REFERENCE_CACHE_PREFIX_ + 'offices'] = JSON.stringify(data.offices);
    values[REFERENCE_CACHE_PREFIX_ + 'leaveTypes'] = JSON.stringify(data.leaveTypes);
    chunks.forEach(function(chunk, i) {
      values[REFERENCE_CACHE_PREFIX_ + 'personnel:' + i] = JSON.stringify(chunk);
    });

    cache.putAll(values, REFERENCE_CACHE_SECONDS_);
    cache.put(REFERENCE_CACHE_PREFIX_ + 'manifest', JSON.stringify({
      v: 1,
      personnelChunks: chunks.length,
      personnelCount: data.personnel.length,
      createdAt: new Date().toISOString()
    }), REFERENCE_CACHE_SECONDS_);

    perf.referenceCacheWriteMs = Date.now() - started;
    perf.referenceCacheChunks = chunks.length;
    console.log('Reference cache write: chunks=' + chunks.length + ', ms=' + perf.referenceCacheWriteMs);
    return true;
  } catch (err) {
    perf.referenceCacheWriteMs = Date.now() - started;
    console.log('Reference cache write skipped: ' + err.message);
    return false;
  }
}

function getReferenceData_(perf) {
  perf = perf || {};
  const totalStarted = Date.now();

  const cached = readReferenceDataCache_(perf);
  if (cached) {
    perf.referenceSource = 'cache';
    perf.referenceTotalMs = Date.now() - totalStarted;
    return cached;
  }

  perf.referenceSource = 'sheets';
  let t = Date.now();

  const ss = getSpreadsheet_();
  perf.spreadsheetOpenMs = Date.now() - t;

  t = Date.now();
  const list = ss.getSheetByName('LIST');
  const directory = ss.getSheetByName('OFFICE_DIRECTORY');
  const leaveSheet = ss.getSheetByName('LEAVE_TYPE');
  perf.sheetLookupMs = Date.now() - t;

  if (!list || !directory || !leaveSheet) throw new Error('Required sheets: LIST, OFFICE_DIRECTORY, LEAVE_TYPE.');

  t = Date.now();
  const listValues = list.getDataRange().getDisplayValues();
  perf.listReadMs = Date.now() - t;
  perf.listRows = listValues.length;
  perf.listColumns = listValues[0] ? listValues[0].length : 0;

  t = Date.now();
  const headers = (listValues[0] || []).map(String);
  const ix = function(name) { return headers.indexOf(name); };
  const personnel = listValues.slice(1)
    .filter(function(row) { return row[ix('BADGE NUMBER')]; })
    .map(function(row) {
      const badgeNumber = String(row[ix('BADGE NUMBER')] || '').trim();
      const fullName = [row[ix('RANK')], row[ix('FIRST NAME')], row[ix('MIDDLE NAME')], row[ix('LAST NAME')], row[ix('SUFFIX')]]
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      return {
        recordId: badgeNumber,
        badgeNumber: badgeNumber,
        rank: String(row[ix('RANK')] || '').trim(),
        fullName: fullName,
        camp: String(row[ix('CAMP')] || '').trim(),
        office: String(row[ix('OFFICE')] || '').trim(),
        gender: String(row[ix('GENDER')] || '').trim(),
        classification: String(row[ix('CLASSIFICATION')] || '').trim(),
        personnelType: String(row[ix('TYPE')] || '').trim()
      };
    });
  perf.personnelBuildMs = Date.now() - t;
  perf.personnelCount = personnel.length;

  t = Date.now();
  const officeValues = directory.getDataRange().getDisplayValues();
  perf.officeReadMs = Date.now() - t;
  perf.officeRows = officeValues.length;

  t = Date.now();
  const offices = officeValues.slice(1)
    .filter(function(row) { return row[0] && row[1] && String(row[2]).toLowerCase() !== 'false'; })
    .map(function(row) {
      return { camp: String(row[0]).trim(), office: String(row[1]).trim(), sortOrder: Number(row[3] || 0), unitKey: String(row[4] || '').trim() };
    });
  perf.officeBuildMs = Date.now() - t;
  perf.officeCount = offices.length;

  t = Date.now();
  const leaveValues = leaveSheet.getDataRange().getDisplayValues();
  perf.leaveReadMs = Date.now() - t;
  perf.leaveRows = leaveValues.length;

  t = Date.now();
  const leaveTypes = leaveValues.slice(1)
    .map(function(row) { return String(row[0] || '').trim(); })
    .filter(Boolean);
  perf.leaveBuildMs = Date.now() - t;
  perf.leaveTypeCount = leaveTypes.length;

  const data = { personnel: personnel, offices: offices, leaveTypes: leaveTypes };
  writeReferenceDataCache_(data, perf);
  perf.referenceTotalMs = Date.now() - totalStarted;
  return data;
}

function resolveUnit_(unitKey, offices) {
  const key = String(unitKey || '').trim().toLowerCase();
  if (!key) return null;
  return offices.find(function(item) {
    return String(item.unitKey || '').trim().toLowerCase() === key;
  }) || null;
}
