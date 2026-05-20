import type { BrowserContext, Page } from 'playwright';
import type { JobListingMeta } from './selection';

export type ScrapedJobListing = JobListingMeta;

export function isLinkedInJobsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/jobs');
  } catch {
    return false;
  }
}

/** Extract numeric job ID from any LinkedIn jobs URL variant. */
export function extractLinkedInJobId(url: string): string | null {
  const patterns = [
    /\/jobs\/view\/(?:[^/?#]*-)?(\d+)/i,
    /currentJobId=(\d+)/i,
    /-(\d{8,})(?:\?|$)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Canonicalize to www.linkedin.com/jobs/view/{id} for reliable guest access. */
export function normalizeLinkedInJobUrl(url: string): string {
  const jobId = extractLinkedInJobId(url);
  if (jobId) {
    return `https://www.linkedin.com/jobs/view/${jobId}`;
  }
  try {
    const parsed = new URL(url);
    parsed.hostname = 'www.linkedin.com';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function parseCompanyFromLinkedInUrl(url: string): string {
  const match = url.match(/-at-(.+)-(\d+)(?:\?|$)/i);
  if (!match) return 'Unknown';

  return match[1]
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const LISTING_PAGE_SELECTORS = [
  'a[href*="/jobs/view/"]',
  '.jobs-search__results-list',
  'li[data-occludable-job-id]',
  '.job-card-container',
];

async function waitForListingPage(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('load', { timeout: 12000 }).catch(() => {});
  await page
    .waitForSelector(LISTING_PAGE_SELECTORS.join(', '), { timeout: 12000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

export async function extractLinkedInJobs(page: Page, limit = 10): Promise<ScrapedJobListing[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await waitForListingPage(page);

      const listings = await page.evaluate(() => {
        const seen = new Set<string>();
        const jobs: {
          title: string;
          url: string;
          location?: string;
          workType?: string;
          seniorityHint?: string;
        }[] = [];

        const cards = document.querySelectorAll(
          'li[data-occludable-job-id], .job-card-container, .jobs-search__results-list li',
        );
        const cardElements =
          cards.length > 0 ? cards : document.querySelectorAll('a[href*="/jobs/view/"]');

        for (const card of cardElements) {
          const anchor =
            card instanceof HTMLAnchorElement
              ? card
              : (card.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null);
          if (!anchor) continue;

          const href = anchor.href;
          const titleEl =
            card.querySelector('.job-card-list__title, .artdeco-entity-lockup__title, strong') ??
            anchor;
          const title = titleEl.textContent?.trim().replace(/\s+/g, ' ');
          if (!href || !title || title.length < 3) continue;

          const idMatch = href.match(/-(\d+)(?:\?|$)/);
          if (!idMatch) continue;

          const jobId = idMatch[1];
          if (seen.has(jobId)) continue;
          seen.add(jobId);

          const metadata = card.textContent?.replace(/\s+/g, ' ').trim() ?? '';

          let location: string | undefined;
          const locationEl = card.querySelector(
            '.job-card-container__metadata-item, .artdeco-entity-lockup__subtitle, [class*="location"]',
          );
          if (locationEl?.textContent?.trim()) {
            location = locationEl.textContent.trim().replace(/\s+/g, ' ');
          }

          let workType: string | undefined;
          if (/remote/i.test(metadata)) workType = 'Remote';
          else if (/hybrid/i.test(metadata)) workType = 'Hybrid';
          else if (/on-?site/i.test(metadata)) workType = 'On-site';

          let seniorityHint: string | undefined;
          const titleLower = title.toLowerCase();
          if (/\b(intern|internship)\b/.test(titleLower)) seniorityHint = 'intern';
          else if (/\b(junior|entry|graduate|new grad)\b/.test(titleLower)) seniorityHint = 'entry';
          else if (/\b(staff|principal)\b/.test(titleLower)) seniorityHint = 'staff';
          else if (/\b(lead|manager|director)\b/.test(titleLower)) seniorityHint = 'lead';
          else if (/\b(senior|sr\.?)\b/.test(titleLower)) seniorityHint = 'senior';
          else if (/\b(all levels|mid)\b/.test(titleLower)) seniorityHint = 'mid';

          jobs.push({
            title,
            url: href.split('?')[0],
            location,
            workType,
            seniorityHint,
          });
        }

        return jobs;
      });

      return listings.slice(0, limit).map((job) => ({
        ...job,
        url: normalizeLinkedInJobUrl(job.url),
        company: parseCompanyFromLinkedInUrl(job.url),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /Execution context was destroyed|navigation|Target (page|closed)/i.test(
        message,
      );

      if (retryable && attempt < 3) {
        console.log(`Listing extract retry ${attempt}/3: ${message}`);
        await page.waitForTimeout(1000 * attempt);
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        continue;
      }

      console.warn(`extractLinkedInJobs failed: ${message}`);
      return [];
    }
  }

  return [];
}

const DESCRIPTION_SELECTORS = [
  '.jobs-description-content__content',
  '.jobs-description__content',
  '.jobs-box__html-content',
  '.jobs-description',
  '#job-details .jobs-box',
  '[class*="jobs-description-content"]',
  '.show-more-less-html__markup',
];

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type GuestJobPosting = {
  description?: string;
  title?: string;
  companyDetails?: { name?: string };
};

/** Fetch full description via LinkedIn's public guest API (no login required). */
export async function fetchLinkedInJobDescriptionGuest(
  context: BrowserContext,
  jobId: string,
): Promise<string> {
  try {
    const response = await context.request.get(
      `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    );

    if (!response.ok()) return '';

    const data = (await response.json()) as GuestJobPosting;
    const html = data.description ?? '';
    if (!html) return '';

    const text = cleanJobDescription(htmlToPlainText(html));
    if (isLoginWall(text)) return '';
    return text;
  } catch {
    return '';
  }
}

export async function getLinkedInJobDescription(page: Page): Promise<string> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

    await page
      .waitForSelector(DESCRIPTION_SELECTORS.join(', '), { timeout: 8000 })
      .catch(() => {});

    await page.waitForTimeout(800);

    const showMore = page
      .locator('button')
      .filter({ hasText: /see more|show more/i })
      .first();
    if (await showMore.isVisible().catch(() => false)) {
      await showMore.click().catch(() => {});
      await page.waitForTimeout(400);
    }

    const text = await page.evaluate((selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const content = el?.textContent?.replace(/\s+\n/g, '\n').trim();
        if (content && content.length > 120) return content;
      }
      return '';
    }, DESCRIPTION_SELECTORS);

    if (!text) return '';
    if (isLoginWall(text)) return '';
    return cleanJobDescription(text);
  } catch {
    return '';
  }
}

export function buildListingFallbackDescription(job: JobListingMeta, quickNote?: string): string {
  const lines = [
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    job.workType ? `Work type: ${job.workType}` : null,
    job.seniorityHint ? `Seniority: ${job.seniorityHint}` : null,
    '',
    'Note: Full job description was not available from LinkedIn during scraping.',
    'Evaluate fit based on title, company, location, and listing metadata only.',
    quickNote ? `Pre-screen note: ${quickNote}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export function isSubstantiveDescription(
  text: string,
  title: string,
  company: string,
): boolean {
  const cleaned = cleanJobDescription(text);
  if (cleaned.length < 180) return false;

  const titleLower = title.toLowerCase();
  const companyLower = company.toLowerCase();

  const withoutHeader = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        l.toLowerCase() !== titleLower &&
        l.toLowerCase() !== companyLower &&
        !/^(apply|save|share)$/i.test(l),
    )
    .join('\n');

  if (withoutHeader.length < 150) return false;

  const hasBodySignals =
    /(about (the )?job|responsibilit|requirement|qualification|what you|you will|we are looking|experience with|skills)/i.test(
      withoutHeader,
    );

  return hasBodySignals || withoutHeader.length >= 400;
}

export function isListingMetadataOnly(text: string): boolean {
  return /Full job description was not available from LinkedIn/i.test(text);
}

function isLoginWall(text: string): boolean {
  const loginSignals = [
    /join or sign in to find your next job/i,
    /sign in to apply/i,
    /join linkedin/i,
  ];
  const hits = loginSignals.filter((pattern) => pattern.test(text)).length;
  return hits >= 2 || (hits >= 1 && text.length < 1200);
}

function cleanJobDescription(text: string): string {
  return text
    .replace(/Join or sign in to find your next job[\s\S]*?(?=About the job|Job description|Requirements|$)/i, '')
    .replace(/Apply[\s\S]*?Sign in with Email[\s\S]*?Join now/gi, '')
    .replace(/Similar jobs[\s\S]*/i, '')
    .replace(/By clicking Continue to join or sign in[\s\S]*?Cookie Policy\./gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function fetchLinkedInJobDescription(
  context: BrowserContext,
  jobUrl: string,
): Promise<string> {
  const normalized = normalizeLinkedInJobUrl(jobUrl);
  const jobId = extractLinkedInJobId(normalized);

  if (jobId) {
    const guestText = await fetchLinkedInJobDescriptionGuest(context, jobId);
    if (guestText) return guestText;
  }

  let page: Page | undefined;
  try {
    page = await context.newPage();
    await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return await getLinkedInJobDescription(page);
  } catch {
    return '';
  } finally {
    await page?.close().catch(() => {});
  }
}
