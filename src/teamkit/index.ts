import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type AssistantSurface,
  type TeamKitAsset,
  type TeamKitConfig,
  type TeamKitPreset,
  buildTeamKitAssets,
  buildTeamKitConfig,
  defaultAssistants,
} from "./templates.js";

export type { AssistantSurface, TeamKitConfig, TeamKitPreset } from "./templates.js";

export interface InitTeamKitOptions {
  preset?: TeamKitPreset;
  assistants?: AssistantSurface[];
  force?: boolean;
  now?: Date;
}

export interface InitTeamKitResult {
  rootDir: string;
  configPath: string;
  created: string[];
  updated: string[];
  skipped: string[];
}

export interface TeamKitDoctorIssue {
  severity: "error" | "warning";
  check: string;
  message: string;
  remedy?: string;
}

export interface TeamKitDoctorReport {
  rootDir: string;
  configPath: string;
  ok: boolean;
  preset?: TeamKitPreset;
  enabledPresets: TeamKitPreset[];
  assistants: AssistantSurface[];
  issues: TeamKitDoctorIssue[];
  passedChecks: string[];
}

export interface TeamKitDoctorOptions {
  env?: NodeJS.ProcessEnv;
  commandExists?: (command: string) => boolean;
  listOllamaModels?: () => string[] | undefined;
}

const CONFIG_PATH = ".claudeflow/teamkit.json";
const AUTO_OLLAMA_MODELS = ["qwen2.5-coder:3b", "qwen2.5-coder:7b", "gemma3:4b"];

interface LegacyTeamKitConfig {
  version?: 1;
  preset: TeamKitPreset;
  assistants: AssistantSurface[];
  runtimeProfiles: TeamKitConfig["runtimeProfiles"];
  generatedBy: "claudeflow";
  generatedAt: string;
}

export function parseTeamKitPreset(value?: string): TeamKitPreset {
  if (!value || value === "hackathon") return "hackathon";
  if (value === "startup") return "startup";
  throw new Error(`Invalid preset "${value}". Use "hackathon" or "startup".`);
}

export function parseAssistantList(value?: string): AssistantSurface[] {
  if (!value) return defaultAssistants();

  const assistants = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (assistants.length === 0) return defaultAssistants();

  const allowed = new Set<AssistantSurface>(["claude", "codex", "copilot"]);
  const unique: AssistantSurface[] = [];

  for (const assistant of assistants) {
    if (!allowed.has(assistant as AssistantSurface)) {
      throw new Error(
        `Invalid assistant "${assistant}". Use a comma-separated list of claude,codex,copilot.`,
      );
    }
    const typed = assistant as AssistantSurface;
    if (!unique.includes(typed)) unique.push(typed);
  }

  return unique;
}

export function initTeamKit(rootDir: string, options: InitTeamKitOptions = {}): InitTeamKitResult {
  const preset = options.preset ?? "hackathon";
  const requestedAssistants = options.assistants ?? defaultAssistants();
  const force = options.force ?? false;
  const existingConfig = readTeamKitConfig(rootDir);
  const assistants = mergeAssistants(existingConfig?.assistants ?? [], requestedAssistants);
  const enabledPresets = mergePresets(existingConfig?.enabledPresets ?? [], preset);
  const config = buildTeamKitConfig(preset, assistants, enabledPresets, options.now);
  const assets = buildTeamKitAssets(config);
  const result: InitTeamKitResult = {
    rootDir,
    configPath: path.join(rootDir, CONFIG_PATH),
    created: [],
    updated: [],
    skipped: [],
  };

  for (const asset of assets) {
    const absolutePath = path.join(rootDir, asset.path);
    mkdirSync(path.dirname(absolutePath), { recursive: true });

    if (asset.kind === "managed-section") {
      writeManagedSection(absolutePath, asset, result);
      continue;
    }

    const alwaysUpdate = asset.path === CONFIG_PATH;
    writeManagedFile(absolutePath, asset.content, force || alwaysUpdate, result);
  }

  return result;
}

