import { isIP } from "node:net";
import type { ToolAdapter } from "./index.js";

export interface WebToolOptions {
  searchBaseUrl?: string;
  userAgent?: string;
  defaultTimeoutMs?: number;
  defaultMaxChars?: number;
}

interface WebSearchResult {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  hostname: string;
}

interface WebSearchResponse {
  query: string;
  engine: string;
  results: WebSearchResult[];
  links: string[];
}

interface WebFetchResponse {
  url: string;
  finalUrl: string;
  hostname: string;
  title: string;
  description: string;
  contentType: string;
  excerpt: string;
  content: string;
  textLength: number;
}

interface WebResearchSource extends WebSearchResult {
  fetched: boolean;
  titleFromPage: string;
  description: string;
  excerpt: string;
  content: string;
  contentType: string;
  fetchError?: string;
}

interface WebResearchResponse extends WebSearchResponse {
  fetchedCount: number;
  sources: WebResearchSource[];
}

const DEFAULT_SEARCH_BASE_URL = "https://html.duckduckgo.com/html/";
const DEFAULT_USER_AGENT = "ClaudeFlowBot/0.1 (+https://github.com/landigf/claudeflow)";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 6_000;

/**
 * Web tool — built-in web search and page fetching with source links.
 * Default path requires no API key and uses DuckDuckGo's HTML results page.
 */
export class WebTool implements ToolAdapter {
  readonly name = "web";

  readonly #searchBaseUrl: string;
  readonly #userAgent: string;
  readonly #defaultTimeoutMs: number;
  readonly #defaultMaxChars: number;

