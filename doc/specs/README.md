# ClaudeFlow Feature Lifecycle

Each feature lives under `doc/specs/<slug>/` with this sequence:

1. `01-brainstorm.md`
2. `02-specification.md`
3. `03-tasks.md`
4. `04-implementation.md`
5. `05-feedback.md`

Rules:
- read earlier docs before writing later ones
- use `03-tasks.md` as the progress tracker
- append to `05-feedback.md` instead of rewriting history
- default to the `cheap` runtime profile (gpt-5-mini) for teammate-facing drafting

Create a new feature folder by copying the templates in `_templates/`.
