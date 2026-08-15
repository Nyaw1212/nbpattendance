# NBP Attendance Center

Clean rebuild of the NBP weekly office attendance recorder.

## Data split

- **Google Sheet**: fixed/reference data (`LIST`, `OFFICE_DIRECTORY`, `LEAVE_TYPE`)
- **Neon PostgreSQL**: attendance entries only

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with your Google Sheet service-account credentials and Neon `DATABASE_URL`.

Share the NBP Form Google Sheet with the service-account email as **Viewer**.

## Neon setup

Open Neon SQL Editor and run:

```sql
-- contents of db/schema.sql
```

This creates one attendance row per employee/date and prevents duplicates with a unique constraint.

## Run

```bash
npm run dev
```

Then open `http://localhost:3000`.

## MVP workflow

1. Select week, camp and office.
2. Personnel are loaded from the Google Sheet.
3. Attendance cells default to Present on weekdays and Off on weekends.
4. Click cells to cycle: `P → O → L → OB → A → —`.
5. Leave cells show the leave types from the sheet.
6. `Save Week` upserts attendance into Neon.
7. Reloading the week restores saved attendance.

## Environment variables

```env
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
DATABASE_URL=
```

Never commit `.env.local` or the Neon password to GitHub.
