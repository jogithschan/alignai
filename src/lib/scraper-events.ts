export type ScrapeJobPayload = {
  id: string;
  title: string;
  company: string;
  url: string;
  description: string;
  alignmentScore: number | null;
  alignmentReason: string | null;
  alignmentDetails: string | null;
  matchTier: string;
  evalStatus?: 'evaluating' | 'complete';
  status: string;
  resume: {
    name: string;
    experienceLevels: string;
    locations: string;
    targetRoles: string;
    avoidKeywords: string;
  } | null;
};

export type ScrapeEvent =
  | { type: 'progress'; message: string }
  | { type: 'job'; job: ScrapeJobPayload }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };

export type ScraperCallbacks = {
  onProgress?: (message: string) => void | Promise<void>;
  onJob?: (job: ScrapeJobPayload) => void | Promise<void>;
};
