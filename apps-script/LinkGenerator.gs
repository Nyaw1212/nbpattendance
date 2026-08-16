const OFFICE_DIRECTORY_SHEET_ = 'OFFICE_DIRECTORY';
const OFFICE_MONITOR_TIMEZONE_ = 'Asia/Manila';
const OFFICE_SHIFT_NAMES_ = ['0000H', '0800H', '1600H'];
const OFFICE_SHIFT_TIME_HEADERS_ = ['0000H TIME', '0800H TIME', '1600H TIME'];
const OFFICE_MONITOR_HEADERS_ = [
  'UPDATED TODAY',
  'LAST UPDATED',
  'LAST UPDATE TIME',
  'LAST SHIFT'
].concat(OFFICE_SHIFT_NAMES_, OFFICE_SHIFT_TIME_HEADERS_);

function normalizeOfficeSlug_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function officeUnitKey_(camp, office) {
  const campSlug = normalizeOfficeSlug_(camp) || 'unit';
  const officeSlug = normalizeOfficeSlug_(office) || 'office';
  const random = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
  return [campSlug, officeSlug, random].join('-');
}

function getOfficeDirectorySheet_() {
  const sheet = getSpreadsheet_().getSheetByName(OFFICE_DIRECTORY_SHEET_);
  if (!sheet) throw new Error('Missing sheet: ' + OFFICE_DIRECTORY_SHEET_);
  return sheet;
}

function ensureNamedColumn_(sheet, header) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(v) {
    return String(v || '').trim();
  });
  let col = headers.indexOf(header) + 1;
  if (!col) {
    col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(header);
  }
  return col;
}

function ensureOfficeLinkColumns_(sheet) {
  return {
    unitKeyCol: ensureNamedColumn_(sheet, 'UNIT KEY'),
    webLinkCol: ensureNamedColumn_(sheet, 'WEB LINK')
  };
}

function ensureOfficeMonitorColumns_(sheet) {
  const cols = {};
  OFFICE_MONITOR_HEADERS_.forEach(function(header) {
    cols[header] = ensureNamedColumn_(sheet, header);
  });
  return cols;
}

function attendanceShiftForDate_(date) {
  const hour = Number(Utilities.formatDate(date, OFFICE_MONITOR_TIMEZONE_, 'H'));
  if (hour < 8) return '0000H';
  if (hour < 16) return '0800H';
  return '1600H';
}

function findOfficeDirectoryRow_(sheet, camp, office) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  const wantedCamp = String(camp || '').trim();
  const wantedOffice = String(office || '').trim();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === wantedCamp &&
        String(values[i][1] || '').trim() === wantedOffice) {
      return i + 2;
    }
  }
  return 0;
}

function markOfficeAttendanceUpdated_(camp, office, savedAt) {
  const sheet = getOfficeDirectorySheet_();
  const row = findOfficeDirectoryRow_(sheet, camp, office);
  if (!row) {
    console.log('Office monitoring row not found: ' + camp + ' | ' + office);
    return null;
  }

  const cols = ensureOfficeMonitorColumns_(sheet);
  const now = savedAt instanceof Date ? savedAt : new Date(savedAt || Date.now());
  const today = Utilities.formatDate(now, OFFICE_MONITOR_TIMEZONE_, 'yyyy-MM-dd');
  const time = Utilities.formatDate(now, OFFICE_MONITOR_TIMEZONE_, 'HH:mm:ss');
  const displayDateTime = Utilities.formatDate(now, OFFICE_MONITOR_TIMEZONE_, 'yyyy-MM-dd HH:mm:ss');
  const shift = attendanceShiftForDate_(now);
  const timeHeader = shift + ' TIME';

  const previousLastUpdated = String(sheet.getRange(row, cols['LAST UPDATED']).getDisplayValue() || '').trim();
  if (previousLastUpdated && previousLastUpdated !== today) {
    OFFICE_SHIFT_TIME_HEADERS_.forEach(function(header) {
      sheet.getRange(row, cols[header]).clearContent();
    });
  }

  sheet.getRange(row, cols['UPDATED TODAY']).setValue('YES');
  sheet.getRange(row, cols['LAST UPDATED']).setValue(today);
  sheet.getRange(row, cols['LAST UPDATE TIME']).setValue(time);
  sheet.getRange(row, cols['LAST SHIFT']).setValue(shift);
  sheet.getRange(row, cols[timeHeader]).setValue(time);

  refreshOfficeShiftStatusFormulas_(sheet, cols, row, row);

  console.log('Office update monitor: ' + camp + ' | ' + office + ' | ' + displayDateTime + ' | ' + shift);
  return { row: row, updatedToday: true, date: today, time: time, shift: shift };
}

