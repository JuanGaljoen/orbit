"use server";

import { InvalidError } from "@/server/errors";
import { syncRepository } from "@/server/github/sync";
import * as github from "@/server/services/github";
import { run } from "./run";

export async function listAccessibleReposAction() {
  return run(async () => {
    try {
      return await github.listAccessibleRepos();
    } catch (err) {
      throw new InvalidError(`GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, { refresh: false });
}
export async function connectRepositoryAction(fullName: string) {
  return run(() => github.connectRepository(fullName));
}
export async function disconnectRepositoryAction(id: string) {
  return run(() => github.disconnectRepository(id));
}
/** Sync failures are recorded on the repository and surfaced as a normal error, not a crash. */
export async function syncRepositoryAction(id: string) {
  return run(async () => {
    try {
      return await syncRepository(id);
    } catch (err) {
      throw new InvalidError(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
export async function addManualLinkAction(input: Parameters<typeof github.addManualLink>[0]) {
  return run(() => github.addManualLink(input));
}
export async function removeLinkAction(id: string) {
  return run(() => github.removeLink(id));
}
export async function acceptSuggestionAction(id: string) {
  return run(() => github.acceptSuggestion(id));
}
export async function dismissSuggestionAction(id: string) {
  return run(() => github.dismissSuggestion(id));
}
