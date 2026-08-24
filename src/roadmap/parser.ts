import type { GoalDraft, ParsedRoadmap } from "../types.js";

export class RoadmapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoadmapValidationError";
  }
}

interface Heading {
  depth: number;
  text: string;
}

const FALLBACK_HEADING_WORDS = /\b(?:meta|objetivo|fase|etapa|sprint|milestone)\b/i;

function withoutAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeIdentity(value: string): string {
  return withoutAccents(value)
    .toLocaleLowerCase("pt-BR")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 500 ? normalized : `${normalized.slice(0, 499)}…`;
}

function identityKey(section: string, text: string, occurrence: number): string {
  const value = `${normalizeIdentity(section)}\n${normalizeIdentity(text)}\n${occurrence}`;
  let first = 0xdeadbeef ^ value.length;
  let second = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2_654_435_761);
    second = Math.imul(second ^ code, 1_597_334_677);
  }
  first = Math.imul(first ^ (first >>> 16), 2_246_822_507)
    ^ Math.imul(second ^ (second >>> 13), 3_266_489_909);
  second = Math.imul(second ^ (second >>> 16), 2_246_822_507)
    ^ Math.imul(first ^ (first >>> 13), 3_266_489_909);
  return `${(second >>> 0).toString(16).padStart(8, "0")}${(first >>> 0).toString(16).padStart(8, "0")}`;
}

function currentSection(headings: Heading[], projectName: string): string {
  const relevant = headings.filter((heading) => heading.depth > 1);
  return (relevant.length ? relevant : headings).map((heading) => heading.text).join(" › ") || projectName;
}

export function parseRoadmap(
  content: string,
  suppliedProjectName?: string,
  maxGoals = 300
): ParsedRoadmap {
  const normalizedContent = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalizedContent.trim()) {
    throw new RoadmapValidationError("O arquivo está vazio.");
  }

  const lines = normalizedContent.split("\n");
  const headings: Heading[] = [];
  const fallbackHeadings: Array<{ text: string; section: string }> = [];
  const checkboxGoals: Array<{ text: string; section: string; completed: boolean }> = [];
  let firstHeading = "";

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch?.[1] && headingMatch[2]) {
      const depth = headingMatch[1].length;
      const text = visibleText(headingMatch[2]);
      if (!firstHeading) firstHeading = text;

      while (headings.length && (headings.at(-1)?.depth ?? 0) >= depth) headings.pop();
      headings.push({ depth, text });

      if (FALLBACK_HEADING_WORDS.test(withoutAccents(text))) {
        fallbackHeadings.push({ text, section: currentSection(headings, firstHeading || text) });
      }
      continue;
    }

    const checkboxMatch = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (checkboxMatch?.[1] !== undefined && checkboxMatch[2]) {
      checkboxGoals.push({
        text: visibleText(checkboxMatch[2]),
        section: currentSection(headings, suppliedProjectName || firstHeading || "Roadmap"),
        completed: checkboxMatch[1].toLowerCase() === "x"
      });
    }
  }

  const projectName = visibleText(suppliedProjectName?.trim() || firstHeading || "Projeto sem nome");
  const rawGoals = checkboxGoals.length
    ? checkboxGoals
    : fallbackHeadings.map((heading) => ({ ...heading, completed: false }));

  if (!rawGoals.length) {
    throw new RoadmapValidationError(
      "Nenhuma meta foi encontrada. Use checkboxes Markdown ou títulos como Meta, Objetivo, Fase, Etapa, Sprint ou Milestone."
    );
  }
  if (rawGoals.length > maxGoals) {
    throw new RoadmapValidationError(`O arquivo contém ${rawGoals.length} metas; o limite é ${maxGoals}.`);
  }

  const occurrenceByIdentity = new Map<string, number>();
  const goals: GoalDraft[] = rawGoals.map((goal) => {
    const identity = `${normalizeIdentity(goal.section)}\n${normalizeIdentity(goal.text)}`;
    const occurrence = (occurrenceByIdentity.get(identity) ?? 0) + 1;
    occurrenceByIdentity.set(identity, occurrence);
    return { ...goal, key: identityKey(goal.section, goal.text, occurrence) };
  });

  return { projectName, goals };
}
