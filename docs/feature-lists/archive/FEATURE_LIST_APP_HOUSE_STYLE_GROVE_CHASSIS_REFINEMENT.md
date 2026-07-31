# App House Style — Grove Chassis Refinement

_Status: Shipped - 2026-07-31 (Deep Grove chassis, connected ledgers, and attached Shopping shelf delivered across stable routes)_

Risk: R2 — shared visual system and responsive layout; no data, auth, schema, provider, or integration behavior
Artifact version: 1.0-green-grove-autopilot
Owner: current `/run`

## Outcome

Refine the approved Soft Utility / Green Ribbon house style into one coherent production system.
Keukenbrein keeps its familiar green page identity, but uses that green more deliberately: a single
Deep Grove chassis joins the route header, utility band, and bottom navigation on phone; the warm
paper work surface sits inside it with soft 14 px corners. On desktop, the paper surface extends to
within 6 px of the viewport edges so the green reads as a quiet perimeter rather than a large field.

The implementation must feel compact, framed, and focused. Shared controls and collections use the
same roles everywhere while each route keeps its own information architecture and purpose-built
interactions.

## Frozen decision set

All remaining design questions are closed. The user explicitly authorized recommended defaults for
every upcoming batch and immediate implementation.

| Role | Production decision |
|---|---|
| Header hierarchy | Balanced Landmark; Recipe First for contextual Recipe headers |
| Header action | Clay Wake: quiet while unchanged, clay commit when dirty |
| Header density | Compact Sweep, preserving 64/72 px normal Green Ribbon geometry and accessible growth |
| Work surface | Framed Boards with Soft Lift separation and a Focused Column inner measure |
| Utility band | Full Green Utility, visually continuous with the header and without a divider |
| Phone chassis | Continuous Grove with soft 14 px paper corners and a Green Anchor bottom navigation |
| Desktop chassis | Warm paper within 6 px of the screen edges; 14 px corners; no corner-hug ornament |
| Green material | One exact solid Deep Grove, `#344f3e`, in light and dark themes and every chassis area |
| Typography | Clean Sans; plain grouping rather than decorative heading markers |
| Actions | Clay Commit primary actions; Quiet Outline secondary actions |
| Navigation | Cream Pill active destination |
| Inputs and filters | Split Utility: cream fields and translucent compact filters; Grove Fill selected state |
| Status | Dot + Text passive status; AH status lives in Shopping's top bar |
| Warnings | Warm Wash tonal feedback |
| Collections | Connected Ledger rhythm for related repeated rows |
| Phone action dock | Paper Shelf attached immediately above the Green Anchor |

User note — reproduced verbatim:

> I still love the green headers and the way that was originally set up that we had though. Lets keep those

## Product constraints

- Preserve production routes, behavior, data, authentication, provider calls, and Albert Heijn
  behavior.
- Preserve Dutch ingredient fields as the sole AH lookup and shopping-list source.
- Preserve the swappable LLM-provider seam and runtime configuration behavior.
- Preserve one semantic H1, native controls, accessible names, passive status semantics, 44 px
  targets, visible keyboard focus, reduced-motion behavior, and long-copy growth.
- Preserve the existing contextual Recipe header contract at 320 px: Back, identity, and the
  accessible action remain on one row where normal copy permits.
- Keep route-specific information architecture. Shared visual roles may converge; business
  workflows may not.
- Do not add dependencies, schema changes, migrations, network calls, credentials, feature flags,
  or new persisted state.
- Do not redesign Assistant, Cook Mode, bottom sheets, segmented tabs, checkboxes, radios,
  quantity steppers, drag/reorder controls, or Shopping completion interactions. Shared shell
  materials may surround them without changing their interaction recipes.
- Do not commit prototype files, authenticated screenshots, household data, browser storage,
  cookies, HAR files, or response bodies.

## Implementation tickets

### GCR-1 — Establish the Grove material and chassis

