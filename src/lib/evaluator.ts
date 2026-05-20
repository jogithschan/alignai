import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import {
  formatExperienceLevels,
  formatLocations,
  type JobPreferences,
} from './preferences';
import type { AlignmentDetails, JobListingMeta, Recommendation } from './selection';
import { recordApiUsage, type ApiOperation } from './api-cost';

let openai: OpenAI | null = null;

export type EvaluatorContext = {
  scrapeRunId?: string;
};

const MODEL = 'gpt-4o-mini';

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

async function trackUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  operation: ApiOperation,
  context?: EvaluatorContext,
) {
  if (!usage) return;
  await recordApiUsage({
    model: MODEL,
    operation,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    scrapeRunId: context?.scrapeRunId,
  });
}

const JobExtractionSchema = z.object({
  jobs: z.array(z.object({
    title: z.string(),
    company: z.string(),
    url: z.string().describe('The URL or relative path to the full job description'),
  })),
});

const QuickScreenSchema = z.object({
  results: z.array(z.object({
    index: z.number(),
    interestScore: z.number().describe('0-100 likelihood this job is worth a full review'),
    note: z.string().describe('Brief reason for the score'),
  })),
});

const SearchKeywordsSchema = z.object({
  keywords: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe('Specific LinkedIn job search title phrases for this candidate'),
});

const ResumeProfileSchema = z.object({
  headline: z.string().describe('One-line summary of this candidate\'s professional identity'),
  coreSkills: z.array(z.string()).max(8).describe('Primary technical skills from the resume'),
  targetTitles: z.array(z.string()).max(5).describe('Job titles they should pursue'),
  domains: z.array(z.string()).max(5).describe('Industry/domain focus areas e.g. LLM, NLP, fintech'),
  seniority: z.string().describe('Experience level in plain language'),
  strongFitSignals: z.array(z.string()).max(5).describe('Phrases in a job title/description that indicate strong fit'),
  weakFitSignals: z.array(z.string()).max(5).describe('Phrases that indicate a false-positive generic match'),
});

export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

const AlignmentSchema = z.object({
  overallScore: z.number().describe('Weighted overall fit score from 0 to 100'),
  skillsScore: z.number().describe('How well resume skills match required/preferred skills'),
  experienceScore: z.number().describe('Seniority and years-of-experience fit'),
  locationScore: z.number().describe('Location and work-mode fit vs preferences'),
  roleScore: z.number().describe('Title, domain, and career-direction fit'),
  strengths: z.array(z.string()).max(3).describe('Top matching strengths'),
  gaps: z.array(z.string()).max(3).describe('Most important gaps or concerns'),
  summary: z.string().describe('Two concise sentences explaining the fit'),
  recommendation: z.enum(['strong', 'good', 'borderline', 'pass']).describe(
    'strong: clear apply; good: solid fit; borderline: possible with tradeoffs; pass: skip',
  ),
});

export type JobAlignmentResult = {
  score: number;
  reason: string;
  details: AlignmentDetails;
};

export async function extractJobLinks(
  pageText: string,
  baseUrl: string,
  context?: EvaluatorContext,
) {
  try {
    const response = await getOpenAI().chat.completions.parse({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are an AI that extracts job postings from raw text/HTML. Return a list of jobs found.' },
        { role: 'user', content: `Base URL: ${baseUrl}\n\nContent:\n${pageText.substring(0, 30000)}` },
      ],
      response_format: zodResponseFormat(JobExtractionSchema, 'job_extraction'),
    });

    await trackUsage(response.usage, 'job_extraction', context);
    return response.choices[0].message.parsed?.jobs || [];
  } catch (error) {
    console.error('Failed to extract job links:', error);
    return [];
  }
}

function formatResumeProfileBlock(profile: ResumeProfile): string {
  return `Candidate profile:
Headline: ${profile.headline}
Core skills: ${profile.coreSkills.join(', ')}
Target titles: ${profile.targetTitles.join(', ')}
Domains: ${profile.domains.join(', ')}
Seniority: ${profile.seniority}
Strong fit signals: ${profile.strongFitSignals.join('; ')}
Weak fit signals (reject if dominant): ${profile.weakFitSignals.join('; ')}`;
}

