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

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !privateKey) throw new Error('Google service account is not configured.');
  return new google.auth.JWT({ email, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
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
    .filter(row => row[ix('RECORD ID')])
    .map(row => ({
      recordId: String(row[ix('RECORD ID')] || ''),
      badgeNumber: String(row[ix('BADGE NUMBER')] || ''),
      rank: String(row[ix('RANK')] || ''),
      fullName: [row[ix('RANK')], row[ix('FIRST NAME')], row[ix('MIDDLE NAME')], row[ix('LAST NAME')], row[ix('SUFFIX')]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      camp: String(row[ix('CAMP')] || ''),
      office: String(row[ix('OFFICE')] || ''),
      gender: String(row[ix('GENDER')] || ''),
      classification: String(row[ix('CLASSIFICATION')] || ''),
      personnelType: String(row[ix('TYPE')] || '')
    }));

  const offices = (officeRange?.values || []).slice(1)
    .filter(row => row[0] && row[1] && String(row[2]).toLowerCase() !== 'false')
    .map(row => ({ camp: String(row[0]), office: String(row[1]), sortOrder: Number(row[3] || 0) }));

  const leaveTypes = (leaveRange?.values || []).slice(1).map(row => String(row[0] || '')).filter(Boolean);
  return { personnel, offices, leaveTypes };
}
