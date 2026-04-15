import type { RuntimeProvider } from "../runtime/factory.js";

export type TeamKitPreset = "hackathon" | "startup";
export type AssistantSurface = "claude" | "codex" | "copilot";
export type RuntimeProfileName = "cheap" | "deep" | "local";

export interface TeamKitDoctorHint {
  env?: string[];
  command?: string;
  note?: string;
}

export interface TeamKitRuntimeProfile {
  provider: RuntimeProvider;
  model: string;
  baseUrl?: string;
  permissionMode?: "plan" | "bypassPermissions";
  recommendedFor: string[];
  doctor: TeamKitDoctorHint;
}

export interface TeamKitConfig {
  version: 2;
  preset: TeamKitPreset;
  enabledPresets: TeamKitPreset[];
  assistants: AssistantSurface[];
  runtimeProfiles: Record<RuntimeProfileName, TeamKitRuntimeProfile>;
  generatedBy: "claudeflow";
  generatedAt: string;
}

export interface TeamKitAsset {
  path: string;
  kind: "managed-file" | "managed-section";
  marker?: string;
  content: string;
}

export function defaultAssistants(): AssistantSurface[] {
  return ["claude", "codex", "copilot"];
}

export function buildTeamKitConfig(
  preset: TeamKitPreset,
  assistants: AssistantSurface[],
  enabledPresets: TeamKitPreset[] = [preset],
  now = new Date(),
): TeamKitConfig {
  const cheapProfile =
    preset === "hackathon"
      ? {
          provider: "gemini" as const,
          model: "gemini-2.5-flash-lite",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
          recommendedFor: [
            "hackathon ideation",
            "structured drafting",
            "sponsor-aligned multimodal experiments",
            "high-volume teammate requests",
          ],
          doctor: {
            env: ["GEMINI_API_KEY"],
            note: "Hackathon mode prefers Gemini as the cheap path when Google credits or Gemini billing are available.",
          },
        }
      : {
          provider: "openai" as const,
          model: "gpt-5-mini",
          baseUrl: "https://api.openai.com/v1",
          recommendedFor: ["brainstorming", "idea critique", "spec drafting", "rewrite passes"],
          doctor: {
            env: ["OPENAI_API_KEY"],
            note: "Cheap is the default path for teammate ideation and structured drafting.",
          },
        };

  return {
    version: 2,
    preset,
    enabledPresets,
    assistants,
    runtimeProfiles: {
      cheap: cheapProfile,
      deep: {
        provider: "claude-cli",
        model: "claude-sonnet-4-20250514",
        permissionMode: "plan",
        recommendedFor: ["deep synthesis", "code review", "high-stakes technical reasoning"],
        doctor: {
          command: "claude",
          note: "Deep is for harder review/synthesis when cheap mode is not enough.",
        },
      },
      local: {
        provider: "ollama",
        model: "auto",
        baseUrl: "http://127.0.0.1:11434/v1",
        recommendedFor: ["private drafts", "offline iteration", "low-cost local runs"],
        doctor: {
          command: "ollama",
          note: "Local is optional. Install Ollama or point OLLAMA_BASE_URL at a compatible server.",
        },
      },
    },
    generatedBy: "claudeflow",
    generatedAt: now.toISOString(),
  };
}

export function buildTeamKitAssets(config: TeamKitConfig): TeamKitAsset[] {
  const assets: TeamKitAsset[] = [
    {
      path: ".claudeflow/teamkit.json",
      kind: "managed-file",
      content: `${JSON.stringify(config, null, 2)}\n`,
    },
    {
      path: "AGENTS.md",
      kind: "managed-section",
      marker: "claudeflow-teamkit",
      content: renderAgentsSection(config),
    },
    {
      path: "README.md",
      kind: "managed-section",
      marker: "claudeflow-teamkit-readme",
      content: renderRepoReadmeSection(config),
    },
    {
      path: ".gitignore",
      kind: "managed-section",
      marker: "claudeflow-teamkit-gitignore",
      content: renderGitignoreSection(),
    },
    {
      path: "doc/specs/README.md",
      kind: "managed-file",
      content: renderSpecsReadme(config),
    },
    {
      path: "doc/specs/_templates/01-brainstorm.md",
      kind: "managed-file",
      content: renderBrainstormTemplate(),
    },
    {
      path: "doc/specs/_templates/02-specification.md",
      kind: "managed-file",
      content: renderSpecificationTemplate(),
    },
    {
      path: "doc/specs/_templates/03-tasks.md",
      kind: "managed-file",
      content: renderTasksTemplate(),
    },
    {
      path: "doc/specs/_templates/04-implementation.md",
      kind: "managed-file",
      content: renderImplementationTemplate(),
    },
    {
      path: "doc/specs/_templates/05-feedback.md",
      kind: "managed-file",
      content: renderFeedbackTemplate(),
    },
    {
      path: "explainit/README.md",
      kind: "managed-file",
      content: renderExplainItReadme(),
    },
    {
      path: "explainit/hackathon.md",
      kind: "managed-file",
      content: renderExplainItHackathon(config),
    },
    {
      path: "explainit/startup.md",
      kind: "managed-file",
      content: renderExplainItStartup(config),
    },
    {
      path: "explainit/macbook-m3-pro.md",
      kind: "managed-file",
      content: renderMacbookGuide(config),
    },
    {
      path: ".env.example",
      kind: "managed-file",
      content: renderEnvExample(config),
    },
  ];

  if (config.assistants.includes("copilot")) {
    assets.push({
      path: ".github/copilot-instructions.md",
      kind: "managed-section",
      marker: "claudeflow-teamkit",
      content: renderCopilotInstructions(config),
    });
  }

  if (config.assistants.includes("claude")) {
    assets.push({
      path: ".claude/README.md",
      kind: "managed-file",
      content: renderClaudeReadme(config),
    });
    for (const preset of config.enabledPresets) {
      assets.push(...buildClaudeCommandAssets(preset));
    }
  }

  for (const preset of config.enabledPresets) {
    if (preset === "hackathon") {
      assets.push(...buildHackathonAssets(config));
    } else {
      assets.push(...buildStartupAssets(config));
    }
  }

  return assets;
}

