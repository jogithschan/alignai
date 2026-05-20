import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { QUALIFYING_MIN_SCORE } from "@/lib/selection";

export const dynamic = "force-dynamic";

function scoreBadgeClass(score: number) {
  if (score >= 85) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (score >= 65) return "border-sky-500/30 bg-sky-500/10 text-sky-400";
  return "border-border bg-muted text-muted-foreground";
}

export default async function ActivityPage() {
  const recentJobs = await prisma.job.findMany({
    where: { alignmentScore: { gte: QUALIFYING_MIN_SCORE } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { resume: { select: { name: true } } },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Recently discovered jobs and their alignment scores."
      />

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_140px_120px_100px_110px] gap-4 border-b border-border bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Job</span>
          <span>Resume</span>
          <span>Company</span>
          <span>Score</span>
          <span>Status</span>
        </div>

        {recentJobs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No jobs discovered yet.
          </div>
        ) : (
          recentJobs.map((job) => (
            <div
              key={job.id}
              className="grid grid-cols-[1fr_140px_120px_100px_110px] gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/20"
            >
              <div className="min-w-0">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {job.title}
                </a>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(job.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <span className="truncate text-sm text-muted-foreground">
                {job.resume?.name ?? "—"}
              </span>

              <span className="truncate text-sm text-muted-foreground">{job.company}</span>

              <span>
                {job.alignmentScore !== null ? (
                  <Badge variant="outline" className={scoreBadgeClass(job.alignmentScore)}>
                    {job.alignmentScore}%
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </span>

              <span>
                <Badge variant="secondary" className="text-xs">
                  {job.status}
                </Badge>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
