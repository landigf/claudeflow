## read-paper

I've now read all files in the paper directory and supporting context. Here's a status summary:

**AgentWebBench IMC 2026 paper** — 12-page LaTeX draft (`benchmark-paper.tex`, 1250 lines), targeting ACM IMC abstract deadline Apr 22 and paper deadline Apr 29.

The paper is built on **browseruse-live-v3** (per `artifact_snapshot.json`): 400 sessions, 10 task families, 4 geo regions, 168K requests, ~2.1 GiB. The current release upgraded from v2 (100 sessions, single region) to v3 with geodistributed data from GCP VMs.

**Paper structure:**
1. Introduction — 4 contributions (design, release, observations, cache replay)
2. Background & Related Work — 35 refs, positioning table
3. Benchmark Design — real execution, schema, surfaces, dimensions, artifacts
4. Methodology & Release — 10 tasks, scripted-random driver, 4 regions, ethics
5. Observations — 8 subsections: heterogeneity, URL reuse, payload composition, object sizes, per-task content, timing, session duration, preliminary LLM comparison, geo variation
6. Replay Utility — 6 policies × 4 sizes, crossover finding (GDSF→LRU)
7. Artifact Design & Reproducibility
8. Discussion — CDN implications, machine lane case, comparison with prior work
9. Limitations & Next Steps — honest about scripted-random, no human baseline
10. Conclusion + Ethics appendix

**Supporting files read:** `REVIEW-PROMPT.md` (detailed 8-section review guide), `artifact_snapshot.json` (v3 data with per-task stats + content types), `refs.bib` (35 entries), `imc-abstract.txt`, `SUBMISSION-CHECKLIST.md`, `OUTREACH.md`, `build_artifacts.py`, `NEXT-STEPS.md`.

What would you like to focus on?

---

## reviewer-systems



This is a research/review task, not an implementation task — so I'll write the review directly rather than using the plan mode workflow.

---

## IMC 2026 Review: AgentWebBench

### 1. Summary

This paper presents AgentWebBench, the first public request-level trace collection of browser-mediated AI agent web traffic. The dataset comprises 400 sessions across 10 task families from 4 geographic regions (168K requests, 2.1 GiB). The paper reports observations on workload heterogeneity, payload composition, and geographic variation, and demonstrates cache replay utility with a size-dependent policy crossover finding (GDSF dominates at small caches, LRU at larger ones).

### 2. Overall Score and Confidence

**Score: 2 (weak reject)**
**Confidence: High**

### 3. Strengths

- **Novel artifact contribution.** To my knowledge, this is indeed the first public, request-level HTTP trace dataset from browser-mediated agent sessions. The gap is real and well-motivated.
- **Sound benchmark design philosophy.** The four synchronized output artifacts (traces.json, cache_trace.csv, access_log.jsonl, summary.json) per task, with a deterministic build pipeline, is good engineering. The "paper as a function of the release" principle is commendable.
- **Thorough related work.** 35 references spanning agent benchmarks, web measurement, cache policies, and browser automation. The positioning table (Table 1) is effective at communicating the gap.
- **Honest limitations section.** The paper is forthright about the scripted-random limitation, the lack of human baselines, and the substrate heterogeneity confound. This honesty is appreciated.
- **Interesting cache crossover finding.** The GDSF→LRU crossover as cache size grows is a genuine and non-obvious result. The separation of object hit rate vs. byte hit rate is well-presented.
- **Geographic variation analysis.** The 19x request volume difference for the same task across regions is a striking finding with real CDN implications.

### 4. Weaknesses

#### Critical

- **Data integrity: paper numbers do not match checked-in artifacts.** I cross-checked Table 2 (per-task stats) against the release metadata (`artifact_snapshot.json` for browseruse-live-v3) and found systematic mismatches across most rows:
  - News aggregation: paper says 364.5 ± 10.1 req/run; artifact says 366.9 ± 7.28
  - Fact checking: paper says 80.9 ± 0.2 req/run; artifact says 86.8 ± 0.76 (7% gap)
  - Job market: paper says 196.3 ± 27.1; artifact says 206.6 ± 26.4
  - API comparison: paper says 111.6 ± 5.7; artifact says 114.2 ± 5.83

  Similarly, cache replay Table 3 does not match `summary.csv`:
  - ARC@1MiB: paper says HR=0.267; CSV says 0.226 (18% relative error)
  - LFU@1MiB BHR: paper says 0.078; CSV says 0.087 (direction of rounding wrong)
  
  **This undermines the paper's core reproducibility claim.** If the "deterministic build pipeline" does not produce the numbers in the paper, the reproducibility story collapses.

