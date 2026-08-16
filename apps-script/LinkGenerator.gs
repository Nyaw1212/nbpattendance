const OFFICE_DIRECTORY_SHEET_ = 'OFFICE_DIRECTORY';

function officeUnitKey_(camp, office) {
  const raw = (String(camp || '') + '-' + String(office || ''))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return raw || Utilities.getUuid().slice(0, 8);
}

function getOfficeDirectorySheet_() {
  const sheet = getSpreadsheet_().getSheetByName(OFFICE_DIRECTORY_SHEET_);
  if (!sheet) throw new Error('Missing sheet: ' + OFFICE_DIRECTORY_SHEET_);
  return sheet;
}

function ensureOfficeLinkColumns_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 6);
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(v) {
    return String(v || '').trim();
  });

  let unitKeyCol = headers.indexOf('UNIT KEY') + 1;
  if (!unitKeyCol) unitKeyCol = 5;

  let webLinkCol = headers.indexOf('WEB LINK') + 1;
  if (!webLinkCol) {
    webLinkCol = Math.max(width, unitKeyCol + 1);
    sheet.getRange(1, webLinkCol).setValue('WEB LINK');
  }

  if (!headers[unitKeyCol - 1]) sheet.getRange(1, unitKeyCol).setValue('UNIT KEY');
  return { unitKeyCol: unitKeyCol, webLinkCol: webLinkCol };
}

function getDeployedWebAppUrl_() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    throw new Error('This Apps Script project has not been deployed as a Web App yet. Deploy it first, then run the link generator again.');
  }
  return url;
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
  const camp = String(sheet.getRange(row, 1).getDisplayValue() || '').trim();
  const office = String(sheet.getRange(row, 2).getDisplayValue() || '').trim();

  if (!camp || !office) throw new Error('CAMP and OFFICE are required on row ' + row + '.');

  let unitKey = String(sheet.getRange(row, cols.unitKeyCol).getDisplayValue() || '').trim();
  if (!unitKey) {
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
