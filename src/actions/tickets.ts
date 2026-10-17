"use server";

import * as tickets from "@/server/services/tickets";
import { run } from "./run";

export async function createTicketAction(input: tickets.CreateTicketInput) {
  return run(() => tickets.createTicket(input));
}
export async function updateTicketAction(id: string, input: tickets.UpdateTicketInput) {
  return run(() => tickets.updateTicket(id, input));
}
export async function moveTicketAction(id: string, statusId: string, position: number) {
  return run(() => tickets.moveTicket(id, statusId, position));
}
export async function archiveTicketAction(id: string, archived: boolean) {
  return run(() => tickets.setTicketArchived(id, archived));
}
export async function deleteTicketAction(id: string) {
  return run(() => tickets.deleteTicket(id));
}
export async function addDependencyAction(ticketId: string, blockedById: string) {
  return run(() => tickets.addDependency(ticketId, blockedById));
}
export async function removeDependencyAction(ticketId: string, blockedById: string) {
  return run(() => tickets.removeDependency(ticketId, blockedById));
}
export async function addCommentAction(ticketId: string, body: string) {
  return run(() => tickets.addComment(ticketId, body));
}
export async function updateCommentAction(id: string, body: string) {
  return run(() => tickets.updateComment(id, body));
}
export async function deleteCommentAction(id: string) {
  return run(() => tickets.deleteComment(id));
}
export async function bulkUpdateTicketsAction(input: Parameters<typeof tickets.bulkUpdateTickets>[0]) {
  return run(() => tickets.bulkUpdateTickets(input));
}
export async function bulkDeleteTicketsAction(ids: string[]) {
  return run(() => tickets.bulkDeleteTickets(ids));
}
/** Read-only lookups for client pickers (no router refresh). */
export async function findTicketsAction(q: string, projectId?: string) {
  return run(() => tickets.listTickets({ q, projectIds: projectId ? [projectId] : undefined, limit: 20 }), {
    refresh: false,
  });
}
