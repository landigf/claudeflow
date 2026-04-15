# ClaudeFlow Team Kit

This repo is initialized with default preset `startup`.
Enabled presets: `hackathon, startup`.

Available assistant-native commands live under `.claude/commands/`.
These commands are wrappers around the shared Team Kit lifecycle:
- brainstorm
- specification drafting
- critique
- handoff

Shared rules:
- read prior lifecycle docs before generating later ones
- keep `03-tasks.md` as the source of truth
- start with the `cheap` runtime profile unless stronger reasoning is required
- if Ollama is available, use the `local` profile aggressively for bulk drafting, review loops, summaries, rewrites, and intermediate code passes
- in hackathon mode, use Gemini as the main hosted path, reserve OpenAI for important research or serious second opinions, and reserve Claude for interactive coding plus final verification