function buildClaudeCommandAssets(preset: TeamKitPreset): TeamKitAsset[] {
  if (preset === "hackathon") {
    return [
      {
        path: ".claude/commands/brainstorm/start.md",
        kind: "managed-file",
        content: renderClaudeCommand("/brainstorm:start", [
          "Read `AGENTS.md`, `README.md`, and `doc/specs/README.md` before proposing anything.",
          "Ground ideas in the current repository, the hackathon theme, constraints, and likely demo value.",
          "Create `doc/specs/<slug>/01-brainstorm.md` from the brainstorm template if it does not exist.",
          "Write 3-5 concrete ideas with user value, feasibility, demo hook, and key unknowns.",
          "Recommend starting with the `cheap` runtime profile unless deep technical synthesis is necessary.",
        ]),
      },
      {
        path: ".claude/commands/brainstorm/spec.md",
        kind: "managed-file",
        content: renderClaudeCommand("/brainstorm:spec", [
          "Read `01-brainstorm.md` and any existing repo context before writing a spec.",
          "Create or update `doc/specs/<slug>/02-specification.md` using the specification template.",
          "Resolve obvious ambiguities in favor of a shippable hackathon demo.",
          "Keep acceptance criteria concrete and implementation-light enough for teammates to review.",
        ]),
      },
      {
        path: ".claude/commands/brainstorm/tasks.md",
        kind: "managed-file",
        content: renderClaudeCommand("/brainstorm:tasks", [
          "Read `02-specification.md` and write `03-tasks.md` with executable tasks.",
          "Treat `03-tasks.md` as the source of truth for progress and status.",
          "Split work into teammate-safe items: ideation, research, handoff, implementation, validation.",
          "Call out which tasks are suitable for cheap, deep, or local runtime profiles.",
        ]),
      },
      {
        path: ".claude/commands/idea/critique.md",
        kind: "managed-file",
        content: renderClaudeCommand("/idea:critique", [
          "Read the brainstorm and spec docs before critiquing.",
          "Score the idea on user value, technical feasibility, demo impact, and implementation risk.",
          "Add feedback to `05-feedback.md` if a feature folder already exists; otherwise include a standalone critique.",
          "Keep the output constructive and specific enough for non-CS teammates to act on it.",
        ]),
      },
      {
        path: ".claude/commands/idea/handoff.md",
        kind: "managed-file",
        content: renderClaudeCommand("/idea:handoff", [
          "Read `01-03` docs and produce `04-implementation.md` as an implementation handoff.",
          "Summarize the target behavior, likely file areas, test ideas, and demo script.",
          "Call out which parts need a stronger `deep` runtime review before coding.",
        ]),
      },
      {
        path: ".claude/commands/tracks/braynr.md",
        kind: "managed-file",
        content: renderClaudeCommand("/track:braynr", [
          "Read `explainit/gdg-ai-hack-2026/README.md` and `explainit/gdg-ai-hack-2026/braynr-learning.md` first.",
          "Ground the output in the current repo and the Braynr EdTech & Learning track.",
          "Create or update `doc/specs/<slug>/01-brainstorm.md` with 3-5 concrete ideas and a recommended direction.",
          "Bias toward one strong demoable wedge instead of a generic tutor chatbot.",
        ]),
      },
      {
        path: ".claude/commands/tracks/luxonis.md",
        kind: "managed-file",
        content: renderClaudeCommand("/track:luxonis", [
          "Read `explainit/gdg-ai-hack-2026/README.md` and `explainit/gdg-ai-hack-2026/luxonis-spatial-ai.md` first.",
          "Ground the output in the current repo and the Luxonis Spatial AI & Vision track.",
          "Create or update `doc/specs/<slug>/01-brainstorm.md` with 3-5 concrete spatial-AI ideas and a recommended direction.",
          "Bias toward demos that can work with OAK hardware, prerecorded footage, or strong simulation if hardware access is limited.",
        ]),
      },
      {
        path: ".claude/commands/tracks/msi.md",
        kind: "managed-file",
        content: renderClaudeCommand("/track:msi", [
          "Read `explainit/gdg-ai-hack-2026/README.md` and `explainit/gdg-ai-hack-2026/msi-on-device-ai.md` first.",
          "Ground the output in the current repo and the MSI On-Device AI track.",
          "Create or update `doc/specs/<slug>/01-brainstorm.md` with 3-5 concrete local-first AI ideas and a recommended direction.",
          "Bias toward privacy, low-latency, and unreliable-network scenarios instead of cloud-dependent demos.",
        ]),
      },
    ];
  }

  return [
    {
      path: ".claude/commands/startup/nightly-review.md",
      kind: "managed-file",
      content: renderClaudeCommand("/startup:nightly-review", [
        "Inspect the repo and produce a nightly engineering review grounded in current code.",
        "Write a concise report with quality, security, and maintainability risks.",
        "Prefer the `cheap` runtime first and escalate to `deep` only for ambiguous findings.",
      ]),
    },
    {
      path: ".claude/commands/startup/backlog.md",
      kind: "managed-file",
      content: renderClaudeCommand("/startup:backlog", [
        "Read the latest reports and propose a ranked improvement backlog.",
        "Focus on bugs, UX wins, code quality, and leverage for a small AI-run startup team.",
      ]),
    },
    {
      path: ".claude/commands/startup/cofounder.md",
      kind: "managed-file",
      content: renderClaudeCommand("/startup:cofounder", [
        "Generate a cofounder-style memo with risks, opportunities, product ideas, and next steps.",
        "Tie every recommendation back to current repo reality, not generic startup advice.",
      ]),
    },
  ];
}

function buildHackathonAssets(config: TeamKitConfig): TeamKitAsset[] {
  return [
    {
      path: "explainit/gdg-ai-hack-2026/README.md",
      kind: "managed-file",
      content: renderGdgHackReadme(),
    },
    {
      path: "explainit/gdg-ai-hack-2026/braynr-learning.md",
      kind: "managed-file",
      content: renderBraynrTrackGuide(config),
    },
    {
      path: "explainit/gdg-ai-hack-2026/luxonis-spatial-ai.md",
      kind: "managed-file",
      content: renderLuxonisTrackGuide(config),
    },
    {
      path: "explainit/gdg-ai-hack-2026/msi-on-device-ai.md",
      kind: "managed-file",
      content: renderMsiTrackGuide(),
    },
    {
      path: "pipelines/hackathon/README.md",
      kind: "managed-file",
      content: renderPipelineReadme("Hackathon pipelines", [
        "These are starter YAML workflows for advanced users. Non-CS teammates should usually begin with the Team Kit docs and assistant commands.",
        `Default runtime profile: \`cheap\` (${config.runtimeProfiles.cheap.model})`,
        "Escalate to `deep` when you need stronger synthesis or code-heavy reasoning.",
      ]),
    },
    {
      path: "pipelines/hackathon/tracks/README.md",
      kind: "managed-file",
      content: renderPipelineReadme("GDG AI HACK 2026 track packs", [
        "Use these when you already know which main track you want to target.",
        "Each track pack turns the current repo into concrete ideas, a demo plan, and a sponsor-aware architecture direction.",
        `Default cheap runtime: \`${config.runtimeProfiles.cheap.model}\``,
      ]),
    },
    {
      path: "pipelines/hackathon/idea-from-repo.yaml",
      kind: "managed-file",
      content: renderIdeaFromRepoPipeline(),
    },
    {
      path: "pipelines/hackathon/critique-idea.yaml",
      kind: "managed-file",
      content: renderCritiqueIdeaPipeline(),
    },
    {
      path: "pipelines/hackathon/spec-from-brainstorm.yaml",
      kind: "managed-file",
      content: renderSpecPipeline(),
    },
    {
      path: "pipelines/hackathon/tasks-from-spec.yaml",
      kind: "managed-file",
      content: renderTasksPipeline(),
    },
    {
      path: "pipelines/hackathon/handoff-summary.yaml",
      kind: "managed-file",
      content: renderHandoffPipeline(),
    },
    {
      path: "pipelines/hackathon/crew-review.yaml",
      kind: "managed-file",
      content: renderHackathonCrewReviewPipeline(),
    },
    {
      path: "pipelines/hackathon/pitch-polish.yaml",
      kind: "managed-file",
      content: renderHackathonPitchPolishPipeline(),
    },
    {
      path: "pipelines/hackathon/tracks/braynr-learning-pack.yaml",
      kind: "managed-file",
      content: renderBraynrTrackPipeline(),
    },
    {
      path: "pipelines/hackathon/tracks/luxonis-spatial-pack.yaml",
      kind: "managed-file",
      content: renderLuxonisTrackPipeline(),
    },
    {
      path: "pipelines/hackathon/tracks/msi-on-device-pack.yaml",
      kind: "managed-file",
      content: renderMsiTrackPipeline(),
    },
  ];
}

