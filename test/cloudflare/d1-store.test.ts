import assert from "node:assert/strict";
import test from "node:test";
import { D1Store } from "../../src/cloudflare/d1-store.js";
import { mergeRoadmap } from "../../src/roadmap/merge.js";
import { parseRoadmap } from "../../src/roadmap/parser.js";

type Row = Record<string, string | number | null>;

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly projects: Map<string, Row>,
    private readonly cooldowns: Map<string, number>
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const normalized = this.normalized();
    if (normalized.includes("FROM AI_COOLDOWNS")) {
      const usedAt = this.cooldowns.get(`${String(this.values[0])}:${String(this.values[1])}`);
      return (usedAt === undefined ? null : { used_at: usedAt }) as T | null;
    }
    return (this.projects.get(String(this.values[0])) ?? null) as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      results: [...this.projects.values()] as T[],
      meta: { changes: 0 }
    } as D1Result<T>;
  }

  async run<T>(): Promise<D1Result<T>> {
    const normalized = this.normalized();
    let changed = 0;
    if (normalized.startsWith("INSERT INTO AI_COOLDOWNS")) {
      this.cooldowns.set(`${String(this.values[0])}:${String(this.values[1])}`, Number(this.values[2]));
      changed = 1;
    } else if (normalized.startsWith("INSERT INTO GUILD_PROJECTS")) {
      const guildId = String(this.values[0]);
      if (!this.projects.has(guildId)) {
        this.projects.set(guildId, this.projectRow(this.values, 1));
        changed = 1;
      }
    } else if (normalized.startsWith("UPDATE GUILD_PROJECTS")) {
      const guildId = String(this.values[8]);
      const revision = Number(this.values[9]);
      const current = this.projects.get(guildId);
      if (current?.revision === revision) {
        this.projects.set(guildId, this.projectRow([guildId, ...this.values.slice(0, 8)], revision + 1));
        changed = 1;
      }
    }
    return { success: true, results: [], meta: { changes: changed } } as unknown as D1Result<T>;
  }

  private normalized(): string {
    return this.query.replace(/\s+/g, " ").trim().toUpperCase();
  }

  private projectRow(values: unknown[], revision: number): Row {
    return {
      guild_id: String(values[0]),
      project_name: String(values[1]),
      readme_content: String(values[2]),
      goals_json: String(values[3]),
      goal_history_json: String(values[4]),
      next_goal_number: Number(values[5]),
      reminder_json: values[6] === null ? null : String(values[6]),
      imported_at: String(values[7]),
      updated_at: String(values[8]),
      revision
    };
  }
}

class FakeD1Database {
  readonly projects = new Map<string, Row>();
  readonly cooldowns = new Map<string, number>();

  prepare(query: string): D1PreparedStatement {
    return new FakeD1Statement(query, this.projects, this.cooldowns) as unknown as D1PreparedStatement;
  }
}

test("persiste projetos e cooldowns usando a interface D1", async () => {
  const database = new FakeD1Database();
  const store = new D1Store(database as unknown as D1Database);
  const project = mergeRoadmap("guild", "README", parseRoadmap("# Projeto\n- [ ] Entregar"), undefined);
  await store.updateGuild("guild", () => ({ project, result: undefined }));
  assert.equal((await store.getGuild("guild"))?.projectName, "Projeto");
  assert.equal((await store.listGuilds()).length, 1);

  assert.equal(await store.consumeAiCooldown("guild", "user", 20, 1_000), 0);
  assert.equal(await store.consumeAiCooldown("guild", "user", 20, 2_000), 19);
  assert.equal(await store.consumeAiCooldown("guild", "user", 20, 22_000), 0);
});
