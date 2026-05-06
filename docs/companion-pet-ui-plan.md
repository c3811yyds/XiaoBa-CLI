# Companion Pet UI Plan

## Goal

Make the electronic pet a lightweight CatsCo companion layer, not a heavy game system. The pet should make long-running agent work feel visible and a little more rewarding while staying out of the runtime core.

## Product Shape

- CatsCo is the product shell.
- XiaoBa is one possible companion / agent option inside CatsCo.
- Future pets should come from standardized pet packs: animation frames, state names, display metadata, unlock rules.
- The companion UI is allowed to be playful, but it should remain a work tool first.

## Current UI Scope

- Keep the companion work entirely in Dashboard frontend for now.
- Do not change AgentSession, runtime adapters, skill loading, or log schemas.
- Do not implement skill updates, skill review, marketplace, or automatic gamification yet.
- Use localStorage for `PetProfile` until real log-derived stats are available.

## Pet States

Current available animation states:

- `idle`: waiting for work
- `thinking`: planning, reading context, waiting for model/tool results
- `typing`: user typing, response generation, sending or downloading
- `success`: a task or operation completed
- `error`: service/API/tool failure

Future standard pet packs should add:

- `learning`: reviewing logs or learning from a skill update
- `excited`: level up or unlock
- `sleeping`: idle for a long time

## Working Process

Clicking the floating pet should show a compact working-process panel. This is not a full log viewer. It should show short, human-readable process events such as:

- thinking about the next step
- sending a message
- reading logs
- service update completed
- update check failed

The panel should not expose sensitive payloads, API keys, raw prompts, or full logs.

## Experience Model

Keep XP simple:

- Token usage can contribute small XP later.
- Skill invocation can contribute small XP later.
- Leveling unlocks cosmetic or companion options, not core capability.
- Avoid multidimensional stats, leaderboards, grind loops, or complex economy.

Initial unlock examples:

- Lv.2: extra thinking animation / expression
- Lv.4: CatsCo skin
- Lv.7: second companion slot or alternate pet

## Future Integration Points

- Read token and tool usage from session JSONL logs.
- Read skill invocation count from session logs or a dedicated stats API.
- Add a read-only `/api/companion/stats` after the log analysis API settles.
- Keep skill management changes in the runtime productization track; companion should consume stats rather than own skill operations.

## Non-goals

- No automatic skill rewriting.
- No hidden Dashboard-as-config-source behavior.
- No direct `.env` writes from companion UI.
- No sensitive data in pet working-process panels.
- No complex gamification system before the basic UI feels good.
