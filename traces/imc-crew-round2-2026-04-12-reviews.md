# IMC Crew Round 2

## related-work-expert

Here is my evaluation of Section 2 and the positioning table.

---

## 1. Missing Critical References

The related work is solid but has three gaps an IMC reviewer will notice:

**No crawler/bot traffic characterization.** The paper claims agents differ from crawlers and human traffic, but cites only Barr-Smith (detection) and Cloudflare (aggregate stats). There is no citation of actual crawler workload characterization studies. Without this, the claim "agentic workloads require fundamentally different caching strategies than human web traffic" lacks a baseline comparison class. Reviewers will ask: different from *which* prior characterization?

**No agent architecture citations.** The paper compares scripted vs. LLM-driven traffic (Table 4, 1.8x amplification) but never cites the agent reasoning architectures that *cause* this difference. ReAct (Yao et al., ICLR 2023) is the canonical reference — the reason LLM agents generate more traffic is exploratory reasoning loops. Without citing it, the 1.8x finding is descriptive but not mechanistically grounded.

**No CDN production trace benchmarks.** The cache section cites algorithms (ARC, S3-FIFO, GDSF, etc.) but not the canonical CDN workload studies that established what "normal" web caching looks like. The GDSF-dominates-LRU finding (Table 5) is only meaningful in contrast to production CDN traces where LRU-family policies typically dominate. Without that comparison point, a reviewer can't assess whether the finding is novel.

**Minor:** Only one industry bot report (Cloudflare). Adding Imperva/Thales "Bad Bot Report" or Akamai "State of the Internet" would strengthen the "bots are growing" framing with triangulated sources.

---

## 2. Positioning Table Accuracy

The table is mostly accurate but has two issues:

- **"Cache policy work" gets ○ for HTTP traces.** This is generous. Most cache policy papers evaluate on block I/O traces (YCSB, MSR Cambridge) or synthetic Zipf workloads, not HTTP traces. A more honest encoding would be `--`, which would actually *strengthen* the gap argument — it widens the hole AgentWebBench fills.

- **The table is too coarse.** Three columns don't capture the key differentiators. Consider adding columns for **"Public dataset"**, **"Browser-mediated"**, or **"Multi-page sessions"**. HTTP Archive has public HTTP traces but they're single-page synthetic loads, not multi-page agent sessions. A richer table makes the distinction crisper. Right now, a reviewer can glance at "Web measurement: ✓ HTTP traces" and think "so HTTP Archive already does this."

---

## 3. Distinction from HTTP Archive

**Insufficient.** The paper says HTTP Archive "provides longitudinal data on web page size and composition" — one clause in a list of six web measurement citations. This is the weakest point in the related work. An IMC reviewer *will* ask: "How is this different from downloading HTTP Archive HAR files and replaying them?"

The answer is strong but unstated:
- HTTP Archive captures **single isolated page loads** from a synthetic crawler (WebPageTest/Lighthouse). No navigation, no multi-page sessions, no task-driven behavior.
- AgentWebBench captures **multi-page, task-driven sessions** where an LLM makes navigation decisions, producing temporal reuse patterns that single-page loads cannot exhibit.
- The reuse structure (unique-URL ratios from 0.875 to 1.000) is a *session-level* property that HTTP Archive fundamentally cannot capture.

This needs to be an explicit 2-3 sentence callout, not a passing mention.

---

## 4. Is the Gap Argument Convincing?

**Mostly yes, with one vulnerability.** The three-way gap (benchmarks measure tasks not traffic; measurement covers humans not agents; cache work uses legacy traces) is logically sound. The positioning paragraph and table make it clear.

The vulnerability: **scale.** 400 sessions / 168K requests is small by IMC standards. Papers like Gill et al. (YouTube) and Ihm & Pai analyzed millions to billions of requests. A reviewer will ask whether findings from 168K requests generalize. The paper should preempt this by arguing that the contribution is the *methodology and trace format* (designed for repeated releases), not a claim of production-scale representativeness. The "longitudinal extensibility" line in the methodology paragraph is a start but needs to be more prominent.