function refreshOfficeShiftStatusFormulas_(sheet, cols, startRow, endRow) {
  const first = Math.max(2, Number(startRow) || 2);
  const last = Math.max(first, Number(endRow) || sheet.getLastRow());
  const count = last - first + 1;
  const activeLetter = columnLetter_(3);
  const dateLetter = columnLetter_(cols['LAST UPDATED']);

  const deadlines = {
    '0000H': 'TIME(0,30,0)',
    '0800H': 'TIME(8,30,0)',
    '1600H': 'TIME(16,30,0)'
  };

  OFFICE_SHIFT_NAMES_.forEach(function(shift) {
    const statusCol = cols[shift];
    const timeCol = cols[shift + ' TIME'];
    const timeLetter = columnLetter_(timeCol);
    const formulas = [];
    for (let row = first; row <= last; row++) {
      formulas.push([
        '=IF($' + activeLetter + row + '<>TRUE,"",IF(AND($' + dateLetter + row + '=TODAY(),$' + timeLetter + row + '<>""),"UPDATED",IF(MOD(NOW(),1)>=' + deadlines[shift] + ',"MISSING","NOT DUE")))'
      ]);
    }
    sheet.getRange(first, statusCol, count, 1).setFormulas(formulas);
  });
}

function columnLetter_(column) {
  let n = Number(column) || 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function refreshOfficeShiftDashboard() {
  const sheet = getOfficeDirectorySheet_();
  const cols = ensureOfficeMonitorColumns_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { updated: 0 };
  refreshOfficeShiftStatusFormulas_(sheet, cols, 2, lastRow);
  SpreadsheetApp.flush();
  return { updated: lastRow - 1 };
}

function refreshOfficeUpdatedTodayFlags() {
  const sheet = getOfficeDirectorySheet_();
  const cols = ensureOfficeMonitorColumns_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { updated: 0 };

  const today = Utilities.formatDate(new Date(), OFFICE_MONITOR_TIMEZONE_, 'yyyy-MM-dd');
  const dates = sheet.getRange(2, cols['LAST UPDATED'], lastRow - 1, 1).getDisplayValues();
  const output = dates.map(function(row) {
    return [String(row[0] || '').trim() === today ? 'YES' : 'NO'];
  });
  sheet.getRange(2, cols['UPDATED TODAY'], output.length, 1).setValues(output);
  refreshOfficeShiftStatusFormulas_(sheet, cols, 2, lastRow);
  SpreadsheetApp.flush();
  return { updated: output.length, today: today };
}

function getDeployedWebAppUrl_() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    throw new Error('This Apps Script project has not been deployed as a Web App yet. Deploy it first, then run the link generator again.');
  }
  return String(url).replace(/\/dev(?:\?.*)?$/, '/exec');
}

function generateSelectedOfficeLink() {
  const sheet = getOfficeDirectorySheet_();
  const row = sheet.getActiveRange().getRow();
  if (row < 2) throw new Error('Select an office row first.');
  return generateOfficeLinkForRow_(sheet, row);
}

function generateAllOfficeLinks() {
  const sheet = getOfficeDirectorySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { generated: 0 };

  let generated = 0;
  for (let row = 2; row <= lastRow; row++) {
    const camp = String(sheet.getRange(row, 1).getDisplayValue() || '').trim();
    const office = String(sheet.getRange(row, 2).getDisplayValue() || '').trim();
    const active = String(sheet.getRange(row, 3).getDisplayValue() || '').trim().toLowerCase();
    if (!camp || !office || active === 'false') continue;
    generateOfficeLinkForRow_(sheet, row);
    generated++;
  }

  clearReferenceDataCache();
  console.log('Generated office links: ' + generated);
  return { generated: generated };
}

function generateOfficeLinkForRow_(sheet, row) {
  const cols = ensureOfficeLinkColumns_(sheet);
  ensureOfficeMonitorColumns_(sheet);

  const camp = String(sheet.getRange(row, 1).getDisplayValue() || '').trim();
  const office = String(sheet.getRange(row, 2).getDisplayValue() || '').trim();
  if (!camp || !office) throw new Error('CAMP and OFFICE are required on row ' + row + '.');

  let unitKey = String(sheet.getRange(row, cols.unitKeyCol).getDisplayValue() || '').trim();
  if (!unitKey || /^(yes|no)$/i.test(unitKey)) {
    unitKey = officeUnitKey_(camp, office);
    sheet.getRange(row, cols.unitKeyCol).setValue(unitKey);
  }

  const baseUrl = getDeployedWebAppUrl_();
  const url = baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'unit=' + encodeURIComponent(unitKey);
  sheet.getRange(row, cols.webLinkCol).setValue(url);

  clearReferenceDataCache();
  SpreadsheetApp.flush();

  console.log('Office link generated: ' + camp + ' | ' + office + ' | ' + url);
  return { row: row, camp: camp, office: office, unitKey: unitKey, url: url };
}
