import { prisma } from './prisma';
import { formatCostUsd, formatTokens } from './format-cost';

export { formatCostUsd, formatTokens };

/** USD per 1M tokens — gpt-4o-mini pricing */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export type ApiOperation = 'job_extraction' | 'quick_screen' | 'alignment' | 'search_keywords' | 'resume_profile';

export const OPERATION_LABELS: Record<ApiOperation, string> = {
  job_extraction: 'Job extraction',
  quick_screen: 'Pre-screening',
  alignment: 'Alignment scoring',
  search_keywords: 'Search title generation',
  resume_profile: 'Resume profiling',
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini'];
  return (
    (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000
  );
}

export async function recordApiUsage(params: {
  model: string;
  operation: ApiOperation;
  promptTokens: number;
  completionTokens: number;
  scrapeRunId?: string;
}) {
  const totalTokens = params.promptTokens + params.completionTokens;
  const estimatedCostUsd = estimateCostUsd(
    params.model,
    params.promptTokens,
    params.completionTokens,
  );

  await prisma.apiUsage.create({
    data: {
      model: params.model,
      operation: params.operation,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens,
      estimatedCostUsd,
      scrapeRunId: params.scrapeRunId,
    },
  });
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return d;
}

export async function getUsageDashboardData() {
  const today = startOfDay();
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);

  const [
    allTime,
    todayAgg,
    weekAgg,
    monthAgg,
    byOperation,
    byDay,
    recentCalls,
    scrapeRuns,
  ] = await Promise.all([
    prisma.apiUsage.aggregate({
      _sum: {
        estimatedCostUsd: true,
        totalTokens: true,
        promptTokens: true,
        completionTokens: true,
      },
      _count: true,
    }),
    prisma.apiUsage.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { estimatedCostUsd: true, totalTokens: true },
      _count: true,
    }),
    prisma.apiUsage.aggregate({
      where: { createdAt: { gte: weekAgo } },
      _sum: { estimatedCostUsd: true, totalTokens: true },
      _count: true,
    }),
    prisma.apiUsage.aggregate({
      where: { createdAt: { gte: monthAgo } },
      _sum: { estimatedCostUsd: true, totalTokens: true },
      _count: true,
    }),
    prisma.apiUsage.groupBy({
      by: ['operation'],
      _sum: { estimatedCostUsd: true, totalTokens: true },
      _count: true,
      orderBy: { _sum: { estimatedCostUsd: 'desc' } },
    }),
    prisma.apiUsage.findMany({
      where: { createdAt: { gte: daysAgo(13) } },
      select: { createdAt: true, estimatedCostUsd: true, totalTokens: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.apiUsage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.apiUsage.groupBy({
      by: ['scrapeRunId'],
      where: { scrapeRunId: { not: null } },
      _sum: { estimatedCostUsd: true, totalTokens: true },
      _count: true,
    }),
  ]);

  const dailyMap = new Map<string, { cost: number; tokens: number; calls: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    dailyMap.set(d.toISOString().slice(0, 10), { cost: 0, tokens: 0, calls: 0 });
  }
  for (const row of byDay) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const entry = dailyMap.get(key);
    if (entry) {
      entry.cost += row.estimatedCostUsd;
      entry.tokens += row.totalTokens;
      entry.calls += 1;
    }
  }

  return {
    summary: {
      allTimeCost: allTime._sum.estimatedCostUsd ?? 0,
      allTimeTokens: allTime._sum.totalTokens ?? 0,
      allTimeCalls: allTime._count,
      todayCost: todayAgg._sum.estimatedCostUsd ?? 0,
      todayTokens: todayAgg._sum.totalTokens ?? 0,
      todayCalls: todayAgg._count,
      weekCost: weekAgg._sum.estimatedCostUsd ?? 0,
      weekTokens: weekAgg._sum.totalTokens ?? 0,
      weekCalls: weekAgg._count,
      monthCost: monthAgg._sum.estimatedCostUsd ?? 0,
      monthTokens: monthAgg._sum.totalTokens ?? 0,
      monthCalls: monthAgg._count,
    },
    byOperation: byOperation.map((row) => ({
      operation: row.operation as ApiOperation,
      cost: row._sum.estimatedCostUsd ?? 0,
      tokens: row._sum.totalTokens ?? 0,
      calls: row._count,
    })),
    dailyUsage: [...dailyMap.entries()].map(([date, stats]) => ({
      date,
      ...stats,
    })),
    recentCalls,
    scrapeRuns: scrapeRuns
      .map((row) => ({
        scrapeRunId: row.scrapeRunId!,
        cost: row._sum.estimatedCostUsd ?? 0,
        tokens: row._sum.totalTokens ?? 0,
        calls: row._count,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
  };
}
