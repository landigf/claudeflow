import { ClaudeApiRuntime, type ClaudeApiRuntimeOptions } from "./api.js";
import { ClaudeCliRuntime, type ClaudeCliRuntimeOptions } from "./cli.js";
import { OllamaRuntime } from "./ollama.js";
import { OpenAICompatibleRuntime, type OpenAICompatibleRuntimeOptions } from "./openai.js";
import type { Runtime } from "./types.js";

export type RuntimeProvider =
  | "claude-cli"
  | "anthropic"
  | "openai"
  | "gemini"
  | "openai-compatible"
  | "ollama";

export interface RuntimeFactoryOptions {
  provider?: RuntimeProvider;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
  apiKey?: string;
  cwd?: ClaudeCliRuntimeOptions["cwd"];
  permissionMode?: ClaudeCliRuntimeOptions["permissionMode"];
  defaultTimeoutMs?: ClaudeCliRuntimeOptions["defaultTimeoutMs"];
  maxTurns?: ClaudeCliRuntimeOptions["maxTurns"];
  maxBudgetUsd?: ClaudeCliRuntimeOptions["maxBudgetUsd"];
  mcpConfig?: ClaudeCliRuntimeOptions["mcpConfig"];
}

/**
 * Create a runtime from explicit options and standard env vars.
 *
 * Defaults to Claude CLI so existing behavior stays unchanged.
 */
export function createRuntime(options: RuntimeFactoryOptions = {}): Runtime {
  const provider = options.provider ?? readRuntimeProvider("CLAUDEFLOW_RUNTIME") ?? "claude-cli";

  switch (provider) {
    case "claude-cli":
      return new ClaudeCliRuntime({
        cwd: options.cwd,
        permissionMode: options.permissionMode,
        defaultTimeoutMs: options.defaultTimeoutMs,
        maxTurns: options.maxTurns,
        maxBudgetUsd: options.maxBudgetUsd,
        mcpConfig: options.mcpConfig,
      });

    case "anthropic": {
      const anthropicOptions: ClaudeApiRuntimeOptions = {
        apiKey: requireValue(options.apiKey ?? process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
        model: options.model ?? process.env.ANTHROPIC_MODEL ?? process.env.CLAUDEFLOW_MODEL,
        maxTokens: options.maxTokens,
        baseUrl: options.baseUrl ?? process.env.ANTHROPIC_BASE_URL,
      };
      return new ClaudeApiRuntime(anthropicOptions);
    }

    case "openai": {
      const openAiOptions: OpenAICompatibleRuntimeOptions = {
        apiKey: requireValue(options.apiKey ?? process.env.OPENAI_API_KEY, "OPENAI_API_KEY"),
        model:
          options.model ?? process.env.OPENAI_MODEL ?? process.env.CLAUDEFLOW_MODEL ?? "gpt-5-mini",
        maxTokens: options.maxTokens,
        baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      };
      return new OpenAICompatibleRuntime(openAiOptions);
    }

    case "gemini": {
      const geminiOptions: OpenAICompatibleRuntimeOptions = {
        apiKey: requireValue(options.apiKey ?? process.env.GEMINI_API_KEY, "GEMINI_API_KEY"),
        model:
          options.model ??
          process.env.GEMINI_MODEL ??
          process.env.CLAUDEFLOW_MODEL ??
          "gemini-2.5-flash-lite",
        maxTokens: options.maxTokens,
        baseUrl:
          options.baseUrl ??
          process.env.GEMINI_BASE_URL ??
          "https://generativelanguage.googleapis.com/v1beta/openai",
      };
      return new OpenAICompatibleRuntime(geminiOptions);
    }

    case "openai-compatible": {
      const compatibleOptions: OpenAICompatibleRuntimeOptions = {
        apiKey:
          options.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? process.env.OPENAI_API_KEY,
        model:
          options.model ??
          process.env.OPENAI_COMPATIBLE_MODEL ??
          process.env.CLAUDEFLOW_MODEL ??
          "gpt-5-mini",
        maxTokens: options.maxTokens,
        baseUrl:
          options.baseUrl ??
          process.env.OPENAI_COMPATIBLE_BASE_URL ??
          process.env.OPENAI_BASE_URL ??
          "https://api.openai.com/v1",
      };
      return new OpenAICompatibleRuntime(compatibleOptions);
    }

    case "ollama": {
      return new OllamaRuntime({
        apiKey: options.apiKey ?? process.env.OLLAMA_API_KEY,
        model: options.model ?? process.env.OLLAMA_MODEL ?? process.env.CLAUDEFLOW_MODEL ?? "auto",
        maxTokens: options.maxTokens,
        baseUrl: options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      });
    }
  }
}

function readRuntimeProvider(name: string): RuntimeProvider | undefined {
  const value = process.env[name];
  if (
    value === "claude-cli" ||
    value === "anthropic" ||
    value === "openai" ||
    value === "gemini" ||
    value === "openai-compatible" ||
    value === "ollama"
  ) {
    return value;
  }
  return undefined;
}

function requireValue(value: string | undefined, envName: string): string {
  if (!value) {
    throw new Error(`Missing API key. Set ${envName} or pass apiKey explicitly.`);
  }
  return value;
}