/** Build a structured profile from the resume to anchor all alignment decisions. */
export async function extractResumeProfile(
  resumeContent: string,
  resumeName: string,
  preferences: JobPreferences,
  context?: EvaluatorContext,
): Promise<ResumeProfile | null> {
  try {
    const response = await getOpenAI().chat.completions.parse({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You analyze a resume and produce a structured profile for job matching.

Be specific to THIS candidate — extract their actual stack, domain, and career direction.
Identify what job titles and keywords indicate a genuine fit vs generic false positives (e.g. a specialized AI/ML engineer should NOT match plain "Software Engineer" roles unless AI/ML is explicit).

Target roles from user: ${preferences.targetRoles.length > 0 ? preferences.targetRoles.join(', ') : 'Infer from resume'}
Experience levels: ${formatExperienceLevels(preferences.experienceLevels)}
Locations: ${formatLocations(preferences.locations)}`,
        },
        {
          role: 'user',
          content: `Profile name: ${resumeName}\n\nResume:\n${resumeContent.substring(0, 6000)}`,
        },
      ],
      response_format: zodResponseFormat(ResumeProfileSchema, 'resume_profile'),
    });

    await trackUsage(response.usage, 'resume_profile', context);
    return response.choices[0].message.parsed ?? null;
  } catch (error) {
    console.error('Failed to extract resume profile:', error);
    return null;
  }
}

export async function quickScreenJobs(
  listings: JobListingMeta[],
  resumeContent: string,
  preferences: JobPreferences,
  context?: EvaluatorContext,
  profile?: ResumeProfile | null,
): Promise<Map<number, { interestScore: number; note: string }>> {
  const results = new Map<number, { interestScore: number; note: string }>();
  if (listings.length === 0) return results;

  const listingSummary = listings
    .map((job, index) =>
      `${index}. ${job.title} @ ${job.company}${job.location ? ` (${job.location})` : ''}${job.workType ? ` · ${job.workType}` : ''}`,
    )
    .join('\n');

  const targetRolesText =
    preferences.targetRoles.length > 0 ? preferences.targetRoles.join(', ') : 'Infer from resume';
  const avoidText =
    preferences.avoidKeywords.length > 0 ? preferences.avoidKeywords.join(', ') : 'None';
  const profileBlock = profile ? `\n\n${formatResumeProfileBlock(profile)}` : '';

  try {
    const response = await getOpenAI().chat.completions.parse({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You pre-screen job listings before expensive full review. Score each listing 0-100.

Score HIGH (75+) only when the title clearly matches the candidate's target titles, domains, and seniority.
Score LOW (below 40) for generic titles that don't reflect the candidate's specialization (e.g. plain "Software Engineer" for an AI/ML specialist).
Hard reject (score 0-20) if title matches avoid keywords (${avoidText}) or weak-fit signals from the profile.

Target roles: ${targetRolesText}
Seniority: ${formatExperienceLevels(preferences.experienceLevels)}
Locations: ${formatLocations(preferences.locations)}${profileBlock}

Be strict. Most listings should score 20-50. Only clear matches exceed 70.`,
        },
        {
          role: 'user',
          content: `Resume excerpt:\n${resumeContent.substring(0, 3500)}\n\n---\n\nListings:\n${listingSummary}`,
        },
      ],
      response_format: zodResponseFormat(QuickScreenSchema, 'quick_screen'),
    });

    await trackUsage(response.usage, 'quick_screen', context);

    for (const row of response.choices[0].message.parsed?.results ?? []) {
      results.set(row.index, { interestScore: row.interestScore, note: row.note });
    }
  } catch (error) {
    console.error('Failed to quick-screen jobs:', error);
  }

  return results;
}

function looksLikeJobTitle(name: string): boolean {
  return /engineer|developer|scientist|architect|analyst|designer|manager|lead/i.test(name);
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim();
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}