- **CI computation is incorrect.** The paper states confidence intervals are "computed using the t-distribution at the 95% level" (Section 4.2), but `build_artifacts.py` line 135 uses `1.96 * stdev / sqrt(n)` — that is the z-distribution, not the t-distribution. For n=10, the correct t-critical value is ~2.262, meaning all reported CIs are ~15% too narrow. This is a methodological error.

#### Major

- **The workload is not agentic.** The paper repeatedly uses "agentic workloads," "agent traffic," and "AI agent web traffic," but the dataset is generated by a scripted-random link follower — a random crawler, not an agent. The paper acknowledges this in the limitations but not consistently in the observations and discussion. Claims like "CDN operators facing growing agent traffic will need adaptive eviction strategies; AgentWebBench provides the first public traces to develop and evaluate them" (abstract) overstate what the data actually shows. A random crawler exercising the browser stack is useful, but it is not the same as an LLM-driven agent that reasons about which pages to visit. The preliminary LLM comparison (Section 5.8) on only 2 tasks with 5 repeats is too thin to validate this generalization.

- **Scale is insufficient for a benchmark paper at IMC.** 400 sessions, 168K requests, and 10 task families is small. For comparison, Butkiewicz et al. (IMC '11) studied 1,700 websites; HTTP Archive tracks millions. The per-task analysis has n=10 per cell (per region), which limits statistical power to detecting only very large effects. The paper tries to frame this as a "release protocol" paper rather than a dataset paper, but the observations sections (which constitute ~40% of the paper) make claims that the dataset size cannot robustly support.

- **Geographic variation is confounded and the paper admits it.** The 19x request count difference is the paper's most dramatic finding, but Section 7 acknowledges that "the cloud VMs use Playwright's Chromium on Linux, which captures a broader set of sub-resource requests than BrowserUse's macOS Chromium." This means the 19x figure conflates geographic effects with instrumentation substrate effects. The paper should not lead with this number in the abstract until the confound is resolved.

- **Cache replay uses only Zurich sessions (14,833 requests).** This is very small for a cache simulation study. With only 2,522 unique objects and a 41.1 MiB working set, even a 25 MiB cache holds most of the corpus. The crossover finding, while interesting, may not generalize beyond this tiny trace. Production CDN traces used in cache research (e.g., Yang et al. SOSP '23, Berger et al. NSDI '17) contain billions of requests. The paper should be much more explicit about the limited scope of the replay conclusions.

#### Minor

- **"100-session release"** (Section 5.7, around line 808): the text says "the full 100-session release" when the release is 400 sessions. The context suggests Zurich-only, but it reads ambiguously.
- **The "machine lane" discussion** (Section 8) advocates for WAID and x402, which feels like advocacy for the authors' other work rather than a finding supported by the data. It should be shortened or moved to future work.
- **Duplicate BibTeX entries:** `berger2017` and `adaptsize` cite the same paper (AdaptSize, NSDI 2017).
- **The build script uses 1.96 instead of t-critical** but labels it as t-distribution — one of these must change.

### 5. Questions for Authors

1. **Which numbers are correct — the paper or the artifacts?** Can you regenerate the paper from the v3 release and confirm all numbers match? The systematic drift suggests the paper text was written against an earlier release (v2?) and not fully updated.

2. **What fraction of the 19x geographic variation is attributable to the substrate confound (macOS BrowserUse vs. Linux Playwright)?** Could you run one task from a Linux VM using BrowserUse (same as Zurich) to isolate the effect?

3. **For the cache crossover finding:** Have you tested whether it persists when replaying only sessions from a single task family? If the crossover only appears in the concatenated multi-task trace, it may be an artifact of mixing heterogeneous workloads rather than a property of agentic traffic per se.

4. **What is the plan for validating that scripted-random traces are representative of real LLM-driven agent behavior?** The two-task preliminary comparison is insufficient. Is there a timeline for a full LLM-driven release before camera-ready?

5. **Why not use an existing cache simulation framework (e.g., libCacheSim)?** A custom simulator introduces questions about correctness that an established tool would avoid.

### 6. Minor Comments

- Line 567-568: "22.8×" spread is computed from the paper's own Table 2 numbers (364.5/16.0). If the table numbers are wrong (per artifact mismatch), this claim is also wrong.
- Line 807-808: "100-session release" → "400-session release" or clarify "100 Zurich sessions."
- The abstract claims "50% under 1 KB" for object sizes — this is stated as a property of "the dataset" but appears to be computed from Zurich sessions only. Clarify scope.
- Table 2: CI of ± 0.0 for regulatory lookup and real estate should be reported as "< 0.1" or the actual value, not literally zero (which implies no variance at all).
- Section 5.8 (LLM comparison): "5 repeats each" on 2 tasks is too thin even for a "preliminary" result. Consider either expanding this substantially or removing it — as-is, it risks giving reviewers something to attack without adding much value.
- The paper is 13 pages body (per the author line), which is at the IMC limit. Some sections could be tightened — the benchmark design section (Section 3) is verbose for what it communicates.

### 7. Recommendation: **Weak Reject**

The paper addresses a genuine gap — there is no public request-level trace dataset for browser-mediated agent sessions — and the benchmark design is thoughtful. However, three issues prevent acceptance:

1. **The numbers in the paper do not match the artifacts**, which fatally undermines the reproducibility contribution that the paper claims as a key selling point.
2. **The workload is not truly agentic** — it is a random crawler exercising the browser stack. The framing consistently overpromises relative to what the data delivers.
3. **The scale is too small** for the breadth of conclusions drawn, particularly in the cache replay and geographic variation analyses.

**What would change my score:**
- Fix all number mismatches and demonstrate end-to-end reproducibility from artifacts to paper.
- Add LLM-driven traces for at least 5 task families (not just 2), enabling a real scripted-vs-agent comparison.
- Resolve the geographic substrate confound or remove the 19x claim from the abstract.
- Either expand the cache replay to the full 400-session trace or substantially scope down the cache-related claims.

With these changes, the paper could be a solid **3 (weak accept)** — the artifact contribution is genuinely useful, but the current version oversells what the data shows.

---

## reviewer-measurement



The full review is written to the plan file. Here's the summary:

---

## IMC 2026 Review: AgentWebBench

### Score: 3 (Weak Accept) | Confidence: High

### Strengths
- Genuine gap — no public replay-ready HTTP traces of browser-mediated agent sessions exist
- Thoughtful artifact design (4 synchronized outputs, deterministic build pipeline, versioned releases)
- Refreshingly honest limitations section
- Interesting cache crossover finding (GDSF→LRU as cache grows)
- Striking 19x geographic variation finding
- Comprehensive related work (35 refs)

### Critical Weaknesses
- **Factual inconsistency: 2.1 GiB claim vs 348 MiB in artifact_snapshot.json** — ~6x discrepancy in the flagship dataset size number
- **Table 2 doesn't match artifact** — systematic mismatches across all 10 tasks (e.g., news: 364.5 vs 366.9 req/run), undermining the reproducibility claim
- **Scripted-random ≠ agent** — the driver has no AI component; title "AgentWebBench" overpromises

### Major Weaknesses
- Geographic confound: macOS BrowserUse vs Linux Playwright not isolated from CDN effects
- Working set (41.1 MiB) is tiny — cache study doesn't generalize to production scales
- Cache replay uses only Zurich (100 sessions), not the full 400
- No comparison to human/existing web traffic baselines

### Questions for Authors
7 questions covering bytes discrepancy, table mismatches, substrate confound, scripted-random validity, HTTP Archive comparison, bot detection rates, and within-session reuse

### Recommendation
**Weak accept, conditional on:** (1) fix all factual inconsistencies, (2) quantify substrate confound, (3) add HTTP Archive comparison, (4) expand LLM comparison to unconstrained tasks, (5) report per-region CIs, (6) verify all ~10 referenced figures exist. No single issue is fatal — the framework contribution stands regardless.

---

The detailed review with line references and specific fixes is in the plan file. Want me to exit plan mode, or do you want to discuss any findings first?
