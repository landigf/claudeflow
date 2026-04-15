import { totalmem } from "node:os";
import { OpenAICompatibleRuntime, type OpenAICompatibleRuntimeOptions } from "./openai.js";
import type { RuntimeRequest, RuntimeResponse } from "./types.js";

export interface OllamaRuntimeOptions extends Omit<OpenAICompatibleRuntimeOptions, "baseUrl"> {
  baseUrl?: string;
  totalMemoryGb?: number;
}

const AUTO_MODEL = "auto";
const SMALL_CODER_MODEL = "qwen2.5-coder:3b";
const DEFAULT_CODER_MODEL = "qwen2.5-coder:7b";
const LARGE_CODER_MODEL = "qwen2.5-coder:14b";
const SMALL_VISION_MODEL = "gemma3:4b";
const LARGE_VISION_MODEL = "gemma3:12b";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";

interface OllamaModelSelectionOptions {
  request: RuntimeRequest;
  totalMemoryGb: number;
}

export function selectOllamaModel({ request, totalMemoryGb }: OllamaModelSelectionOptions): string {
  const text = `${request.systemPrompt ?? ""}\n${request.prompt}`.toLowerCase();
  const wantsVision =
    /\b(image|screenshot|photo|vision|visual|diagram|ui|screen|mockup|camera)\b/.test(text);
  const wantsCode =
    Boolean(request.tools && request.tools.length > 0) ||
    Boolean(request.outputSchema) ||
    /\b(code|repo|pull request|debug|test|typescript|javascript|python|function|class|lint|build|compile|bug|refactor|fix)\b/.test(
      text,
    );
  const wantsFastPass =
    !wantsCode &&
    text.length < 1_200 &&
    /\b(list|brainstorm|rewrite|summarize|extract|categorize|tag|classify)\b/.test(text);

  if (wantsVision) {
    return totalMemoryGb >= 32 ? LARGE_VISION_MODEL : SMALL_VISION_MODEL;
  }
  if (wantsFastPass) {
    return SMALL_CODER_MODEL;
  }
  if (wantsCode) {
    return totalMemoryGb >= 32 ? LARGE_CODER_MODEL : DEFAULT_CODER_MODEL;
  }
  return totalMemoryGb >= 32 ? LARGE_CODER_MODEL : DEFAULT_CODER_MODEL;
}

/**
 * Convenience wrapper around the OpenAI-compatible runtime for Ollama.
 */
export class OllamaRuntime extends OpenAICompatibleRuntime {
  readonly #configuredModel: string;
  readonly #totalMemoryGb: number;

  constructor(options?: OllamaRuntimeOptions) {
    const configuredModel = options?.model ?? process.env.OLLAMA_MODEL ?? AUTO_MODEL;
    super({
      ...options,
      baseUrl: options?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
      model: configuredModel,
    });
    this.#configuredModel = configuredModel;
    this.#totalMemoryGb = options?.totalMemoryGb ?? Math.round(totalmem() / 1024 ** 3);
  }

  async execute(request: RuntimeRequest): Promise<RuntimeResponse> {
    const configuredModel =
      request.model && request.model !== AUTO_MODEL
        ? request.model
        : this.#configuredModel === AUTO_MODEL
          ? selectOllamaModel({ request, totalMemoryGb: this.#totalMemoryGb })
          : this.#configuredModel;

    return super.execute({
      ...request,
      model: configuredModel,
    });
  }
}