function buildStartupAssets(config: TeamKitConfig): TeamKitAsset[] {
  return [
    {
      path: "pipelines/startup/README.md",
      kind: "managed-file",
      content: renderPipelineReadme("Startup autopilot skeletons", [
        "This preset is intentionally template-first. It gives you recurring audit/report skeletons without introducing a scheduler yet.",
        `Start reviews on \`cheap\` (${config.runtimeProfiles.cheap.model}) and escalate targeted follow-up runs to \`deep\`.`,
        `Use \`local\` (${config.runtimeProfiles.local.model}) for privacy-sensitive drafts or low-cost iteration.`,
      ]),
    },
    {
      path: "pipelines/startup/nightly-code-review.yaml",
      kind: "managed-file",
      content: renderNightlyCodeReviewPipeline(),
    },
    {
      path: "pipelines/startup/weekly-ux-critique.yaml",
      kind: "managed-file",
      content: renderWeeklyUxCritiquePipeline(),
    },
    {
      path: "pipelines/startup/security-perf-crew.yaml",
      kind: "managed-file",
      content: renderSecurityPerfCrewPipeline(),
    },
    {
      path: "pipelines/startup/improvement-backlog.yaml",
      kind: "managed-file",
      content: renderImprovementBacklogPipeline(),
    },
    {
      path: "pipelines/startup/cofounder-report.yaml",
      kind: "managed-file",
      content: renderCofounderReportPipeline(),
    },
  ];
}

function renderAgentsSection(config: TeamKitConfig): string {
  const assistants = config.assistants.join(", ");
  const presets = config.enabledPresets.join(", ");
  return [
    "## ClaudeFlow Team Kit",
    "",
    `Default preset: \`${config.preset}\``,
    `Enabled presets: \`${presets}\``,
    `Assistant surfaces: \`${assistants}\``,
    "",
    "Team workflow rules:",
    "1. For any new idea, create `doc/specs/<slug>/01-brainstorm.md` before writing implementation tasks.",
    "2. Read earlier lifecycle docs before writing later ones. Do not write `03-tasks.md` without reading `02-specification.md`.",
    "3. Treat `03-tasks.md` as the source of truth for execution status.",
    "4. Keep `05-feedback.md` append-only until the team explicitly resolves an item.",
    "5. Start with the `cheap` runtime profile for ideation and drafting. Escalate to `deep` only when the task truly needs stronger reasoning.",
    "",
    "Runtime profiles:",
    `- \`cheap\`: ${config.runtimeProfiles.cheap.provider} / ${config.runtimeProfiles.cheap.model}`,
    `- \`deep\`: ${config.runtimeProfiles.deep.provider} / ${config.runtimeProfiles.deep.model}`,
    `- \`local\`: ${config.runtimeProfiles.local.provider} / ${config.runtimeProfiles.local.model}`,
    "",
    ...config.enabledPresets.map((preset) => presetSpecificAgentsGuidance(preset)),
    "",
  ].join("\n");
}

function presetSpecificAgentsGuidance(preset: TeamKitPreset): string {
  if (preset === "hackathon") {
    return "- Hackathon mode: keep outputs concrete, demoable, and understandable by teammates who are not computer scientists.";
  }
  return "- Startup mode: keep outputs grounded in repo reality and focus on recurring leverage, product insight, and quality improvement.";
}

function renderCopilotInstructions(config: TeamKitConfig): string {
  return [
    "# ClaudeFlow Team Kit",
    "",
    "When working in this repository:",
    "",
    "- Read `AGENTS.md` and `doc/specs/README.md` before proposing feature work.",
    "- Use the feature lifecycle under `doc/specs/<slug>/`.",
    "- For new feature ideas, start with `01-brainstorm.md`, then move to `02-specification.md`, then `03-tasks.md`.",
    "- Keep proposals grounded in the current repository, not generic suggestions.",
    "- Default to the `cheap` runtime profile for drafts and ideation.",
    "",
    `Default preset: \`${config.preset}\``,
    `Enabled presets: \`${config.enabledPresets.join(", ")}\``,
    `Recommended cheap model: \`${config.runtimeProfiles.cheap.model}\``,
    "",
  ].join("\n");
}

function renderClaudeReadme(config: TeamKitConfig): string {
  return [
    "# ClaudeFlow Team Kit",
    "",
    `This repo is initialized with default preset \`${config.preset}\`.`,
    `Enabled presets: \`${config.enabledPresets.join(", ")}\`.`,
    "",
    "Available assistant-native commands live under `.claude/commands/`.",
    "These commands are wrappers around the shared Team Kit lifecycle:",
    "- brainstorm",
    "- specification drafting",
    "- critique",
    "- handoff",
    "",
    "Shared rules:",
    "- read prior lifecycle docs before generating later ones",
    "- keep `03-tasks.md` as the source of truth",
    "- start with the `cheap` runtime profile unless stronger reasoning is required",
    "",
  ].join("\n");
}

function renderClaudeCommand(command: string, steps: string[]): string {
  return [
    `# ${command}`,
    "",
    "Follow this workflow:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "If a required document is missing, create it from the matching template in `doc/specs/_templates/`.",
    "",
  ].join("\n");
}

function renderSpecsReadme(config: TeamKitConfig): string {
  return [
    "# ClaudeFlow Feature Lifecycle",
    "",
    "Each feature lives under `doc/specs/<slug>/` with this sequence:",
    "",
    "1. `01-brainstorm.md`",
    "2. `02-specification.md`",
    "3. `03-tasks.md`",
    "4. `04-implementation.md`",
    "5. `05-feedback.md`",
    "",
    "Rules:",
    "- read earlier docs before writing later ones",
    "- use `03-tasks.md` as the progress tracker",
    "- append to `05-feedback.md` instead of rewriting history",
    `- default to the \`cheap\` runtime profile (${config.runtimeProfiles.cheap.model}) for teammate-facing drafting`,
    "",
    "Create a new feature folder by copying the templates in `_templates/`.",
    "",
  ].join("\n");
}

