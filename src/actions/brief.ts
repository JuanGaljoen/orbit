"use server";

import { implementationBrief } from "@/server/services/brief";
import { run } from "./run";

export async function briefAction(key: string) {
  return run(() => implementationBrief(key), { refresh: false });
}
