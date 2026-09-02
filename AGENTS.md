# Pixel Cosmos agent rules

Read [documentation/README.md](documentation/README.md) first. Source
documentation lives in `documentation/`; `docs/` is generated deploy output
and must not be edited as a source of truth.

Before changing gameplay, read the relevant source document:

- [scanner and economy](documentation/gameplay/SCANNER_AND_ECONOMY.md)
- [core mechanics](documentation/gameplay/GAME_MECHANICS.md)
- [scanner design](documentation/design/SCAN_DESIGN.md)
- [economy plan](documentation/plans/ECONOMY_ROADMAP.md)
- [shipyard JSON and shared render contract](documentation/design/PIXEL_SHIPYARD_JSON_SPEC.md)
- [build/program rules](documentation/BUILD_AND_PROGRAMS.md)

## Mandatory engineering rules

1. Generated gameplay must be deterministic from explicit seeds. Do not use
   `Math.random()` for world generation, prices, inventories, scans,
   contracts or simulation outcomes. Persist only mutable deltas and stable
   identifiers; add a same-seed regression test for new generation logic.
2. Every in-game item is an independent instance. Catalogue data is immutable;
   use `makeItem()` when an item enters inventory, cargo or a fitted slot.
3. Reuse the shared ship renderer and keep render settings on the hull/item
   instance, not in global scene state.
4. Keep player-facing text in both `src/i18n/ru.json` and
   `src/i18n/en.json`. Explain disabled actions with a concrete reason.
5. Keep business rules in `src/game/`; scenes render state and call those
   APIs. Do not mutate market, scanner or save state from a render loop.
6. Use `apply_patch` for source edits. Preserve unrelated dirty-worktree
   changes. Do not edit generated `docs/` output manually.
7. Run focused `npm.cmd test -- ...` tests and `npx.cmd vite build` after a
   relevant change. Update the documents above when a player-visible rule or
   persistence contract changes.
