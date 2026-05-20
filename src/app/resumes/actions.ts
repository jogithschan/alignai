"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getResumes() {
  return await prisma.resume.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function addResume(
  name: string,
  content: string,
  experienceLevels: string[],
  locations: string[],
  targetRoles: string[] = [],
  avoidKeywords: string[] = [],
) {
  const count = await prisma.resume.count();

  await prisma.resume.create({
    data: {
      name,
      content,
      experienceLevels: JSON.stringify(experienceLevels),
      locations: JSON.stringify(locations),
      targetRoles: JSON.stringify(targetRoles),
      avoidKeywords: JSON.stringify(avoidKeywords),
      isActive: count === 0,
    },
  });

  revalidatePath("/resumes");
}

export async function updateResumePreferences(
  id: string,
  experienceLevels: string[],
  locations: string[],
  targetRoles: string[] = [],
  avoidKeywords: string[] = [],
) {
  await prisma.resume.update({
    where: { id },
    data: {
      experienceLevels: JSON.stringify(experienceLevels),
      locations: JSON.stringify(locations),
      targetRoles: JSON.stringify(targetRoles),
      avoidKeywords: JSON.stringify(avoidKeywords),
    },
  });

  revalidatePath("/resumes");
}

export async function setActiveResume(id: string) {
  await prisma.resume.updateMany({
    data: { isActive: false },
  });

  await prisma.resume.update({
    where: { id },
    data: { isActive: true },
  });

  revalidatePath("/resumes");
}

export async function deleteResume(id: string) {
  await prisma.resume.delete({
    where: { id },
  });

  revalidatePath("/resumes");
}
