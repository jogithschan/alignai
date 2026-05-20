import { isLinkedInJobsUrl } from "./linkedin";

export const EXPERIENCE_LEVELS = [
  { id: "intern", label: "Intern / New Grad" },
  { id: "entry", label: "Entry / Junior" },
  { id: "mid", label: "Mid-Level" },
  { id: "senior", label: "Senior" },
  { id: "staff", label: "Staff / Principal" },
  { id: "lead", label: "Lead / Manager" },
] as const;

export type ExperienceLevelId = (typeof EXPERIENCE_LEVELS)[number]["id"];

export type JobPreferences = {
  experienceLevels: string[];
  locations: string[];
  targetRoles: string[];
  avoidKeywords: string[];
};

export function parsePreferences(
  experienceLevelsJson: string,
  locationsJson: string,
  targetRolesJson = "[]",
  avoidKeywordsJson = "[]",
): JobPreferences {
  const parseArray = (raw: string) => {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  };

  return {
    experienceLevels: parseArray(experienceLevelsJson),
    locations: parseArray(locationsJson),
    targetRoles: parseArray(targetRolesJson),
    avoidKeywords: parseArray(avoidKeywordsJson),
  };
}

export function formatExperienceLevels(ids: string[]): string {
  if (ids.length === 0) return "Any";
  return ids
    .map((id) => EXPERIENCE_LEVELS.find((l) => l.id === id)?.label ?? id)
    .join(", ");
}

export function formatLocations(locations: string[]): string {
  return locations.length > 0 ? locations.join(", ") : "Any";
}

export const SUGGESTED_LOCATIONS = [
  "Remote",
  "United States",
  "Canada",
  "United Kingdom",
  "Europe",
  "India",
  "Bengaluru",
  "San Francisco Bay Area",
  "New York City",
] as const;

/** LinkedIn f_E experience filter values */
export const LINKEDIN_EXPERIENCE_MAP: Record<string, string> = {
  intern: "1", // Internship
  entry: "2", // Entry level
  mid: "4", // Mid-Senior level
  senior: "4",
  staff: "5", // Director
  lead: "6", // Executive
};

export function buildLinkedInExperienceFilter(experienceLevels: string[]): string | null {
  const values = [...new Set(
    experienceLevels.map((id) => LINKEDIN_EXPERIENCE_MAP[id]).filter(Boolean),
  )];
  return values.length > 0 ? values.join(",") : null;
}

export const LISTINGS_PER_LOCATION = 8;

export type LinkedInSearchQuery = {
  location?: string;
  keyword: string;
  url: string;
};

/**
 * Build LinkedIn search queries — one independent search per location × title keyword.
 * Locations are the outer loop so each geography gets its own dedicated search pass.
 */
export function buildLinkedInSearchPlan(
  baseUrl: string,
  preferences: JobPreferences,
  searchKeywords: string[] = [],
): LinkedInSearchQuery[] {
  if (!isLinkedInJobsUrl(baseUrl)) {
    return [{ location: undefined, keyword: '', url: baseUrl }];
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return [{ location: undefined, keyword: '', url: baseUrl }];
  }

  if (!parsed.pathname.includes('/jobs/search')) {
    return [{ location: undefined, keyword: '', url: baseUrl }];
  }

  const experienceFilter = buildLinkedInExperienceFilter(preferences.experienceLevels);
  const locations =
    preferences.locations.length > 0
      ? preferences.locations
      : [parsed.searchParams.get('location')].filter((v): v is string => Boolean(v));

  const keywords =
    searchKeywords.length > 0
      ? searchKeywords
      : [parsed.searchParams.get('keywords')].filter((v): v is string => Boolean(v));

  if (keywords.length === 0) keywords.push('');

  const locationList = locations.length > 0 ? locations : [undefined];
  const plan: LinkedInSearchQuery[] = [];

  const applyFilters = (url: URL, location?: string) => {
    url.hostname = 'www.linkedin.com';
    url.searchParams.delete('f_E');
    url.searchParams.delete('f_WT');

    if (location) {
      url.searchParams.set('location', location);
      if (/remote/i.test(location)) {
        url.searchParams.set('f_WT', '2');
      }
    } else {
      url.searchParams.delete('location');
    }

    if (experienceFilter) {
      url.searchParams.set('f_E', experienceFilter);
    }
  };

  // Location-first: each location is searched independently
  for (const location of locationList) {
    for (const keyword of keywords) {
      const url = new URL(baseUrl);
      if (keyword) {
        url.searchParams.set('keywords', keyword);
      } else {
        url.searchParams.delete('keywords');
      }
      applyFilters(url, location);
      plan.push({
        location,
        keyword: keyword || '(any title)',
        url: url.toString(),
      });
    }
  }

  return plan.length > 0 ? plan : [{ location: undefined, keyword: '', url: baseUrl }];
}

/** @deprecated Use buildLinkedInSearchPlan */
export function buildLinkedInSearchUrls(
  baseUrl: string,
  preferences: JobPreferences,
  searchKeywords: string[] = [],
): string[] {
  return buildLinkedInSearchPlan(baseUrl, preferences, searchKeywords).map((q) => q.url);
}
