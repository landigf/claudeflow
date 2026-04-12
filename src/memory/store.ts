import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * File-based memory store for ClaudeFlow pipelines.
 * Stores key-value pairs as JSON files — git-friendly, inspectable, no database.
 *
 * Usage:
 *   const memory = new MemoryStore(".claudeflow/memory");
 *   memory.set("last-audit", { date: "2026-04-12", issues: 5 });
 *   const last = memory.get("last-audit");
 */
export class MemoryStore {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = path.resolve(dir);
    if (!existsSync(this.#dir)) {
      mkdirSync(this.#dir, { recursive: true });
    }
  }

  /** Get a value by key. Returns undefined if not found. */
  get<T = unknown>(key: string): T | undefined {
    const filePath = this.#keyPath(key);
    if (!existsSync(filePath)) return undefined;
    try {
      const raw = readFileSync(filePath, "utf-8");
      const entry = JSON.parse(raw) as MemoryEntry;
      return entry.value as T;
    } catch {
      return undefined;
    }
  }

  /** Set a value by key. Overwrites if exists. */
  set(key: string, value: unknown): void {
    const entry: MemoryEntry = {
      key,
      value,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(this.#keyPath(key), JSON.stringify(entry, null, 2));
  }

  /** Check if a key exists. */
  has(key: string): boolean {
    return existsSync(this.#keyPath(key));
  }

  /** Delete a key. */
  delete(key: string): boolean {
    const filePath = this.#keyPath(key);
    if (!existsSync(filePath)) return false;
    const { unlinkSync } = require("node:fs") as typeof import("node:fs");
    unlinkSync(filePath);
    return true;
  }

  /** List all keys. */
  keys(): string[] {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    if (!existsSync(this.#dir)) return [];
    return readdirSync(this.#dir)
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(/\.json$/, ""));
  }

  /** Get all entries as a record. */
  all(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of this.keys()) {
      result[key] = this.get(key);
    }
    return result;
  }

  #keyPath(key: string): string {
    // Sanitize key for filesystem
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.#dir, `${safe}.json`);
  }
}

interface MemoryEntry {
  key: string;
  value: unknown;
  updatedAt: string;
}
