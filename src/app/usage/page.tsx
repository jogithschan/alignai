import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DailySpendChart } from "@/components/DailySpendChart";
import {
  formatCostUsd,
  formatTokens,
  getUsageDashboardData,
  OPERATION_LABELS,
  type ApiOperation,
} from "@/lib/api-cost";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  cost,
  tokens,
  calls,
}: {
  label: string;
  cost: number;
  tokens: number;
  calls: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">{formatCostUsd(cost)}</p>
        <p className="text-xs text-muted-foreground">
          {formatTokens(tokens)} tokens · {calls.toLocaleString()} calls
        </p>
      </CardContent>
    </Card>
  );
}

function DailyChart({ data }: { data: { date: string; cost: number; calls: number }[] }) {
  return <DailySpendChart data={data} />;
}

export default async function UsagePage() {
  const data = await getUsageDashboardData();
  const maxOpCost = Math.max(...data.byOperation.map((o) => o.cost), 0.0001);

  return (
    <div className="space-y-8">
      <PageHeader
        title="API Usage"
        description="OpenAI token usage and estimated costs from scraping and job evaluation."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today"
          cost={data.summary.todayCost}
          tokens={data.summary.todayTokens}
          calls={data.summary.todayCalls}
        />
        <StatCard
          label="Last 7 days"
          cost={data.summary.weekCost}
          tokens={data.summary.weekTokens}
          calls={data.summary.weekCalls}
        />
        <StatCard
          label="Last 30 days"
          cost={data.summary.monthCost}
          tokens={data.summary.monthTokens}
          calls={data.summary.monthCalls}
        />
        <StatCard
          label="All time"
          cost={data.summary.allTimeCost}
          tokens={data.summary.allTimeTokens}
          calls={data.summary.allTimeCalls}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily spend (14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyChart data={data.dailyUsage} />
            {data.dailyUsage.every((d) => d.cost === 0) && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                No spend recorded in this window yet. Summary cards above reflect all-time usage.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by operation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.byOperation.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
            ) : (
              data.byOperation.map((row) => {
                const label =
                  OPERATION_LABELS[row.operation as ApiOperation] ?? row.operation;
                const pct = (row.cost / maxOpCost) * 100;
                return (
                  <div key={row.operation} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="text-muted-foreground">
                        {formatCostUsd(row.cost)} · {row.calls} calls
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {data.scrapeRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent scrape runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[1fr_100px_100px_80px] gap-4 border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Run</span>
                <span>Cost</span>
                <span>Tokens</span>
                <span>Calls</span>
              </div>
              {data.scrapeRuns.map((run) => (
                <div
                  key={run.scrapeRunId}
                  className="grid grid-cols-[1fr_100px_100px_80px] gap-4 border-b border-border px-4 py-2.5 last:border-b-0"
                >
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {run.scrapeRunId.slice(0, 12)}…
                  </span>
                  <span className="text-sm">{formatCostUsd(run.cost)}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatTokens(run.tokens)}
                  </span>
                  <span className="text-sm text-muted-foreground">{run.calls}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent API calls</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentCalls.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No API calls yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[140px_1fr_90px_90px_90px] gap-4 border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Time</span>
                <span>Operation</span>
                <span>Tokens</span>
                <span>Cost</span>
                <span>Model</span>
              </div>
              {data.recentCalls.map((call) => (
                <div
                  key={call.id}
                  className="grid grid-cols-[140px_1fr_90px_90px_90px] gap-4 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-muted/20"
                >
                  <span className="text-xs text-muted-foreground">
                    {new Date(call.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    {OPERATION_LABELS[call.operation as ApiOperation] ?? call.operation}
                    {call.scrapeRunId && (
                      <Badge variant="secondary" className="text-[10px]">
                        scrape
                      </Badge>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatTokens(call.totalTokens)}
                  </span>
                  <span className="text-sm">{formatCostUsd(call.estimatedCostUsd)}</span>
                  <span className="truncate text-xs text-muted-foreground">{call.model}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Costs are estimates based on gpt-4o-mini pricing ($0.15/1M input, $0.60/1M output tokens).
        Actual billing may differ slightly.
      </p>
    </div>
  );
}