- Replace route-specific herb/ribbon shades with the single `--kitchen-grove: #344f3e` token.
- Use it for Green Ribbon, full-green utility bands, the authenticated shell reveal, and bottom
  navigation in light and dark themes.
- Add the soft 14 px paper work-surface recipe.
- On phone, retain a visible Grove frame around the work surface; on desktop, constrain that reveal
  to 6 px at the viewport edges.
- Keep existing safe-area and fixed-overlay calculations intact.

Verification: computed colors match exactly across header, utility, shell, and nav in both themes;
320/393/768/1280 px have no horizontal overflow; desktop shows no large green gutters.

Rollback: remove the chassis recipe and restore the prior paper route roots without touching route
markup or behavior.

### GCR-2 — Make Green Ribbon and utility composition coherent

- Keep the current shared Green Ribbon owner and its standard/contextual layout contract.
- Join the utility band to the ribbon with no border or shade seam.
- Keep route title hierarchy compact and sans-serif.
- Move Shopping's passive AH status into the header action group while retaining the existing Add
  item action and status text.
- Preserve long Dutch/English copy and 200%-equivalent text growth.

Verification: standard and contextual headers at all target widths; AH state is passive, readable,
and present in the top bar; no header-to-utility seam; no action overflow.

Rollback: restore the prior neutral utility recipe and return AH status to the utility row.

### GCR-3 — Align actions, fields, filters, status, and feedback

- Retain clay as the only shared primary commit treatment and quiet outline for secondary actions.
- Keep inputs on cream paper and compact filters translucent until selected.
- Use Deep Grove fill for selected filters and tabs without changing pressed-state semantics.
- Render status as dot plus text without pill framing.
- Use Warm Wash for warning and uncertain-result notices.
- Preserve 44 px targets, focus-visible rings, invalid/disabled/busy states, and dark-theme contrast.

Verification: browser checks for default, selected, focused, disabled, invalid, busy, warning, and
dark states; source contract rejects restored same-role dialects.

Rollback: revert shared role recipes independently of route markup.

### GCR-4 — Connect repeated work into ledgers

- Use Connected Ledger rhythm for related Recipe cards, Shopping sections, Settings rows, Stock
  groups, and Meal-plan groups where the existing data already forms one collection.
- Use plain headings, internal dividers, and Soft Lift separation between distinct boards.
- Preserve Recipe image/no-image behavior and the existing responsive column counts.
- Do not merge independently actionable forms, notices, or route-specific controls into ledgers.

Verification: representative long collections at phone and desktop widths; first/middle/last
geometry, focus order, Recipe columns, empty states, and no clipped content.

Rollback: restore independent card corners/shadows per caller while leaving shared data rendering
unchanged.

### GCR-5 — Attach Shopping's phone actions as a Paper Shelf

- Restyle the existing fixed Shopping dock as a cream shelf attached directly above the Green
  Anchor at phone widths.
- Keep Add item, Review/Connect AH, counts, disabled state, and callbacks unchanged.
- Preserve the existing desktop primary-column alignment and reserve enough scroll space that the
  shelf never covers the final list row.

Verification: 320 and 393 px with long Shopping content, keyboard focus, connected/disconnected AH,
disabled review state, and final-row visibility; 768/1280 desktop placement remains balanced.

Rollback: restore the floating dock geometry without touching callbacks or AH behavior.

### GCR-6 — Apply and document the stable-route system

- Apply the chassis and surface recipes to Stock, Meal plan, Shopping, Recipes index/detail/edit,
  Settings index/panels, and Login.
- Allow the shared authenticated shell and navigation material to remain visible around Home
  without redesigning Assistant content.
- Update `docs/ui-house-style.md` with the final material, spacing, and component contracts.
- Update source and Playwright regression coverage in the same change.

Verification: every named route at 320/393/768/1280 px, light/dark, English/Dutch, long content,
keyboard focus, and unauthenticated Login.

Rollback: route-by-route class removal is independent; shared tokens remain compatible with the
previous Soft Utility callers.

