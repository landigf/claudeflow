import { afterEach, describe, expect, it, vi } from "vitest";
import { WebTool } from "../../src/tools/web.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("WebTool", () => {
  it("searches the web and returns links with snippets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `
          <html>
            <body>
              <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Falpha">Alpha Result</a>
              <div class="result__snippet">First result snippet.</div>
              <a class="result__a" href="https://example.com/beta">Beta Result</a>
              <div class="result__snippet">Second result snippet.</div>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const tool = new WebTool();
    const result = (await tool.execute("search", {
      query: "claudeflow web research",
      topK: 2,
    })) as {
      query: string;
      results: Array<{ title: string; url: string; snippet: string }>;
      links: string[];
    };

    expect(result.query).toBe("claudeflow web research");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      title: "Alpha Result",
      url: "https://example.com/alpha",
      snippet: "First result snippet.",
    });
    expect(result.links).toEqual(["https://example.com/alpha", "https://example.com/beta"]);
  });

  it("researches a topic and returns fetched sources with content", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("duckduckgo")) {
        return new Response(
          `
            <html>
              <body>
                <a class="result__a" href="https://example.com/guide">ClaudeFlow Guide</a>
                <div class="result__snippet">A practical guide.</div>
                <a class="result__a" href="https://example.com/research">Research Notes</a>
                <div class="result__snippet">Collected research notes.</div>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      if (url === "https://example.com/guide") {
        return new Response(
          `
            <html>
              <head>
                <title>ClaudeFlow Guide</title>
                <meta name="description" content="How to research with ClaudeFlow." />
              </head>
              <body>
                <main>Use the web tool to gather sources and keep the links.</main>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      }

      if (url === "https://example.com/research") {
        return new Response("Plain text research notes with direct source links.", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    const tool = new WebTool();
    const result = (await tool.execute("research", {
      query: "claudeflow investigation workflow",
      topK: 5,
      fetchTopK: 2,
      maxCharsPerPage: 500,
    })) as {
      results: Array<{ url: string }>;
      sources: Array<{ url: string; fetched: boolean; content: string; titleFromPage: string }>;
      fetchedCount: number;
    };

    expect(result.results).toHaveLength(2);
    expect(result.fetchedCount).toBe(2);
    expect(result.sources[0]).toMatchObject({
      url: "https://example.com/guide",
      fetched: true,
      titleFromPage: "ClaudeFlow Guide",
    });
    expect(result.sources[0].content).toContain("Use the web tool to gather sources");
    expect(result.sources[1].content).toContain("Plain text research notes");
  });

  it("blocks private or local URLs", async () => {
    const tool = new WebTool();

    await expect(tool.execute("fetch", { url: "http://localhost:3000" })).rejects.toThrow(
      "private/local hosts",
    );
    await expect(tool.execute("fetch", { url: "http://127.0.0.1:11434" })).rejects.toThrow(
      "private/local hosts",
    );
  });
});
