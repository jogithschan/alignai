export type Recommendation = 'strong' | 'good' | 'borderline' | 'pass';

export type AlignmentDetails = {
  skillsScore: number;
  experienceScore: number;
  locationScore: number;
  roleScore: number;
  strengths: string[];
  gaps: string[];
  recommendation: Recommendation;
};

export type JobListingMeta = {
  title: string;
  company: string;
  url: string;
  location?: string;
  workType?: string;
  seniorityHint?: string;
};

export const QUALIFYING_MIN_SCORE = 68;
export const MIN_SKILLS_SCORE = 58;
export const MIN_ROLE_SCORE = 58;
export const MAX_SAVED_JOBS = 10;
export const MAX_LISTINGS_TO_COLLECT = 40;
export const MAX_JOBS_TO_EVALUATE = 20;
export const QUICK_SCREEN_THRESHOLD = 55;
export const MIN_TITLE_RELEVANCE = 45;

export function parseAlignmentDetails(raw: string | null | undefined): AlignmentDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AlignmentDetails;
  } catch {
    return null;
  }
}

export function formatAlignmentReason(details: AlignmentDetails, summary: string): string {
  const parts = [
    summary,
    `Skills ${details.skillsScore}% · Experience ${details.experienceScore}% · Location ${details.locationScore}% · Role ${details.roleScore}%`,
  ];
  if (details.strengths.length > 0) {
    parts.push(`Strengths: ${details.strengths.join('; ')}`);
  }
  if (details.gaps.length > 0) {
    parts.push(`Gaps: ${details.gaps.join('; ')}`);
  }
  return parts.join('\n');
}

export function passesSelectionGate(
  overallScore: number,
  details: AlignmentDetails,
): boolean {
  if (details.recommendation === 'pass') return false;
  if (details.recommendation === 'borderline' && overallScore < 75) return false;
  if (overallScore < QUALIFYING_MIN_SCORE) return false;
  if (details.skillsScore < MIN_SKILLS_SCORE) return false;
  if (details.roleScore < MIN_ROLE_SCORE) return false;
  return true;
}

/** How well a job title matches resume-derived search titles and target roles. */
export function scoreTitleRelevance(title: string, titleSignals: string[]): number {
  const signals = titleSignals
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1);
  if (signals.length === 0) return 50;

  const t = title.toLowerCase().trim();

  for (const signal of signals) {
    if (t.includes(signal) || signal.includes(t)) return 92;
    const words = signal.split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) continue;
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits === words.length) return 88;
    if (hits / words.length >= 0.6) return 72;
  }

  // Penalize generic titles when candidate has specific target signals
  if (
    /^(senior |staff |principal )?(software|full.?stack|backend|frontend|web) (engineer|developer)$/i.test(
      title.trim(),
    )
  ) {
    return 18;
  }

  return 32;
}

export function isTitleRelevant(title: string, titleSignals: string[]): boolean {
  return scoreTitleRelevance(title, titleSignals) >= MIN_TITLE_RELEVANCE;
}

export function matchesAvoidKeywords(text: string, avoidKeywords: string[]): boolean {
  const haystack = text.toLowerCase();
  return avoidKeywords.some((keyword) => haystack.includes(keyword.toLowerCase().trim()));
}

export function scoreLocationHint(location: string | undefined, preferredLocations: string[]): number {
  if (!location || preferredLocations.length === 0) return 50;

  const normalized = location.toLowerCase();
  for (const pref of preferredLocations) {
    const p = pref.toLowerCase();
    if (normalized.includes(p) || p.includes(normalized)) return 90;
    if (p === 'remote' && /remote|work from home|wfh|anywhere/i.test(normalized)) return 95;
    if (/remote/i.test(normalized) && preferredLocations.some((l) => /remote/i.test(l))) return 95;
  }

  return 20;
}

export function inferSeniorityFromTitle(title: string): string | undefined {
  const t = title.toLowerCase();
  if (/\b(intern|internship|co-op)\b/.test(t)) return 'intern';
  if (/\b(junior|entry|graduate|new grad|associate)\b/.test(t)) return 'entry';
  if (/\b(staff|principal|distinguished|fellow)\b/.test(t)) return 'staff';
  if (/\b(lead|manager|director|head of|vp)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  if (/\b(all levels|mid-level|mid level)\b/.test(t)) return 'mid';
  return undefined;
}

export function scoreSeniorityHint(
  hint: string | undefined,
  preferredLevels: string[],
): number {
  if (!hint || preferredLevels.length === 0) return 50;

  const levelOrder = ['intern', 'entry', 'mid', 'senior', 'staff', 'lead'];
  const hintIdx = levelOrder.indexOf(hint);
  if (hintIdx === -1) return 50;

  let best = 0;
  for (const level of preferredLevels) {
    const idx = levelOrder.indexOf(level);
    if (idx === -1) continue;
    const distance = Math.abs(idx - hintIdx);
    const score = distance === 0 ? 95 : distance === 1 ? 75 : distance === 2 ? 45 : 15;
    best = Math.max(best, score);
  }
  return best;
}

export function computeListingPriorScore(
  listing: JobListingMeta,
  preferences: { locations: string[]; experienceLevels: string[]; targetRoles: string[] },
  titleSignals: string[] = [],
): number {
  const titleScore = scoreTitleRelevance(
    listing.title,
    titleSignals.length > 0 ? titleSignals : preferences.targetRoles,
  );

  let score = Math.round(
    titleScore * 0.45 +
      scoreLocationHint(listing.location, preferences.locations) * 0.25 +
      scoreSeniorityHint(
        listing.seniorityHint ?? inferSeniorityFromTitle(listing.title),
        preferences.experienceLevels,
      ) * 0.3,
  );

  if (/remote/i.test(listing.workType ?? '') || /remote/i.test(listing.location ?? '')) {
    if (preferences.locations.some((l) => /remote/i.test(l))) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}
