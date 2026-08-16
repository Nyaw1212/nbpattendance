import { NextRequest, NextResponse } from 'next/server';
import { listAttendanceBackups } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const camp = searchParams.get('camp');
    const office = searchParams.get('office');
    const limit = Number(searchParams.get('limit') || 30);
    const backups = await listAttendanceBackups({ camp, office, limit });
    return NextResponse.json({ backups });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to list attendance backups.'
    }, { status: 500 });
  }
}