export function doctorTeamKit(
  rootDir: string,
  options: TeamKitDoctorOptions = {},
): TeamKitDoctorReport {
  const configPath = path.join(rootDir, CONFIG_PATH);
  const report: TeamKitDoctorReport = {
    rootDir,
    configPath,
    ok: false,
    enabledPresets: [],
    assistants: [],
    issues: [],
    passedChecks: [],
  };

  if (!existsSync(configPath)) {
    report.issues.push({
      severity: "error",
      check: "config",
      message: "Missing `.claudeflow/teamkit.json`.",
      remedy: "Run `claudeflow init --preset hackathon --assistants claude,codex,copilot`.",
    });
    return report;
  }

  let config: TeamKitConfig;
  try {
    const parsedConfig = readTeamKitConfig(rootDir);
    if (!parsedConfig) {
      report.issues.push({
        severity: "error",
        check: "config",
        message: "Missing or unreadable `.claudeflow/teamkit.json`.",
        remedy: "Re-run `claudeflow init --force` to regenerate the Team Kit config.",
      });
      return report;
    }
    config = parsedConfig;
  } catch (error) {
    report.issues.push({
      severity: "error",
      check: "config",
      message: `Failed to parse \`.claudeflow/teamkit.json\`: ${(error as Error).message}`,
      remedy: "Re-run `claudeflow init --force` to regenerate the Team Kit config.",
    });
    return report;
  }

  report.preset = config.preset;
  report.enabledPresets = config.enabledPresets;
  report.assistants = config.assistants;

  validateAssets(rootDir, config, report);
  validateRuntimeProfiles(config, report);
  validateRuntimeDependencies(config, report, options);

  report.ok = !report.issues.some((issue) => issue.severity === "error");
  return report;
}

export function formatDoctorReport(report: TeamKitDoctorReport): string {
  const lines = [
    "ClaudeFlow Team Kit doctor",
    `Root: ${report.rootDir}`,
    `Config: ${report.configPath}`,
  ];

  if (report.preset) lines.push(`Default preset: ${report.preset}`);
  if (report.enabledPresets.length > 0) {
    lines.push(`Enabled presets: ${report.enabledPresets.join(", ")}`);
  }
  if (report.assistants.length > 0) lines.push(`Assistants: ${report.assistants.join(", ")}`);

  if (report.passedChecks.length > 0) {
    lines.push("", "Checks passed:");
    for (const check of report.passedChecks) {
      lines.push(`- ${check}`);
    }
  }

  const errors = report.issues.filter((issue) => issue.severity === "error");
  const warnings = report.issues.filter((issue) => issue.severity === "warning");

  if (errors.length > 0) {
    lines.push("", "Errors:");
    for (const issue of errors) {
      lines.push(`- [${issue.check}] ${issue.message}`);
      if (issue.remedy) lines.push(`  Fix: ${issue.remedy}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const issue of warnings) {
      lines.push(`- [${issue.check}] ${issue.message}`);
      if (issue.remedy) lines.push(`  Fix: ${issue.remedy}`);
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    lines.push("", "No issues found.");
  }

  return lines.join("\n");
}

function writeManagedFile(
  absolutePath: string,
  content: string,
  force: boolean,
  result: InitTeamKitResult,
): void {
  const exists = existsSync(absolutePath);
  if (exists && !force) {
    result.skipped.push(relativePath(result.rootDir, absolutePath));
    return;
  }

  writeFileSync(absolutePath, content);
  if (exists) {
    result.updated.push(relativePath(result.rootDir, absolutePath));
  } else {
    result.created.push(relativePath(result.rootDir, absolutePath));
  }
}

function writeManagedSection(
  absolutePath: string,
  asset: TeamKitAsset,
  result: InitTeamKitResult,
): void {
  const marker = asset.marker ?? "claudeflow-teamkit";
  const block = renderManagedBlock(marker, asset.content);
  const relPath = relativePath(result.rootDir, absolutePath);

  if (!existsSync(absolutePath)) {
    writeFileSync(absolutePath, `${block}\n`);
    result.created.push(relPath);
    return;
  }

  const current = readFileSync(absolutePath, "utf-8");
  const next = upsertManagedBlock(current, marker, asset.content);

  if (next === current) {
    result.skipped.push(relPath);
    return;
  }

  writeFileSync(absolutePath, next);
  result.updated.push(relPath);
}

function validateAssets(rootDir: string, config: TeamKitConfig, report: TeamKitDoctorReport): void {
  const assets = buildTeamKitAssets(config);
  for (const asset of assets) {
    const absolutePath = path.join(rootDir, asset.path);

    if (!existsSync(absolutePath)) {
      report.issues.push({
        severity: "error",
        check: "files",
        message: `Missing expected Team Kit asset \`${asset.path}\`.`,
        remedy: "Re-run `claudeflow init` to restore missing assets.",
      });
      continue;
    }

    if (asset.kind === "managed-section") {
      const marker = asset.marker ?? "claudeflow-teamkit";
      const current = readFileSync(absolutePath, "utf-8");
      if (!hasManagedBlock(current, marker)) {
        report.issues.push({
          severity: "error",
          check: "files",
          message: `Expected managed Team Kit section in \`${asset.path}\`, but the marker is missing.`,
          remedy: "Re-run `claudeflow init --force` to restore the managed section.",
        });
        continue;
      }
    }

    report.passedChecks.push(`Found ${asset.path}`);
  }
}

