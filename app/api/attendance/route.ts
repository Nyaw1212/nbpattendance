import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    // Keep only the final value for each employee/date pair before writing.
    // This preserves the same uniqueness rule as the database constraint and
    // prevents a single bulk INSERT from trying to update the same row twice.
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

    // One bulk upsert instead of one SQL statement per attendance entry.
    // The database still uses (employee_key, attendance_date) as the conflict key,
    // so the saved result is equivalent to the previous row-by-row implementation.
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

    return NextResponse.json({ saved: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save attendance.' }, { status: 500 });
  }
}
