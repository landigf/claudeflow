import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ClaudeCliRuntime,
  OllamaRuntime,
  OpenAICompatibleRuntime,
  createRuntime,
  selectOllamaModel,
} from "../../src/index.js";

const originalFetch = global.fetch;
const ENV_KEYS = [
  "CLAUDEFLOW_RUNTIME",
  "CLAUDEFLOW_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "GEMINI_MODEL",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OPENAI_COMPATIBLE_MODEL",
  "OLLAMA_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
] as const;

describe("OpenAICompatibleRuntime", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("calls chat completions and parses structured output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "gpt-4.1-mini",
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 8,
            prompt_tokens_details: { cached_tokens: 3 },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const runtime = new OpenAICompatibleRuntime({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
    });

    const result = await runtime.execute({
      prompt: "Return JSON",
      systemPrompt: "You are precise",
      outputSchema: z.object({ ok: z.boolean() }),
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };

    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.messages[0]).toEqual({ role: "system", content: "You are precise" });
    expect(body.messages[1].content).toContain(
      "Respond with ONLY a JSON object matching this schema",
    );
    expect(body.messages[1].content).toContain('"ok"');
    expect(result.text).toBe('{"ok":true}');
    expect(result.structured).toEqual({ ok: true });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 8, cacheReadTokens: 3 });
    expect(result.costUsd).toBeCloseTo(0.0000176, 10);
  });

  it("works without an API key for local OpenAI-compatible servers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "llama3.1:8b",
          choices: [
            {
              message: {
                content: [
                  { type: "text", text: "hello " },
                  { type: "output_text", text: "world" },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 7 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const runtime = new OpenAICompatibleRuntime({
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1:8b",
    });

    const result = await runtime.execute({ prompt: "Say hello" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers.Authorization).toBeUndefined();
    expect(result.text).toBe("hello world");
    expect(result.costUsd).toBeNull();
  });
});

describe("createRuntime", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("defaults to Claude CLI for backward compatibility", () => {
    expect(createRuntime()).toBeInstanceOf(ClaudeCliRuntime);
  });

  it("creates an OpenAI runtime from env defaults", () => {
    process.env.CLAUDEFLOW_RUNTIME = "openai";
    process.env.OPENAI_API_KEY = "sk-test";

    expect(createRuntime()).toBeInstanceOf(OpenAICompatibleRuntime);
  });

  it("creates a Gemini runtime from env defaults", () => {
    process.env.CLAUDEFLOW_RUNTIME = "gemini";
    process.env.GEMINI_API_KEY = "gem-test";

    expect(createRuntime()).toBeInstanceOf(OpenAICompatibleRuntime);
  });

  it("creates an Ollama runtime without requiring an API key", () => {
    process.env.CLAUDEFLOW_RUNTIME = "ollama";

    expect(createRuntime()).toBeInstanceOf(OpenAICompatibleRuntime);
  });

  it("exposes an explicit Ollama runtime helper", () => {
    const runtime = new OllamaRuntime();
    expect(runtime).toBeInstanceOf(OpenAICompatibleRuntime);
  });

  it("auto-selects the coding model for code-heavy prompts on 18 GB", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "qwen2.5-coder:7b",
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const runtime = new OllamaRuntime({ model: "auto", totalMemoryGb: 18 });
    await runtime.execute({
      prompt: "Review this TypeScript repository and fix the failing tests.",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { model: string };
    expect(body.model).toBe("qwen2.5-coder:7b");
  });

  it("auto-selects the vision model for vision-like prompts on 18 GB", async () => {
    expect(
      selectOllamaModel({
        request: { prompt: "Analyze this UI screenshot and suggest improvements." },
        totalMemoryGb: 18,
      }),
    ).toBe("gemma3:4b");
  });
});
