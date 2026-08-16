function migrateOfficeDirectoryTo0000Shifts() {
  const sheet = getOfficeDirectorySheet_();
  const tz = OFFICE_MONITOR_TIMEZONE_ || 'Asia/Manila';
  const lastRow = Math.max(sheet.getLastRow(), 2);

  // Keep the existing shift columns in place and rename them.
  sheet.getRange('I1:K1').setValues([['0000H', '0800H', '1600H']]);

  // Reclassify any current stored submission using LAST UPDATE TIME.
  // The shift tracker only represents the current day's three submissions,
  // so clear the old shift cells and rebuild from the latest known save.
  const rows = sheet.getRange(2, 5, lastRow - 1, 7).getValues(); // E:K
  const output = [];

  rows.forEach(function(r) {
    const updatedToday = String(r[0] || '').trim().toUpperCase(); // E
    const lastUpdated = r[1]; // F
    const lastTime = r[2]; // G

    let lastShift = '';
    let s0000 = '';
    let s0800 = '';
    let s1600 = '';

    if (updatedToday === 'YES' && lastTime !== '' && lastTime != null) {
      let hour;
      if (lastTime instanceof Date) {
        hour = Number(Utilities.formatDate(lastTime, tz, 'H'));
      } else if (typeof lastTime === 'number') {
        hour = Math.floor(lastTime * 24) % 24;
      } else {
        const m = String(lastTime).match(/^(\d{1,2}):/);
        hour = m ? Number(m[1]) : NaN;
      }

      if (!isNaN(hour)) {
        if (hour < 8) {
          lastShift = '0000H';
          s0000 = lastTime;
        } else if (hour < 16) {
          lastShift = '0800H';
          s0800 = lastTime;
        } else {
          lastShift = '1600H';
          s1600 = lastTime;
        }
      }
    }

    output.push([lastShift, s0000, s0800, s1600]);
  });

  sheet.getRange(2, 8, output.length, 4).setValues(output); // H:K

  // Preserve non-shift conditional formats, replace only those touching I:K.
  const shiftStartCol = 9;
  const shiftEndCol = 11;
  const keptRules = sheet.getConditionalFormatRules().filter(function(rule) {
    return !rule.getRanges().some(function(range) {
      const start = range.getColumn();
      const end = range.getLastColumn();
      return start <= shiftEndCol && end >= shiftStartCol;
    });
  });

  const green = '#B7E1CD';
  const red = '#F4C7C3';
  const darkGreen = '#124D29';
  const darkRed = '#991111';
  const rowsRange = lastRow > 2 ? lastRow : 1000;

  function addRule(a1, formula, bg, fg) {
    keptRules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula)
        .setBackground(bg)
        .setFontColor(fg)
        .setBold(true)
        .setRanges([sheet.getRange(a1)])
        .build()
    );
  }

  addRule('I2:I1000', '=AND($C2=TRUE,$F2=TODAY(),$I2<>"")', green, darkGreen);
  addRule('I2:I1000', '=AND($C2=TRUE,MOD(NOW(),1)>=TIME(0,30,0),OR($F2<>TODAY(),$I2=""))', red, darkRed);

  addRule('J2:J1000', '=AND($C2=TRUE,$F2=TODAY(),$J2<>"")', green, darkGreen);
  addRule('J2:J1000', '=AND($C2=TRUE,MOD(NOW(),1)>=TIME(8,30,0),OR($F2<>TODAY(),$J2=""))', red, darkRed);

  addRule('K2:K1000', '=AND($C2=TRUE,$F2=TODAY(),$K2<>"")', green, darkGreen);
  addRule('K2:K1000', '=AND($C2=TRUE,MOD(NOW(),1)>=TIME(16,30,0),OR($F2<>TODAY(),$K2=""))', red, darkRed);

  sheet.setConditionalFormatRules(keptRules);
  SpreadsheetApp.flush();

  return {
    shifts: ['0000H', '0800H', '1600H'],
    deadlines: ['0030H', '0830H', '1630H'],
    rowsUpdated: output.length
  };
}
