"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getSettings() {
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    return await prisma.settings.create({
      data: { targetUrls: "[]" }
    });
  }
  return settings;
}

export async function updateSettings(id: string, targetUrls: string) {
  await prisma.settings.update({
    where: { id },
    data: { targetUrls },
  });
  
  revalidatePath("/settings");
}
