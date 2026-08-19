function getPendingMovementCount() {
  let conn, stmt, rs;
  try {
    conn = getNeonConnection_();
    stmt = conn.prepareStatement(
      "SELECT COUNT(*) FROM nbp_attendance.personnel_movements WHERE status = 'PENDING_RECEIPT'"
    );
    rs = stmt.executeQuery();
    return rs.next() ? rs.getInt(1) : 0;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}
