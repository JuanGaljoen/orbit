"use server";

import { searchAll } from "@/server/services/search";
import { run } from "./run";

export async function searchAction(q: string) {
  return run(() => searchAll(q), { refresh: false });
}
