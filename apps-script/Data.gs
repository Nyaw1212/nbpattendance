function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('GOOGLE_SHEET_ID');
  if (!id) throw new Error('Set GOOGLE_SHEET_ID in Apps Script Script Properties.');
  return SpreadsheetApp.openById(id);
}

function getReferenceData_(perf) {
  perf = perf || {};
  const totalStarted = Date.now();
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

  perf.referenceTotalMs = Date.now() - totalStarted;
  return { personnel: personnel, offices: offices, leaveTypes: leaveTypes };
}

function resolveUnit_(unitKey, offices) {
  const key = String(unitKey || '').trim().toLowerCase();
  if (!key) return null;
  return offices.find(function(item) {
    return String(item.unitKey || '').trim().toLowerCase() === key;
  }) || null;
}
