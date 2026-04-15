# ClaudeFlow on a MacBook Pro M3 Pro

This guide is for running ClaudeFlow well on Apple Silicon without turning the laptop into a science project.

## The practical recommendation
- Use Claude Max or Claude Code for the real coding loop when you want hands-on implementation help.
- Use `local` (`auto`) aggressively for drafts, reviews, summarization, rewrites, task splitting, and intermediate code passes.
- Use Gemini as the main hosted path for most structured requests and teammate workflows.
- Use OpenAI only for important research or a serious second opinion.
- Keep Claude-backed ClaudeFlow runs for final review, final judgment, and final verification.

## Why your M3 Pro is good enough
- Apple Silicon is a strong local-model machine because of unified memory and GPU acceleration.
- Ollama supports macOS on Apple M-series hardware and is improving Apple Silicon performance with MLX.
- That makes laptop-first local runs realistic for helper tasks during a hackathon or for startup sidecar automation.

## Best local model choices
- Automatic default: `auto`
  It picks `qwen2.5-coder:3b` for lightweight text work, `qwen2.5-coder:7b` for coding/review work, and `gemma3:4b` for vision-like prompts.
- Faster and lighter fallback: `qwen2.5-coder:3b`
- Stronger local coding pass when you have enough memory and patience: `qwen2.5-coder:14b`
- Local multimodal option for screenshots, mockups, or diagrams: `gemma3:4b`
- Stronger multimodal pass if your machine has more headroom: `gemma3:12b`

## Which one to use
- If you have 18 GB unified memory, start with 3B to 8B class models and keep other heavy apps closed.
- If you have 36 GB or more, 12B to 14B models become much more realistic for serious local work.
- Use local models for reviewer crews, categorization, summarization, test suggestions, rough rewrites, and intermediate code passes.
- Do not rely on a local model alone for the final architectural or product decision if a stronger hosted model is available.

## The best hackathon setup on this laptop
1. Code with Claude Max or Claude Code when you need real implementation help.
2. Let local Ollama do as much bulk helper work as possible.
3. Use Gemini as the main hosted path for structured requests and teammate docs.
4. Use OpenAI only for important research or a strong second opinion.
5. Use Claude-backed ClaudeFlow runs for final review and final test passes.
6. Only touch cloud GPU deployment if the final demo itself needs hosted inference.

## Commands to start with
```bash
ollama pull qwen2.5-coder:3b
ollama pull qwen2.5-coder:7b
ollama pull gemma3:4b
npx claudeflow doctor
npx claudeflow run pipelines/hackathon/crew-review.yaml --runtime ollama
```
- `claudeflow doctor` warns if the auto-router models are missing.

## When not to overcomplicate it
- If the team needs results fast, keep the split simple: local for bulk work, Gemini for default hosted work, Claude for the final gate.
- If the laptop starts swapping memory or slowing the rest of your work, step back to a smaller model or go back to `cheap`.
- Local is there to save cost and add resilience, not to become the whole product strategy.
