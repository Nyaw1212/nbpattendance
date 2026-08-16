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

function getBootstrapData(unitKey) {
  const data = getReferenceData_();
  const resolvedUnit = unitKey ? resolveUnit_(unitKey, data.offices) : null;
  return {
    appTitle: APP_TITLE,
    personnel: data.personnel,
    offices: data.offices,
    leaveTypes: data.leaveTypes,
    resolvedUnit: resolvedUnit
  };
}