function validateRuntimeProfiles(config: TeamKitConfig, report: TeamKitDoctorReport): void {
  const { cheap, deep, local } = config.runtimeProfiles;

  if (!cheap) {
    report.issues.push({
      severity: "error",
      check: "runtime",
      message: "Missing `cheap` runtime profile.",
      remedy: "Re-run `claudeflow init --force` to restore default runtime profiles.",
    });
    return;
  }

  if (!deep || !local) {
    report.issues.push({
      severity: "error",
      check: "runtime",
      message: "Team Kit runtime profiles must include `cheap`, `deep`, and `local`.",
      remedy: "Re-run `claudeflow init --force` to restore default runtime profiles.",
    });
    return;
  }

  if (!["openai", "openai-compatible", "gemini"].includes(cheap.provider)) {
    report.issues.push({
      severity: "warning",
      check: "runtime",
      message: `Cheap profile uses \`${cheap.provider}\`; the recommended default is OpenAI, Gemini, or another OpenAI-compatible API.`,
      remedy: "Use `openai`, `gemini`, or `openai-compatible` for cheap teammate ideation runs.",
    });
  } else {
    report.passedChecks.push(`Cheap profile: ${cheap.provider} / ${cheap.model}`);
  }

  if (deep.provider === "claude-cli" || deep.provider === "anthropic") {
    report.passedChecks.push(`Deep profile: ${deep.provider} / ${deep.model}`);
  } else {
    report.issues.push({
      severity: "warning",
      check: "runtime",
      message: `Deep profile uses \`${deep.provider}\`; the default expectation is Claude CLI or Anthropic API.`,
      remedy:
        "Prefer Claude CLI or Anthropic for the deep profile unless you intentionally chose another high-end model.",
    });
  }

  if (local.provider === "ollama") {
    report.passedChecks.push(`Local profile: ${local.provider} / ${local.model}`);
  } else {
    report.issues.push({
      severity: "warning",
      check: "runtime",
      message: `Local profile uses \`${local.provider}\`; the default expectation is Ollama.`,
      remedy:
        "Use `ollama` for the local profile or document the alternative compatible server clearly.",
    });
  }
}

