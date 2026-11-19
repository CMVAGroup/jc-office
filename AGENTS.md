# AGENTS.md — instructies voor coding agents (Codex e.a.)

Dit project wordt door meerdere coding agents bewerkt (Claude Code en Codex). **Alle werkafspraken staan in [CLAUDE.md](CLAUDE.md) en gelden onverkort voor jou.** Lees dat bestand eerst, en daarna `docs/progress.md` en `docs/backlog.md`.

Kort de belangrijkste regels:

- Productspecificatie: `docs/julie-claire-ai-kantoor-bouwplan.md`. Bedrijf: CMVA Commerce, merk: Julie & Claire.
- Geen fictieve merkclaims; onbekend blijft `onbekend`. Geld in gehele minor units. Alles gescoped op `workspace_id`.
- Agents in de app krijgen alleen tools uit `packages/agents/src/tools.ts`. Externe writes alleen via `executeApprovedAction` (fase 1: altijd uit). Niet omzeilen.
- Geen secrets in code, prompts, logs of Git. `.env` nooit committen.
- Draai na wijzigingen de typecheck en tests (commando’s in `CLAUDE.md`).

## Samenwerken met andere agents

- Werk niet tegelijk met een andere agent aan dezelfde bestanden.
- Werk op een eigen git-branch en commit kleine, beschreven stappen.
- Werk `docs/progress.md` bij als je iets afrondt, zodat de volgende agent weet waar het project staat.
- Start de demo niet als die al draait (poorten 3210 en 54329), en draai nooit als Administrator (PostgreSQL weigert dat).
