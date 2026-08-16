import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { appendAttendanceBackup } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

type AttendanceEntry = {
  employeeKey: string;
  date: string;
  status: string;
  leaveType?: string | null;
  camp: string;
  office: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get('weekStart');
    const weekEnd = searchParams.get('weekEnd');
    const camp = searchParams.get('camp');
    const office = searchParams.get('office');
    if (!weekStart || !weekEnd || !camp || !office) {
      return NextResponse.json({ error: 'Missing weekStart, weekEnd, camp, or office.' }, { status: 400 });
    }
    const sql = db();
    const rows = await sql`
      SELECT employee_key, attendance_date::text, status, leave_type
      FROM nbp_attendance.attendance
      WHERE attendance_date BETWEEN ${weekStart}::date AND ${weekEnd}::date
        AND camp_at_time = ${camp}
        AND office_at_time = ${office}
      ORDER BY employee_key, attendance_date
    `;
    return NextResponse.json({ records: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load attendance.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entries = Array.isArray(body.entries) ? body.entries as AttendanceEntry[] : [];
    if (!entries.length) return NextResponse.json({ error: 'No attendance entries supplied.' }, { status: 400 });

    const deduped = new Map<string, {
      employee_key: string;
      attendance_date: string;
      status: string;
      leave_type: string | null;
      camp_at_time: string;
      office_at_time: string;
    }>();

    for (const entry of entries) {
      const employeeKey = String(entry.employeeKey);
      const attendanceDate = String(entry.date);
      deduped.set(`${employeeKey}|${attendanceDate}`, {
        employee_key: employeeKey,
        attendance_date: attendanceDate,
        status: String(entry.status),
        leave_type: entry.leaveType ? String(entry.leaveType) : null,
        camp_at_time: String(entry.camp),
        office_at_time: String(entry.office),
      });
    }

    const rows = [...deduped.values()];
    const sql = db();

    await sql`
      INSERT INTO nbp_attendance.attendance ${sql(
        rows,
        'employee_key',
        'attendance_date',
        'status',
        'leave_type',
        'camp_at_time',
        'office_at_time'
      )}
      ON CONFLICT (employee_key, attendance_date)
      DO UPDATE SET status = EXCLUDED.status,
                    leave_type = EXCLUDED.leave_type,
                    camp_at_time = EXCLUDED.camp_at_time,
                    office_at_time = EXCLUDED.office_at_time,
                    updated_at = NOW()
    `;

    // Neon is the system of record. After the database save succeeds, write one
    // compact transaction snapshot to Google Sheets as a secondary backup.
    let backup: { ok: boolean; transactionId?: string; warning?: string } = { ok: false };
    try {
      const result = await appendAttendanceBackup(rows.map(row => ({
        employeeKey: row.employee_key,
        date: row.attendance_date,
        status: row.status,
        leaveType: row.leave_type,
        camp: row.camp_at_time,
        office: row.office_at_time
      })));
      backup = { ok: true, transactionId: result.transactionId };
    } catch (error) {
      backup = {
        ok: false,
        warning: error instanceof Error ? error.message : 'Google Sheets backup failed.'
      };
    }

    return NextResponse.json({ saved: rows.length, backup });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save attendance.' }, { status: 500 });
  }
}