A secondary weakness: the gap is narrow. "We ran agents and recorded HTTP traffic" is straightforward. The paper needs to emphasize the non-obvious engineering (CDP instrumentation, trace schema design, cache-replay export pipeline) and the surprising findings (GDSF dominance, 1.8x LLM amplification, 66.5% rendering overhead) to justify a full paper rather than a dataset workshop paper.

---

## 5. Suggested Additional Citations (3-5)

1. **Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (ICLR 2023)** — The agent architecture that explains *why* LLM-driven traffic is 1.8x heavier (exploratory reasoning loops). Essential for mechanistic grounding of the scripted-vs-LLM comparison.

2. **Berger et al., "Practical Bounds on Optimal Caching with Variable Object Sizes" (SIGMETRICS 2018)** — Directly relevant to your finding that size-aware policies (GDSF) dominate. This paper establishes that object size distribution is the key variable determining optimal caching, which is exactly what your heavy-tailed size distribution (50% under 1 KB) and GDSF results demonstrate.

3. **Imperva/Thales "Bad Bot Report 2024"** — Triangulates the Cloudflare bot traffic claim. IMC reviewers expect multiple sources for industry-scale assertions. Also provides the human/good-bot/bad-bot breakdown that contextualizes where agents fit.

4. **Sun et al., "A Large-Scale Study of Robots.txt" (WWW 2007)** or **Arlitt & Jin, "Workload Characterization of the 1998 World Cup Web Site" (IEEE Network 2000)** — Canonical crawler/web workload characterization. Citing one gives you a baseline to contrast against. The point: traditional crawler traffic has very different temporal locality (breadth-first URL frontier) vs. agent traffic (depth-first task-driven navigation).

5. **Yang et al., "A Large Scale Analysis of Hundreds of In-Memory Cache Clusters at Twitter" (OSDI 2020)** — The canonical production cache trace study. Citing it lets you say: "Production CDN traces from [Twitter OSDI '20] show LRU-family dominance; our agentic traces show the opposite (GDSF dominance), confirming that this workload class is structurally different."

---

### Summary Assessment

The related work is well-organized with good paragraph-level structure. The main risks for review are: (a) the HTTP Archive distinction is too weak, (b) no agent architecture citations to explain the LLM amplification finding, and (c) no production CDN trace baseline to contextualize the cache results. Fixing these three plus adding 3-4 citations would significantly strengthen Section 2.

---

## meta-reviewer

---

## IMC 2026 Area Chair Meta-Review

**Paper:** AgentWebBench: A Reproducible Benchmark for Browser-Mediated Web Workloads
**Reviewers:** 4 expert reviews + area chair assessment
**Post-revision status:** Authors addressed several R1 concerns (LLM traces scaled to all 10 tasks, cache study 5.5x larger, HTTP Archive comparison added, stale claims fixed)

---

### 1. CONSENSUS SCORE: 3.0 / 5 (Borderline)

The PC is split. The workload characterization is the clear strength — all four reviewers agree on this. The cache study improved substantially but remains a demonstration, not a contribution. The naming and framing issues persist.

**Score breakdown by contribution:**

| Contribution | Score | Consensus |
|---|---|---|
| Artifact + trace schema | 3.5 | Genuine first; useful for community |
| Workload characterization (Sec 5) | 3.5 | Rich, well-structured, 7 observation subsections |
| LLM vs scripted comparison | 3.5 | All 10 tasks now; 1.8x with 8x task variation is interesting |
| Cache replay study (Sec 6) | 2.5 | Improved but still thin for policy conclusions |
| Related work + positioning | 2.5 | Key citations missing; HTTP Archive distinction still weak |
| Scale + generalizability | 2.0 | 168K requests / 400 sessions is small for IMC |

**What improved since R1 (credit where due):**
- LLM traces for all 10 tasks (was 2) — this is significant. The 1.8x aggregate with 8.6x on literature review vs 1.1x on API comparison is a genuinely interesting finding that shows task structure drives amplification. This is now one of the paper's strongest results.
- Cache study at 82K requests with 17K unique URLs across 4 regions is much more convincing than the 14K Zurich-only trace. GDSF dominating at ALL sizes is a cleaner, stronger claim than the previous crossover narrative.
- HTTP Archive comparison in Discussion (Section 7) — 2x requests, JS 1.8x human, images 0.3x human. This is exactly what was needed. Useful quantitative contrast.
- Numbers verified against artifact — eliminates the R1 concern about stale data.