function renderRepoReadmeSection(config: TeamKitConfig): string {
  return [
    "## ClaudeFlow Team Kit",
    "",
    "This repository is prepared to work with ClaudeFlow as a structured collaboration layer for humans plus assistants.",
    "",
    "Start here:",
    "1. Read `AGENTS.md`.",
    "2. Read `explainit/README.md` and the relevant use-case file.",
    "3. Use `doc/specs/<slug>/` for idea -> spec -> tasks -> implementation -> feedback.",
    "",
    "Recommended runtime path:",
    `- \`cheap\`: ${config.runtimeProfiles.cheap.provider} / ${config.runtimeProfiles.cheap.model}`,
    `- \`deep\`: ${config.runtimeProfiles.deep.provider} / ${config.runtimeProfiles.deep.model}`,
    `- \`local\`: ${config.runtimeProfiles.local.provider} / ${config.runtimeProfiles.local.model}`,
    "",
    "Teammates should start with `cheap` unless the task clearly needs deeper reasoning or a private local run.",
    "",
  ].join("\n");
}

function renderGitignoreSection(): string {
  return [
    "# ClaudeFlow Team Kit",
    ".claudeflow/checkpoints/",
    ".claudeflow/memory/",
    "traces/",
    "pipelines/.claudeflow/",
    "pipelines/traces/",
    ".env",
    ".env.local",
    ".DS_Store",
    "",
  ].join("\n");
}

function renderEnvExample(config: TeamKitConfig): string {
  return [
    "# ClaudeFlow Team Kit",
    "# Copy this file to .env.local and fill only the variables you actually have.",
    "# Never commit real keys.",
    "",
    `CLAUDEFLOW_RUNTIME=${config.runtimeProfiles.cheap.provider}`,
    `CLAUDEFLOW_MODEL=${config.runtimeProfiles.cheap.model}`,
    "",
    "# Cheap hosted path",
    "GEMINI_API_KEY=",
    "GEMINI_MODEL=gemini-2.5-flash-lite",
    "GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai",
    "OPENAI_API_KEY=",
    "OPENAI_MODEL=gpt-5-mini",
    "",
    "# Deep path",
    "ANTHROPIC_API_KEY=",
    "ANTHROPIC_MODEL=claude-sonnet-4-20250514",
    "",
    "# Local path",
    "OLLAMA_BASE_URL=http://127.0.0.1:11434/v1",
    "OLLAMA_MODEL=auto",
    "",
  ].join("\n");
}

function renderBrainstormTemplate(): string {
  return [
    "# Brainstorm",
    "",
    "## Context",
    "- Repo area:",
    "- User/problem:",
    "- Hackathon theme or business goal:",
    "",
    "## Candidate Ideas",
    "### Idea 1",
    "- Summary:",
    "- User value:",
    "- Demo hook:",
    "- Feasibility:",
    "- Risks / unknowns:",
    "",
    "### Idea 2",
    "- Summary:",
    "- User value:",
    "- Demo hook:",
    "- Feasibility:",
    "- Risks / unknowns:",
    "",
    "## Recommendation",
    "- Chosen direction:",
    "- Why now:",
    "- What to validate next:",
    "",
  ].join("\n");
}

function renderSpecificationTemplate(): string {
  return [
    "# Specification",
    "",
    "## Goal",
    "- Problem statement:",
    "- Success criteria:",
    "",
    "## Audience",
    "- Primary users:",
    "- Demo/story angle:",
    "",
    "## Scope",
    "- In scope:",
    "- Out of scope:",
    "",
    "## Solution Shape",
    "- UX / workflow:",
    "- Technical approach:",
    "- Data / integrations:",
    "",
    "## Acceptance Criteria",
    "- [ ]",
    "- [ ]",
    "- [ ]",
    "",
  ].join("\n");
}

function renderTasksTemplate(): string {
  return [
    "# Tasks",
    "",
    "## Status Rules",
    "- `todo`",
    "- `in-progress`",
    "- `done`",
    "",
    "## Work Items",
    "- [ ] todo - Research / ideation follow-up",
    "- [ ] todo - Product / UX refinement",
    "- [ ] todo - Implementation",
    "- [ ] todo - Validation / demo prep",
    "",
    "## Notes",
    "- Cheap runtime tasks:",
    "- Deep runtime tasks:",
    "- Local runtime tasks:",
    "",
  ].join("\n");
}

function renderImplementationTemplate(): string {
  return [
    "# Implementation Handoff",
    "",
    "## Summary",
    "- Intended behavior:",
    "- Highest-risk technical areas:",
    "",
    "## Likely File Areas",
    "-",
    "",
    "## Test Plan",
    "-",
    "",
    "## Demo Plan",
    "-",
    "",
  ].join("\n");
}

function renderFeedbackTemplate(): string {
  return [
    "# Feedback Log",
    "",
    "Append new observations below. Do not rewrite previous notes unless they were explicitly resolved.",
    "",
    "## Entries",
    "- Date:",
    "  Source:",
    "  Feedback:",
    "  Impact:",
    "  Follow-up:",
    "",
  ].join("\n");
}

function renderPipelineReadme(title: string, bullets: string[]): string {
  return [`# ${title}`, "", ...bullets.map((bullet) => `- ${bullet}`), ""].join("\n");
}

function renderExplainItReadme(): string {
  return [
    "# ExplainIt",
    "",
    "This folder is the human-first guide to using ClaudeFlow in real team scenarios.",
    "",
    "- `hackathon.md` explains how a mixed technical/non-technical team should use ClaudeFlow during a hackathon.",
    "- `startup.md` explains how to organize recurring AI-led reviews, what runtime to buy first, and when a local model makes sense.",
    "- `macbook-m3-pro.md` explains the best local setup for an Apple Silicon laptop, especially for a MacBook Pro M3 Pro.",
    "- `gdg-ai-hack-2026/` contains the researched challenge pack for the May 8-10, 2026 GDG AI HACK in Milan.",
    "- `.env.example` shows which keys and runtime variables teammates can configure privately on their own machine.",
    "",
    "Read these files before asking an assistant to help. They are written for both humans and AI assistants to follow together.",
    "",
  ].join("\n");
}