/** Derive LinkedIn search titles from resume content and preferences. */
export async function deriveSearchKeywords(
  resumeContent: string,
  resumeName: string,
  targetRoles: string[] = [],
  context?: EvaluatorContext,
): Promise<string[]> {
  const fromPrefs = dedupeKeywords(targetRoles);
  if (fromPrefs.length >= 3) {
    return fromPrefs.slice(0, 4);
  }

  try {
    const response = await getOpenAI().chat.completions.parse({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You generate LinkedIn job search keyword phrases tailored to a specific candidate.

Rules:
- Return 3-4 specific job TITLE phrases this person should search for
- Base titles on their actual skills, domain, and career direction in the resume
- Prefer niche titles over generic ones (e.g. "AI Engineer", "ML Platform Engineer", "NLP Engineer" — NOT "Software Engineer" or "Developer" unless that is truly their only fit)
- Include stack/domain hints when relevant (LLM, TypeScript, backend, data, etc.)
- Each phrase should be 2-5 words, suitable for LinkedIn's keywords param
- Do not repeat the same phrase with minor wording changes`,
        },
        {
          role: 'user',
          content: `Profile name: ${resumeName}
${fromPrefs.length > 0 ? `User-specified target roles (include these): ${fromPrefs.join(', ')}\n` : ''}
Resume:
${resumeContent.substring(0, 5000)}`,
        },
      ],
      response_format: zodResponseFormat(SearchKeywordsSchema, 'search_keywords'),
    });

    await trackUsage(response.usage, 'search_keywords', context);

    const derived = dedupeKeywords(response.choices[0].message.parsed?.keywords ?? []);
    const merged = dedupeKeywords([...fromPrefs, ...derived]);

    if (merged.length > 0) return merged.slice(0, 4);
  } catch (error) {
    console.error('Failed to derive search keywords:', error);
  }

  if (fromPrefs.length > 0) return fromPrefs.slice(0, 4);
  if (looksLikeJobTitle(resumeName)) return [resumeName];
  return ['AI Engineer'];
}

export async function evaluateJobAlignment(
  jobDescription: string,
  resumeContent: string,
  preferences: JobPreferences = {
    experienceLevels: [],
    locations: [],
    targetRoles: [],
    avoidKeywords: [],
  },
  listingMeta?: Pick<JobListingMeta, 'title' | 'company' | 'location' | 'workType'>,
  context?: EvaluatorContext,
  profile?: ResumeProfile | null,
): Promise<JobAlignmentResult | null> {
  try {
    const experienceText = formatExperienceLevels(preferences.experienceLevels);
    const locationText = formatLocations(preferences.locations);
    const targetRolesText =
      preferences.targetRoles.length > 0 ? preferences.targetRoles.join(', ') : 'Infer from resume';
    const avoidText =
      preferences.avoidKeywords.length > 0 ? preferences.avoidKeywords.join(', ') : 'None';
    const profileBlock = profile ? `\n\n${formatResumeProfileBlock(profile)}` : '';

    const metaBlock = listingMeta
      ? `\nListing metadata:\nTitle: ${listingMeta.title}\nCompany: ${listingMeta.company}\nLocation: ${listingMeta.location ?? 'Unknown'}\nWork type: ${listingMeta.workType ?? 'Unknown'}\n`
      : '';

    const response = await getOpenAI().chat.completions.parse({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a strict technical recruiter. Most jobs are NOT a fit — your job is to filter out false positives.

Score each dimension 0-100:
- skillsScore: required skills/stack vs resume (partial overlap = 40-60, not 80+)
- experienceScore: seniority and scope vs candidate level (${experienceText})
- locationScore: geography and remote/hybrid vs preferences (${locationText})
- roleScore: job TITLE and function vs target roles (${targetRolesText}). Generic "Software Engineer" without domain match = roleScore below 40 for specialized candidates.

Compute overallScore: skills 35%, experience 25%, location 20%, role 25%.
Hard fail (recommendation=pass, overall below 50) when:
- Title is generic and doesn't match candidate's domain/specialization
- Avoid keywords appear (${avoidText})
- Clear seniority mismatch
- Job requires fundamentally different skills${profileBlock}

Recommendations (be conservative):
- strong: overall >= 82, roleScore >= 75, skillsScore >= 75
- good: overall >= 70, roleScore >= 65, skillsScore >= 65
- borderline: overall 55-69 with tradeoffs
- pass: everything else

Do NOT inflate scores for tangential overlap. A generic web dev role is a pass for an AI/ML engineer unless AI/ML is central to the role.`,
        },
        {
          role: 'user',
          content: `Resume:\n${resumeContent.substring(0, 6000)}${metaBlock}\n---\n\nJob description:\n${jobDescription.substring(0, 8000)}`,
        },
      ],
      response_format: zodResponseFormat(AlignmentSchema, 'alignment'),
    });

    await trackUsage(response.usage, 'alignment', context);

    const parsed = response.choices[0].message.parsed;
    if (!parsed) return null;

    const details: AlignmentDetails = {
      skillsScore: parsed.skillsScore,
      experienceScore: parsed.experienceScore,
      locationScore: parsed.locationScore,
      roleScore: parsed.roleScore,
      strengths: parsed.strengths,
      gaps: parsed.gaps,
      recommendation: parsed.recommendation as Recommendation,
    };

    return {
      score: parsed.overallScore,
      reason: parsed.summary,
      details,
    };
  } catch (error) {
    console.error('Failed to evaluate job alignment:', error);
    return null;
  }
}
