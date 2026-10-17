"use server";

import * as settings from "@/server/services/settings";
import { run } from "./run";

export async function saveAiSettingsAction(value: Parameters<typeof settings.setSetting<"ai">>[1]) {
  return run(() => settings.setSetting("ai", value));
}
export async function savePreferencesAction(value: Parameters<typeof settings.setSetting<"preferences">>[1]) {
  return run(() => settings.setSetting("preferences", value));
}
