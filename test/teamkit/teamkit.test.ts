import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  doctorTeamKit,
  formatDoctorReport,
  initTeamKit,
  parseAssistantList,
  parseTeamKitPreset,
} from "../../src/index.js";

describe("Team Kit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "cf-teamkit-"));
  });

  it("initializes the hackathon preset on a clean repo", () => {
    const result = initTeamKit(dir, {
      preset: "hackathon",
      assistants: ["claude", "codex", "copilot"],
      now: new Date("2026-04-15T08:00:00.000Z"),
    });

    expect(result.created.length).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, ".claudeflow/teamkit.json"))).toBe(true);
    expect(existsSync(path.join(dir, ".github/copilot-instructions.md"))).toBe(true);
    expect(existsSync(path.join(dir, ".claude/commands/brainstorm/start.md"))).toBe(true);
    expect(existsSync(path.join(dir, ".claude/commands/tracks/braynr.md"))).toBe(true);
    expect(existsSync(path.join(dir, "README.md"))).toBe(true);
    expect(existsSync(path.join(dir, ".gitignore"))).toBe(true);
    expect(existsSync(path.join(dir, "doc/specs/_templates/01-brainstorm.md"))).toBe(true);
    expect(existsSync(path.join(dir, "explainit/hackathon.md"))).toBe(true);
    expect(existsSync(path.join(dir, "explainit/startup.md"))).toBe(true);
    expect(existsSync(path.join(dir, "explainit/macbook-m3-pro.md"))).toBe(true);
    expect(existsSync(path.join(dir, ".env.example"))).toBe(true);
    expect(existsSync(path.join(dir, "explainit/gdg-ai-hack-2026/README.md"))).toBe(true);
    expect(existsSync(path.join(dir, "explainit/gdg-ai-hack-2026/braynr-learning.md"))).toBe(true);
    expect(existsSync(path.join(dir, "pipelines/hackathon/idea-from-repo.yaml"))).toBe(true);
    expect(existsSync(path.join(dir, "pipelines/hackathon/tracks/braynr-learning-pack.yaml"))).toBe(
      true,
    );

    const config = JSON.parse(
      readFileSync(path.join(dir, ".claudeflow/teamkit.json"), "utf-8"),
    ) as {
      runtimeProfiles: { cheap: { provider: string; model: string }; local: { model: string } };
    };
    expect(config.runtimeProfiles.cheap.provider).toBe("gemini");
    expect(config.runtimeProfiles.cheap.model).toBe("gemini-2.5-flash-lite");
    expect(config.runtimeProfiles.local.model).toBe("auto");

    const agents = readFileSync(path.join(dir, "AGENTS.md"), "utf-8");
    expect(agents).toContain("claudeflow-teamkit:start");
    expect(agents).toContain("03-tasks.md");

    const repoReadme = readFileSync(path.join(dir, "README.md"), "utf-8");
    expect(repoReadme).toContain("claudeflow-teamkit-readme:start");
    expect(repoReadme).toContain("Recommended runtime path");

    const explainit = readFileSync(path.join(dir, "explainit/hackathon.md"), "utf-8");
    expect(explainit).toContain("What API key to buy first");
    expect(explainit).toContain("GEMINI_API_KEY");
    expect(explainit).toContain(".env.local");
    expect(explainit).toContain("cheap");
    expect(explainit).toContain("GDG AI HACK");

    const macbook = readFileSync(path.join(dir, "explainit/macbook-m3-pro.md"), "utf-8");
    expect(macbook).toContain("MacBook Pro M3 Pro");
    expect(macbook).toContain("Automatic default: `auto`");

    const gdgPack = readFileSync(path.join(dir, "explainit/gdg-ai-hack-2026/README.md"), "utf-8");
    expect(gdgPack).toContain("Braynr");
    expect(gdgPack).toContain("Luxonis");
    expect(gdgPack).toContain("MSI");
  });

  it("is idempotent and preserves existing managed files unless force is used", () => {
    initTeamKit(dir, { preset: "hackathon", assistants: ["claude", "copilot"] });

    const commandPath = path.join(dir, ".claude/commands/brainstorm/start.md");
    writeFileSync(commandPath, "# custom teammate workflow\n");

    const result = initTeamKit(dir, { preset: "hackathon", assistants: ["claude", "copilot"] });
    expect(result.skipped).toContain(".claude/commands/brainstorm/start.md");
    expect(readFileSync(commandPath, "utf-8")).toBe("# custom teammate workflow\n");

    const forced = initTeamKit(dir, {
      preset: "hackathon",
      assistants: ["claude", "copilot"],
      force: true,
    });
    expect(forced.updated).toContain(".claude/commands/brainstorm/start.md");
    expect(readFileSync(commandPath, "utf-8")).toContain("/brainstorm:start");
  });

  it("merges presets and assistants across repeated init runs", () => {
    initTeamKit(dir, { preset: "hackathon", assistants: ["claude", "copilot"] });
    const result = initTeamKit(dir, { preset: "startup", assistants: ["codex"] });

    expect(result.updated).toContain(".claudeflow/teamkit.json");
    expect(existsSync(path.join(dir, "pipelines/hackathon/idea-from-repo.yaml"))).toBe(true);
    expect(existsSync(path.join(dir, "pipelines/startup/cofounder-report.yaml"))).toBe(true);
    expect(existsSync(path.join(dir, ".claude/commands/startup/cofounder.md"))).toBe(true);

    const config = JSON.parse(
      readFileSync(path.join(dir, ".claudeflow/teamkit.json"), "utf-8"),
    ) as {
      preset: string;
      enabledPresets: string[];
      assistants: string[];
      runtimeProfiles: { cheap: { provider: string; model: string } };
    };

    expect(config.preset).toBe("startup");
    expect(config.enabledPresets).toEqual(["hackathon", "startup"]);
    expect(config.assistants).toEqual(["claude", "copilot", "codex"]);
    expect(config.runtimeProfiles.cheap.provider).toBe("openai");
    expect(config.runtimeProfiles.cheap.model).toBe("gpt-5-mini");
  });

  it("appends a managed section to an existing AGENTS file without replacing user content", () => {
    writeFileSync(path.join(dir, "AGENTS.md"), "# Existing guide\n\nKeep tests fast.\n");

    initTeamKit(dir, { preset: "hackathon", assistants: ["codex"] });

    const content = readFileSync(path.join(dir, "AGENTS.md"), "utf-8");
    expect(content).toContain("# Existing guide");
    expect(content).toContain("Keep tests fast.");
    expect(content).toContain("claudeflow-teamkit:start");
  });

  it("reports actionable warnings for missing runtime dependencies", () => {
    initTeamKit(dir, {
      preset: "hackathon",
      assistants: ["claude", "codex", "copilot"],
    });

    const report = doctorTeamKit(dir, {
      env: {},
      commandExists: () => false,
    });

    expect(report.ok).toBe(true);
    expect(report.issues.some((issue) => issue.check === "cheap-env")).toBe(true);
    expect(report.issues.some((issue) => issue.check === "deep-tool")).toBe(true);
    expect(report.issues.some((issue) => issue.check === "local-tool")).toBe(true);

    const text = formatDoctorReport(report);
    expect(text).toContain("GEMINI_API_KEY");
    expect(text).toContain("claude");
    expect(text).toContain("ollama");
  });

  it("warns when the local auto-router models are not installed", () => {
    initTeamKit(dir, {
      preset: "hackathon",
      assistants: ["claude", "codex", "copilot"],
    });

    const report = doctorTeamKit(dir, {
      env: { GEMINI_API_KEY: "x" },
      commandExists: () => true,
      listOllamaModels: () => ["qwen2.5-coder:3b"],
    });

    expect(report.ok).toBe(true);
    const issue = report.issues.find((entry) => entry.check === "local-models");
    expect(issue?.message).toContain("qwen2.5-coder:7b");
    expect(issue?.message).toContain("gemma3:4b");
  });

  it("passes the local model check when the auto-router models are installed", () => {
    initTeamKit(dir, {
      preset: "hackathon",
      assistants: ["claude", "codex", "copilot"],
    });

    const report = doctorTeamKit(dir, {
      env: { GEMINI_API_KEY: "x" },
      commandExists: () => true,
      listOllamaModels: () => ["qwen2.5-coder:3b", "qwen2.5-coder:7b", "gemma3:4b"],
    });

    expect(report.issues.some((issue) => issue.check === "local-models")).toBe(false);
    expect(formatDoctorReport(report)).toContain(
      "local models: qwen2.5-coder:3b, qwen2.5-coder:7b, gemma3:4b",
    );
  });

  it("fails doctor when expected assets are missing", () => {
    initTeamKit(dir, { preset: "startup", assistants: ["copilot"] });
    rmSync(path.join(dir, "pipelines/startup/cofounder-report.yaml"));

    const report = doctorTeamKit(dir, {
      env: { OPENAI_API_KEY: "x" },
      commandExists: () => true,
    });

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.severity === "error")).toBe(true);
    expect(formatDoctorReport(report)).toContain("cofounder-report.yaml");
  });

  it("parses preset and assistant inputs", () => {
    expect(parseTeamKitPreset()).toBe("hackathon");
    expect(parseTeamKitPreset("startup")).toBe("startup");
    expect(parseAssistantList()).toEqual(["claude", "codex", "copilot"]);
    expect(parseAssistantList("claude,copilot,claude")).toEqual(["claude", "copilot"]);
  });
});
