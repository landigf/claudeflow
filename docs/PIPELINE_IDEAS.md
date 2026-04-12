# Pipeline Ideas — Real Use Cases for ClaudeFlow

These are concrete pipelines that teams can build with ClaudeFlow. Each one replaces a manual process with a reusable, traceable, improvable pipeline.

## Code Quality Pipelines

### `code-review-expert.yaml`
Run before every PR. An "expert reviewer" pipeline:
- Step 1: Read the diff (`git diff main...HEAD`)
- Step 2: Check code quality (naming, structure, duplication, SOLID principles)
- Step 3: Check maintainability (complexity, coupling, test coverage)
- Step 4: Check security (SQL injection, XSS, secrets in code, OWASP top 10)
- Step 5: Produce a structured review with severity levels
- Output: `{ issues: [{file, line, severity, message}], score: number, approved: boolean }`

### `performance-audit.yaml`
Analyze codebase for performance problems:
- Step 1: Find hot paths (database queries, API calls, loops)
- Step 2: Check for N+1 queries, missing indexes, unbounded fetches
- Step 3: Check bundle size, unused dependencies, tree-shaking
- Step 4: Estimate memory usage patterns
- Output: `{ issues: [...], estimated_impact: "high/medium/low", recommendations: [...] }`

### `test-suite-generator.yaml`
Generate comprehensive test suites from existing code:
- Step 1: Read module, understand its public API
- Step 2: Identify edge cases, error paths, boundary conditions
- Step 3: Generate test file with unit tests covering all paths
- Step 4: Run tests, fix any failures
- Step 5: Check coverage, add missing tests
- Loop until coverage > 90%
- Output: test files + coverage report

## DevOps Pipelines

### `deployment-readiness.yaml`
Run before deploying to production:
- Step 1: Check all tests pass
- Step 2: Check no TODO/FIXME/HACK in code being deployed
- Step 3: Verify environment variables documented
- Step 4: Check database migrations are reversible
- Step 5: Verify health check endpoints exist
- Step 6: Check monitoring/alerting is configured
- Output: `{ ready: boolean, blockers: [...], warnings: [...] }`

### `cloud-cost-optimizer.yaml`
Review cloud infrastructure for waste:
- Step 1: Read infrastructure config (Terraform, docker-compose, Cloud Run)
- Step 2: Identify over-provisioned resources
- Step 3: Find unused services, orphan disks, idle VMs
- Step 4: Estimate monthly savings
- Output: `{ current_cost: number, optimized_cost: number, changes: [...] }`

### `incident-postmortem.yaml`
After an outage, generate a structured postmortem:
- Step 1: Read error logs from the incident window
- Step 2: Trace the root cause through the codebase
- Step 3: Identify what monitoring should have caught it
- Step 4: Generate timeline, impact assessment, action items
- Output: structured postmortem document

## Daily/Scheduled Pipelines

### `daily-codebase-health.yaml`
Run every morning via cron:
- Step 1: Check for dependency vulnerabilities (`npm audit`)
- Step 2: Check for stale branches (>7 days)
- Step 3: Check for unresolved PR reviews
- Step 4: Scan for TODO items older than 2 weeks
- Step 5: Generate health report
- Output: Telegram/Slack notification with health score

### `nightly-bug-hunter.yaml`
Run overnight — proactively find bugs:
- Step 1: Read recent git commits
- Step 2: For each changed file, analyze for potential bugs
- Step 3: Check if existing tests cover the changes
- Step 4: Generate new tests for uncovered paths
- Step 5: Run full test suite
- Branch: if bugs found → create GitHub issues
- Output: `{ bugs_found: number, issues_created: string[], tests_added: number }`

### `weekly-refactor-suggestions.yaml`
Weekly code improvement proposals:
- Step 1: Identify the most complex files (cyclomatic complexity)
- Step 2: Find duplicated logic across modules
- Step 3: Check for outdated patterns vs current best practices
- Step 4: Propose specific refactoring tasks with effort estimates
- Output: GitHub issues with `refactor` label

## PR Workflow Pipelines

### `pre-merge-gate.yaml`
Automated quality gate before merging:
- Step 1: Verify branch is up to date with main
- Step 2: Run full test suite
- Step 3: Run code review pipeline (see above)
- Step 4: Check commit message format
- Step 5: Verify no secrets in diff
- Branch: all pass → auto-approve / any fail → request changes
- Output: PR review comment with approval/rejection

### `pr-description-generator.yaml`
Auto-generate PR descriptions from the diff:
- Step 1: Read the diff
- Step 2: Summarize changes in plain language
- Step 3: List files changed with purpose of each change
- Step 4: Generate test plan checklist
- Step 5: Detect breaking changes, add warnings
- Output: formatted PR body in markdown

## Research & Documentation Pipelines

### `api-documentation.yaml`
Generate or update API docs from code:
- Step 1: Find all API endpoints (Express/Fastify/FastAPI routes)
- Step 2: Extract request/response types
- Step 3: Generate OpenAPI spec
- Step 4: Validate against existing tests
- Output: updated docs/api.md or openapi.yaml

### `onboarding-guide.yaml`
Generate onboarding documentation for new team members:
- Step 1: Read project structure, README, CONTRIBUTING.md
- Step 2: Identify key modules and their relationships
- Step 3: Find the "getting started" commands
- Step 4: Generate a step-by-step onboarding guide
- Step 5: Validate guide by running the setup commands
- Output: docs/onboarding.md

### `research-survey.yaml`
For academic/research projects:
- Step 1: Search for papers on a given topic
- Step 2: Summarize each paper (title, abstract, key findings)
- Step 3: Compare approaches across papers
- Step 4: Generate comparison table
- Step 5: Identify research gaps
- Output: structured survey document with citations

## Key Insight

Every one of these pipelines:
1. **Exists as a file** in git — reviewable, versionable, shareable
2. **Produces a trace** — you can see exactly what was checked and what was found
3. **Can be improved** — tweak a prompt, add a step, increase retry count
4. **Works with any model** — swap runtime from Claude to GPT to local model
5. **Costs are predictable** — the analyzer tells you tokens/cost before running
6. **Can run on schedule** — nightly, weekly, pre-merge, pre-deploy

The shift: from "I asked Claude to check the code" to "we run the code-review pipeline on every PR and here's the trace."
