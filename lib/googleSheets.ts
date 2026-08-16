import { randomUUID } from 'crypto';
import { google } from 'googleapis';

export type Personnel = {
  recordId: string;
  badgeNumber: string;
  rank: string;
  fullName: string;
  camp: string;
  office: string;
  gender: string;
  classification: string;
  personnelType: string;
};

export type AttendanceBackupEntry = {
  employeeKey: string;
  date: string;
  status: string;
  leaveType?: string | null;
  camp: string;
  office: string;
};

const BACKUP_SHEET = 'ATTENDANCE_BACKUP';

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !privateKey) throw new Error('Google service account is not configured.');
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

export async function loadReferenceData() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const sheets = google.sheets({ version: 'v4', auth: auth() });
  const result = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ['LIST!A:P', 'OFFICE_DIRECTORY!A:D', 'LEAVE_TYPE!A:A']
  });

  const [listRange, officeRange, leaveRange] = result.data.valueRanges || [];
  const listRows = listRange?.values || [];
  const headers = (listRows[0] || []).map(String);
  const ix = (name: string) => headers.indexOf(name);

  const personnel: Personnel[] = listRows.slice(1)
    .filter(row => row[ix('BADGE NUMBER')])
    .map(row => {
      const badgeNumber = String(row[ix('BADGE NUMBER')] || '').trim();
      return {
        // Keep the existing UI contract for now, but use BADGE NUMBER as the permanent employee key.
        recordId: badgeNumber,
        badgeNumber,
        rank: String(row[ix('RANK')] || ''),
        fullName: [row[ix('RANK')], row[ix('FIRST NAME')], row[ix('MIDDLE NAME')], row[ix('LAST NAME')], row[ix('SUFFIX')]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
        camp: String(row[ix('CAMP')] || '').trim(),
        office: String(row[ix('OFFICE')] || '').trim(),
        gender: String(row[ix('GENDER')] || '').trim(),
        classification: String(row[ix('CLASSIFICATION')] || '').trim(),
        personnelType: String(row[ix('TYPE')] || '').trim()
      };
    });

  const offices = (officeRange?.values || []).slice(1)
    .filter(row => row[0] && row[1] && String(row[2]).toLowerCase() !== 'false')
    .map(row => ({ camp: String(row[0]).trim(), office: String(row[1]).trim(), sortOrder: Number(row[3] || 0) }));

  const leaveTypes = (leaveRange?.values || []).slice(1).map(row => String(row[0] || '').trim()).filter(Boolean);
  return { personnel, offices, leaveTypes };
}

async function ensureBackupSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const sheets = google.sheets({ version: 'v4', auth: auth() });
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title'
  });

  const exists = (metadata.data.sheets || []).some(sheet => sheet.properties?.title === BACKUP_SHEET);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: BACKUP_SHEET } } }]
      }
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${BACKUP_SHEET}!A1:H1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'TRANSACTION ID',
          'SAVED AT',
          'CAMP',
          'OFFICE',
          'DATE FROM',
          'DATE TO',
          'ENTRY COUNT',
          'JSON BACKUP'
        ]]
      }
    });
  }

  return { spreadsheetId, sheets };
}

export async function appendAttendanceBackup(entries: AttendanceBackupEntry[]) {
  if (!entries.length) throw new Error('No attendance entries supplied for backup.');

  const transactionId = randomUUID();
  const savedAt = new Date().toISOString();
  const dates = entries.map(entry => String(entry.date)).sort();
  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];
  const camp = String(entries[0].camp || '');
  const office = String(entries[0].office || '');

  // Keep the JSON compact by storing shared transaction metadata once and
  // representing attendance rows as [badge, date, status, leaveType].
  const payload = {
    v: 1,
    transactionId,
    savedAt,
    camp,
    office,
    dateFrom,
    dateTo,
    entries: entries.map(entry => [
      String(entry.employeeKey),
      String(entry.date),
      String(entry.status),
      entry.leaveType ? String(entry.leaveType) : null
    ])
  };

  const json = JSON.stringify(payload);
  if (json.length > 49000) {
    throw new Error(`Attendance backup is too large for one Google Sheets cell (${json.length} characters).`);
  }

  const { spreadsheetId, sheets } = await ensureBackupSheet();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${BACKUP_SHEET}!A:H`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[transactionId, savedAt, camp, office, dateFrom, dateTo, entries.length, json]]
    }
  });

  return { transactionId, savedAt, count: entries.length };
}