function renderExplainItHackathon(config: TeamKitConfig): string {
  return [
    "# ClaudeFlow for a Hackathon",
    "",
    "This file is for teammates who are joining a hackathon repo and want clear structure without needing to understand the whole ClaudeFlow engine.",
    "",
    "## What to do first",
    "1. Read `README.md`, `AGENTS.md`, and `doc/specs/README.md`.",
    "2. If you use Copilot, also read `.github/copilot-instructions.md`.",
    "3. If you use Claude Code, check `.claude/commands/` for the ready-made workflows.",
    "4. Start with one feature folder under `doc/specs/<slug>/`.",
    "5. If you are doing GDG AI HACK 2026 specifically, read `explainit/gdg-ai-hack-2026/README.md` and the relevant track guide before ideating.",
    "6. Copy `.env.example` to `.env.local` and fill only the keys you actually have access to.",
    "",
    "## The simple workflow",
    "1. Brainstorm the idea in `01-brainstorm.md`.",
    "2. Turn the chosen idea into `02-specification.md`.",
    "3. Break it into `03-tasks.md`.",
    "4. Write `04-implementation.md` as the handoff for the person doing the coding.",
    "5. Append lessons and critiques to `05-feedback.md`.",
    "",
    "## What to ask your assistant",
    '- "Read `explainit/hackathon.md`, `AGENTS.md`, and the repo README, then propose 3 grounded hackathon ideas."',
    '- "Read the GDG AI HACK challenge pack and tell me which of the three main tracks this repo fits best."',
    '- "Use the ClaudeFlow hackathon workflow and write `doc/specs/<slug>/01-brainstorm.md`."',
    '- "Turn this brainstorm into `02-specification.md` and `03-tasks.md` in a way a teammate can follow."',
    "",
    "## Which runtime to use",
    `- Start with \`cheap\`: ${config.runtimeProfiles.cheap.provider} / ${config.runtimeProfiles.cheap.model}. This is the default for ideation, drafting, and structured requests.`,
    `- Use \`deep\`: ${config.runtimeProfiles.deep.provider} / ${config.runtimeProfiles.deep.model} only for harder synthesis, final critiques, or code-heavy reasoning.`,
    `- Use \`local\`: ${config.runtimeProfiles.local.provider} / ${config.runtimeProfiles.local.model} only if someone already has Ollama set up or if privacy matters.`,
    "",
    "## How to handle API keys with teammates",
    "- Do not commit real keys to the repo.",
    "- Do not paste real keys into shared docs, PRs, or issue threads.",
    "- Give teammates `.env.example` and have each person create their own `.env.local`.",
    "- Share actual secrets privately with a password manager or direct private message, not through Git.",
    "- If someone only has Gemini access, they can still use the hackathon setup because `cheap` defaults to Gemini here.",
    "",
    "## If you have a MacBook Pro M3 Pro",
    "- Your best local default is the `auto` local router, which picks between `qwen2.5-coder:3b`, `qwen2.5-coder:7b`, and `gemma3:4b` based on the task.",
    "- If you need a multimodal local option for screenshots or diagrams, add `gemma3:4b`.",
    "- If your machine has higher unified memory and you can tolerate slower responses, test `qwen2.5-coder:14b` or `gemma3:12b` for stronger local passes.",
    "- Read `explainit/macbook-m3-pro.md` before spending time on a VM setup.",
    "",
    "## Best setup for GDG AI HACK 2026",
    "- The event is short and build-first. Optimize for speed and reliability, not for fancy infrastructure.",
    "- GDG AI HACK gives useful sponsor resources including Google Cloud credits and Gemini API access. If you already have Gemini billing or sponsor credits, use Gemini first for the `cheap` path.",
    "- Keep Claude for the hard high-leverage steps. Use Gemini, other cheap APIs, or Ollama for reviewer crews, summaries, and drafting.",
    "- The safest overall plan is still laptop-first with hosted APIs as backup capacity.",
    "",
    "## Recommended architecture",
    "- Use raw Claude or Claude Code for quick one-off thinking and last-mile debugging.",
    "- Use ClaudeFlow for repeatable work: review, critique, fix-and-verify, handoff, and pitch polish.",
    "- Let `cheap` do most of the volume.",
    "- Let `deep` be the final judge.",
    "- Let `local` help only if someone has already prepared it.",
    "",
    "## What API key to buy first",
    "- If you already have `GEMINI_API_KEY` funding or sponsor credits, use Gemini first for the `cheap` profile.",
    "- If you do not have Gemini funding, buy an OpenAI API key next and use `gpt-5-mini` as the simple second path.",
    "- If you already pay for Claude and want stronger reviews or coding help, keep Claude as the `deep` option instead of forcing everyone onto it.",
    "- Do not block the team on a local model. Local is optional, not the default path.",
    "- The right order for this hackathon is usually: Gemini credits first, Claude for deep work, OpenAI as a backup if needed, local only after that.",
    "",
    "## Repo organization rules",
    "- Keep feature thinking in `doc/specs/<slug>/`, not scattered across chats.",
    "- Keep `03-tasks.md` as the source of truth for who is doing what.",
    "- Ask assistants to stay grounded in the current repo instead of generic hackathon ideas.",
    "- Prefer one clear, demoable feature over five vague ones.",
    "",
    "## When a local model makes sense",
    "- You already have Ollama installed and someone knows how to maintain it.",
    "- You want cheap private drafts or quick rewrites.",
    "- You are okay with weaker quality than the paid `cheap` or `deep` options.",
    "",
    "## Best local model picks",
    "- Automatic default: `auto`",
    "  It routes simple text tasks to `qwen2.5-coder:3b`, coding/review tasks to `qwen2.5-coder:7b`, and vision-like prompts to `gemma3:4b`.",
    "- Vision/local multimodal: `gemma3:4b`",
    "- Bigger local coding pass if your M3 Pro has enough unified memory: `qwen2.5-coder:14b`",
    "",
    "## When a VM or hosted inference makes sense",
    "- Only if the final demo itself needs a hosted model service.",
    "- Prefer a simple managed deployment to a custom GPU setup during the hackathon.",
    "- Do not spend the weekend doing infrastructure work unless it is part of the product.",
    "",
    "## The main goal",
    "ClaudeFlow is here to make teamwork structured. It is not here to make teammates learn YAML or become prompt engineers.",
    "",
  ].join("\n");
}

function renderExplainItStartup(config: TeamKitConfig): string {
  return [
    "# ClaudeFlow for an AI-Run Startup",
    "",
    "This file explains how to use ClaudeFlow when the technical side of the startup is mostly run by AI and you want recurring insight, critique, and improvement loops.",
    "",
    "## The recommended setup",
    `- Use \`cheap\` (${config.runtimeProfiles.cheap.provider} / ${config.runtimeProfiles.cheap.model}) for daily and nightly drafting, triage, review summaries, and backlog generation.`,
    `- Use \`deep\` (${config.runtimeProfiles.deep.provider} / ${config.runtimeProfiles.deep.model}) for harder synthesis, final review, architecture critique, and high-stakes decisions.`,
    `- Keep \`local\` (${config.runtimeProfiles.local.provider} / ${config.runtimeProfiles.local.model}) as an optional privacy/cost tool, not as the main production brain.`,
    "",
    "## What API key to buy first",
    "- Buy the `cheap` provider first. This is the best first spend because it covers the high-volume recurring work.",
    "- If you already have Gemini billing or want to stay close to the Google stack, `gemini-2.5-flash-lite` is a valid cheap path.",
    "- Add the `deep` provider only after you know which tasks actually need stronger reasoning.",
    "- Use a local model only if privacy or marginal cost matters more than output quality and maintenance simplicity.",
    "",
    "## Practical provider strategy",
    "- Use Claude as the high-leverage judge, not as the only worker.",
    "- Use the cheap provider for repetitive nightly or weekly work.",
    "- Use a local model for bulk drafts, categorization, or privacy-sensitive internal loops only when weaker quality is acceptable.",
    "- On a MacBook Pro M3 Pro, treat local as a useful sidecar, not as the single source of truth for product direction or critical refactors.",
    "",
    "## What to automate first",
    "1. Nightly code quality review",
    "2. Weekly UX/product critique",
    "3. Security/performance review",
    "4. Improvement backlog generation",
    "5. A cofounder-style summary of risks, opportunities, and next steps",
    "",
    "## How to organize the repo",
    "- Put recurring workflows in `pipelines/startup/`.",
    "- Put longer-lived decisions, specs, and follow-up notes in `doc/specs/`.",
    "- Keep traces for real runs so you can compare what changed week to week.",
    "- Separate cheap recurring runs from deeper review runs so cost stays predictable.",
    "",
    "## What to ask your assistant",
    '- "Read `explainit/startup.md`, the repo README, and the startup pipelines, then suggest the smallest nightly review loop we should run first."',
    '- "Generate a ranked improvement backlog grounded in the current repo and latest reports."',
    '- "Write a cofounder-style memo: what is fragile, what is working, and what would move the business forward next."',
    "",
    "## When a local model makes sense",
    "- Privacy-sensitive drafts",
    "- Bulk rewrites or lightweight categorization",
    "- Cheap experimentation by someone already comfortable running Ollama",
    "",
    "## When a local model does not make sense",
    "- You want teammates to get started fast with minimal setup",
    "- You need strong reasoning quality for product or technical decisions",
    "- No one on the team wants to maintain the local model stack",
    "",
    "## The main goal",
    "Use ClaudeFlow to make AI work repeatable and reviewable. The value is not just better output; it is having a stable operating system for your startup's recurring thinking work.",
    "",
  ].join("\n");
}

