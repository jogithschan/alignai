"use server";

import { prisma } from "@/lib/prisma";
import { QUALIFYING_MIN_SCORE } from "@/lib/selection";
import { revalidatePath } from "next/cache";

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

export async function getMatchJobs() {
  return await prisma.job.findMany({
    where: {
      matchTier: "MATCH",
      alignmentScore: { gte: QUALIFYING_MIN_SCORE },
    },
    orderBy: { alignmentScore: "desc" },
    include: jobInclude,
  });
}

export async function getReviewJobs() {
  return await prisma.job.findMany({
    where: { matchTier: "REVIEW" },
    orderBy: { alignmentScore: "desc" },
    include: jobInclude,
  });
}

/** @deprecated Use getMatchJobs */
export async function getJobs() {
  return getMatchJobs();
}

export async function updateJobStatus(id: string, status: string) {
  await prisma.job.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/");
}

export async function promoteJobToMatch(id: string) {
  await prisma.job.update({
    where: { id },
    data: { matchTier: "MATCH" },
  });
  revalidatePath("/");
}
