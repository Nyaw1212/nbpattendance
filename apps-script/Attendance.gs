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

function saveAttendanceWeek(payload) {
  if (!payload || !payload.camp || !payload.office || !payload.weekStart || !payload.weekEnd) {
    throw new Error('Camp, office, weekStart, and weekEnd are required.');
  }

  const entries = normalizeAttendanceEntries_(payload.entries);
  if (!entries.length) throw new Error('No valid attendance entries supplied.');

  // Neon is the primary attendance store. Do not create a successful backup-only
  // transaction if the primary database write fails.
  const neonSaved = saveNeonAttendance_(entries, payload.camp, payload.office);

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

  const records = loadNeonAttendance_(payload.camp, payload.office, payload.weekStart, payload.weekEnd);
  return {
    ok: true,
    source: 'neon',
    records: records,
    count: records.length
  };
}
