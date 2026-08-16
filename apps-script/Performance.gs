function profileAttendanceLoad(payload) {
  payload = payload || {};
  const camp = String(payload.camp || '').trim();
  const office = String(payload.office || '').trim();
  const weekStart = String(payload.weekStart || '').trim();
  const weekEnd = String(payload.weekEnd || '').trim();

  if (!camp || !office || !weekStart || !weekEnd) {
    throw new Error('camp, office, weekStart, and weekEnd are required.');
  }

  const report = {
    camp: camp,
    office: office,
    weekStart: weekStart,
    weekEnd: weekEnd,
    cacheHit: false,
    sheetBackupHit: false,
    cacheLookupMs: 0,
    sheetBackupLookupMs: 0,
    neonConnectMs: null,
    neonPrepareMs: null,
    neonQueryMs: null,
    neonReadMs: null,
    neonTotalMs: null,
    neonRecordCount: null,
    totalMs: 0
  };

  const totalStarted = Date.now();
  const cacheKey = attendanceCacheKey_(camp, office, weekStart, weekEnd);

  const cacheStarted = Date.now();
  const cached = getAttendanceCacheRecords_(cacheKey);
  report.cacheLookupMs = Date.now() - cacheStarted;
  report.cacheHit = !!cached;
  report.cacheRecordCount = cached ? cached.length : 0;

  const sheetStarted = Date.now();
  const backup = loadAttendanceBackup_(camp, office, weekStart, weekEnd);
  report.sheetBackupLookupMs = Date.now() - sheetStarted;
  report.sheetBackupHit = !!(backup && backup.records);
  report.sheetBackupRecordCount = backup && backup.records ? backup.records.length : 0;
  report.sheetBackupTransactionId = backup ? backup.transactionId : null;

  const neonPerf = {};
  const neonRecords = loadNeonAttendance_(camp, office, weekStart, weekEnd, neonPerf);
  report.neonConnectMs = neonPerf.neonConnectMs || 0;
  report.neonPrepareMs = neonPerf.neonPrepareMs || 0;
  report.neonQueryMs = neonPerf.neonQueryMs || 0;
  report.neonReadMs = neonPerf.neonReadMs || 0;
  report.neonTotalMs = neonPerf.neonTotalMs || 0;
  report.neonRecordCount = neonRecords.length;

  report.totalMs = Date.now() - totalStarted;

  console.log('ATTENDANCE PERFORMANCE PROFILE');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

function profileCurrentAttendanceWeek() {
  return profileAttendanceLoad({
    camp: 'NBP',
    office: 'COURT AND SUBPOENA OFFICE',
    weekStart: '2026-08-16',
    weekEnd: '2026-08-22'
  });
}