function renderMacbookGuide(config: TeamKitConfig): string {
  return [
    "# ClaudeFlow on a MacBook Pro M3 Pro",
    "",
    "This guide is for running ClaudeFlow well on Apple Silicon without turning the laptop into a science project.",
    "",
    "## The practical recommendation",
    `- Keep \`cheap\` (${config.runtimeProfiles.cheap.model}) as the default for daily ideation, drafting, and teammate workflows.`,
    `- Keep \`deep\` (${config.runtimeProfiles.deep.model}) for the hardest reasoning and final judgment.`,
    "- Use `local` (`auto`) as a worker model for drafts, reviews, summarization, and low-stakes code passes.",
    "- If your team already has Gemini credits, it is a strong cheap hosted path before opening another paid API account.",
    "",
    "## Why your M3 Pro is good enough",
    "- Apple Silicon is a strong local-model machine because of unified memory and GPU acceleration.",
    "- Ollama supports macOS on Apple M-series hardware and is improving Apple Silicon performance with MLX.",
    "- That makes laptop-first local runs realistic for helper tasks during a hackathon or for startup sidecar automation.",
    "",
    "## Best local model choices",
    "- Automatic default: `auto`",
    "  It picks `qwen2.5-coder:3b` for lightweight text work, `qwen2.5-coder:7b` for coding/review work, and `gemma3:4b` for vision-like prompts.",
    "- Faster and lighter fallback: `qwen2.5-coder:3b`",
    "- Stronger local coding pass when you have enough memory and patience: `qwen2.5-coder:14b`",
    "- Local multimodal option for screenshots, mockups, or diagrams: `gemma3:4b`",
    "- Stronger multimodal pass if your machine has more headroom: `gemma3:12b`",
    "",
    "## Which one to use",
    "- If you have 18 GB unified memory, start with 3B to 8B class models and keep other heavy apps closed.",
    "- If you have 36 GB or more, 12B to 14B models become much more realistic for serious local work.",
    "- Use local models for reviewer crews, categorization, summarization, test suggestions, and rough rewrites.",
    "- Do not rely on a local model alone for the final architectural or product decision if a stronger hosted model is available.",
    "",
    "## The best hackathon setup on this laptop",
    "1. Use Claude or another strong hosted model for the hard thinking and last-mile debugging.",
    "2. Use the `cheap` profile for most structured drafting and team-facing docs.",
    "3. Use local Ollama models for repeated review loops and low-cost helpers.",
    "4. Only touch cloud GPU deployment if the final demo itself needs hosted inference.",
    "",
    "## Commands to start with",
    "```bash",
    "ollama pull qwen2.5-coder:3b",
    "ollama pull qwen2.5-coder:7b",
    "ollama pull gemma3:4b",
    "npx claudeflow doctor",
    "npx claudeflow run pipelines/hackathon/crew-review.yaml --runtime ollama",
    "```",
    "- `claudeflow doctor` warns if the auto-router models are missing.",
    "",
    "## When not to overcomplicate it",
    "- If the team needs results fast, use hosted APIs first.",
    "- If the laptop starts swapping memory or slowing the rest of your work, step back to a smaller model or go back to `cheap`.",
    "- Local is there to save cost and add resilience, not to become the whole product strategy.",
    "",
  ].join("\n");
}

function renderGdgHackReadme(): string {
  return [
    "# GDG AI HACK 2026 Challenge Pack",
    "",
    "This folder turns the public hackathon brief into practical working guidance for your team and your assistants.",
    "",
    "## Event frame",
    "- Event: GDG AI HACK 2026 in Milan",
    "- Dates: May 8-10, 2026",
    "- Kickoff: May 9, 2026",
    "- Format: in-person build weekend with teams of up to four",
    "",
    "## The three main tracks",
    "1. Braynr: EdTech & Learning",
    "2. Luxonis: Spatial AI & Vision",
    "3. MSI: On-Device AI",
    "",
    "## Supporting sponsor stack",
    "- Google Cloud and Gemini for hosted AI capacity and prototype APIs",
    "- Replit for fast cloud prototyping",
    "- GitHub Education for student tooling",
    "- ElevenLabs for voice interfaces and narration",
    "- M5Stack and related hardware sponsors for device-side demos and sensors",
    "",
    "## How to use this pack",
    "1. Read the track guide that best matches your idea.",
    "2. Run or inspect the matching pipeline in `pipelines/hackathon/tracks/`.",
    "3. Turn the best direction into `doc/specs/<slug>/01-brainstorm.md`.",
    "4. Keep the final concept small, demoable, and sponsor-aware.",
    "",
    "## Choosing the right track",
    "- Pick Braynr if the core value is better learning, feedback, accessibility, or education workflows.",
    "- Pick Luxonis if the core value depends on camera input, depth, spatial awareness, or real-world perception.",
    "- Pick MSI if the strongest story is local inference, privacy, resilience, or no-cloud operation.",
    "",
  ].join("\n");
}

function renderBraynrTrackGuide(config: TeamKitConfig): string {
  return [
    "# Braynr Track: EdTech & Learning",
    "",
    "Use this track if your product improves how someone learns, gets feedback, studies, teaches, or practices a skill.",
    "",
    "## What judges will likely care about",
    "- A clear learner or teacher pain point",
    "- Personalization that goes beyond a generic chatbot",
    "- A measurable learning improvement, feedback loop, or accessibility gain",
    "- A demo that feels useful immediately",
    "",
    "## Strong idea shapes",
    "- Adaptive study coach for one subject or skill",
    "- Teacher assistant that turns raw work into rubric-based feedback",
    "- Accessibility-first learning companion with voice support",
    "- Team learning dashboard for hackathon or classroom collaboration",
    "",
    "## Sponsor/tool fit",
    "- Braynr gives the education angle and challenge framing.",
    "- Google/Gemini can help with hosted reasoning, multimodal analysis, or document understanding.",
    "- ElevenLabs fits well if voice tutoring or spoken feedback is central.",
    "- GitHub Education and Replit help if the demo includes classroom or student developer workflows.",
    `- Use \`cheap\` (${config.runtimeProfiles.cheap.model}) for ideation and drafting, and \`deep\` for final critique.`,
    "",
    "## What to avoid",
    "- A generic tutor with no real wedge",
    "- Too many personas or subjects at once",
    "- No way to show whether learning actually improved",
    "",
    "## A good demo story",
    "Show one concrete learner journey: input, diagnosis, personalized help, and visible improvement or feedback.",
    "",
  ].join("\n");
}

