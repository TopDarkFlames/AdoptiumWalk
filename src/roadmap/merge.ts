import type { GuildProject, ParsedRoadmap } from "../types.js";

export function mergeRoadmap(
  guildId: string,
  readmeContent: string,
  parsed: ParsedRoadmap,
  previous?: GuildProject,
  now = new Date()
): GuildProject {
  const timestamp = now.toISOString();
  const goalHistory = structuredClone(previous?.goalHistory ?? {});

  for (const goal of previous?.goals ?? []) {
    goalHistory[goal.key] = {
      number: goal.number,
      completed: goal.completed,
      updatedAt: goal.updatedAt
    };
  }

  let nextGoalNumber = previous?.nextGoalNumber
    ?? Math.max(0, ...Object.values(goalHistory).map((entry) => entry.number)) + 1;

  const goals = parsed.goals.map((draft) => {
    const historical = goalHistory[draft.key];
    const number = historical?.number ?? nextGoalNumber++;
    const completed = historical?.completed ?? draft.completed;
    const updatedAt = historical?.updatedAt ?? timestamp;
    goalHistory[draft.key] = { number, completed, updatedAt };
    return { ...draft, number, completed, updatedAt };
  });

  const result: GuildProject = {
    guildId,
    projectName: parsed.projectName,
    readmeContent,
    goals,
    goalHistory,
    nextGoalNumber,
    importedAt: previous?.importedAt ?? timestamp,
    updatedAt: timestamp
  };
  if (previous?.reminder) result.reminder = previous.reminder;
  return result;
}

export function updateGoalStatus(
  project: GuildProject,
  goalNumber: number,
  completed: boolean,
  now = new Date()
): GuildProject {
  const goal = project.goals.find((candidate) => candidate.number === goalNumber);
  if (!goal) throw new Error(`Meta ${goalNumber} não encontrada.`);

  const timestamp = now.toISOString();
  const goals = project.goals.map((candidate) => candidate.number === goalNumber
    ? { ...candidate, completed, updatedAt: timestamp }
    : candidate);
  const goalHistory = {
    ...project.goalHistory,
    [goal.key]: { number: goal.number, completed, updatedAt: timestamp }
  };
  return { ...project, goals, goalHistory, updatedAt: timestamp };
}
