const MOVEMENT_SCHEMA_ = 'nbp_attendance';
const MOVEMENT_TABLE_ = 'personnel_movements';
const MOVEMENT_HISTORY_SHEET_ = 'OFFICE_MOVEMENT';

function setupMovementTable() {
  let conn, stmt;
  try {
    conn = getNeonConnection_();
    stmt = conn.createStatement();
    stmt.execute([
      'CREATE TABLE IF NOT EXISTS ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ + ' (',
      'movement_id text PRIMARY KEY,',
      'employee_key text NOT NULL,',
      'full_name_snapshot text NOT NULL,',
      'from_camp text NOT NULL,',
      'from_office text NOT NULL,',
      'to_camp text NOT NULL,',
      'to_office text NOT NULL,',
      'position_snapshot text,',
      'admin_order_no text NOT NULL,',
      'admin_order_date date,',
      'effective_date date NOT NULL,',
      'remarks text,',
      "status text NOT NULL DEFAULT 'PENDING_RECEIPT',",
      'created_by text,',
      'created_at timestamptz NOT NULL DEFAULT now(),',
      'received_by text,',
      'received_at timestamptz,',
      "CONSTRAINT personnel_movements_status_check CHECK (status IN ('PENDING_RECEIPT','COMPLETED','CANCELLED'))",
      ');'
    ].join(' '));
    try { stmt.execute('ALTER TABLE ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ + ' ADD COLUMN IF NOT EXISTS position_snapshot text'); } catch (ignore) {}
    stmt.execute('CREATE INDEX IF NOT EXISTS idx_personnel_movements_status ON ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ + ' (status, effective_date DESC)');
    stmt.execute('CREATE INDEX IF NOT EXISTS idx_personnel_movements_employee ON ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ + ' (employee_key, created_at DESC)');
    return { ok: true, table: MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ };
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function getMovementBootstrap() {
  const refs = getMovementReferenceData_();
  return { personnel: refs.personnel, offices: refs.offices, pending: listPendingMovements_() };
}

function getPendingMovementCount() {
  let conn, stmt, rs;
  try {
    conn = getNeonConnection_();
    stmt = conn.prepareStatement('SELECT COUNT(*) FROM ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ + " WHERE status = 'PENDING_RECEIPT'");
    rs = stmt.executeQuery();
    return rs.next() ? Number(rs.getInt(1) || 0) : 0;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function getMovementReferenceData_() {
  const ss = getSpreadsheet_();
  const list = ss.getSheetByName('LIST');
  const directory = ss.getSheetByName('OFFICE_DIRECTORY');
  if (!list || !directory) throw new Error('Movement Center requires LIST and OFFICE_DIRECTORY sheets.');

  const values = list.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(function(x){ return String(x).trim(); });
  const ix = function(name){ return headers.indexOf(name); };
  const required = ['BADGE NUMBER','RANK','LAST NAME','FIRST NAME','MIDDLE NAME','SUFFIX','CAMP','OFFICE'];
  required.forEach(function(name){ if (ix(name) < 0) throw new Error('LIST is missing required column: ' + name); });

  const personnel = values.slice(1).filter(function(row){ return String(row[ix('BADGE NUMBER')] || '').trim(); }).map(function(row){
    const fullName = [row[ix('RANK')],row[ix('FIRST NAME')],row[ix('MIDDLE NAME')],row[ix('LAST NAME')],row[ix('SUFFIX')]].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    return {
      recordId: ix('RECORD ID') >= 0 ? String(row[ix('RECORD ID')] || '').trim() : '',
      badgeNumber: String(row[ix('BADGE NUMBER')] || '').trim(),
      rank: String(row[ix('RANK')] || '').trim(),
      fullName: fullName,
      camp: String(row[ix('CAMP')] || '').trim(),
      office: String(row[ix('OFFICE')] || '').trim(),
      position: ix('POSITION / DESIGNATION') >= 0 ? String(row[ix('POSITION / DESIGNATION')] || '').trim() : ''
    };
  });

  const officeValues = directory.getDataRange().getDisplayValues();
  const oh = (officeValues[0] || []).map(function(x){ return String(x).trim(); });
  const campIx = oh.indexOf('CAMP'), officeIx = oh.indexOf('OFFICE'), activeIx = oh.indexOf('ACTIVE'), sortIx = oh.indexOf('SORT ORDER');
  if (campIx < 0 || officeIx < 0) throw new Error('OFFICE_DIRECTORY requires CAMP and OFFICE columns.');
  const offices = officeValues.slice(1).filter(function(row){
    const camp = String(row[campIx] || '').trim(), office = String(row[officeIx] || '').trim();
    const active = activeIx < 0 ? true : !['FALSE','NO','0','INACTIVE'].includes(String(row[activeIx] || '').trim().toUpperCase());
    return camp && office && active;
  }).map(function(row){
    return { camp:String(row[campIx] || '').trim(), office:String(row[officeIx] || '').trim(), sortOrder:sortIx >= 0 ? Number(row[sortIx] || 0) : 0 };
  });
  return { personnel: personnel, offices: offices };
}

function createPersonnelMovement(payload) {
  payload = payload || {};
  const employeeKey = String(payload.employeeKey || '').trim();
  const toCamp = String(payload.toCamp || '').trim();
  const toOffice = String(payload.toOffice || '').trim();
  const position = String(payload.position || '').trim();
  const adminOrderNo = String(payload.adminOrderNo || '').trim();
  const adminOrderDate = String(payload.adminOrderDate || '').trim();
  const effectiveDate = String(payload.effectiveDate || '').trim();
  const remarks = String(payload.remarks || '').trim();
  if (!employeeKey || !toCamp || !toOffice || !adminOrderNo || !effectiveDate) throw new Error('Personnel, destination, Admin Order No., and effective date are required.');

  const refs = getMovementReferenceData_();
  const person = refs.personnel.find(function(p) { return String(p.badgeNumber) === employeeKey; });
  if (!person) throw new Error('Personnel record was not found.');
  if (person.camp === toCamp && person.office === toOffice) throw new Error('Destination is the same as the current assignment.');
  if (!refs.offices.some(function(o) { return o.camp === toCamp && o.office === toOffice; })) throw new Error('Destination office is not valid or active.');
  if (hasPendingMovement_(employeeKey)) throw new Error('This personnel already has a pending movement awaiting receipt.');

  const movementId = Utilities.getUuid();
  let conn, stmt;
  try {
    conn = getNeonConnection_();
    stmt = conn.prepareStatement([
      'INSERT INTO ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_,
      '(movement_id, employee_key, full_name_snapshot, from_camp, from_office, to_camp, to_office, position_snapshot, admin_order_no, admin_order_date, effective_date, remarks, status, created_by)',
      "VALUES (?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''), ?, NULLIF(?, '')::date, ?::date, NULLIF(?, ''), 'PENDING_RECEIPT', ?)"
    ].join(' '));
    const vals = [movementId, employeeKey, person.fullName, person.camp, person.office, toCamp, toOffice, position || person.position, adminOrderNo, adminOrderDate, effectiveDate, remarks, getMovementUserEmail_()];
    vals.forEach(function(v, i) { stmt.setString(i + 1, String(v == null ? '' : v)); });
    stmt.executeUpdate();
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
  return { ok:true, movementId:movementId, status:'PENDING_RECEIPT', person:person.fullName, from:person.camp+' / '+person.office, to:toCamp+' / '+toOffice };
}

function receivePersonnelMovement(movementId) {
  movementId = String(movementId || '').trim();
  if (!movementId) throw new Error('Movement ID is required.');
  const movement = getMovementById_(movementId);
  if (!movement) throw new Error('Movement record was not found.');
  if (movement.status === 'COMPLETED') return { ok:true, alreadyCompleted:true, movement:movement };
  if (movement.status !== 'PENDING_RECEIPT') throw new Error('Only pending movements can be received.');

  const current = getPersonnelAssignmentFromSheet_(movement.employeeKey);
  if (!current) throw new Error('Personnel could not be found in LIST.');
  const alreadyAtDestination = current.camp === movement.toCamp && current.office === movement.toOffice;
  const stillAtOrigin = current.camp === movement.fromCamp && current.office === movement.fromOffice;
  if (!alreadyAtDestination && !stillAtOrigin) throw new Error('Assignment conflict: LIST currently shows ' + current.camp + ' / ' + current.office + '.');

  if (stillAtOrigin) updatePersonnelAssignmentInSheet_(movement.employeeKey, movement.toCamp, movement.toOffice, movement.position);
  appendOfficeMovementHistory_(movement, current.recordId);
  completeMovement_(movementId, getMovementUserEmail_());
  clearReferenceDataCache();
  return { ok:true, movementId:movementId, status:'COMPLETED', person:movement.fullName, assignment:movement.toCamp+' / '+movement.toOffice };
}

function appendOfficeMovementHistory_(movement, recordId) {
  const sheet = getSpreadsheet_().getSheetByName(MOVEMENT_HISTORY_SHEET_);
  if (!sheet) throw new Error(MOVEMENT_HISTORY_SHEET_ + ' sheet was not found.');
  const adminText = 'Admin Order: ' + movement.adminOrderNo + (movement.adminOrderDate ? ' dated ' + movement.adminOrderDate : '');
  const remarks = [adminText, movement.remarks].filter(Boolean).join(' | ');
  sheet.appendRow([recordId || '', movement.employeeKey, movement.fromOffice, movement.toOffice, movement.position || '', movement.effectiveDate, '', remarks]);
}

function listPendingMovements() { return listPendingMovements_(); }

function listPendingMovements_() {
  let conn, stmt, rs;
  const out = [];
  try {
    conn = getNeonConnection_();
    stmt = conn.prepareStatement([
      'SELECT movement_id, employee_key, full_name_snapshot, from_camp, from_office, to_camp, to_office,',
      "COALESCE(position_snapshot, ''), admin_order_no, COALESCE(admin_order_date::text, ''), effective_date::text, COALESCE(remarks, ''), status,",
      "COALESCE(created_by, ''), created_at::text",
      'FROM ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_,
      "WHERE status = 'PENDING_RECEIPT'",
      'ORDER BY effective_date ASC, created_at ASC'
    ].join(' '));
    rs = stmt.executeQuery();
    while (rs.next()) out.push(movementRowToObject_(rs));
    return out;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function hasPendingMovement_(employeeKey) {
  let conn, stmt, rs;
  try {
    conn = getNeonConnection_();
    stmt = conn.prepareStatement('SELECT 1 FROM ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ + " WHERE employee_key = ? AND status = 'PENDING_RECEIPT' LIMIT 1");
    stmt.setString(1, employeeKey);
    rs = stmt.executeQuery();
    return rs.next();
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function getMovementById_(movementId) {
  let conn, stmt, rs;
  try {
    conn = getNeonConnection_();
    stmt = conn.prepareStatement([
      'SELECT movement_id, employee_key, full_name_snapshot, from_camp, from_office, to_camp, to_office,',
      "COALESCE(position_snapshot, ''), admin_order_no, COALESCE(admin_order_date::text, ''), effective_date::text, COALESCE(remarks, ''), status,",
      "COALESCE(created_by, ''), created_at::text",
      'FROM ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_,
      'WHERE movement_id = ?'
    ].join(' '));
    stmt.setString(1, movementId);
    rs = stmt.executeQuery();
    return rs.next() ? movementRowToObject_(rs) : null;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function movementRowToObject_(rs) {
  return {
    movementId:String(rs.getString(1)), employeeKey:String(rs.getString(2)), fullName:String(rs.getString(3)),
    fromCamp:String(rs.getString(4)), fromOffice:String(rs.getString(5)), toCamp:String(rs.getString(6)), toOffice:String(rs.getString(7)),
    position:String(rs.getString(8)||''), adminOrderNo:String(rs.getString(9)), adminOrderDate:String(rs.getString(10)||''),
    effectiveDate:String(rs.getString(11)), remarks:String(rs.getString(12)||''), status:String(rs.getString(13)),
    createdBy:String(rs.getString(14)||''), createdAt:String(rs.getString(15)||'')
  };
}

function completeMovement_(movementId, receivedBy) {
  let conn, stmt;
  try {
    conn = getNeonConnection_();
    stmt = conn.prepareStatement('UPDATE ' + MOVEMENT_SCHEMA_ + '.' + MOVEMENT_TABLE_ + " SET status='COMPLETED', received_by=?, received_at=now() WHERE movement_id=? AND status='PENDING_RECEIPT'");
    stmt.setString(1, String(receivedBy || ''));
    stmt.setString(2, movementId);
    const changed = stmt.executeUpdate();
    if (!changed) throw new Error('Movement could not be completed.');
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function getPersonnelAssignmentFromSheet_(employeeKey) {
  const sheet = getSpreadsheet_().getSheetByName('LIST');
  if (!sheet) throw new Error('LIST sheet was not found.');
  const values = sheet.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(function(x){ return String(x).trim(); });
  const badgeCol = headers.indexOf('BADGE NUMBER'), campCol = headers.indexOf('CAMP'), officeCol = headers.indexOf('OFFICE');
  const recordCol = headers.indexOf('RECORD ID'), positionCol = headers.indexOf('POSITION / DESIGNATION');
  if (badgeCol < 0 || campCol < 0 || officeCol < 0) throw new Error('LIST requires BADGE NUMBER, CAMP, and OFFICE columns.');
  for (let i=1;i<values.length;i++) {
    if (String(values[i][badgeCol]).trim() === employeeKey) return {
      row:i+1, recordId:recordCol>=0?String(values[i][recordCol]||'').trim():'', camp:String(values[i][campCol]).trim(), office:String(values[i][officeCol]).trim(),
      position:positionCol>=0?String(values[i][positionCol]||'').trim():'', campCol:campCol+1, officeCol:officeCol+1, positionCol:positionCol>=0?positionCol+1:0
    };
  }
  return null;
}

function updatePersonnelAssignmentInSheet_(employeeKey, camp, office, position) {
  const sheet = getSpreadsheet_().getSheetByName('LIST');
  const current = getPersonnelAssignmentFromSheet_(employeeKey);
  if (!current) throw new Error('Personnel could not be found in LIST.');
  sheet.getRange(current.row, current.campCol).setValue(camp);
  sheet.getRange(current.row, current.officeCol).setValue(office);
  if (current.positionCol && position) sheet.getRange(current.row, current.positionCol).setValue(position);
  SpreadsheetApp.flush();
}

function getMovementUserEmail_() {
  try { return String(Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '').trim(); }
  catch (ignore) { return ''; }
}
