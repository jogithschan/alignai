"use client";

import { useEffect, useState } from "react";
import { updateJobStatus, promoteJobToMatch } from "./actions";
import { PageHeader } from "@/components/PageHeader";
import { useScrape } from "@/components/ScrapeProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Play, Check, X, ExternalLink, Loader2, ArrowUpRight } from "lucide-react";
import {
  formatExperienceLevels,
  formatLocations,
  parsePreferences,
} from "@/lib/preferences";
import {
  formatDescriptionForDisplay,
  getAlignmentSummary,
  resolveAlignmentDetails,
} from "@/lib/job-display";
import type { AlignmentDetails } from "@/lib/selection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { ScrapeJobPayload } from "@/lib/scraper-events";

type Job = ScrapeJobPayload;

function scoreBadgeClass(score: number) {
  if (score >= 85) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (score >= 65) return "border-sky-500/30 bg-sky-500/10 text-sky-400";
  return "border-amber-500/30 bg-amber-500/10 text-amber-400";
}

function recommendationLabel(recommendation: string) {
  switch (recommendation) {
    case "strong":
      return "Strong match";
    case "good":
      return "Good fit";
    case "borderline":
      return "Borderline";
    case "pass":
      return "Pass";
    default:
      return recommendation;
  }
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-sky-500/70 transition-all"
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}

function DeepEvalBadge({ detailsJson }: { detailsJson: string | null }) {
  const details = resolveAlignmentDetails(detailsJson, null);
  if (!details) return null;
  return (
    <Badge variant="outline" className="text-xs capitalize">
      {recommendationLabel(details.recommendation)}
    </Badge>
  );
}

