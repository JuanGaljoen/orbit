"use server";

import * as proposals from "@/server/services/proposals";
import { run } from "./run";

export async function updateProposalAction(id: string, payload: unknown) {
  return run(() => proposals.updateProposal(id, payload));
}
export async function applyProposalAction(id: string) {
  return run(() => proposals.applyProposal(id));
}
export async function discardProposalAction(id: string) {
  return run(() => proposals.discardProposal(id));
}