function renderLuxonisTrackGuide(config: TeamKitConfig): string {
  return [
    "# Luxonis Track: Spatial AI & Vision",
    "",
    "Use this track if the product depends on seeing the world: objects, movement, people, environments, depth, or spatial context.",
    "",
    "## What judges will likely care about",
    "- A real-world problem that clearly needs camera or spatial understanding",
    "- Good use of perception, not just generic classification",
    "- A demo that makes the physical-world value obvious",
    "- Feasible deployment story with hardware, recorded footage, or simulation",
    "",
    "## Strong idea shapes",
    "- Accessibility assistant that interprets surroundings",
    "- Safety or occupancy monitor for workspaces, labs, or events",
    "- Sports, movement, or posture feedback system",
    "- Retail, warehouse, or logistics assistant using scene understanding",
    "",
    "## Sponsor/tool fit",
    "- Luxonis brings the vision and spatial AI framing.",
    "- Google/Gemini can help with higher-level reasoning on top of detected events.",
    "- Replit is useful for quick demo dashboards.",
    "- M5Stack or related device sponsors can help if the demo crosses into sensors or physical interaction.",
    `- Use \`local\` (${config.runtimeProfiles.local.model}) for review crews, but keep actual perception demos grounded in the camera stack.`,
    "",
    "## What to avoid",
    "- A vision demo with no clear user outcome",
    "- Depending on hardware you cannot actually access during the event",
    "- Overbuilding the model stack instead of the end-to-end user story",
    "",
    "## A good demo story",
    "Show live or prerecorded footage, the system's interpretation, and the action or insight a user gets from it.",
    "",
  ].join("\n");
}

function renderMsiTrackGuide(): string {
  return [
    "# MSI Track: On-Device AI",
    "",
    "Use this track if the strongest story is local inference, privacy, low latency, or working even when connectivity is poor.",
    "",
    "## What judges will likely care about",
    "- Why on-device matters for this use case",
    "- A believable local deployment story",
    "- Privacy, speed, or resilience as part of the value, not an afterthought",
    "- A demo that proves the product still works without cloud dependence",
    "",
    "## Strong idea shapes",
    "- Offline private assistant for a specific workflow",
    "- Local-first coding or research copilot",
    "- Field-tech or emergency workflow assistant with weak connectivity",
    "- Private note, meeting, or document intelligence on a laptop device",
    "",
    "## Sponsor/tool fit",
    "- MSI gives the on-device framing and hardware story.",
    "- Ollama and local runtimes help you prove the local-first path quickly.",
    "- Google/Gemini can still be used for evaluation or optional cloud fallback, but not as the main dependency.",
    "- Your MacBook M3 Pro plus the `local` auto router is a practical development path for this track.",
    "",
    "## What to avoid",
    "- Calling it on-device while the core intelligence still depends on cloud APIs",
    "- Models too large to run reliably on the real demo machine",
    "- No explanation of why local execution matters",
    "",
    "## A good demo story",
    "Show the product working locally, with low latency and a clear privacy or resilience advantage.",
    "",
  ].join("\n");
}

function renderIdeaFromRepoPipeline(): string {
  return [
    "name: hackathon-idea-from-repo",
    "steps:",
    "  - id: repo-scan",
    "    prompt: |",
    "      Read the current repository and summarize the product, current capabilities, and obvious gaps.",
    "      Theme: {theme}",
    "      Constraints: {constraints}",
    "    tools: [Read, Glob, Grep]",
    "    output:",
    "      repo_summary: string",
    "      opportunities:",
    "        type: array",
    "        items: string",
    "",
    "  - id: idea-pack",
    "    prompt: |",
    "      Using this repo summary: {repo-scan.repo_summary}",
    "      Opportunities: {repo-scan.opportunities}",
    "      Generate 5 grounded hackathon ideas with user value, demo hook, and feasibility.",
    "    output:",
    "      report: string",
    "",
  ].join("\n");
}

function renderCritiqueIdeaPipeline(): string {
  return [
    "name: hackathon-critique-idea",
    "steps:",
    "  - id: critique",
    "    prompt: |",
    "      Critique this idea or draft spec:",
    "      {idea}",
    "",
    "      Score it for user value, technical feasibility, demo impact, and execution risk.",
    "      End with a recommendation and the top 3 improvements.",
    "    output:",
    "      scorecard: string",
    "",
  ].join("\n");
}

function renderSpecPipeline(): string {
  return [
    "name: hackathon-spec-from-brainstorm",
    "steps:",
    "  - id: draft-spec",
    "    prompt: |",
    "      Turn this brainstorm into a concise, implementation-ready specification:",
    "      {brainstorm}",
    "",
    "      Include goal, audience, scope, solution shape, and acceptance criteria.",
    "    output:",
    "      specification: string",
    "",
  ].join("\n");
}

function renderTasksPipeline(): string {
  return [
    "name: hackathon-tasks-from-spec",
    "steps:",
    "  - id: task-breakdown",
    "    prompt: |",
    "      Turn this specification into an actionable task list:",
    "      {specification}",
    "",
    "      Split work into ideation, product/UX, implementation, validation, and demo preparation.",
    "    output:",
    "      tasks: string",
    "",
  ].join("\n");
}

function renderHandoffPipeline(): string {
  return [
    "name: hackathon-handoff-summary",
    "steps:",
    "  - id: handoff",
    "    prompt: |",
    "      Create an implementation handoff from this feature lifecycle content:",
    "      Brainstorm: {brainstorm}",
    "      Specification: {specification}",
    "      Tasks: {tasks}",
    "",
    "      Summarize the likely code areas, testing plan, and demo plan.",
    "    output:",
    "      handoff: string",
    "",
  ].join("\n");
}

function renderHackathonCrewReviewPipeline(): string {
  return [
    "name: hackathon-crew-review",
    "steps:",
    "  - id: reviewer-product",
    "    prompt: |",
    "      Review this feature idea and implementation plan from a product perspective.",
    "      Focus on user value, clarity, and demo strength.",
    "      {idea}",
    "    output:",
    "      review: string",
    "",
    "  - id: reviewer-technical",
    "    prompt: |",
    "      Review this feature idea and implementation plan from a technical perspective.",
    "      Focus on feasibility, execution risk, and missing details.",
    "      {idea}",
    "    output:",
    "      review: string",
    "",
    "  - id: synthesis",
    "    prompt: |",
    "      Combine these reviews into one actionable verdict.",
    "      Product review: {reviewer-product.review}",
    "      Technical review: {reviewer-technical.review}",
    "    output:",
    "      report: string",
    "",
  ].join("\n");
}