  constructor(options?: WebToolOptions) {
    this.#searchBaseUrl =
      options?.searchBaseUrl ?? process.env.WEB_SEARCH_BASE_URL ?? DEFAULT_SEARCH_BASE_URL;
    this.#userAgent = options?.userAgent ?? process.env.WEB_USER_AGENT ?? DEFAULT_USER_AGENT;
    this.#defaultTimeoutMs =
      options?.defaultTimeoutMs ?? parsePositiveInt(process.env.WEB_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    this.#defaultMaxChars =
      options?.defaultMaxChars ?? parsePositiveInt(process.env.WEB_MAX_CHARS, DEFAULT_MAX_CHARS);
  }

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "search":
        return this.#search(params);
      case "fetch":
        return this.#fetch(params);
      case "research":
        return this.#research(params);
      default:
        throw new Error(`WebTool: unknown action "${action}"`);
    }
  }

  async #search(params: Record<string, unknown>): Promise<WebSearchResponse> {
    const query = requireNonEmptyString(params.query, "WebTool.search: query is required");
    const topK = clampPositiveInt(params.topK, 5, 1, 10);
    const timeoutMs = clampPositiveInt(params.timeoutMs, this.#defaultTimeoutMs, 1_000, 60_000);

    const url = new URL(this.#searchBaseUrl);
    url.searchParams.set("q", query);

    const response = await this.#fetchText(url.toString(), timeoutMs);
    const html = await response.text();
    const results = parseDuckDuckGoResults(html, topK);

    return {
      query,
      engine: "duckduckgo-html",
      results,
      links: results.map((result) => result.url),
    };
  }

  async #fetch(params: Record<string, unknown>): Promise<WebFetchResponse> {
    const url = requireNonEmptyString(params.url, "WebTool.fetch: url is required");
    const maxChars = clampPositiveInt(params.maxChars, this.#defaultMaxChars, 500, 50_000);
    const timeoutMs = clampPositiveInt(params.timeoutMs, this.#defaultTimeoutMs, 1_000, 60_000);

    return this.#fetchPage(url, maxChars, timeoutMs);
  }

  async #research(params: Record<string, unknown>): Promise<WebResearchResponse> {
    const search = await this.#search(params);
    const fetchTopK = clampPositiveInt(params.fetchTopK, Math.min(3, search.results.length), 0, 10);
    const maxCharsPerPage = clampPositiveInt(
      params.maxCharsPerPage,
      this.#defaultMaxChars,
      500,
      50_000,
    );
    const timeoutMs = clampPositiveInt(params.timeoutMs, this.#defaultTimeoutMs, 1_000, 60_000);

    const selected = search.results.slice(0, fetchTopK);
    const sources = await Promise.all(
      selected.map(async (result): Promise<WebResearchSource> => {
        try {
          const page = await this.#fetchPage(result.url, maxCharsPerPage, timeoutMs);
          return {
            ...result,
            fetched: true,
            titleFromPage: page.title,
            description: page.description || result.snippet,
            excerpt: page.excerpt,
            content: page.content,
            contentType: page.contentType,
          };
        } catch (error) {
          return {
            ...result,
            fetched: false,
            titleFromPage: "",
            description: result.snippet,
            excerpt: "",
            content: "",
            contentType: "",
            fetchError: (error as Error).message,
          };
        }
      }),
    );

    return {
      ...search,
      fetchedCount: sources.filter((source) => source.fetched).length,
      sources,
    };
  }

  async #fetchPage(url: string, maxChars: number, timeoutMs: number): Promise<WebFetchResponse> {
    const normalized = normalizePublicHttpUrl(url);
    const response = await this.#fetchText(normalized.toString(), timeoutMs);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const body = await response.text();
    const finalUrl = response.url || normalized.toString();
    const finalHostname = safeHostname(finalUrl);

    if (contentType.includes("text/html")) {
      const title = extractTitle(body);
      const description = extractMetaDescription(body);
      const content = truncate(stripHtml(body), maxChars);
      return {
        url: normalized.toString(),
        finalUrl,
        hostname: finalHostname,
        title,
        description,
        contentType,
        excerpt: truncate(content, 280),
        content,
        textLength: content.length,
      };
    }

    const content = truncate(normalizeWhitespace(body), maxChars);
    return {
      url: normalized.toString(),
      finalUrl,
      hostname: finalHostname,
      title: "",
      description: "",
      contentType,
      excerpt: truncate(content, 280),
      content,
      textLength: content.length,
    };
  }

  async #fetchText(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": this.#userAgent,
          Accept: "text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.1",
        },
      });

      if (!response.ok) {
        throw new Error(`WebTool fetch failed (${response.status}) for ${url}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseDuckDuckGoResults(html: string, topK: number): WebSearchResult[] {
  const titleMatches = Array.from(
    html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
  );
  const snippetMatches = Array.from(
    html.matchAll(
      /<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi,
    ),
  );

  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  for (let index = 0; index < titleMatches.length && results.length < topK; index++) {
    const match = titleMatches[index];
    const rawUrl = decodeHtmlEntities(match[1] ?? "");
    const normalizedUrl = normalizeDuckDuckGoResultUrl(rawUrl);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;

    const title = normalizeWhitespace(stripHtml(match[2] ?? ""));
    if (!title) continue;

    seen.add(normalizedUrl);
    results.push({
      rank: results.length + 1,
      title,
      url: normalizedUrl,
      snippet: normalizeWhitespace(stripHtml(snippetMatches[index]?.[1] ?? "")),
      hostname: safeHostname(normalizedUrl),
    });
  }

  return results;
}

function normalizeDuckDuckGoResultUrl(rawUrl: string): string | undefined {
  if (!rawUrl) return undefined;

  try {
    const absolute = rawUrl.startsWith("http")
      ? rawUrl
      : new URL(rawUrl, "https://duckduckgo.com").toString();
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get("uddg");
    const target = uddg ? decodeURIComponent(uddg) : parsed.toString();
    return normalizePublicHttpUrl(target).toString();
  } catch {
    return undefined;
  }
}

function normalizePublicHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`WebTool only supports http(s) URLs, got "${url.protocol}"`);
  }

  if (isPrivateHost(url.hostname)) {
    throw new Error(`WebTool blocks private/local hosts: ${url.hostname}`);
  }

  return url;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (ipVersion === 6) {
    return (
      host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")
    );
  }

  return false;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeWhitespace(stripHtml(match?.[1] ?? ""));
}

function extractMetaDescription(html: string): string {
  const match = html.match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
  );
  return normalizeWhitespace(decodeHtmlEntities(match?.[1] ?? ""));
}

function stripHtml(html: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