function AlignmentBreakdown({
  detailsJson,
  reason,
}: {
  detailsJson: string | null;
  reason: string | null;
}) {
  const details: AlignmentDetails | null = resolveAlignmentDetails(detailsJson, reason);
  if (!details) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {getAlignmentSummary(reason)}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs capitalize">
          {recommendationLabel(details.recommendation)}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ScoreBar label="Skills" score={details.skillsScore} />
        <ScoreBar label="Experience" score={details.experienceScore} />
        <ScoreBar label="Location" score={details.locationScore} />
        <ScoreBar label="Role fit" score={details.roleScore} />
      </div>
      {details.strengths.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Strengths
          </h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {details.strengths.map((s) => (
              <li key={s}>+ {s}</li>
            ))}
          </ul>
        </div>
      )}
      {details.gaps.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gaps
          </h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {details.gaps.map((g) => (
              <li key={g}>− {g}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DashboardClient({
  initialMatchJobs,
  initialReviewJobs,
}: {
  initialMatchJobs: Job[];
  initialReviewJobs: Job[];
}) {
  const [matchJobs, setMatchJobs] = useState(initialMatchJobs);
  const [reviewJobs, setReviewJobs] = useState(initialReviewJobs);
  const { isRunning, message: scrapeStatus, startScrape, subscribeToJobs } = useScrape();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [dashboardView, setDashboardView] = useState<"matches" | "review">("matches");

  const reviewPendingCount = reviewJobs.filter((j) => j.status === "PENDING").length;

  const addJob = (job: Job) => {
    const upsert = (prev: Job[]) => {
      const without = prev.filter((j) => j.id !== job.id && j.url !== job.url);
      return [...without, job].sort(
        (a, b) => (b.alignmentScore ?? 0) - (a.alignmentScore ?? 0),
      );
    };

    if (job.evalStatus === "evaluating" || job.matchTier === "REVIEW") {
      setReviewJobs(upsert);
      if (job.evalStatus === "complete") {
        setMatchJobs((prev) => prev.filter((j) => j.url !== job.url));
      }
    } else {
      setMatchJobs(upsert);
      setReviewJobs((prev) => prev.filter((j) => j.url !== job.url));
    }

    if (job.evalStatus === "evaluating") {
      setDashboardView("review");
    }

    if (selectedJob?.url === job.url && job.evalStatus === "complete") {
      setSelectedJob(job);
    }
  };

  useEffect(() => subscribeToJobs(addJob), [subscribeToJobs]);

  const handleScrape = async () => {
    try {
      await startScrape();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to start scraper";
      alert(msg);
    }
  };

  const updateJobInLists = (id: string, patch: Partial<Job>) => {
    const apply = (jobs: Job[]) => jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    setMatchJobs(apply);
    setReviewJobs(apply);
    if (selectedJob?.id === id) setSelectedJob({ ...selectedJob, ...patch });
  };

  const removeFromReview = (id: string) => {
    setReviewJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleStatusChange = async (id: string, status: string) => {
    updateJobInLists(id, { status });
    await updateJobStatus(id, status);
  };

  const handlePromoteToMatch = async (id: string) => {
    const job = reviewJobs.find((j) => j.id === id);
    if (!job) return;
    const promoted = { ...job, matchTier: "MATCH" };
    removeFromReview(id);
    setMatchJobs((prev) =>
      [...prev.filter((j) => j.id !== id), promoted].sort(
        (a, b) => (b.alignmentScore ?? 0) - (a.alignmentScore ?? 0),
      ),
    );
    setSelectedJob(null);
    await promoteJobToMatch(id);
  };

  const JobCardList = ({
    jobs,
    filterStatus,
    emptyMessage,
    showDeepEvalBadge = false,
  }: {
    jobs: Job[];
    filterStatus: string;
    emptyMessage: string;
    showDeepEvalBadge?: boolean;
  }) => {
    const filtered = jobs.filter((j) => j.status === filterStatus);

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((job) => {
          const isEvaluating = job.evalStatus === "evaluating";

          return (
          <Card
            key={job.id}
            className={`cursor-pointer transition-colors hover:border-muted-foreground/30 ${
              isEvaluating ? "border-dashed opacity-90" : ""
            }`}
            onClick={() => !isEvaluating && setSelectedJob(job)}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="line-clamp-2 text-base leading-snug">{job.title}</CardTitle>
                {isEvaluating ? (
                  <Badge variant="outline" className="shrink-0 gap-1 border-sky-500/30 bg-sky-500/10 text-sky-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Evaluating
                  </Badge>
                ) : job.alignmentScore !== null ? (
                  <Badge variant="outline" className={`shrink-0 ${scoreBadgeClass(job.alignmentScore)}`}>
                    {job.alignmentScore}%
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">{job.company}</p>
                {showDeepEvalBadge && !isEvaluating && <DeepEvalBadge detailsJson={job.alignmentDetails} />}
              </div>
              {job.resume && (
                <p className="text-xs text-muted-foreground/70">Scored against {job.resume.name}</p>
              )}
            </CardHeader>
            <CardContent className="pb-3">
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {isEvaluating
                  ? "Fetching description and running alignment analysis..."
                  : getAlignmentSummary(job.alignmentReason)}
              </p>
            </CardContent>
            <CardFooter>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={isEvaluating}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(job.url, "_blank");
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View posting
              </Button>
            </CardFooter>
          </Card>
          );
        })}
      </div>
    );
  };

  const isReviewJob = selectedJob?.matchTier === "REVIEW";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Toggle between strong matches and the deep eval review queue."
        action={
          <Button onClick={handleScrape} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scraping...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run scraper
              </>
            )}
          </Button>
        }
      />

      {scrapeStatus && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {isRunning && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
          {scrapeStatus}
        </div>
      )}

      <Tabs
        value={dashboardView}
        onValueChange={(v) => setDashboardView(v as "matches" | "review")}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="matches">
            Strong matches
            <Badge variant="secondary" className="ml-2">
              {matchJobs.filter((j) => j.status === "PENDING").length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="review">
            Deep eval review
            <Badge variant="secondary" className="ml-2">
              {reviewPendingCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matches" className="mt-6">
          <Tabs defaultValue="PENDING" className="w-full">
            <TabsList>
              <TabsTrigger value="PENDING">
                Pending
                <Badge variant="secondary" className="ml-2">
                  {matchJobs.filter((j) => j.status === "PENDING").length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="APPLIED">
                Applied
                <Badge variant="secondary" className="ml-2">
                  {matchJobs.filter((j) => j.status === "APPLIED").length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="REJECTED">
                Dismissed
                <Badge variant="secondary" className="ml-2">
                  {matchJobs.filter((j) => j.status === "REJECTED").length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="PENDING" className="mt-6">
              <JobCardList
                jobs={matchJobs}
                filterStatus="PENDING"
                emptyMessage={
                  isRunning
                    ? "Waiting for matching jobs..."
                    : "No strong matches yet. Run the scraper to find aligned roles."
                }
              />
            </TabsContent>
            <TabsContent value="APPLIED" className="mt-6">
              <JobCardList jobs={matchJobs} filterStatus="APPLIED" emptyMessage="No applied jobs yet." />
            </TabsContent>
            <TabsContent value="REJECTED" className="mt-6">
              <JobCardList jobs={matchJobs} filterStatus="REJECTED" emptyMessage="No dismissed jobs." />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="review" className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Pre-screened jobs undergoing or finished with deep evaluation — including below-threshold
            scores and manual read-throughs when auto-scoring wasn&apos;t possible.
          </p>
          <JobCardList
            jobs={reviewJobs}
            filterStatus="PENDING"
            showDeepEvalBadge
            emptyMessage={
              isRunning
                ? "Waiting for deep-eval results..."
                : "No jobs in review. Run the scraper to evaluate more listings."
            }
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-0 border-b border-border px-6 py-5 pr-12">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-xl">{selectedJob?.title}</DialogTitle>
                <DialogDescription className="mt-1 text-base">
                  {selectedJob?.company}
                  {isReviewJob && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Deep eval review
                    </Badge>
                  )}
                  {selectedJob?.resume && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Scored against {selectedJob.resume.name}
                      {(() => {
                        const prefs = parsePreferences(
                          selectedJob.resume.experienceLevels,
                          selectedJob.resume.locations,
                          selectedJob.resume.targetRoles,
                          selectedJob.resume.avoidKeywords,
                        );
                        const parts = [
                          formatExperienceLevels(prefs.experienceLevels),
                          formatLocations(prefs.locations),
                        ].filter((p) => p !== "Any");
                        return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
                      })()}
                    </span>
                  )}
                </DialogDescription>
              </div>
              {selectedJob?.alignmentScore != null && (
                <Badge variant="outline" className={scoreBadgeClass(selectedJob.alignmentScore)}>
                  {selectedJob.alignmentScore}% match
                </Badge>
              )}
            </div>
          </DialogHeader>

          {selectedJob && (() => {
            const { text: displayDescription, isThin } = formatDescriptionForDisplay(
              selectedJob.description,
              selectedJob.title,
              selectedJob.company,
            );

            return (
              <>
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                  <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5">
                    <h3 className="text-sm font-medium">Fit analysis</h3>
                    <AlignmentBreakdown
                      detailsJson={selectedJob.alignmentDetails}
                      reason={selectedJob.alignmentReason}
                    />
                    {resolveAlignmentDetails(
                      selectedJob.alignmentDetails,
                      selectedJob.alignmentReason,
                    ) && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {getAlignmentSummary(selectedJob.alignmentReason)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Job description</h3>
                    {isThin ? (
                      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-5 py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          LinkedIn didn&apos;t expose the full description while scraping.
                          Open the posting to read requirements and responsibilities.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => window.open(selectedJob.url, "_blank")}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View on LinkedIn
                        </Button>
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/20 p-5">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {displayDescription}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2 border-t border-border px-6 py-5">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(selectedJob.url, "_blank")}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open posting
                  </Button>
                  {selectedJob.status === "PENDING" && (
                    <>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          handleStatusChange(selectedJob.id, "REJECTED");
                          setSelectedJob(null);
                        }}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Dismiss
                      </Button>
                      {isReviewJob ? (
                        <Button
                          className="flex-1"
                          onClick={() => handlePromoteToMatch(selectedJob.id)}
                        >
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          Promote
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          onClick={() => {
                            handleStatusChange(selectedJob.id, "APPLIED");
                            setSelectedJob(null);
                          }}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Applied
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
