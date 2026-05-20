import { NextResponse } from 'next/server';
import { getScrapeRunner } from '@/lib/scrape-runner';

export async function POST() {
  const runner = getScrapeRunner();
  const result = await runner.start();

  if ('error' in result) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json({ runId: result.runId, status: 'running' }, { status: 202 });
}

export async function GET() {
  const runner = getScrapeRunner();
  return NextResponse.json(runner.getSnapshot());
}
