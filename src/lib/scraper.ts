import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { prisma } from './prisma';
import { extractJobLinks, evaluateJobAlignment, quickScreenJobs, deriveSearchKeywords, extractResumeProfile } from './evaluator';
import {
  extractLinkedInJobs,
  fetchLinkedInJobDescription,
  isLinkedInJobsUrl,
  isSubstantiveDescription,
  buildListingFallbackDescription,
  normalizeLinkedInJobUrl,
} from './linkedin';
import { parsePreferences, buildLinkedInSearchPlan, LISTINGS_PER_LOCATION } from './preferences';
import {
  computeListingPriorScore,
  isTitleRelevant,
  matchesAvoidKeywords,
  MAX_JOBS_TO_EVALUATE,
  MAX_LISTINGS_TO_COLLECT,
  passesSelectionGate,
  QUICK_SCREEN_THRESHOLD,
  type JobListingMeta,
} from './selection';
import type { ScraperCallbacks, ScrapeJobPayload } from './scraper-events';

const FETCH_CONCURRENCY = 4;
const NAV_RETRIES = 3;
const METADATA_FALLBACK_MIN_QUICK_SCORE = 65;

const RETRYABLE_NAV_ERRORS =
  /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|Timeout/i;

const jobInclude = {
  resume: {
    select: {
      name: true,
      experienceLevels: true,
      locations: true,
      targetRoles: true,
      avoidKeywords: true,
    },
  },
} as const;

type RankedCandidate = JobListingMeta & {
  priorScore: number;
  quickScore: number;
  quickNote?: string;
};

