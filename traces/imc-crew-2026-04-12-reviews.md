# IMC 2026 — 8-Expert Review Crew

## cdn-expert



This is a research review task, not an implementation plan — so I won't call ExitPlanMode. Here's the review:

---

## CDN Engineer Review: AgentWebBench Cache Replay Study

### 1. Is the cache crossover finding actionable?

**No. Directionally interesting, not deployment-changing.**

GDSF's advantage on mixed-size web objects has been known since the early 2000s. The heavy-tailed size distribution (50% under 1 KB, 4.6% over 100 KB) is the textbook scenario where size-aware admission wins. More critically:

- **82K requests is ~1 second of traffic** at a medium edge PoP. I make policy decisions on 10^8–10^10 request traces.
- **Cache sizes (1–50 MiB) are unrealistic.** CDN per-tenant allocations are 100 MiB–10 GiB; edge servers are 100 GB–1 TB.
- **Not real agent traffic.** A scripted-random link follower is closer to a traditional crawler than to a ReAct/CoT agent.
- **No TTL/freshness information.** Without Cache-Control headers, this is a pure capacity-miss study — it tells me nothing about staleness or revalidation, which is where real operational cost lives.

### 2. Is 168K requests enough?

**No. 3–4 orders of magnitude too small.**

| Trace | Requests | Used for |
|-------|----------|----------|
| Twitter (OSDI '20) | Billions | Cache policy at scale |
| MSR Cambridge | Hundreds of millions | Block cache research |
| S3-FIFO (Yang et al.) | Billions | FIFO policy eval |
| **AgentWebBench** | **82,455** (replay subset) | Cache policy claims |

The 82K replay trace has ~4.8 requests per unique URL. That's barely enough to distinguish LRU from random eviction, let alone rank 6 sophisticated policies. Confidence intervals on policy ranking via bootstrap resampling are absent and needed.

### 3. What's missing from the trace schema?

**Critical gaps that block CDN adoption:**

| Missing | Why it matters |
|---------|---------------|
| `Cache-Control` / `Expires` | TTL-based eviction dominates CDN management. Without TTLs, you can only study capacity misses. |
| `ETag` / `Last-Modified` | Can't distinguish cold misses from revalidations (304s). |
| `Vary` header | Determines cache key variants (gzip vs brotli, mobile vs desktop). |
| `Accept-Encoding` / `Content-Encoding` | Compressed vs uncompressed sizes for capacity planning. |
| Origin TTFB | CDN operators optimize for origin offload, not just hit rate. |
| CDN hit/miss indicator | Browser-side vantage can't distinguish CDN hits from origin fetches. |

The schema does well on: timestamps, URL, content-type, body size, session/task IDs. The `cache_trace.csv` format is clean and directly consumable. Better than many published traces.

### 4. Would I use this benchmark?

**Partially.**

**Yes for:** workload characterization (the 66.5% rendering overhead finding is genuinely actionable), traffic modeling inputs (timing distributions, URL reuse ratios, per-task content mix), and motivating machine-lane investment.

**No for:** cache policy evaluation, capacity planning, rate limiting design, or any production deployment decision.

The reproducibility pipeline (`build_artifacts.py` → figures → paper) is best-in-class.

### 5. Comparison with existing traces

AgentWebBench's unique value: the only public trace combining session structure + task labels + replay-ready format for browser-mediated automation. That's a real gap-fill.

Where it falls short: HTTP Archive has full HAR with all response headers and 15 years of longitudinal data. CDN production traces have 10^4–10^6× more requests and capture the cache-side view (hit/miss decisions, TTL expirations, revalidations). These are complementary, not substitutes.

The JS/image inversion finding (60% JS agent vs 33% human; 14% images agent vs 45% human) is a clean, citable result.

### 6. Specific suggestions for IMC

**Fatal issue first:** The conclusion (line 1220) says *"at 10 MiB recency-based LRU surges ahead"* and the figure caption (line 1023) says *"LRU surges ahead at 10 MiB"* — but Table 5 shows GDSF=66.5% vs LRU=50.7% at 10 MiB. **GDSF wins at every size.** This is a copy-paste artifact from the earlier Zurich-only trace. Any reviewer will catch this and it will torpedo the paper.

**Blockers for IMC:**
1. Fix the crossover inconsistency immediately
2. Scale to 1M+ requests (100 repeats, more tasks, multi-day collection)
3. Add LLM-driven traces — the "scripted-random" limitation undermines the "agentic workload" claim entirely

**Strong improvements:**
4. Plot continuous miss ratio curves (MRC) using Waldspurger's miniature simulation, not 5 discrete points — test up to working-set size (2.1 GiB)
5. Per-task cache breakdown (10 tasks × 6 policies × continuous MRC) — this would be a genuinely novel contribution
6. Add Cache-Control/ETag/Vary to the trace schema and run TTL-aware simulation
7. Bootstrap confidence intervals on policy ranking (shuffle sessions 100×, report CIs)

**High-impact extensions:**
8. Human browsing traces on the same 10 tasks for direct agent-vs-human cache comparison
9. Mixed-workload simulation: what happens to cache when agents are 10%, 25%, 50% of traffic? This is the result that would make me change my deployment.

### Bottom line

**The paper's strongest contributions are Sections 5.1–5.9 (workload characterization) and the reproducibility pipeline, not the cache study.** The 66.5% rendering overhead, per-task content composition, and geographic variation analysis are genuine IMC contributions. Section 6 is currently a proof-of-concept, not a research result — reposition it as "demonstration of replay utility" and save the strong cache findings for a follow-on paper at larger scale. Items 1–3 above are blockers; 4–5 would move the paper from borderline to strong accept.

---

## agent-expert

I now have a thorough understanding of the paper. Let me write the review.

---

## Agent Researcher Review: AgentWebBench Benchmark Design and Agent Framing

### 1. Is "AgentWebBench" an honest name?

**No. It's aspirational branding on a crawler trace.**

The name claims "Agent" but the only released data comes from a scripted-random link follower. The paper defines "browser-mediated AI systems" as a spectrum (line 85–86: "ranging from deterministic scripted drivers to LLM-steered autonomous agents"), which is technically defensible but strategically misleading. Every agent researcher who sees "AgentWebBench" in a citation will assume it contains traces from systems like those evaluated in WebArena or Mind2Web. It doesn't.

The paper is commendably transparent about this (line 139–144): "We are explicit about scope. The current release uses a scripted-random driver, not an LLM-steered agent. This is a real limitation." But honesty buried in paragraph 3 of the introduction doesn't fix a misleading title. The name will travel further than the caveat.

**Suggested rename:** `BrowserWorkloadBench` or `WebTrafficBench`. Add "Agent" when you ship LLM-driven traces.

### 2. Is scripted-random a valid proxy for LLM-driven navigation?

**No. The navigation strategy is fundamentally different in kind, not just degree.**

The scripted-random driver (`runner.py:257–295`) does:
1. Fetch seed URL → parse HTML for `<a href>` tags → filter same-host → shuffle → follow top-N
2. Repeat with 1-second sleeps, fixed step budget (6–20 steps)
3. Zero page understanding — no DOM analysis, no content reading, no task-relevant decisions

An LLM-driven agent (WebArena-style, or even the paper's own BrowserUse+Gemini setup at `runner.py:388–442`) does:
1. Receive full accessibility tree or DOM state
2. Reason about task progress ("I need to find the pricing page")
3. Backtrack, retry, try alternative paths
4. Interact with dynamic elements (dropdowns, search boxes, filters)
5. Decide when the task is done

These produce categorically different traffic patterns:

| Property | Scripted-Random | LLM Agent (WebArena-class) |
|----------|----------------|---------------------------|
| Link selection | Uniform random over `<a>` tags | Semantically targeted |
| Page interaction | Navigate only | Click, type, scroll, filter |
| Backtracking | None | Frequent (revisits → higher URL reuse) |
| Think time | Fixed 1s | Variable (LLM inference: 1–30s) |
| Request bursting | Linear, uniform spacing | Clustered around decision points |
| Dynamic content | Not triggered | JS-driven state changes produce new requests |
| Step budget | Fixed | Agent-determined (early exit or timeout) |
| Error recovery | Skip after 2 retries | Retry with different strategy |

The paper's own preliminary comparison (Table 7, line 838–849) shows this on two tasks — but the tasks chosen (regulatory lookup, documentation lookup) are precisely the ones where the gap is smallest, because they have constrained link structures. On an open-ended task like "news aggregation" or "travel planning," the divergence would be much larger.

**The critical issue:** The scripted driver produces a *uniform exploration* pattern. An LLM agent produces a *goal-directed search* pattern. These have fundamentally different reuse distributions, and any cache policy conclusions drawn from one do not transfer to the other.

### 3. What would a proper agent comparison look like?

A benchmark that earns the name "AgentWebBench" needs:

**Tier 1 — Minimum for the agent label:**
- Run 3+ LLM backends (GPT-4o, Claude, Gemini) on all 10 tasks, 10 repeats each
- Record the same trace schema as the scripted runs
- Compare: URL reuse, request timing, content-type mix, session duration, step count
- Report both task completion rate AND traffic characteristics

**Tier 2 — Meaningful for the agent community:**
- Include traces from established agent frameworks: BrowserUse, WebArena's agent, Playwright Agents, Stagehand, LaVague
- Vary agent architecture: ReAct, CoT, tree-of-thought, multi-agent
- Include failed sessions — agent failures produce distinctive traffic (repeated retries, long stalls, abandoned navigations)
- Annotate each request with the agent's "reasoning step" that triggered it

**Tier 3 — Benchmark the community would adopt:**
- Standard task suite overlapping with WebArena/Mind2Web tasks (so researchers can correlate task success with traffic cost)
- Difficulty tiers with expected traffic budgets
- Leaderboard: task success rate vs. network cost (requests, bytes, origin hits)
- A "traffic efficiency" metric: how much network work per unit of task progress

### 4. How does this compare to WebArena / Mind2Web / WebVoyager?

| Dimension | WebArena | Mind2Web | WebVoyager | AgentWebBench |
|-----------|----------|----------|------------|---------------|
| **What it measures** | Task success (action sequences) | Element prediction accuracy | End-to-end task completion | HTTP request patterns |
| **Environment** | Self-hosted (GitLab, shopping, Reddit clones) | Real websites (snapshot) | Real websites (live) | Real websites (live) |
| **Agent type** | LLM agents | LLM agents | LLM multimodal agents | Scripted-random |
| **Traffic captured** | Action logs only | None | Screenshots only | Full HTTP trace |
| **Reproducibility** | High (self-hosted) | Medium (snapshots) | Low (live web) | Medium (live web, but repeatable driver) |
| **Tasks** | 812 across 6 sites | 2,350 across 137 sites | 643 across 15 sites | 10 task families, 400 sessions |

**The real gap AgentWebBench fills:** None of these benchmarks captures HTTP-level traffic. WebArena logs actions ("click button #submit") but not the 50 sub-resource requests that button click triggers. This is the paper's genuinely novel contribution (line 194–196): "These benchmarks focus on what agents accomplish, not how their behavior manifests at the network level."

**But the positioning is wrong.** The paper positions itself as a peer of these agent benchmarks (Table 1, line 292–307). It isn't. It's a *web measurement* paper that borrows task structure from agent benchmarks. The right framing is: "We provide the missing network-level substrate that agent benchmarks lack." Currently the paper tries to have it both ways — calling itself an agent benchmark while containing no agent traces.

### 5. Would the agent community adopt this benchmark?

**Not in its current form. Here's why:**

**What agent researchers need:**
1. A way to compare agents on infrastructure cost, not just task success
2. Traces from *their* agents on *their* tasks
3. A leaderboard or standard metric

**What AgentWebBench provides:**
1. Traces from a scripted driver on custom tasks
2. No agent comparison capability (only one "agent" type)
3. No task success measurement (Table 1 explicitly shows "Task eval: --")

**The adoption path is there but requires execution.** If AgentWebBench:
- Integrated WebArena tasks (self-hosted, reproducible)
- Shipped traces from 3+ LLM agents
- Published a "network cost per task" metric
- Provided a simple harness: `agentwebbench run --agent my_agent.py --task news-aggregation`

...then yes, agent researchers would use it. The infrastructure (CDP tracing, trace schema, cache-ready exports) is solid. The missing piece is the actual agent traces and the task overlap with established benchmarks.

### 6. What's the path from "browser automation traces" to "agent traffic benchmark"?

**Phase 1 (pre-IMC, immediate):**
- Rename to something accurate OR ship LLM traces before submission
- Run Gemini 2.5 Flash + GPT-4o on all 10 tasks (the paper says this costs ~$3 and takes ~1 hour — there is no excuse)
- Fix the CDP instrumentation bug that prevents multi-domain LLM tracing (line 861–865)
- Publish the comparison: does scripted-random traffic look like LLM traffic? If yes, the proxy is validated. If no, the scripted data is an interesting baseline but not the main contribution.

**Phase 2 (post-IMC, 3-month horizon):**
- Add WebArena tasks (the 6 self-hosted sites) — this gives you reproducible, agent-standard tasks
- Collect traces from 3+ agent frameworks on these tasks
- Define and publish a "traffic efficiency" metric: `task_success / (requests × bytes)`
- Release a runner that agent developers can plug into

**Phase 3 (workshop/follow-on paper):**
- Community contribution: accept trace submissions from agent developers
- Mixed-workload studies: what happens to CDN caches when 10% of sessions are agents?
- Correlate task difficulty with network cost — is there a "network price of intelligence"?

### Bottom line

The paper has a genuinely novel idea (HTTP-level measurement of browser-mediated automation) and solid infrastructure (CDP tracing, reproducible pipeline, geo-distributed collection). But calling it "AgentWebBench" while shipping only scripted-random traces is a naming problem that will cost credibility with both the agent and measurement communities.

The fix is straightforward: either rename it, or — better — spend the $3 and one hour to ship real LLM traces before IMC submission. The framework already supports it (line 866–868). The preliminary comparison on 2 tasks (Table 7) shows the pipeline works. Extending to all 10 tasks converts this from "a web measurement paper with an aspirational name" to "the first network-level agent benchmark" — which is what the title promises.

---
