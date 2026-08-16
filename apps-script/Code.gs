const APP_TITLE = 'NBP Attendance Center';

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.appTitle = APP_TITLE;
  template.unitKey = (e && e.parameter && e.parameter.unit) ? String(e.parameter.unit) : '';
  return template.evaluate()
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function resolveRequestedUnit_(unitKey, offices) {
  return resolveUnit_(unitKey, offices);
}

function getBootstrapData(unitKey) {
  const started = Date.now();
  const perf = {};
  const data = getReferenceData_(perf);

  let t = Date.now();
  const resolvedUnit = unitKey ? resolveRequestedUnit_(unitKey, data.offices) : null;
  perf.resolveUnitMs = Date.now() - t;

  let personnel = data.personnel;
  let offices = data.offices;

  if (unitKey && !resolvedUnit) {
    throw new Error('This office link is invalid or no longer active.');
  }

  if (resolvedUnit) {
    t = Date.now();
    personnel = data.personnel.filter(function(person) {
      return String(person.camp || '').trim() === String(resolvedUnit.camp || '').trim() &&
             String(person.office || '').trim() === String(resolvedUnit.office || '').trim();
    });

    offices = [resolvedUnit];
    perf.unitFilterMs = Date.now() - t;
    perf.unitPersonnelCount = personnel.length;
    perf.unitOfficeCount = offices.length;
  }

  perf.bootstrapTotalMs = Date.now() - started;

  console.log('BOOTSTRAP PERFORMANCE ' + JSON.stringify(perf));

  return {
    appTitle: APP_TITLE,
    personnel: personnel,
    offices: offices,
    leaveTypes: data.leaveTypes,
    resolvedUnit: resolvedUnit,
    unitLocked: !!resolvedUnit,
    performance: perf
  };
}

function getOfficeSubmissionStatus(unitKey) {
  const key = String(unitKey || '').trim();
  if (!key) return { individualLink: false };

  const data = getReferenceData_({});
  const unit = resolveRequestedUnit_(key, data.offices);
  if (!unit) throw new Error('This office link is invalid or no longer active.');

  const sheet = getOfficeDirectorySheet_();
  const row = findOfficeDirectoryRow_(sheet, unit.camp, unit.office);
  if (!row) throw new Error('Office monitoring row not found.');

  const cols = ensureOfficeMonitorColumns_(sheet);
  const now = new Date();
  const shift = attendanceShiftForDate_(now);
  const today = Utilities.formatDate(now, OFFICE_MONITOR_TIMEZONE_, 'yyyy-MM-dd');
  const time = Utilities.formatDate(now, OFFICE_MONITOR_TIMEZONE_, 'HH:mm:ss');
  const lastUpdated = String(sheet.getRange(row, cols['LAST UPDATED']).getDisplayValue() || '').trim();
  const shiftTime = String(sheet.getRange(row, cols[shift + ' TIME']).getDisplayValue() || '').trim();
  const updated = lastUpdated === today && !!shiftTime;

  return {
    individualLink: true,
    camp: unit.camp,
    office: unit.office,
    shift: shift,
    status: updated ? 'UPDATED' : 'DUE FOR SUBMISSION',
    updated: updated,
    submissionTime: updated ? shiftTime : '',
    serverDate: today,
    serverTime: time,
    timezone: OFFICE_MONITOR_TIMEZONE_
  };
}

function profileBootstrapData() {
  const result = getBootstrapData('');
  console.log('BOOTSTRAP PROFILE');
  console.log(JSON.stringify(result.performance, null, 2));
  return result.performance;
}

function profileUnitBootstrap(unitKey) {
  const result = getBootstrapData(unitKey);
  console.log('UNIT BOOTSTRAP PROFILE: ' + unitKey);
  console.log(JSON.stringify(result.performance, null, 2));
  return result.performance;
}
