import { NextResponse } from 'next/server';
import { loadReferenceData } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await loadReferenceData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load reference data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
