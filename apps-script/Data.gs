function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('GOOGLE_SHEET_ID');
  if (!id) throw new Error('Set GOOGLE_SHEET_ID in Apps Script Script Properties.');
  return SpreadsheetApp.openById(id);
}

function getReferenceData_() {
  const ss = getSpreadsheet_();
  const list = ss.getSheetByName('LIST');
  const directory = ss.getSheetByName('OFFICE_DIRECTORY');
  const leaveSheet = ss.getSheetByName('LEAVE_TYPE');
  if (!list || !directory || !leaveSheet) throw new Error('Required sheets: LIST, OFFICE_DIRECTORY, LEAVE_TYPE.');

  const listValues = list.getDataRange().getDisplayValues();
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

  const officeValues = directory.getDataRange().getDisplayValues();
  const offices = officeValues.slice(1)
    .filter(function(row) { return row[0] && row[1] && String(row[2]).toLowerCase() !== 'false'; })
    .map(function(row) {
      return { camp: String(row[0]).trim(), office: String(row[1]).trim(), sortOrder: Number(row[3] || 0), unitKey: String(row[4] || '').trim() };
    });

  const leaveTypes = leaveSheet.getDataRange().getDisplayValues().slice(1)
    .map(function(row) { return String(row[0] || '').trim(); })
    .filter(Boolean);

  return { personnel: personnel, offices: offices, leaveTypes: leaveTypes };
}

function resolveUnit_(unitKey, offices) {
  const key = String(unitKey || '').trim().toLowerCase();
  if (!key) return null;
  return offices.find(function(item) {
    return String(item.unitKey || '').trim().toLowerCase() === key;
  }) || null;
}
