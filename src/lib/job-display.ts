import type { AlignmentDetails } from './selection';
import { parseAlignmentDetails } from './selection';

const NOISE_LINE =
  /^(apply|save|share|report|easy apply|join|sign in|forgot password|new to linkedin|similar jobs|show more|see more)$/i;

export function formatDescriptionForDisplay(
  description: string,
  title: string,
  company: string,
): { text: string; isThin: boolean } {
  const normalized = description
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const titleLower = title.toLowerCase();
  const companyLower = company.toLowerCase();

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (NOISE_LINE.test(lower)) return false;
    if (lower === titleLower) return false;
    if (lower === companyLower) return false;
    if (/^scored against /i.test(lower)) return false;
    if (/user agreement|privacy policy|cookie policy/i.test(lower)) return false;
    if (/^\d+ (applicant|month|week|day|hour)/i.test(lower)) return false;
    return true;
  });

  const text = filtered.join('\n\n').trim();
  const hasBodySignals =
    /(about (the )?job|responsibilit|requirement|qualification|what you|you will|we are looking|experience with|skills)/i.test(
      text,
    );
  const isThin = text.length < 180 || (!hasBodySignals && text.length < 350);

  return { text, isThin };
}

export function getAlignmentSummary(reason: string | null | undefined): string {
  if (!reason) return 'No reasoning available.';
  return reason.split('\n')[0].trim();
}

/** Parse structured details from DB JSON or legacy multi-line alignmentReason. */
export function resolveAlignmentDetails(
  detailsJson: string | null | undefined,
  reason: string | null | undefined,
): AlignmentDetails | null {
  const fromJson = parseAlignmentDetails(detailsJson);
  if (fromJson) return fromJson;

  if (!reason) return null;

  const scoreMatch = reason.match(
    /Skills (\d+)% · Experience (\d+)% · Location (\d+)% · Role (\d+)%/,
  );
  if (!scoreMatch) return null;

  const strengthsLine = reason.match(/Strengths: (.+?)(?:\nGaps:|$)/s);
  const gapsLine = reason.match(/Gaps: (.+?)$/s);

  const parseList = (raw: string | undefined) =>
    raw
      ? raw
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const overall = reason.match(/(\d+)%/);
  let recommendation: AlignmentDetails['recommendation'] = 'good';
  const score = overall ? Number(overall[1]) : 70;
  if (score >= 80) recommendation = 'strong';
  else if (score >= 65) recommendation = 'good';
  else if (score >= 50) recommendation = 'borderline';
  else recommendation = 'pass';

  return {
    skillsScore: Number(scoreMatch[1]),
    experienceScore: Number(scoreMatch[2]),
    locationScore: Number(scoreMatch[3]),
    roleScore: Number(scoreMatch[4]),
    strengths: parseList(strengthsLine?.[1]),
    gaps: parseList(gapsLine?.[1]),
    recommendation,
  };
}
