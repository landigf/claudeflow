# ClaudeFlow for an AI-Run Startup

This file explains how to use ClaudeFlow when the technical side of the startup is mostly run by AI and you want recurring insight, critique, and improvement loops.

## The recommended setup
- Use `cheap` (openai / gpt-5-mini) for daily and nightly drafting, triage, review summaries, and backlog generation.
- Use `deep` (claude-cli / claude-sonnet-4-20250514) for harder synthesis, final review, architecture critique, and high-stakes decisions.
- Keep `local` (ollama / auto) as an optional privacy/cost tool, not as the main production brain.

## What API key to buy first
- Buy the `cheap` provider first. This is the best first spend because it covers the high-volume recurring work.
- If you already have Gemini billing or want to stay close to the Google stack, `gemini-2.5-flash-lite` is a valid cheap path.
- Add the `deep` provider only after you know which tasks actually need stronger reasoning.
- Use a local model only if privacy or marginal cost matters more than output quality and maintenance simplicity.

## Practical provider strategy
- Use Claude as the high-leverage judge, not as the only worker.
- Use the cheap provider for repetitive nightly or weekly work.
- Use a local model for bulk drafts, categorization, or privacy-sensitive internal loops only when weaker quality is acceptable.
- On a MacBook Pro M3 Pro, treat local as a useful sidecar, not as the single source of truth for product direction or critical refactors.

## What to automate first
1. Nightly code quality review
2. Weekly UX/product critique
3. Security/performance review
4. Improvement backlog generation
5. A cofounder-style summary of risks, opportunities, and next steps

## How to organize the repo
- Put recurring workflows in `pipelines/startup/`.
- Put longer-lived decisions, specs, and follow-up notes in `doc/specs/`.
- Keep traces for real runs so you can compare what changed week to week.
- Separate cheap recurring runs from deeper review runs so cost stays predictable.

## What to ask your assistant
- "Read `explainit/startup.md`, the repo README, and the startup pipelines, then suggest the smallest nightly review loop we should run first."
- "Generate a ranked improvement backlog grounded in the current repo and latest reports."
- "Write a cofounder-style memo: what is fragile, what is working, and what would move the business forward next."

## When a local model makes sense
- Privacy-sensitive drafts
- Bulk rewrites or lightweight categorization
- Cheap experimentation by someone already comfortable running Ollama

## When a local model does not make sense
- You want teammates to get started fast with minimal setup
- You need strong reasoning quality for product or technical decisions
- No one on the team wants to maintain the local model stack

## The main goal
Use ClaudeFlow to make AI work repeatable and reviewable. The value is not just better output; it is having a stable operating system for your startup's recurring thinking work.
