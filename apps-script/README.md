# NBP Attendance Center — Apps Script Port

This folder is the Google Apps Script version of the Attendance Center. The existing Next.js app remains the reference implementation during the one-time port.

## One-time local setup

```powershell
cd apps-script
clasp login
clasp create "NBP Attendance Center" --type webapp
```

`clasp create` generates `.clasp.json` with the Google Apps Script project ID. Keep that file local unless you intentionally want to share the script ID.

After the project exists:

```powershell
clasp push
clasp open-script
```

In Apps Script **Project Settings → Script Properties**, add:

- `GOOGLE_SHEET_ID` = the NBPattendance spreadsheet ID

The Apps Script service runs under the deploying account and reads the spreadsheet directly with `SpreadsheetApp`, so the service-account email/private-key variables used by Next.js are not needed here.

## Current port milestone

- Web-app shell (`doGet`)
- Direct Google Sheets reference-data loading
- Personnel / office / leave-type bootstrap
- Optional `?unit=<key>` link resolution when `OFFICE_DIRECTORY` column E contains a unit key

Next milestones:

1. Attendance week grid and P/O/Leave-or-Status interaction
2. Leave/status/date-range modals
3. Neon attendance API bridge through `UrlFetchApp`
4. Google Sheets JSON transaction backup
5. Office-specific links and recovery/admin tools
