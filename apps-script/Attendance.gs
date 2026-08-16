const ATTENDANCE_SHEET_ = 'ATTENDANCE_BACKUP';
const ATTENDANCE_CACHE_SECONDS_ = 300;

function attendanceCacheKey_(camp, office, weekStart, weekEnd) {
  const raw = [String(camp), String(office), String(weekStart), String(weekEnd)].join('|');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return 'attendance:' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function getAttendanceCache_() {
  return CacheService.getScriptCache();
}

function invalidateAttendanceCache_(camp, office, weekStart, weekEnd) {
  getAttendanceCache_().remove(attendanceCacheKey_(camp, office, weekStart, weekEnd));
}

function ensureAttendanceSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(ATTENDANCE_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(ATTENDANCE_SHEET_);
    sheet.getRange(1, 1, 1, 8).setValues([[
      'TRANSACTION ID',
      'SAVED AT',
      'CAMP',
      'OFFICE',
      'DATE FROM',
      'DATE TO',
      'ENTRY COUNT',
      'JSON BACKUP'
    ]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function normalizeAttendanceEntries_(rawEntries) {
  const deduped = {};
  (Array.isArray(rawEntries) ? rawEntries : []).forEach(function(raw) {
    if (!Array.isArray(raw) || raw.length < 3) return;
    const employeeKey = String(raw[0] || '').trim();
    const date = String(raw[1] || '').trim();
    const status = String(raw[2] || '').trim();
    const leaveType = raw[3] == null || raw[3] === '' ? null : String(raw[3]);
    if (!employeeKey || !date || !status) return;
    deduped[employeeKey + '|' + date] = [employeeKey, date, status, leaveType];
  });
  return Object.keys(deduped).sort().map(function(k) { return deduped[k]; });
}

function entriesToRecords_(entries) {
  return (entries || []).map(function(e) {
    return {
      employee_key: String(e[0]),
      attendance_date: String(e[1]),
      status: String(e[2]),
      leave_type: e[3] == null || e[3] === '' ? null : String(e[3])
    };
  });
}

function recordsToCompactJson_(records) {
  return JSON.stringify((records || []).map(function(r) {
    return [r.employee_key, r.attendance_date, r.status, r.leave_type == null ? null : r.leave_type];
  }));
}

function compactJsonToRecords_(json) {
  return entriesToRecords_(JSON.parse(json));
}

function putAttendanceCache_(cacheKey, records) {
  try {
    const json = recordsToCompactJson_(records);
    // CacheService value limit is finite; compact arrays keep this well below it.
    if (Utilities.newBlob(json).getBytes().length >= 95000) return false;
    const cache = getAttendanceCache_();
    cache.put(cacheKey, json, ATTENDANCE_CACHE_SECONDS_);
    return !!cache.get(cacheKey); // verify the write instead of assuming it worked
  } catch (err) {
    console.log('Attendance cache write skipped: ' + err.message);
    return false;
  }
}

function getAttendanceCacheRecords_(cacheKey) {
  const cached = getAttendanceCache_().get(cacheKey);
  if (!cached) return null;
  try {
    return compactJsonToRecords_(cached);
  } catch (err) {
    getAttendanceCache_().remove(cacheKey);
    return null;
  }
}

function appendAttendanceBackup_(entries, camp, office, weekStart, weekEnd) {
  const transactionId = Utilities.getUuid();
  const savedAt = new Date().toISOString();
  const backup = {
    v: 1,
    transactionId: transactionId,
    savedAt: savedAt,
    camp: String(camp),
    office: String(office),
    dateFrom: String(weekStart),
    dateTo: String(weekEnd),
    entries: entries
  };

  const json = JSON.stringify(backup);
  if (json.length > 49000) {
    throw new Error('Attendance transaction is too large for one Google Sheets cell (' + json.length + ' characters).');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureAttendanceSheet_();
    sheet.appendRow([
      transactionId,
      savedAt,
      String(camp),
      String(office),
      String(weekStart),
      String(weekEnd),
      entries.length,
      json
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return { transactionId: transactionId, savedAt: savedAt, jsonCharacters: json.length };
}

function loadAttendanceBackup_(camp, office, weekStart, weekEnd) {
  const sheet = ensureAttendanceSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  // Read newest first in moderate blocks so we usually find the matching week quickly.
  const blockSize = 200;
  for (let end = lastRow; end >= 2; end -= blockSize) {
    const start = Math.max(2, end - blockSize + 1);
    const values = sheet.getRange(start, 1, end - start + 1, 8).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      const row = values[i];
      if (String(row[2]) !== String(camp) ||
          String(row[3]) !== String(office) ||
          String(row[4]) !== String(weekStart) ||
          String(row[5]) !== String(weekEnd)) continue;
      try {
        const backup = JSON.parse(String(row[7] || ''));
        if (!backup || !Array.isArray(backup.entries)) continue;
        return {
          transactionId: backup.transactionId || String(row[0] || ''),
          savedAt: backup.savedAt || String(row[1] || ''),
          records: entriesToRecords_(backup.entries)
        };
      } catch (ignore) {}
    }
  }
  return null;
}

function saveAttendanceWeek(payload) {
  if (!payload || !payload.camp || !payload.office || !payload.weekStart || !payload.weekEnd) {
    throw new Error('Camp, office, weekStart, and weekEnd are required.');
  }

  const entries = normalizeAttendanceEntries_(payload.entries);
  if (!entries.length) throw new Error('No valid attendance entries supplied.');

  const neonSaved = saveNeonAttendance_(entries, payload.camp, payload.office);
  invalidateAttendanceCache_(payload.camp, payload.office, payload.weekStart, payload.weekEnd);

  let backup;
  try {
    backup = appendAttendanceBackup_(entries, payload.camp, payload.office, payload.weekStart, payload.weekEnd);
  } catch (backupError) {
    return {
      ok: true,
      saved: neonSaved,
      source: 'neon',
      backupOk: false,
      backupWarning: backupError && backupError.message ? backupError.message : String(backupError)
    };
  }

  // Prime L1 cache immediately with the exact data just persisted to Neon.
  const cacheKey = attendanceCacheKey_(payload.camp, payload.office, payload.weekStart, payload.weekEnd);
  putAttendanceCache_(cacheKey, entriesToRecords_(entries));

  return {
    ok: true,
    saved: neonSaved,
    source: 'neon',
    backupOk: true,
    transactionId: backup.transactionId,
    savedAt: backup.savedAt,
    jsonCharacters: backup.jsonCharacters
  };
}

function loadAttendanceWeek(payload) {
  if (!payload || !payload.camp || !payload.office || !payload.weekStart || !payload.weekEnd) {
    throw new Error('Camp, office, weekStart, and weekEnd are required.');
  }

  const cacheKey = attendanceCacheKey_(payload.camp, payload.office, payload.weekStart, payload.weekEnd);

  // L1: volatile Apps Script cache — fastest path.
  const cachedRecords = getAttendanceCacheRecords_(cacheKey);
  if (cachedRecords) {
    return { ok: true, source: 'cache', records: cachedRecords, count: cachedRecords.length };
  }

  // L2: persistent transaction backup in Sheets — much faster than opening JDBC.
  const backup = loadAttendanceBackup_(payload.camp, payload.office, payload.weekStart, payload.weekEnd);
  if (backup && backup.records && backup.records.length) {
    putAttendanceCache_(cacheKey, backup.records);
    return {
      ok: true,
      source: 'sheet-cache',
      transactionId: backup.transactionId,
      records: backup.records,
      count: backup.records.length
    };
  }

  // L3: Neon is authoritative when no warm copy exists.
  const records = loadNeonAttendance_(payload.camp, payload.office, payload.weekStart, payload.weekEnd);
  putAttendanceCache_(cacheKey, records);

  return { ok: true, source: 'neon', records: records, count: records.length };
}
