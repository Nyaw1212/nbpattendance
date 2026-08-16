function getNeonConnection_() {
  const props = PropertiesService.getScriptProperties();
  const host = String(props.getProperty('NEON_HOST') || '').trim();
  const port = String(props.getProperty('NEON_PORT') || '5432').trim();
  const database = String(props.getProperty('NEON_DATABASE') || '').trim();
  const user = String(props.getProperty('NEON_USER') || '').trim();
  const password = String(props.getProperty('NEON_PASSWORD') || '');

  if (!host || !database || !user || !password) {
    throw new Error('Neon is not configured. Set NEON_HOST, NEON_PORT, NEON_DATABASE, NEON_USER, and NEON_PASSWORD in Script Properties.');
  }

  const url = 'jdbc:postgresql://' + host + ':' + port + '/' + database;
  return Jdbc.getConnection(url, user, password);
}

function testNeonConnection() {
  let conn, stmt, rs;
  try {
    conn = getNeonConnection_();
    stmt = conn.createStatement();
    rs = stmt.executeQuery('SELECT 1 AS test');
    if (!rs.next()) throw new Error('Neon returned no result.');
    const value = rs.getInt('test');
    console.log('Neon connection OK: ' + value);
    return { ok: true, test: value };
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function saveNeonAttendance_(entries, camp, office, perf) {
  perf = perf || {};
  let conn, stmt;
  const totalStarted = Date.now();
  try {
    let t = Date.now();
    conn = getNeonConnection_();
    perf.neonConnectMs = Date.now() - t;

    t = Date.now();
    conn.setAutoCommit(false);
    const sql = [
      'INSERT INTO nbp_attendance.attendance',
      '(employee_key, attendance_date, status, leave_type, camp_at_time, office_at_time)',
      'VALUES (?, ?::date, ?, ?, ?, ?)',
      'ON CONFLICT (employee_key, attendance_date)',
      'DO UPDATE SET status = EXCLUDED.status,',
      'leave_type = EXCLUDED.leave_type,',
      'camp_at_time = EXCLUDED.camp_at_time,',
      'office_at_time = EXCLUDED.office_at_time,',
      'updated_at = NOW()'
    ].join(' ');
    stmt = conn.prepareStatement(sql);
    perf.neonPrepareMs = Date.now() - t;

    t = Date.now();
    entries.forEach(function(entry) {
      stmt.setString(1, String(entry[0]));
      stmt.setString(2, String(entry[1]));
      stmt.setString(3, String(entry[2]));
      if (entry[3] == null || entry[3] === '') stmt.setNull(4, 12);
      else stmt.setString(4, String(entry[3]));
      stmt.setString(5, String(camp));
      stmt.setString(6, String(office));
      stmt.addBatch();
    });
    perf.neonBindMs = Date.now() - t;

    t = Date.now();
    stmt.executeBatch();
    perf.neonBatchMs = Date.now() - t;

    t = Date.now();
    conn.commit();
    perf.neonCommitMs = Date.now() - t;
    perf.neonTotalMs = Date.now() - totalStarted;
    return entries.length;
  } catch (err) {
    if (conn) {
      try { conn.rollback(); } catch (ignore) {}
    }
    perf.neonTotalMs = Date.now() - totalStarted;
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

function loadNeonAttendance_(camp, office, weekStart, weekEnd, perf) {
  perf = perf || {};
  let conn, stmt, rs;
  const totalStarted = Date.now();
  try {
    let t = Date.now();
    conn = getNeonConnection_();
    perf.neonConnectMs = Date.now() - t;

    t = Date.now();
    stmt = conn.prepareStatement([
      'SELECT employee_key, attendance_date::text, status, leave_type',
      'FROM nbp_attendance.attendance',
      'WHERE attendance_date BETWEEN ?::date AND ?::date',
      'AND camp_at_time = ?',
      'AND office_at_time = ?',
      'ORDER BY employee_key, attendance_date'
    ].join(' '));
    stmt.setString(1, String(weekStart));
    stmt.setString(2, String(weekEnd));
    stmt.setString(3, String(camp));
    stmt.setString(4, String(office));
    perf.neonPrepareMs = Date.now() - t;

    t = Date.now();
    rs = stmt.executeQuery();
    perf.neonQueryMs = Date.now() - t;

    t = Date.now();
    const records = [];
    while (rs.next()) {
      records.push({
        employee_key: String(rs.getString(1)),
        attendance_date: String(rs.getString(2)),
        status: String(rs.getString(3)),
        leave_type: rs.getString(4)
      });
    }
    perf.neonReadMs = Date.now() - t;
    perf.neonTotalMs = Date.now() - totalStarted;
    return records;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}
