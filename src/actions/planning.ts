"use server";

import * as milestones from "@/server/services/milestones";
import * as objectives from "@/server/services/objectives";
import * as projects from "@/server/services/projects";
import { run } from "./run";

export async function createProjectAction(input: projects.ProjectInput) {
  return run(() => projects.createProject(input));
}
export async function updateProjectAction(id: string, input: Parameters<typeof projects.updateProject>[1]) {
  return run(() => projects.updateProject(id, input));
}
export async function archiveProjectAction(id: string, archived: boolean) {
  return run(() => projects.setProjectArchived(id, archived));
}
export async function deleteProjectAction(id: string) {
  return run(() => projects.deleteProject(id));
}
export async function setProjectReposAction(projectId: string, repositoryIds: string[]) {
  return run(() => projects.setProjectRepos(projectId, repositoryIds));
}

export async function createObjectiveAction(input: Parameters<typeof objectives.createObjective>[0]) {
  return run(() => objectives.createObjective(input));
}
export async function updateObjectiveAction(id: string, input: Parameters<typeof objectives.updateObjective>[1]) {
  return run(() => objectives.updateObjective(id, input));
}
export async function archiveObjectiveAction(id: string, archived: boolean) {
  return run(() => objectives.setObjectiveArchived(id, archived));
}
export async function deleteObjectiveAction(id: string) {
  return run(() => objectives.deleteObjective(id));
}

export async function createMilestoneAction(input: Parameters<typeof milestones.createMilestone>[0]) {
  return run(() => milestones.createMilestone(input));
}
export async function updateMilestoneAction(id: string, input: Parameters<typeof milestones.updateMilestone>[1]) {
  return run(() => milestones.updateMilestone(id, input));
}
export async function completeMilestoneAction(id: string, completed: boolean) {
  return run(() => milestones.setMilestoneCompleted(id, completed));
}
export async function deleteMilestoneAction(id: string) {
  return run(() => milestones.deleteMilestone(id));
}
export async function addMilestoneDepAction(milestoneId: string, dependsOnId: string) {
  return run(() => milestones.addMilestoneDep(milestoneId, dependsOnId));
}
export async function removeMilestoneDepAction(milestoneId: string, dependsOnId: string) {
  return run(() => milestones.removeMilestoneDep(milestoneId, dependsOnId));
}
