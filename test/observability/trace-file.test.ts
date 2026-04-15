import { describe, expect, it } from "vitest";

import { createTraceFileName } from "../../src/observability/trace-file.js";

describe("createTraceFileName", () => {
  it("includes milliseconds and pid to avoid same-second collisions", () => {
    const name = createTraceFileName(
      "hackathon-critique-idea",
      new Date("2026-04-15T12:29:45.321Z"),
      4321,
    );

    expect(name).toBe("hackathon-critique-idea-2026-04-15T12-29-45-321Z-4321.json");
  });
});
