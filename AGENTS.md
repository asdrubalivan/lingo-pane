# AGENTS.md

## Language

- GitHub issues and issue comments: English, title and body, even when the conversation that led to them is in Spanish.
- Commit messages: English (since 2026-10-02; older ones are in Spanish), after a short lowercase area prefix (`pane:`, `setup:`, `lesson:`, `docs:`, `tests:`).
- READMEs: `README.md` (English) is the source; `README.es.md` and `README.fr.md` change in the same commit.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (asdrubalivan/lingo-pane), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
