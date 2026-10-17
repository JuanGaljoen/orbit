import { Octokit } from "@octokit/rest";
import { InvalidError } from "../errors";

export function githubConfigured() {
  return !!process.env.GITHUB_TOKEN;
}

export function webhookConfigured() {
  return !!process.env.GITHUB_WEBHOOK_SECRET;
}

let client: Octokit | null = null;

/** Read-only use: the PAT should be fine-grained with Contents/PRs/Checks/Metadata = read. */
export function octokit(): Octokit {
  if (!githubConfigured()) throw new InvalidError("GitHub isn't configured — set GITHUB_TOKEN");
  client ??= new Octokit({ auth: process.env.GITHUB_TOKEN, userAgent: "orbit" });
  return client;
}

/** Test hook. */
export function setOctokit(o: Octokit | null) {
  client = o;
}