async function gotoWithRetry(
  page: Page,
  url: string,
  options: Parameters<Page['goto']>[1],
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= NAV_RETRIES; attempt++) {
    try {
      await page.goto(url, options);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!RETRYABLE_NAV_ERRORS.test(message) || attempt === NAV_RETRIES) {
        if (/ERR_NAME_NOT_RESOLVED/i.test(message)) {
          throw new Error(
            `Could not reach ${new URL(url).hostname} (DNS lookup failed). Check your internet connection and try again.`,
          );
        }
        throw error;
      }
      console.log(`Navigation retry ${attempt}/${NAV_RETRIES} for ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

async function setupFastContext(context: BrowserContext) {
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'media', 'font'].includes(type)) {
      void route.abort();
    } else {
      void route.continue();
    }
  });
}

async function fetchJobDescription(
  context: BrowserContext,
  jobUrl: string,
): Promise<string> {
  if (isLinkedInJobsUrl(jobUrl)) {
    return fetchLinkedInJobDescription(context, jobUrl);
  }

  let page: Page | undefined;
  try {
    page = await context.newPage();
    await gotoWithRetry(page, jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return await page.evaluate(() => document.body?.innerText ?? '');
  } catch {
    return '';
  } finally {
    await page?.close().catch(() => {});
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function emitJob(callbacks: ScraperCallbacks | undefined, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });
  if (job) {
    await callbacks?.onJob?.({ ...(job as ScrapeJobPayload), evalStatus: 'complete' });
  }
}

function pendingJobId(url: string) {
  return `pending:${url}`;
}

async function emitEvaluatingJob(
  callbacks: ScraperCallbacks | undefined,
  job: JobListingMeta,
  resume: { name: string; experienceLevels: string; locations: string; targetRoles: string; avoidKeywords: string },
) {
  await callbacks?.onJob?.({
    id: pendingJobId(job.url),
    title: job.title,
    company: job.company,
    url: job.url,
    description: '',
    alignmentScore: null,
    alignmentReason: null,
    alignmentDetails: null,
    matchTier: 'REVIEW',
    evalStatus: 'evaluating',
    status: 'PENDING',
    resume,
  });
}

async function persistManualReviewJob(
  callbacks: ScraperCallbacks | undefined,
  job: RankedCandidate,
  resumeId: string,
  reason: string,
  description: string,
) {
  const saved = await prisma.job.upsert({
    where: { url: job.url },
    create: {
      title: job.title,
      company: job.company,
      url: job.url,
      description: description.substring(0, 5000),
      alignmentScore: Math.round(job.quickScore) || null,
      alignmentReason: reason,
      alignmentDetails: null,
      matchTier: 'REVIEW',
      resumeId,
    },
    update: {
      title: job.title,
      company: job.company,
      description: description.substring(0, 5000),
      alignmentScore: Math.round(job.quickScore) || null,
      alignmentReason: reason,
      alignmentDetails: null,
      matchTier: 'REVIEW',
      resumeId,
    },
  });

  await emitJob(callbacks, saved.id);
  return saved;
}

function buildCompletionMessage({
  listingsCount,
  evaluatedCount,
  matchCount,
  reviewCount,
  thinDescriptionCount,
  evalFailedCount,
}: {
  listingsCount: number;
  evaluatedCount: number;
  matchCount: number;
  reviewCount: number;
  thinDescriptionCount: number;
  evalFailedCount: number;
}): string {
  const savedTotal = matchCount + reviewCount;
  if (savedTotal > 0) {
    const parts = [`${matchCount} strong match${matchCount === 1 ? '' : 'es'}`];
    if (reviewCount > 0) {
      parts.push(`${reviewCount} for review`);
    }
    return `Scraping complete. Saved ${savedTotal} deep-evaluated jobs from ${listingsCount} listings (${parts.join(', ')}).`;
  }

  if (thinDescriptionCount === evaluatedCount) {
    return `Scraping complete. Reviewed ${listingsCount} listings; LinkedIn did not expose descriptions for any of the ${evaluatedCount} candidates deep-evaluated.`;
  }

  if (evalFailedCount > 0 && thinDescriptionCount === 0) {
    return `Scraping complete. Deep-evaluated ${evaluatedCount} jobs from ${listingsCount} listings; scoring failed for ${evalFailedCount}.`;
  }

  return `Scraping complete. Reviewed ${listingsCount} listings; no jobs saved from deep evaluation.`;
}

function rankCandidates(
  listings: JobListingMeta[],
  quickScreen: Map<number, { interestScore: number; note: string }>,
  preferences: ReturnType<typeof parsePreferences>,
  titleSignals: string[],
): RankedCandidate[] {
  return listings
    .map((listing, index) => {
      const priorScore = computeListingPriorScore(listing, preferences, titleSignals);
      const quick = quickScreen.get(index);
      const quickScore = quick?.interestScore ?? priorScore;
      const combined = Math.round(priorScore * 0.35 + quickScore * 0.65);
      return {
        ...listing,
        priorScore,
        quickScore: combined,
        quickNote: quick?.note,
      };
    })
    .sort((a, b) => b.quickScore - a.quickScore);
}

export async function runScraper(callbacks?: ScraperCallbacks, runId?: string) {
  const settings = await prisma.settings.findFirst();
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });

  if (!settings || !settings.targetUrls || !activeResume) {
    throw new Error('Missing settings or active resume.');
  }

  const urls: string[] = JSON.parse(settings.targetUrls);
  if (urls.length === 0) return { message: 'No URLs to scrape.' };

  const preferences = parsePreferences(
    activeResume.experienceLevels,
    activeResume.locations,
    activeResume.targetRoles,
    activeResume.avoidKeywords,
  );

  const scrapeRunId = runId ?? crypto.randomUUID();
  const evalContext = { scrapeRunId };

  await callbacks?.onProgress?.('Deriving search titles from resume...');
  const searchKeywords = await deriveSearchKeywords(
    activeResume.content,
    activeResume.name,
    preferences.targetRoles,
    evalContext,
  );
  console.log(`Search titles: ${searchKeywords.join(', ')}`);

  await callbacks?.onProgress?.('Building resume profile for alignment...');
  const resumeProfile = await extractResumeProfile(
    activeResume.content,
    activeResume.name,
    preferences,
    evalContext,
  );

  const titleSignals = [
    ...new Set(
      [
        ...searchKeywords,
        ...preferences.targetRoles,
        ...(resumeProfile?.targetTitles ?? []),
        ...(resumeProfile?.strongFitSignals ?? []),
      ]
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  const baseUrls =
    urls.length > 0
      ? urls
      : ['https://www.linkedin.com/jobs/search/'];

  await callbacks?.onProgress?.(
    `Searching ${searchKeywords.length} title(s) across ${preferences.locations.length || 1} location(s)...`,
  );

  await callbacks?.onProgress?.('Collecting job listings...');

  const browser: Browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    await setupFastContext(context);
    const listingPage = await context.newPage();

    const seenJobUrls = new Set<string>();
    const listings: JobListingMeta[] = [];

    for (const url of baseUrls) {
      if (listings.length >= MAX_LISTINGS_TO_COLLECT) break;

      const searchPlan = buildLinkedInSearchPlan(url, preferences, searchKeywords);

      for (const query of searchPlan) {
        if (listings.length >= MAX_LISTINGS_TO_COLLECT) break;

        const locationLabel = query.location ?? 'any location';
        await callbacks?.onProgress?.(
          `Searching "${query.keyword}" in ${locationLabel}...`,
        );

        console.log(`Scraping listings: ${query.url}`);

        let extractedJobs: JobListingMeta[] = [];

        try {
          await gotoWithRetry(listingPage, query.url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
          });

          const pageOrigin = new URL(query.url).origin;
          const perSearchLimit = Math.min(
            LISTINGS_PER_LOCATION,
            MAX_LISTINGS_TO_COLLECT - listings.length,
          );

          if (isLinkedInJobsUrl(query.url)) {
            extractedJobs = await extractLinkedInJobs(listingPage, perSearchLimit);
          } else {
            const pageText = await listingPage.evaluate(() => document.body?.innerText ?? '');
            extractedJobs = await extractJobLinks(pageText, pageOrigin, evalContext);
          }

          for (const job of extractedJobs) {
            let jobUrl = job.url;
            try {
              if (!jobUrl.startsWith('http')) {
                jobUrl = new URL(job.url, pageOrigin).href;
              }
              if (isLinkedInJobsUrl(jobUrl)) {
                jobUrl = normalizeLinkedInJobUrl(jobUrl);
              }
            } catch {
              continue;
            }

            if (seenJobUrls.has(jobUrl)) continue;

            const searchText = `${job.title} ${job.company} ${job.location ?? ''}`;
            if (matchesAvoidKeywords(searchText, preferences.avoidKeywords)) {
              console.log(`Skipped (avoid keyword): ${job.title}`);
              continue;
            }

            if (!isTitleRelevant(job.title, titleSignals)) {
              console.log(`Skipped (title mismatch): ${job.title}`);
              continue;
            }

            seenJobUrls.add(jobUrl);
            listings.push({ ...job, url: jobUrl });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Search skipped (${locationLabel}): ${message}`);
        }
      }
    }

    await listingPage.close();

    if (listings.length === 0) {
      return { message: 'Scraping complete. No job listings found.' };
    }

    await callbacks?.onProgress?.(`Pre-screening ${listings.length} listings...`);
    const quickScreen = await quickScreenJobs(
      listings,
      activeResume.content,
      preferences,
      evalContext,
      resumeProfile,
    );
    const ranked = rankCandidates(listings, quickScreen, preferences, titleSignals);

    const existing = await prisma.job.findMany({
      where: {
        url: { in: ranked.map((c) => c.url) },
        matchTier: 'MATCH',
      },
      select: { url: true },
    });
    const existingUrls = new Set(existing.map((j) => j.url));

    const toEvaluate = ranked
      .filter((c) => !existingUrls.has(c.url))
      .filter((c) => c.quickScore >= QUICK_SCREEN_THRESHOLD)
      .slice(0, MAX_JOBS_TO_EVALUATE);

    if (toEvaluate.length === 0) {
      return {
        message: `Scraping complete. Reviewed ${listings.length} listings; none passed pre-screening (${QUICK_SCREEN_THRESHOLD}+).`,
      };
    }

    await callbacks?.onProgress?.(
      `Deep-evaluating top ${toEvaluate.length} of ${listings.length} listings (${existingUrls.size} already saved)...`,
    );

    const resumePayload = {
      name: activeResume.name,
      experienceLevels: activeResume.experienceLevels,
      locations: activeResume.locations,
      targetRoles: activeResume.targetRoles,
      avoidKeywords: activeResume.avoidKeywords,
    };

    type EvaluatedJob = RankedCandidate & {
      description: string;
      score: number;
      reason: string;
      detailsJson: string;
      matchTier: 'MATCH' | 'REVIEW';
    };

    let matchCount = 0;
    let reviewCount = 0;
    let thinDescriptionCount = 0;
    let evalFailedCount = 0;

    for (let i = 0; i < toEvaluate.length; i += FETCH_CONCURRENCY) {
      const batch = toEvaluate.slice(i, i + FETCH_CONCURRENCY);

      await mapConcurrent(batch, FETCH_CONCURRENCY, async (job) => {
        await emitEvaluatingJob(callbacks, job, resumePayload);

        let description = await fetchJobDescription(context, job.url);
        let usedFallback = false;

        if (!description.trim() || !isSubstantiveDescription(description, job.title, job.company)) {
          if (job.quickScore >= METADATA_FALLBACK_MIN_QUICK_SCORE) {
            description = buildListingFallbackDescription(job, job.quickNote);
            usedFallback = true;
            console.log(`Using listing metadata fallback: ${job.title}`);
          } else {
            thinDescriptionCount++;
            console.log(`Saved for manual review (thin description): ${job.title}`);
            await persistManualReviewJob(
              callbacks,
              job,
              activeResume.id,
              'Flagged for deep review. LinkedIn did not expose a full description — worth a manual read-through.',
              buildListingFallbackDescription(job, job.quickNote),
            );
            reviewCount++;
            await callbacks?.onProgress?.(`Saved for review: ${job.title} (manual)`);
            return;
          }
        }

        const alignment = await evaluateJobAlignment(
          description,
          activeResume.content,
          preferences,
          job,
          evalContext,
          resumeProfile,
        );

        if (!alignment) {
          evalFailedCount++;
          console.log(`Saved for manual review (eval failed): ${job.title}`);
          await persistManualReviewJob(
            callbacks,
            job,
            activeResume.id,
            'Flagged for deep review. Automatic alignment scoring failed — worth a manual read-through.',
            description,
          );
          reviewCount++;
          await callbacks?.onProgress?.(`Saved for review: ${job.title} (manual)`);
          return;
        }

        const passed = passesSelectionGate(alignment.score, alignment.details);
        const matchTier = passed ? 'MATCH' : 'REVIEW';
        const reason = usedFallback
          ? `[Limited LinkedIn data] ${alignment.reason}`
          : alignment.reason;

        const saved = await prisma.job.upsert({
          where: { url: job.url },
          create: {
            title: job.title,
            company: job.company,
            url: job.url,
            description: description.substring(0, 5000),
            alignmentScore: alignment.score,
            alignmentReason: reason,
            alignmentDetails: JSON.stringify(alignment.details),
            matchTier,
            resumeId: activeResume.id,
          },
          update: {
            title: job.title,
            company: job.company,
            description: description.substring(0, 5000),
            alignmentScore: alignment.score,
            alignmentReason: reason,
            alignmentDetails: JSON.stringify(alignment.details),
            matchTier,
            resumeId: activeResume.id,
          },
        });

        if (matchTier === 'MATCH') matchCount++;
        else reviewCount++;

        console.log(
          `Saved ${matchTier} (${alignment.score}%, ${alignment.details.recommendation}): ${job.title}`,
        );

        await emitJob(callbacks, saved.id);
        await callbacks?.onProgress?.(
          `Saved ${matchTier === 'MATCH' ? 'match' : 'review'}: ${job.title} (${alignment.score}%)`,
        );
      });
    }

    await context.close();

    return {
      message: buildCompletionMessage({
        listingsCount: listings.length,
        evaluatedCount: toEvaluate.length,
        matchCount,
        reviewCount,
        thinDescriptionCount,
        evalFailedCount,
      }),
    };
  } catch (error) {
    console.error('Scraper error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}