### GCR-7 — Full verification, simplification, and delivery

- Run focused unit/source tests during implementation.
- Run `npm run check`, `npm run build`, and the complete provider-free `npm test` gate.
- Run a real-browser UI audit over Shopping phone, Recipes phone, Stock desktop, dark Shopping,
  every stable route, and difficult long-content/focus states.
- Remove obsolete styles and duplicated tokens discovered by the implementation.
- Append `docs/log.md`, mark this artifact Shipped, archive it, commit intentionally, rebase on the
  remote branch, and push.

Verification: clean test gate, no P1–P3 UI finding in the final audit, clean intended diff, and
remote branch tip equals the local commit.

Rollback: revert the single delivery commit; no migration, state rollback, or data repair is
required.

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Green overwhelms desktop | Phone chassis is scaled up unchanged | Wasted canvas and visual fatigue | Immediate at 1280 px | Paper surface reaches within 6 px of the viewport; inner content stays focused | Low |
| Chassis shows multiple greens | Legacy ribbon, shell, utility, or nav token survives | Visible seams and theme drift | Computed-style comparison | One literal Grove token and source/runtime assertions | Low |
| Header clips long copy | AH status and action compete with title at 320 px or 200% text | Lost identity or action | Browser geometry and overflow checks | Flexible copy, contextual recipe contract, status kept compact, natural header growth | Low |
| Fixed shelf covers content | Dock reserve and nav geometry diverge | Final rows become unreachable | Long Shopping fixture at 320/393 px | Keep the fixed-bar height contract and assert final-row visibility | Low |
| Visual consolidation changes behavior | Markup movement touches callbacks or active semantics | Shopping/AH or filter regression | Existing E2E plus source diff | Presentation-only move; reuse existing values and handlers unchanged | Low |
| Connected ledgers erase meaningful boundaries | Unrelated forms/notices are grouped | Scanning and focus context worsen | Route-by-route UI audit | Limit ledger recipe to existing repeated collections; retain stateful boundaries | Low |
| Dark theme becomes muddy or low-contrast | Warm material mixes are applied indiscriminately | Readability and focus loss | Dark-route browser checks | Fixed Grove plus theme-specific paper/card/ink tokens; visible focus assertions | Low |
| Shared shell leaks into excluded experiences | Broad selectors restyle Cook Mode or Assistant controls | Purpose-built interactions drift | Source review and Home/Cook smoke | Scope chassis to route/shell surfaces; no interaction-component changes | Low |

Steelman: The strongest alternative is to keep Green Ribbon as a route-local header and merely
tune spacing, which would be smaller. That cannot resolve the user's repeated evidence of visible
green seams, a disconnected phone dock/nav, and route-by-route material drift. A single shared
Grove chassis is the right abstraction because the variation is explicitly responsive—continuous
on phone and only a 6 px reveal on desktop—while route content and interactions remain independent.

Plan critique: GO. The scope and boundaries are explicit, every failure mode has an observable
mitigation, tickets map to independently verifiable behavior, there is no deferred caller or
migration debt, and rollback is a code-only revert.

## Verification matrix

| Surface | Required evidence |
|---|---|
| Shopping | 320/393 phone, 768/1280 desktop, long content, uncertain AH-result warning, AH connected/disconnected where safe fixtures exist, dock and final row |
| Recipes | 320/393 phone with four no-photo recipes, 768/1280 columns, detail and edit contextual headers, dirty/clean Save |
| Stock | 1280 desktop with long ready-meal collection plus phone layouts |
| Meal plan | Long week and item copy, current/other week groups, phone and desktop |
| Settings | Index plus every stable panel, long summaries, warning notice |
| Login | 320 and desktop, English/Dutch, invalid and focused fields |
| Themes and input | Light/dark; keyboard focus; selected/disabled/busy/invalid; 200%-equivalent header text |

## Open questions

None. Recommended defaults are accepted for every remaining design choice.
