import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

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
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return NextResponse.json({ error: 'No attendance entries supplied.' }, { status: 400 });
    const sql = db();
    await sql.begin(async tx => {
      for (const entry of entries) {
        await tx`
          INSERT INTO nbp_attendance.attendance (employee_key, attendance_date, status, leave_type, camp_at_time, office_at_time, updated_at)
          VALUES (${String(entry.employeeKey)}, ${String(entry.date)}::date, ${String(entry.status)}, ${entry.leaveType || null}, ${String(entry.camp)}, ${String(entry.office)}, NOW())
          ON CONFLICT (employee_key, attendance_date)
          DO UPDATE SET status = EXCLUDED.status,
                        leave_type = EXCLUDED.leave_type,
                        camp_at_time = EXCLUDED.camp_at_time,
                        office_at_time = EXCLUDED.office_at_time,
                        updated_at = NOW()
        `;
      }
    });
    return NextResponse.json({ saved: entries.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save attendance.' }, { status: 500 });
  }
}
