# ClaudeFlow for a Hackathon

This file is for teammates who are joining a hackathon repo and want clear structure without needing to understand the whole ClaudeFlow engine.

## What to do first
1. Read `README.md`, `AGENTS.md`, and `doc/specs/README.md`.
2. If you use Copilot, also read `.github/copilot-instructions.md`.
3. If you use Claude Code, check `.claude/commands/` for the ready-made workflows.
4. Start with one feature folder under `doc/specs/<slug>/`.
5. If you are doing GDG AI HACK 2026 specifically, read `explainit/gdg-ai-hack-2026/README.md` and the relevant track guide before ideating.
6. Copy `.env.example` to `.env.local` and fill only the keys you actually have access to.

## The simple workflow
1. Brainstorm the idea in `01-brainstorm.md`.
2. Turn the chosen idea into `02-specification.md`.
3. Break it into `03-tasks.md`.
4. Write `04-implementation.md` as the handoff for the person doing the coding.
5. Append lessons and critiques to `05-feedback.md`.
6. For investigations or market/product research, use `pipelines/research-topic.yaml` or a `tool: web` step so the output keeps real source links.

## What to ask your assistant
- "Read `explainit/hackathon.md`, `AGENTS.md`, and the repo README, then propose 3 grounded hackathon ideas."
- "Read the GDG AI HACK challenge pack and tell me which of the three main tracks this repo fits best."
- "Use the ClaudeFlow hackathon workflow and write `doc/specs/<slug>/01-brainstorm.md`."
- "Turn this brainstorm into `02-specification.md` and `03-tasks.md` in a way a teammate can follow."

## The intended operating mode
- Write real code with Claude Max or Claude Code when you need hands-on implementation help.
- Let local Ollama run as much bulk work as possible: brainstorming, rewrites, summaries, review crews, task splitting, and intermediate code passes.
- Use Gemini as the main hosted API for most structured requests and teammate-facing drafting.
- Use OpenAI only for important research, stronger external perspective, or a serious second opinion.
- Use Claude-backed ClaudeFlow runs mainly for final review, final test/verify passes, and true last-mile debugging.

## Which runtime to use
- Start with `local`: ollama / auto whenever Ollama is available. It is the preferred bulk worker for drafting, reviews, summaries, and low-cost helper tasks.
- Use `cheap`: gemini / gemini-2.5-flash-lite as the main hosted path for structured requests, ideation, drafting, and teammate workflows.
- Use OpenAI as a manual override with `--runtime openai` only when you want important research or a serious second opinion.
- Use `deep`: claude-cli / claude-sonnet-4-20250514 for interactive coding support, final critiques, final verification, and real last-mile debugging.

## How to handle API keys with teammates
- Do not commit real keys to the repo.
- Do not paste real keys into shared docs, PRs, or issue threads.
- Give teammates `.env.example` and have each person create their own `.env.local`.
- Share actual secrets privately with a password manager or direct private message, not through Git.
- If someone only has Gemini access, they can still use the hackathon setup because `cheap` defaults to Gemini here.

## If you have a MacBook Pro M3 Pro
- Your best local default is the `auto` local router, which picks between `qwen2.5-coder:3b`, `qwen2.5-coder:7b`, and `gemma3:4b` based on the task.
- If you need a multimodal local option for screenshots or diagrams, add `gemma3:4b`.
- If your machine has higher unified memory and you can tolerate slower responses, test `qwen2.5-coder:14b` or `gemma3:12b` for stronger local passes.
- Read `explainit/macbook-m3-pro.md` before spending time on a VM setup.

## Best setup for GDG AI HACK 2026
- The event is short and build-first. Optimize for speed and reliability, not for fancy infrastructure.
- GDG AI HACK gives useful sponsor resources including Google Cloud credits and Gemini API access. Use Gemini as the main hosted path first.
- If Ollama is already working on your MacBook, lean on it heavily instead of paying for bulk helper calls.
- Keep Claude for real coding help, final reviews, and final verification instead of burning it on bulk drafting.
- The safest overall plan is still laptop-first with hosted APIs as backup capacity.

## Recommended architecture
- Use raw Claude or Claude Code for actual coding sessions and the hardest last-mile debugging.
- Use ClaudeFlow for repeatable work: review, critique, fix-and-verify, handoff, and pitch polish.
- Let `local` do as much grunt work as possible when it is available.
- Let Gemini be the default hosted path.
- Let OpenAI act as the deliberate research or second-opinion path.
- Let Claude be the final judge and final verifier.

## What API key to buy first
- If local Ollama is already installed, use it first for volume work because it is effectively free once set up.
- Use `GEMINI_API_KEY` as the main hosted API spend for hackathon work.
- Add `OPENAI_API_KEY` only for important research or a serious second opinion when Gemini is not enough.
- Keep Claude Max or Claude API for interactive coding help, final reviews, and final test passes instead of using it as the bulk worker.
- The right order for this hackathon is usually: local first for volume, Gemini for main hosted work, OpenAI for selected research, Claude for final coding and verification.

## Repo organization rules
- Keep feature thinking in `doc/specs/<slug>/`, not scattered across chats.
- Keep `03-tasks.md` as the source of truth for who is doing what.
- Ask assistants to stay grounded in the current repo instead of generic hackathon ideas.
- Prefer one clear, demoable feature over five vague ones.

## When a local model makes sense
- You already have Ollama installed and someone knows how to maintain it.
- You want to offload bulk drafts, rewrites, summaries, review loops, or intermediate code passes without paying per call.
- You are okay with using hosted models only for the truly important moments.

## Best local model picks
- Automatic default: `auto`
  It routes simple text tasks to `qwen2.5-coder:3b`, coding/review tasks to `qwen2.5-coder:7b`, and vision-like prompts to `gemma3:4b`.
- Vision/local multimodal: `gemma3:4b`
- Bigger local coding pass if your M3 Pro has enough unified memory: `qwen2.5-coder:14b`

## When a VM or hosted inference makes sense
- Only if the final demo itself needs a hosted model service.
- Prefer a simple managed deployment to a custom GPU setup during the hackathon.
- Do not spend the weekend doing infrastructure work unless it is part of the product.

## The main goal
ClaudeFlow is here to make teamwork structured. It is not here to make teammates learn YAML or become prompt engineers.
