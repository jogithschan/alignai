"use client";

import { formatCostUsd } from "@/lib/format-cost";

type DailyPoint = { date: string; cost: number; calls: number };

function niceCeil(value: number, divisions = 4): number {
  if (value <= 0) return 0.01;
  const rough = value / divisions;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const niceUnit =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceUnit * magnitude * divisions;
}

function buildYAxisTicks(maxCost: number): number[] {
  const ceiling = niceCeil(maxCost);
  const steps = 4;
  return Array.from({ length: steps + 1 }, (_, i) => (ceiling / steps) * i);
}

export function DailySpendChart({ data }: { data: DailyPoint[] }) {
  const maxCost = Math.max(...data.map((d) => d.cost), 0);
  const yMax = niceCeil(maxCost);
  const yTicks = buildYAxisTicks(maxCost).reverse();

  return (
    <div className="flex gap-3">
      <div className="flex h-40 w-12 shrink-0 flex-col justify-between py-0.5 text-right">
        {yTicks.map((tick) => (
          <span key={tick} className="text-[10px] leading-none text-muted-foreground">
            {formatCostUsd(tick)}
          </span>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {yTicks.map((tick) => (
            <div key={tick} className="border-t border-border/40" />
          ))}
        </div>

        <div className="relative flex h-40 items-end gap-1.5">
          {data.map((day) => {
            const heightPct =
              yMax > 0 ? Math.max(day.cost > 0 ? 6 : 0, (day.cost / yMax) * 100) : 0;
            const label = new Date(day.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return (
              <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col">
                <div className="flex flex-1 items-end">
                  <div
                    className="w-full rounded-sm bg-sky-500/60 transition-all hover:bg-sky-500/80"
                    style={{ height: `${heightPct}%` }}
                    title={`${label}: ${formatCostUsd(day.cost)} (${day.calls} calls)`}
                  />
                </div>
                <span className="mt-1.5 truncate text-center text-[10px] text-muted-foreground">
                  {label.split(" ")[1]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
