"use server";

import * as vocab from "@/server/services/vocab";
import { run } from "./run";

export async function createStatusAction(input: Parameters<typeof vocab.createStatus>[0]) {
  return run(() => vocab.createStatus(input));
}
export async function updateStatusAction(id: string, input: Parameters<typeof vocab.updateStatus>[1]) {
  return run(() => vocab.updateStatus(id, input));
}
export async function reorderStatusesAction(ids: string[]) {
  return run(() => vocab.reorderStatuses(ids));
}
export async function deleteStatusAction(id: string) {
  return run(() => vocab.deleteStatus(id));
}
export async function createPriorityAction(input: Parameters<typeof vocab.createPriority>[0]) {
  return run(() => vocab.createPriority(input));
}
export async function updatePriorityAction(id: string, input: Parameters<typeof vocab.updatePriority>[1]) {
  return run(() => vocab.updatePriority(id, input));
}
export async function deletePriorityAction(id: string) {
  return run(() => vocab.deletePriority(id));
}
export async function createLabelAction(input: Parameters<typeof vocab.createLabel>[0]) {
  return run(() => vocab.createLabel(input));
}
export async function updateLabelAction(id: string, input: Parameters<typeof vocab.updateLabel>[1]) {
  return run(() => vocab.updateLabel(id, input));
}
export async function deleteLabelAction(id: string) {
  return run(() => vocab.deleteLabel(id));
}
