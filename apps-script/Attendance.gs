const ATTENDANCE_SHEET_ = 'ATTENDANCE_BACKUP';

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

function saveAttendanceWeek(payload) {
  if (!payload || !payload.camp || !payload.office || !payload.weekStart || !payload.weekEnd) {
    throw new Error('Camp, office, weekStart, and weekEnd are required.');
  }

  const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!rawEntries.length) throw new Error('No attendance entries supplied.');

  const deduped = {};
  rawEntries.forEach(function(raw) {
    if (!Array.isArray(raw) || raw.length < 3) return;
    const employeeKey = String(raw[0] || '').trim();
    const date = String(raw[1] || '').trim();
    const status = String(raw[2] || '').trim();
    const leaveType = raw[3] == null || raw[3] === '' ? null : String(raw[3]);
    if (!employeeKey || !date || !status) return;
    deduped[employeeKey + '|' + date] = [employeeKey, date, status, leaveType];
  });

  const entries = Object.keys(deduped).sort().map(function(k) { return deduped[k]; });
  if (!entries.length) throw new Error('No valid attendance entries supplied.');

  const transactionId = Utilities.getUuid();
  const savedAt = new Date().toISOString();
  const backup = {
    v: 1,
    transactionId: transactionId,
    savedAt: savedAt,
    camp: String(payload.camp),
    office: String(payload.office),
    dateFrom: String(payload.weekStart),
    dateTo: String(payload.weekEnd),
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
      String(payload.camp),
      String(payload.office),
      String(payload.weekStart),
      String(payload.weekEnd),
      entries.length,
      json
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    transactionId: transactionId,
    savedAt: savedAt,
    saved: entries.length,
    jsonCharacters: json.length
  };
}
