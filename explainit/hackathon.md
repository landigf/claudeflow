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

## What to ask your assistant
- "Read `explainit/hackathon.md`, `AGENTS.md`, and the repo README, then propose 3 grounded hackathon ideas."
- "Read the GDG AI HACK challenge pack and tell me which of the three main tracks this repo fits best."
- "Use the ClaudeFlow hackathon workflow and write `doc/specs/<slug>/01-brainstorm.md`."
- "Turn this brainstorm into `02-specification.md` and `03-tasks.md` in a way a teammate can follow."

## Which runtime to use
- Start with `cheap`: openai / gpt-5-mini. This is the default for ideation, drafting, and structured requests.
- Use `deep`: claude-cli / claude-sonnet-4-20250514 only for harder synthesis, final critiques, or code-heavy reasoning.
- Use `local`: ollama / auto only if someone already has Ollama set up or if privacy matters.

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
- GDG AI HACK gives useful sponsor resources including Google Cloud credits and Gemini API access. If you already have Gemini billing or sponsor credits, use Gemini first for the `cheap` path.
- Keep Claude for the hard high-leverage steps. Use Gemini, other cheap APIs, or Ollama for reviewer crews, summaries, and drafting.
- The safest overall plan is still laptop-first with hosted APIs as backup capacity.

## Recommended architecture
- Use raw Claude or Claude Code for quick one-off thinking and last-mile debugging.
- Use ClaudeFlow for repeatable work: review, critique, fix-and-verify, handoff, and pitch polish.
- Let `cheap` do most of the volume.
- Let `deep` be the final judge.
- Let `local` help only if someone has already prepared it.

## What API key to buy first
- If you already have `GEMINI_API_KEY` funding or sponsor credits, use Gemini first for the `cheap` profile.
- If you do not have Gemini funding, buy an OpenAI API key next and use `gpt-5-mini` as the simple second path.
- If you already pay for Claude and want stronger reviews or coding help, keep Claude as the `deep` option instead of forcing everyone onto it.
- Do not block the team on a local model. Local is optional, not the default path.
- The right order for this hackathon is usually: Gemini credits first, Claude for deep work, OpenAI as a backup if needed, local only after that.

## Repo organization rules
- Keep feature thinking in `doc/specs/<slug>/`, not scattered across chats.
- Keep `03-tasks.md` as the source of truth for who is doing what.
- Ask assistants to stay grounded in the current repo instead of generic hackathon ideas.
- Prefer one clear, demoable feature over five vague ones.

## When a local model makes sense
- You already have Ollama installed and someone knows how to maintain it.
- You want cheap private drafts or quick rewrites.
- You are okay with weaker quality than the paid `cheap` or `deep` options.

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