---

### 2. MANDATORY CHANGES FOR ACCEPTANCE

These are not suggestions. A revision without all five will not change my recommendation.

**M1. Fix the name or fix the data.** (Agent Expert, Area Chair)

"AgentWebBench" implies an agent benchmark. The primary dataset (400 sessions, 168K requests) is scripted-random — deterministic link-selection with no reasoning. The LLM traces (50 sessions, 26K requests) are secondary. Two options:

- **(a) Rename** to something like "WebTrafficBench" or "BrowserWorkloadBench" and position scripted-random as the primary contribution with LLM comparison as a validation. This is honest.
- **(b) Make LLM traces primary.** Run 100+ LLM sessions (not 50) across all 10 tasks, make them the main release, and demote scripted-random to "baseline." This is stronger but costs ~$200-400 in API calls and ~1 week of collection time.

Option (b) is strictly better for the paper. 50 LLM sessions is a comparison; 200 LLM sessions is a dataset. If you want to keep the name, earn it.

**M2. Add 3-4 critical citations and strengthen the Related Work distinction from HTTP Archive.** (Area Chair review)

Specifically:
- **ReAct (Yao et al., ICLR 2023):** The 1.8x amplification finding demands a mechanistic explanation. ReAct's reasoning loops are why LLM agents generate more traffic. Without this citation, the finding is descriptive but ungrounded. One sentence in Section 5.8 connecting the amplification to exploratory reasoning loops.
- **A production CDN trace study** (Yang et al. OSDI 2020 or Berger et al. SIGMETRICS 2018): The GDSF-dominates finding is only meaningful relative to the known result that LRU-family policies dominate on production CDN traces. Without this contrast, a reviewer cannot assess novelty.
- **HTTP Archive distinction in Section 2**, not just Section 7. Add 2-3 sentences explicitly stating: HTTP Archive captures single isolated page loads from synthetic crawlers; AgentWebBench captures multi-page task-driven sessions with temporal reuse patterns that single-page loads cannot exhibit. The current one-clause mention in the Related Work is the paper's weakest positioning point.

**M3. Address the geographic confound honestly.** (Methodology Expert)

The 19x geographic variation is the paper's most striking claim, but the paper itself admits (Section 8) that Zurich uses BrowserUse/macOS while cloud VMs use Playwright/Linux. This is a substrate confound, not a geographic effect. The paper currently buries this in Limitations.

Fix: Add a paragraph in Section 5.7 (Geographic Variation) that explicitly decomposes the variation into (a) CDN/content differences and (b) substrate differences, and quantify which dominates. If you can't decompose them, downgrade the claim: "up to 19x variation, of which an unknown fraction reflects collection substrate differences rather than geographic effects." Do not lead with a 19x number in the abstract and conclusion if you can't defend it.

**M4. Strengthen the cache study or downscope its claims.** (CDN Expert, Area Chair)

82K requests is better than 14K, but the paper still claims "agentic workloads require fundamentally different caching strategies than human web traffic." This is a strong causal claim from a single 82K-request trace with no human comparison trace. Two options:

- **(a) Downscope:** Change "fundamentally different caching strategies" to "substantially different cache policy rankings" and add a caveat that the finding is from a single benchmark trace, not production traffic. Remove it from the abstract's final sentence.
- **(b) Strengthen:** Replay an HTTP Archive trace (or a publicly available CDN trace like the Twitter OSDI '20 trace) through the same 6 policies and show that LRU dominates there while GDSF dominates on AgentWebBench. This would be a 1-day effort and would make the claim airtight.

Option (b) converts the cache section from a demonstration to a finding. I strongly recommend it.

**M5. Add a per-task cache breakdown.** (CDN Expert)

Table 5 shows aggregate hit rates only. The paper claims (Section 6.3, last sentence) that "different task families produce different optimal policies" but provides no evidence. Add a small table or figure showing hit rates for the top-3 and bottom-3 tasks individually. This is a 2-hour analysis task and would add genuine depth.

---

### 3. PREDICTION: REJECTED (55-60% likely), unless M1-M5 are addressed

**The case for acceptance:**
- Novel, useful artifact — genuinely the first public browser-mediated agent HTTP traces
- Rich workload characterization with 7 well-structured observation subsections
- LLM comparison across all 10 tasks is now convincing (post-revision strength)
- Reproducibility story is above-average (synchronized artifacts, deterministic pipeline)
- The 66.5% rendering overhead + HTTP Archive comparison is a clean, quotable finding
- Timely topic — CDN operators and the agent community need this data

**The case for rejection:**
- **Scale.** 168K requests / 400 sessions is 2-3 orders of magnitude below IMC's typical trace sizes. Gill et al. analyzed YouTube at millions of requests. Ihm & Pai characterized web traffic over billions. The paper needs to explicitly argue it's a methodology + first-release contribution, not a production-scale characterization — and even then, reviewers may find it insufficient.
- **Naming oversell.** The primary data is scripted-random, not agent. This will irritate at least one reviewer enough to argue for rejection on intellectual honesty grounds.
- **Cache study depth.** Six policies, five sizes, one trace, no baseline comparison — this is a demonstration, not a cache research contribution. IMC has published deep cache papers (e.g., the S3-FIFO paper at SOSP, GL-Cache at OSDI). This section invites comparison to work it cannot match.
- **Missing baselines.** No human trace, no production CDN trace, no crawler trace. Every claim of "different from X" lacks the X.

**My honest assessment:** The paper is a solid workshop paper (HotNets, IMC workshop track) that is stretching to be a full IMC paper. The gap is not quality — the writing is good, the methodology is sound, the observations are interesting. The gap is *depth and scale*. IMC full papers typically go deep on one dimension; this paper goes moderate on several.

With M1(b) + M4(b) addressed — LLM traces as primary data + CDN trace comparison — the acceptance probability jumps to ~50-55%. That's the highest-leverage 2-week investment.

---

### 4. ACTION PLAN: NEXT 10 DAYS

Assuming IMC abstract deadline ~late April, full paper ~early June.

| Day | Task | Impact |
|---|---|---|
| **1-2** | **M1(b): Collect 150+ LLM sessions** across all 10 tasks (15/task). Use Gemini 2.5 Flash. Budget: ~$150-300. Run overnight on GCP VMs. | Fixes naming issue; makes LLM traces the primary dataset alongside scripted baseline |
| **3** | **M4(b): Download a public CDN/web trace** (Twitter OSDI '20, or use HTTP Archive HAR files). Replay through same 6 policies. Produce comparison table showing LRU dominance on human/production traces vs GDSF dominance on AgentWebBench. | Converts cache section from demonstration to finding |
| **4** | **M5: Per-task cache breakdown.** Run cache replay per-task, produce heatmap or small table. Identify which tasks drive GDSF advantage. | Adds depth to cache section |
| **5** | **M2: Citation surgery.** Add ReAct, Berger SIGMETRICS '18, one production CDN study, Imperva bot report. Rewrite HTTP Archive paragraph in Section 2 with explicit 3-sentence distinction. | Closes related work gaps |
| **6** | **M3: Geographic confound.** Either (a) re-run one task from Zurich using the same containerized substrate as GCP VMs (isolates substrate vs geography) or (b) add honest caveat paragraph in Section 5.7 and tone down 19x claims in abstract/conclusion. | Preempts methodology reviewer |
| **7-8** | **Integrate new LLM data.** Update Tables 2, 4, all aggregate numbers. Restructure paper: LLM traces as primary release, scripted-random as reproducible baseline. Update abstract, intro, conclusion. | Structural revision |
| **9** | **Full paper recompile + internal read.** Verify all numbers against updated artifact. Check that every claim in abstract appears with evidence in body. | Consistency pass |
| **10** | **Self-review against this meta-review.** Check each M1-M5 is addressed. Read the paper as a hostile reviewer one more time. | Final quality gate |

**Bottom line:** The paper has a real contribution buried under framing, scale, and positioning problems. The workload characterization and LLM comparison are genuinely interesting — the 1.8x amplification with 8x task variation, the 66.5% rendering overhead, the GDSF dominance — these are findings the community needs. The 10-day plan above is designed to convert a borderline-reject into a borderline-accept. The two highest-ROI items are M1(b) (make LLM traces primary) and M4(b) (CDN trace comparison). If you can only do two things, do those.

---