function renderHackathonPitchPolishPipeline(): string {
  return [
    "name: hackathon-pitch-polish",
    "steps:",
    "  - id: draft-pitch",
    "    prompt: |",
    "      Turn this project summary into a short hackathon pitch.",
    "      Project: {project}",
    "      Audience: judges and mentors",
    "    output:",
    "      pitch: string",
    "",
    "  - id: critique-pitch",
    "    prompt: |",
    "      Critique this pitch for clarity, credibility, and demo strength.",
    "      {draft-pitch.pitch}",
    "    output:",
    "      critique: string",
    "",
    "  - id: improve-pitch",
    "    prompt: |",
    "      Improve the pitch using this critique.",
    "      Pitch: {draft-pitch.pitch}",
    "      Critique: {critique-pitch.critique}",
    "    output:",
    "      final_pitch: string",
    "",
  ].join("\n");
}

function renderBraynrTrackPipeline(): string {
  return [
    "name: hackathon-braynr-learning-pack",
    "steps:",
    "  - id: repo-scan",
    "    prompt: |",
    "      Read the current repository and summarize what product or capability already exists.",
    "      Theme: Braynr EdTech & Learning",
    "      Constraints: {constraints}",
    "    tools: [Read, Glob, Grep]",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      repo_summary: string",
    "",
    "  - id: idea-pack",
    "    prompt: |",
    "      Using this repo summary: {repo-scan.repo_summary}",
    "      Generate 5 concrete ideas for the Braynr EdTech & Learning track.",
    "      Each idea must include target user, pain point, why it is better than a generic tutor, and how to demo it fast.",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      report: string",
    "",
    "  - id: demo-plan",
    "    prompt: |",
    "      From this idea pack: {idea-pack.report}",
    "      Choose the best single concept and produce a 24-hour demo plan.",
    "      Include sponsor/tool fit, MVP scope cuts, and the one metric or proof point to show judges.",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      plan: string",
    "",
  ].join("\n");
}

function renderLuxonisTrackPipeline(): string {
  return [
    "name: hackathon-luxonis-spatial-pack",
    "steps:",
    "  - id: repo-scan",
    "    prompt: |",
    "      Read the current repository and summarize what product or capability already exists.",
    "      Theme: Luxonis Spatial AI & Vision",
    "      Constraints: {constraints}",
    "    tools: [Read, Glob, Grep]",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      repo_summary: string",
    "",
    "  - id: idea-pack",
    "    prompt: |",
    "      Using this repo summary: {repo-scan.repo_summary}",
    "      Generate 5 concrete ideas for the Luxonis Spatial AI & Vision track.",
    "      Each idea must include camera/spatial input, user outcome, hardware or footage plan, and fast demo path.",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      report: string",
    "",
    "  - id: demo-plan",
    "    prompt: |",
    "      From this idea pack: {idea-pack.report}",
    "      Choose the best single concept and produce a 24-hour demo plan.",
    "      Include perception pipeline, sponsor/tool fit, fallback if hardware is limited, and the user-facing output.",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      plan: string",
    "",
  ].join("\n");
}

function renderMsiTrackPipeline(): string {
  return [
    "name: hackathon-msi-on-device-pack",
    "steps:",
    "  - id: repo-scan",
    "    prompt: |",
    "      Read the current repository and summarize what product or capability already exists.",
    "      Theme: MSI On-Device AI",
    "      Constraints: {constraints}",
    "    tools: [Read, Glob, Grep]",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      repo_summary: string",
    "",
    "  - id: idea-pack",
    "    prompt: |",
    "      Using this repo summary: {repo-scan.repo_summary}",
    "      Generate 5 concrete ideas for the MSI On-Device AI track.",
    "      Each idea must include why local inference matters, what runs on-device, and how to keep the demo reliable on real hardware.",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      report: string",
    "",
    "  - id: demo-plan",
    "    prompt: |",
    "      From this idea pack: {idea-pack.report}",
    "      Choose the best single concept and produce a 24-hour demo plan.",
    "      Include local model/runtime choice, sponsor/tool fit, privacy or latency advantage, and fallback scope cuts.",
    "    retry: { maxAttempts: 2 }",
    "    output:",
    "      plan: string",
    "",
  ].join("\n");
}

function renderNightlyCodeReviewPipeline(): string {
  return [
    "name: startup-nightly-code-review",
    "steps:",
    "  - id: code-review",
    "    prompt: |",
    "      Review the current repository for bugs, regressions, missing tests, and maintainability risks.",
    "      Prioritize findings by severity and give concrete next actions.",
    "    tools: [Read, Glob, Grep]",
    "    output:",
    "      report: string",
    "",
  ].join("\n");
}

function renderWeeklyUxCritiquePipeline(): string {
  return [
    "name: startup-weekly-ux-critique",
    "steps:",
    "  - id: ux-review",
    "    prompt: |",
    "      Critique the product UX and onboarding based on the codebase, docs, and current flows.",
    "      Focus on clarity, friction, and opportunities for higher conversion or delight.",
    "    tools: [Read, Glob, Grep]",
    "    output:",
    "      critique: string",
    "",
  ].join("\n");
}

function renderSecurityPerfCrewPipeline(): string {
  return [
    "name: startup-security-perf-crew",
    "steps:",
    "  - id: security-review",
    "    prompt: |",
    "      Review the repository for security risks and suspicious patterns.",
    "    tools: [Read, Glob, Grep]",
    "    output:",
    "      security_findings: string",
    "",
    "  - id: perf-review",
    "    prompt: |",
    "      Review the repository for performance risks, obvious inefficiencies, and scaling bottlenecks.",
    "    tools: [Read, Glob, Grep]",
    "    output:",
    "      perf_findings: string",
    "",
    "  - id: synthesis",
    "    prompt: |",
    "      Combine these reviews into one prioritized report.",
    "      Security: {security-review.security_findings}",
    "      Performance: {perf-review.perf_findings}",
    "    output:",
    "      report: string",
    "",
  ].join("\n");
}

function renderImprovementBacklogPipeline(): string {
  return [
    "name: startup-improvement-backlog",
    "steps:",
    "  - id: backlog",
    "    prompt: |",
    "      Propose a ranked improvement backlog for this repository.",
    "      Include product, UX, engineering quality, and developer velocity items.",
    "    tools: [Read, Glob, Grep]",
    "    output:",
    "      backlog: string",
    "",
  ].join("\n");
}

function renderCofounderReportPipeline(): string {
  return [
    "name: startup-cofounder-report",
    "steps:",
    "  - id: cofounder-report",
    "    prompt: |",
    "      Produce a cofounder-style memo grounded in the current codebase.",
    "      Cover what is working, what is fragile, what to improve next, and where product leverage is highest.",
    "    tools: [Read, Glob, Grep]",
    "    output:",
    "      memo: string",
    "",
  ].join("\n");
}
