# Feature List: Recipe UX Follow-up
_Status: Shipped — 2026-07-20_

## Outcome

Make recipe browsing and cooking faster to scan without removing capability: one compact view/language toolbar, bilingual plain-language cooking instructions, serving-aware regeneration, direct editing, editable provenance, and denser recipe list/editor layouts.

## Evidence-backed findings

| # | Priority | Finding and user impact | Evidence | Cite |
|---|---|---|---|---|
| 1 | P1 | The recipe language control occupies its own labelled row and only changes the original recipe. The cooking view remains English, has no serving control, and offers no visible regeneration action. | Browser audit at 375 and 1280 px; `recipes/[slug]/+page.svelte`; `BenchSheet.svelte`. | `[H4] [H6] [H8] [Norman]` |
| 2 | P1 | Generated instructions use restaurant shorthand such as “sofrito” and “aromatics”, raising the knowledge needed for an ordinary home-cooking task. | Current cooking prompt and generated fixture. | `[H2] [Krug]` |
| 3 | P2 | Original recipe content has no local edit action, and the source URL is displayed but absent from the editor and save schema. | Recipe detail and editor browser audit; editor route source. | `[H3] [H7] [Norman]` |
| 4 | P2 | The recipe editor spends multiple rows per ingredient and direction, while the recipe index separates related filters into two rails and uses tall card media. Both require avoidable scrolling. | Browser audit at 375 and 1280 px; editor measured 1,842 px document height at 1280 px. | `[H8] [Gestalt] [Fitts]` |

## Delivery tickets

### RXF-1 — Shared compact recipe toolbar

- Render `Cooking | Original` and the unlabeled `NL | EN` switch in one row.
- Keep recipe language as the page-level state and apply it to both views.
- Preserve accessible group labels without repeating them visually.

### RXF-2 — Bilingual, serving-aware cooking graph

- Store one shared step graph with English and Dutch text leaves so language switches preserve step identity, timer state, and progress.
- Keep legacy v2 English caches renderable; generate v3 only when Dutch or a different serving target is requested.
- Add serving controls and an explicit `Regenerate` / `Update view` action.
- Keep the current cooking sheet live until a replacement succeeds; never destroy progress on a failed refresh.
- Serialize request-aware generation per recipe and reject writes based on stale recipe content.

### RXF-3 — Plain home-cook language

- Rewrite the cooking prompt around concrete household language.
- Name familiar ingredients directly instead of using umbrella restaurant terms.
- Reject known inaccessible shorthand in generated titles, goals, bodies, stream names, and timer labels.

### RXF-4 — Direct edit and editable source

- Add an edit action beside the original recipe controls.
- Add source URL to the editor and server validation.
- Preserve the cooking cache for source-only and notes-only edits; regenerate only when cooking inputs change.

### RXF-5 — Dense editor and recipe index

- Fit ingredient values into one desktop row and a compact, labelled mobile layout.
- Put direction actions beside the step number and reduce textarea height.
- Tighten card/form gaps without reducing touch targets below the existing app comfort size.
- Combine recipe category/status filters into one rail and reduce card media height.

## Risk and verification

Risk lane: R2. The work changes generated-cache compatibility, concurrency, and two high-use responsive surfaces. Verification requires unit coverage for v2/v3 normalization and language availability, repository type/test/build gates, and browser checks at 375, 768, and 1280 px in both languages. AI calls remain mocked or fixture-backed.

## Shipped result

- Recipe view and language now share one compact toolbar; NL/EN projects the same cooking graph without resetting step identity, timers, or progress.
- Cooking view has serving controls plus explicit `Regenerate` and `Update view` actions. Failed refreshes leave the current sheet intact.
- New cooking caches are bilingual v3; valid v2 caches remain available in English until an upgrade is needed.
- The generator is request-aware, serialized per recipe, guards against recipe edits during generation, stamps its own generation ID/serving target, and no longer mutates the recipe's content timestamp for a cache write.
- The prompt is a short home-cook contract, and validation rejects the known restaurant shorthand named in RXF-3.
- Original recipe exposes a local edit action. Source URL is editable, while source-only and notes-only saves preserve cooking work.
- Five ingredient rows now fit within the audited 1280 px editor viewport; mobile ingredients use two compact labelled rows and method actions share their step header.
- The recipe index uses one status-first horizontal filter rail and shorter card media.
- Repository gates pass with 237 unit tests. Responsive browser coverage passed the cooking/detail group; the adversarial editor pass found missing direction textarea names, which were fixed. Two index/editor keyboard and console checks exhausted their bounded agent budgets; the exposed filter DOM-order mismatch was fixed before ship.

## Open questions

None.

## References

- `[H2]` Match between system and the real world.
- `[H3]` User control and freedom.
- `[H4]` Consistency and standards.
- `[H6]` Recognition rather than recall.
- `[H7]` Flexibility and efficiency of use.
- `[H8]` Aesthetic and minimalist design.
- `[Norman]` Don Norman, _The Design of Everyday Things_.
- `[Krug]` Steve Krug, _Don't Make Me Think_.
- `[Gestalt]` Proximity and common-region principles.
- `[Fitts]` Fitts's Law.