function validateRuntimeDependencies(
  config: TeamKitConfig,
  report: TeamKitDoctorReport,
  options: TeamKitDoctorOptions,
): void {
  const env = options.env ?? process.env;
  const commandExists = options.commandExists ?? hasCommand;
  const listOllamaModels = options.listOllamaModels ?? readOllamaModels;

  for (const [profileName, profile] of Object.entries(config.runtimeProfiles)) {
    for (const envName of profile.doctor.env ?? []) {
      if (!env[envName]) {
        report.issues.push({
          severity: "warning",
          check: `${profileName}-env`,
          message: `Missing \`${envName}\` for the \`${profileName}\` runtime profile.`,
          remedy: `Set ${envName} before using the ${profileName} profile.`,
        });
      } else {
        report.passedChecks.push(`${profileName} env: ${envName}`);
      }
    }

    const commandAvailable = profile.doctor.command ? commandExists(profile.doctor.command) : false;
    if (profile.doctor.command) {
      if (!commandAvailable) {
        report.issues.push({
          severity: "warning",
          check: `${profileName}-tool`,
          message: `Command \`${profile.doctor.command}\` was not found for the \`${profileName}\` runtime profile.`,
          remedy:
            profile.doctor.note ??
            `Install ${profile.doctor.command} or change the runtime profile.`,
        });
      } else {
        report.passedChecks.push(`${profileName} tool: ${profile.doctor.command}`);
      }
    }

    if (profileName === "local" && profile.provider === "ollama" && commandAvailable) {
      const installedModels = listOllamaModels();
      if (!installedModels) {
        report.issues.push({
          severity: "warning",
          check: "local-models",
          message: "Could not inspect installed Ollama models for the `local` runtime profile.",
          remedy:
            "Run `ollama list` to verify the recommended models are installed for the local profile.",
        });
        continue;
      }

      const expectedModels = profile.model === "auto" ? AUTO_OLLAMA_MODELS : [profile.model];
      const missingModels = expectedModels.filter((model) => !installedModels.includes(model));

      if (missingModels.length > 0) {
        report.issues.push({
          severity: "warning",
          check: "local-models",
          message: `Missing recommended Ollama models for the \`local\` runtime profile: ${missingModels.join(", ")}.`,
          remedy:
            profile.model === "auto"
              ? `Run \`ollama pull ${missingModels.join(" && ollama pull ")}\` or switch the local profile to a single installed model.`
              : `Run \`ollama pull ${missingModels[0]}\` or update the local profile to an installed model.`,
        });
      } else {
        report.passedChecks.push(`local models: ${expectedModels.join(", ")}`);
      }
    }
  }
}

function renderManagedBlock(marker: string, content: string): string {
  return [`<!-- ${marker}:start -->`, content.trim(), `<!-- ${marker}:end -->`].join("\n");
}

function upsertManagedBlock(current: string, marker: string, content: string): string {
  const block = renderManagedBlock(marker, content);
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;

  if (current.includes(start) && current.includes(end)) {
    const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, "m");
    return current.replace(pattern, block);
  }

  const prefix = current.trimEnd();
  if (prefix.length === 0) return `${block}\n`;
  return `${prefix}\n\n${block}\n`;
}

function hasManagedBlock(current: string, marker: string): boolean {
  return current.includes(`<!-- ${marker}:start -->`) && current.includes(`<!-- ${marker}:end -->`);
}

function relativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath) || ".";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCommand(command: string): boolean {
  const executable = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(executable, [command], { stdio: "ignore" });
  return result.status === 0;
}

function readOllamaModels(): string[] | undefined {
  const result = spawnSync("ollama", ["list"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) return undefined;

  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

function readTeamKitConfig(rootDir: string): TeamKitConfig | undefined {
  const configPath = path.join(rootDir, CONFIG_PATH);
  if (!existsSync(configPath)) return undefined;
  const raw = JSON.parse(readFileSync(configPath, "utf-8")) as TeamKitConfig | LegacyTeamKitConfig;
  return normalizeTeamKitConfig(raw);
}

function normalizeTeamKitConfig(config: TeamKitConfig | LegacyTeamKitConfig): TeamKitConfig {
  const enabledPresets =
    "enabledPresets" in config && Array.isArray(config.enabledPresets)
      ? mergePresets(config.enabledPresets, config.preset)
      : [config.preset];

  return {
    version: 2,
    preset: config.preset,
    enabledPresets,
    assistants: config.assistants,
    runtimeProfiles: config.runtimeProfiles,
    generatedBy: "claudeflow",
    generatedAt: config.generatedAt,
  };
}

function mergeAssistants(
  existing: AssistantSurface[],
  requested: AssistantSurface[],
): AssistantSurface[] {
  return Array.from(new Set([...existing, ...requested]));
}

function mergePresets(existing: TeamKitPreset[], requested: TeamKitPreset): TeamKitPreset[] {
  return Array.from(new Set([...existing, requested]));
}
