# Feature List: Shopping Journey Simplification

_Status: Shipped - 2026-07-28_

## Problem framing

Shopping now fits on a phone, but it still makes routine use feel like configuration work. The
header repeats “left” and “in basket” counts that are already expressed by the list and basket
section. The source-filter rail permanently fades both edges, so real controls look disabled.
Mobile hides List order, weekly-item management, and shopping rules behind List options. A recipe
rule then hands off through another sheet before the household can change its need or substitute.

Weekly items are the last source pill even though they are the most predictable first stop. Store
Route is a heuristic classifier and is not reliable enough to remain a promised sort. `/shopping`
also defaults to the planning week containing today even when that week's delivery date has
already passed. The recovery link says “Back to this week,” which becomes misleading once the
useful default is the next grocery run.

“Sent to AH” contains durable and important handoff evidence, but mobile places it after the full
list and every attempt expands up to five product lines. Success, partial failure, and uncertain
delivery need clearer hierarchy and safer recovery.

## Intent brief

- **Objective:** make Shopping a calm repeated mobile task: choose a source, scan weekly items
  first, check items off, adjust a rule or substitute directly, and understand the latest AH
  handoff without navigating through nested sheets.
- **Primary users:** Freek and Ylfa using a phone while planning or shopping; desktop remains a
  supported planning surface.
- **Entry:** `/shopping`, an explicit `?week=YYYY-MM-DD` link, or the meal-plan Shopping link.
- **Outcome:** the household sees the correct upcoming grocery run and can act on the list with
  the important controls continuously visible.
- **Exit:** checked items remain reversible; AH sends lead to an explicit success, partial, or
  uncertain result and a durable activity summary.

## Observed evidence

### Authenticated runtime

| Surface | Observation | User impact |
| --- | --- | --- |
| Phone, effective 300 CSS px | The filter viewport was 206 px wide. Four pills measured 41, 170, 91, and 193 px; the fourth began outside the viewport. A 12 px edge mask remained active at both ends. | “All” and the clipped edge pill look faded rather than enabled; continuation is ambiguous. |
| Phone, effective 300 CSS px | List order, weekly management, and shopping rules were hidden; only List options remained visible. | Routine sorting and rule edits begin with an extra sheet. |
| Desktop, effective 1024 CSS px | All four pills fit, but the same two-edge mask remained active. List order, weekly management, and rules were all visible. | The fade is a component choice, not a true overflow state. |
| Both | No page-level horizontal overflow occurred and phone pills remained 44 px high. | Preserve the working responsive and target-size baseline. |

No authenticated screenshot or household item/recipe content is retained.

### Source trace

| Current behavior | Evidence | Consequence |
| --- | --- | --- |
| Visible “left / in basket” pair | `WeekNav.svelte:92-98` | Duplicates state already represented by the active list and basket disclosure. |
| Permanent faded filter edges | `ShoppingLists.svelte:145-180`; shared mask in `src/app.css:335-347` | First and last controls lose contrast even at a scroll boundary. |
| Weekly follows every recipe pill | `ShoppingLists.svelte:151-179` | Recurring basics are visually secondary. |
| Phone hides sort, rules, and weekly management | `ShoppingLists.svelte:1262-1298` | List options becomes a compulsory router. |
| Rule path chains sheets | `list-controller.svelte.ts:225-249`; `ShoppingLists.svelte:437-480,550-597` | List options → rules → edit before the actual controls appear. |
| Store Route is lexical classification | `shopping_list_view.ts:3-162,202-247` | A sparse hard-coded dictionary promises store knowledge the app does not have. |
| Default week is always today's planning week | `reconcile-shopping.ts:165-183` | A passed delivery date can leave the default one grocery run behind. |
| “Back to this week” is conditional recovery | `WeekNav.svelte:73-87` | It conflicts with an upcoming-delivery default. |
| Push history is in the trailing aside and expands lines | `+page.svelte:202-227`; `PushHistory.svelte:44-105` | Mobile reaches the latest handoff only after the list; successful sends consume too much space. |

## Existing-system inventory and invariants

- `ShoppingLists.svelte` owns filters, sort controls, active/basket projections, row actions, and
  the rules surfaces.
- `list-controller.svelte.ts` owns transient filter/sort/sheet state, focus recovery, undo, and
  optimistic mutation feedback.
- `shopping_list_view.ts` is the pure projection seam for filters, sorts, grouping, and stable
  item keys.
- `SourceDecisionSheet.svelte` edits exactly one recipe-owned source using its entry and recipe
  revisions. It is the safety seam to reuse, not bypass.
- `RecurringShoppingList.svelte` owns the add/edit/skip/stop manager for recurring definitions.
- `AhSheet.svelte` and the server workflow own matching and external push safety. This plan does
  not change push semantics or offer retry after an uncertain result.
- The active Assistant Recipe Options work adds recipe-scoped AH product preferences and strict
  mixed-source conflict behavior. Shopping terms and substitutes remain separate from AH product
  IDs.
- AH search and basket push continue to use canonical Dutch ingredient/term fields only.
- No schema, auth, new dependency, or destructive data operation is required.

## Scope

### In

- Remove the visible “Y left / X in basket” header block while retaining useful basket-section
  counts and accessible mutation announcements.
- Put `All`, `Weekly items`, then recipe pills in one fully opaque horizontal rail.
- Remove the order dropdown and its controller state. Use the existing stable List order everywhere;
  do not expose A–Z or Store Route.
- Remove Store Route and A–Z from projection code, messages, UI, tests, and dead grouping CSS.
- Make weekly items the first section in All, with one direct Manage action in its section header.
- Keep mixed weekly/recipe rows single: show them once in Weekly in All, while still matching both
  source filters.
- Replace nested rule handoffs with visible row summaries and a direct reusable rule/substitute
  editor.
- Make off-list rules directly editable in one rules sheet without opening a second editor sheet.
- Choose the default Shopping week from the next non-past delivery date when no explicit `week`
  query is present.
- Remove “Back to this week”; retain previous/next week navigation and explicit deep links.
- Redesign Sent to AH as a latest-first activity surface with safe success, partial, pending, and
  uncertain states.
- Update English/Dutch copy, unit tests, and authenticated responsive browser coverage.

### Out

- Changing shopping-entry, recurring-item, push-history, recipe-preference, or auth schemas.
- Inferring rules, substitutes, or AH products automatically.
- Changing canonical recipe data, the Dutch AH lookup seam, product-preference precedence, or
  aggregate-row conflict rules.
- Changing AH push idempotency, marking-bought behavior, destinations, or provider integration.
- Reordering recipes or shopping entries persistently.
- Adding drag-and-drop, a custom store map, a new settings route, or another dependency.
- Redesigning meal planning, recipe editing, or inventory.

## Design shotgun

Every direction uses equivalent fictitious content, includes a long recipe name, shows weekly
items first, removes Store Route, A–Z, the order control, and header counts, and covers a partial AH
send.

### Round one — interaction model

The first comparison tested Run Rail, Source Board, and Edit Lane. The household selected
**Source Board** on 2026-07-28 and made List order a fixed behavior rather than a visible choice.
Run Rail and Edit Lane remain useful comparison evidence, but they are no longer candidates for
implementation.

### Round two — Source Board treatment

All three refinements preserve one canonical row per aggregate shopping item. A weekly/recipe item
appears in Weekly and carries recipe source chips. An item shared only by recipes appears once in a
Shared section after Weekly. Recipe sections contain only their exclusive rows. Source filters
continue to show every matching row.

#### Direction A — Source Ledger

**Visual thesis:** use compact editorial bands rather than cards: a strong source header followed
by uninterrupted rows, with color and type carrying ownership.

- Weekly, Shared when needed, then recipe sections form one vertical ledger.
- Section headers use a narrow tinted strip; rows share one quiet surface with thin separators.
- The source rail filters the board. In All, it also reflects the same section order.
- Recipe and substitute state remains a direct row action; Weekly owns the only Manage action.
- Latest AH activity is a bounded strip before the ledger.

**Strength:** keeps Source Board provenance while adding the least vertical and visual weight.

**Trade-off:** section boundaries are quieter than framed cards.

**Optimizes:** repeated phone scanning and long meal plans.

#### Direction B — Editorial Cards

**Visual thesis:** give every source a framed, lightly tinted card with a generous title, count,
and local actions.

- Weekly, Shared, and recipe sources are separate cards with stronger color identity.
- Recipe cards may be manually collapsed; Weekly starts open.
- Rule/substitute state stays inline, while card headers make ownership explicit.
- Desktop uses a two-column board; phone remains a single card stack.

**Strength:** strongest source explanation and easiest planning overview.

**Trade-off:** card padding and repeated headers create the tallest mobile page.

**Optimizes:** planning, review, and explaining why an item exists.

#### Direction C — Focus Deck

**Visual thesis:** turn sources into a horizontal deck on phone and a column board on desktop, so
one source receives full attention at a time.

- All begins with a compact source index and the Weekly card; adjacent cards are reached by
  horizontal snap or a source pill.
- Desktop lays the same cards into columns.
- Shared remains its own card and every aggregate row still appears once.
- AH activity stays above the deck rather than becoming another card.

**Strength:** the calmest single-source view and strongest visual separation.

**Trade-off:** horizontal navigation hides later sources and makes full-list scanning slower.

**Optimizes:** focused planning one source at a time.

## Chosen approach

Lock **Source Board** as the interaction model and **Direction A — Source Ledger** as its treatment.

Source Ledger preserves the chosen source-led hierarchy without turning a long phone list into a
stack of padded cards or a horizontal browsing task. It also resolves Source Board's shared-item
problem explicitly: Weekly wins for any recurring aggregate, recipe-only aggregates shared by
more than one recipe live in Shared, and everything appears once. The kitchen palette and existing
44 px geometry remain; ownership comes from section headers, source chips, and stable ordering.

### Phone structure

```text
Shopping                                      AH connected
‹  Tue 28 Jul — Mon 3 Aug · Delivery Tue 28 Jul        ›

[ SHOPPING RULES · 2 off list                         Review › ]
[ All ][ Weekly items ][ Recipe A ][ Recipe B … ]

AH activity  ✓  7 sent to order · 12:43        Details ›

WEEKLY ITEMS                                      Manage
○ Milk                                  Weekly
○ Fruit                                 Weekly

SHARED
○ Tomatoes            Weeknight tacos + Traybake     ›

WEEKNIGHT TACOS
○ Tortillas           Every time · Buy: wholegrain   ›

LONG FAMILY AUBERGINE TRAYBAKE
○ Yoghurt             Usually stocked · Buy: oat      ›

                         [ Add item ] [ Review AH · 5 ]
```

### Direct rule editor

- Open from a row summary in one tap or expand a row inside the global Rules sheet.
- Reuse one `ShoppingRuleEditor` body:
  - need: Every time / Nice to have / Usually stocked;
  - buy as: approved Dutch term/substitute chips;
  - when a substitute differs from the recipe name, offer the existing “Use in recipe too”
    choice;
  - explicit Save and Cancel; no autosave.
- For an aggregate with several recipe sources, open one sheet containing source cards. Each card
  exposes its own editor and revision-bound save; no source is chosen implicitly.
- Manual and weekly actions remain separate from recipe rules.
- Saving failure preserves the draft, keeps the editor open, and leaves focus on the failed
  source. Success updates the visible summary and returns focus to its trigger.

### Global rules sheet

- A full-width green `Shopping rules` control sits directly below the week selector and above the
  source pills whenever recipe sources exist. Its off-list count is secondary warning copy, not a
  List options badge.
- The sheet starts with `Not on this list` when exclusions exist, then allows `All recipe rules`.
- Each rule row shows need and buy-as state. Tapping the row expands the same editor in place;
  there is no second sheet.
- Off-list ingredients remain reachable even though they have no shopping row.

### Weekly behavior

- The Weekly items pill is stable, including an empty state. It does not disappear just because
  this week has zero included recurring rows.
- In All, any item with a weekly source belongs to the Weekly section and appears once.
- Mixed weekly/recipe items still match both Weekly and their recipe filters.
- Stable List order applies within every section; there is no ordering control or alternate sort.
- The Weekly section header owns the sole visible Manage action. The recurring manager no longer
  renders a separate toolbar trigger.

### Upcoming grocery default

- An explicit `?week=` always wins.
- Without it, derive today's planning week and its delivery date.
- If a grocery day is configured and that delivery date is before today's Amsterdam date, use the
  next planning week.
- On the delivery date itself, keep the current run; only the next local day advances.
- With no grocery day configured, retain today's planning week.
- Replace “This week” with delivery-first copy such as `Upcoming shop` only when it truthfully
  describes the selected default. Explicit historical/future weeks show their date range without
  a recovery link.

### AH activity

- Phone: latest attempt appears after the controls and before the list. Desktop: the same
  component appears in the existing side rail.
- The latest attempt shows status, destination, account when present, timestamp, and counts.
- Presentation precedence is explicit: pending → uncertain → failed → partial (some failed or
  skipped) → success. A zero-send failed attempt must never read as a successful send.
- Success is collapsed by default; `Details` reveals product/free-text lines.
- Partial or failed attempts expand unresolved/failed lines first and keep successful lines
  secondary.
- Pending remains a live busy status.
- Uncertain remains visually persistent and says to check AH before another send; it never exposes
  Retry.
- Older attempts live under `Previous sends (N)` and are collapsed.
- Empty history renders nothing. The immediate `AhPushResult` remains the first response after a
  send; activity is the durable reload/return state.

## Rejected alternatives

- **Run Rail:** lighter and faster, but the household selected stronger source ownership over one
  visually continuous list.
- **Edit Lane:** strongest batch editing, but adds a mode and hides useful current state during
  the normal shopping run.
- **Keep List options and shorten its labels:** preserves the extra navigation and does not solve
  direct rule/substitute access.
- **Keep A–Z behind a smaller order control:** retains state and UI for a secondary choice the
  household does not use.
- **Fix Store Route's dictionary:** compounds a product promise without reliable aisle/store
  metadata.
- **Autosave rule chips:** fewer taps, but a stray selection writes a recipe-owned decision
  immediately and gives failure recovery no stable draft.

## Phase plan

### Phase 1 — Make week and projection truth correct

Add the delivery-aware default-week helper, preserve explicit deep links, delete Store Route and
its dead classifier/grouping code, and extend pure projection tests before changing the UI.

### Phase 2 — Establish the Source Ledger and weekly-first board

Remove header counts, the recovery link, and all ordering controls/state. Rebuild the source
navigation as an opaque scroll rail. Compose All as Weekly, optional Shared, then recipe sections
without duplicates, and move weekly management to its section header.

### Phase 3 — Flatten rules and substitutes

Extract the reusable editor body, add direct row summaries, simplify the controller's sheet
handoffs, and make the global Rules sheet edit sources inline. Preserve revision, focus, failure,
and Dutch-term boundaries.

### Phase 4 — Make AH activity trustworthy and finish responsive coverage

Recompose durable send history around the latest outcome and recovery state, place it correctly by
viewport, then run the complete responsive/state/language matrix and trim superseded code/copy.

## Execution tickets

### SHOP-JS-1 — Default to the next non-past grocery run

- **Observable behavior:** `/shopping` opens the planning week whose configured delivery date is
  today or next; an explicit `?week=` is unchanged.
- **In:** pure date resolver, Amsterdam date boundary, page-load use, week-header semantics,
  removal of “Back to this week.”
- **Out:** meal-plan defaults, grocery preference storage, time-of-day delivery slots.
- **Targets:** `src/lib/server/workflows/reconcile-shopping.ts`,
  `src/lib/server/workflows/reconcile-shopping.test.ts`,
  `src/lib/components/shopping/WeekNav.svelte`, `src/routes/shopping/+page.svelte`,
  `messages/en.json`, `messages/nl.json`.
- **Risk:** R2; default routing changes which existing week is materialized.
- **Verification:** before/on/after delivery; grocery day before and after week start; year
  boundary; no grocery day; explicit past/current/future query.
- **Rollback:** restore today's planning-week resolver and header copy; persisted weekly data is
  untouched.

### SHOP-JS-2 — Delete ordering controls and use List order everywhere

- **Observable behavior:** Shopping has no order dropdown. Every filter and Source Board section
  uses the existing stable List order.
- **In:** remove controller sort state, A–Z and Store Route options, store classifier/section
  grouping, messages, responsive control geometry, and dead tests/CSS.
- **Out:** new aisle data, drag ordering, or persistent custom order.
- **Targets:** `src/lib/shopping_list_view.ts`, its tests,
  `src/lib/components/shopping/list-controller.svelte.ts`,
  `src/lib/components/shopping/ShoppingLists.svelte`, all `shopping_sort_*` and
  `shopping_store_*` messages, e2e.
- **Risk:** R1.
- **Verification:** typecheck/search catches every sort caller; stable order across filters and
  sections; 320/375/768/1280 rail geometry and keyboard access.
- **Rollback:** restore the former sort union and control together; do not leave dead classifier
  or controller state.

### SHOP-JS-3 — Rebuild the opaque source rail

- **Observable behavior:** `All`, `Weekly items`, then recipe pills are fully opaque; the first
  and last reachable pill are never masked.
- **In:** rail order, Shopping-specific removal of the edge mask, scroll padding/snap, long EN/NL
  labels, stable Weekly empty filter.
- **Out:** changing the shared rail utility for other routes.
- **Targets:** `ShoppingLists.svelte`, `shopping_list_view.ts`, controller/tests, messages, e2e.
- **Risk:** R1.
- **Verification:** initial/middle/end scroll positions; pointer and keyboard focus; active state;
  long names; no page overflow; next pill may peek naturally but no interactive pixel is faded.
- **Rollback:** revert the Shopping rail only; preserve the shared utility.

### SHOP-JS-4 — Put weekly items first and own management there

- **Observable behavior:** All starts with Weekly items, mixed-source rows appear once, and the
  Weekly section has the sole direct Manage action. Recipe-only shared aggregates appear once in
  Shared; recipe sections contain their exclusive rows.
- **In:** source-aware partitioning after filtering, stable List order within sections, stable
  Weekly empty state, optional Shared section, recurring manager trigger removal.
- **Out:** recurring schema or command changes.
- **Targets:** `shopping_list_view.ts`, `list-controller.svelte.ts`,
  `ShoppingLists.svelte`, `RecurringShoppingList.svelte`, focused tests/e2e.
- **Risk:** R2; projection mistakes could hide or duplicate required items.
- **Verification:** weekly-only, recipe-only, manual, mixed weekly/recipe, multi-recipe shared,
  done, covered, incompatible quantities, empty weekly, filter transitions, stable List order.
- **Rollback:** restore one unsectioned projection and the existing manager trigger.

### SHOP-JS-5 — Open a rule or substitute directly from its shopping row

- **Observable behavior:** one tap on visible rule/substitute state opens the actual editor for
  that source; aggregate rows expose every recipe source without guessing.
- **In:** reusable editor body, direct row summary, multi-source sheet, explicit save, focus/draft
  recovery.
- **Out:** AH product candidate selection, automatic recipe edits, manual/weekly source actions.
- **Targets:** new `src/lib/components/shopping/ShoppingRuleEditor.svelte`,
  `SourceDecisionSheet.svelte`, `ShoppingLists.svelte`, controller, route save seam, messages,
  tests/e2e.
- **Risk:** R2; a source/revision mismatch could write the wrong recipe rule.
- **Verification:** single/multiple recipe sources; need-only, substitute-only, combined change;
  stale entry/recipe revision; failed save retains draft; successful save refreshes summary;
  other recipe sources unchanged; Dutch term reaches the existing endpoint.
- **Rollback:** restore the current source sheet and row overflow action while keeping the safe
  save endpoint.

### SHOP-JS-6 — Edit off-list rules without a second sheet

- **Observable behavior:** Rules opens directly and its rows expand the same editor in place;
  excluded rules need no follow-up sheet.
- **In:** persistent Rules entry, excluded/all scopes, inline expansion, one dirty source at a
  time, focus and error handling.
- **Out:** bulk mutation or autosave.
- **Targets:** `ShoppingLists.svelte`, controller, `ShoppingRuleEditor.svelte`, messages, e2e.
- **Risk:** R2.
- **Verification:** zero/some exclusions; expand/cancel/save; failed save; keyboard focus;
  320 px and 200% layout; aggregate entries remain per-source.
- **Rollback:** restore the existing rules list and its revision-bound editor handoff.

### SHOP-JS-7 — Turn Sent to AH into outcome-first activity

- **Observable behavior:** the latest attempt is visible before the list on phone and in the side
  rail on desktop; details and older attempts are disclosed only when useful.
- **In:** component composition, details hierarchy, placement, success/partial/failed/pending/
  uncertain states, safe Open AH action.
- **Out:** push API, history schema, retry, provider calls, marking-bought rules.
- **Targets:** `PushHistory.svelte`, `AhPushResult.svelte` only for consistent copy if needed,
  `src/routes/shopping/+page.svelte`, messages, browser fixtures/tests.
- **Risk:** R2; weak uncertain-state copy could cause a duplicate external send.
- **Verification:** every attempt status; counts and destination; no Retry in uncertain state;
  failed rows prioritized; older sends collapsed; empty hidden; mobile/desktop order; reload
  agreement with immediate result.
- **Rollback:** restore the existing history rendering; external history data is unchanged.

### SHOP-JS-8 — Complete the repeated-task acceptance matrix

- **Observable behavior:** the redesigned route remains fast, understandable, reversible, and
  responsive across its realistic states.
- **In:** unit, Svelte, build, primary/secondary authenticated e2e, EN/NL, light/dark, phone/
  tablet/desktop, empty/active/complete/covered/failed states, copy/dead-code trim.
- **Out:** real AH basket push or authenticated evidence artifacts.
- **Targets:** `tests/e2e/responsive-parity.e2e.ts`, focused component/domain tests, changed
  Shopping files.
- **Risk:** R1.
- **Verification:** `npm test`, `npm run test:e2e:secondary`, `git diff --check`, Gitleaks;
  no authenticated screenshots/HAR/cookies/response bodies retained.
- **Rollback:** revert the UI/projection commits together while preserving unrelated active
  Assistant Recipe Options work.

## Risk tier and rollout

Overall risk is **R2**. There is no schema, auth, destructive operation, or new external write.
The risk comes from shared week selection, source-aware projection, persistent rule edits, and the
uncertain external-handoff message.

- Implement from the committed tip that contains the active Assistant Recipe Options work, or
  rebase onto its eventual merged `main` before editing the shared AH preview files.
- Land pure date/projection tests before UI composition.
- Use the existing isolated authenticated browser fixtures; never exercise a real AH push.
- Deploy through GitHub `main`, wait for Railway `SUCCESS`, prove exact-main equality, then run an
  authenticated structural canary without retaining household content.
- Roll back with a normal revert of the Shopping redesign commits. No migration or variable
  rollback is needed.

## Failure-mode table

| Priority | Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Default advances too early | Delivery day treated as passed at midnight start | Current run seems to disappear on delivery day | High in pure date tests | Advance only when delivery date is strictly before today's Amsterdam date; explicit query always wins | Low |
| P1 | Explicit deep link is overridden | Default resolver runs for `?week=` | Shared or bookmarked week opens elsewhere | High in route test | Branch on a valid explicit query before applying the default | None expected |
| P1 | Weekly/recipe item appears twice | All is grouped by every source | Household may buy a shared item twice | High in projection test and row keys | Partition items once; weekly ownership wins only for All presentation | Low |
| P2 | Weekly grouping hides recipe membership | Row moves to Weekly in All | Recipe filter seems incomplete | High in filter tests | Presentation partition follows filtering; mixed rows continue to match both filters | Low |
| P2 | Removing ordering UI leaves hidden state | Controller/default still accepts A–Z or Store Route | Invisible state changes order or dead code survives | High at typecheck/search | Delete the sort state, union, resolver, groups, all `shopping_sort_*` / `shopping_store_*` messages, tests, and CSS in one ticket | None expected |
| P2 | List order becomes unstable between sections | Partitioning reconstructs rows without preserving their source index | Items jump when filters change | High in pure projection tests | Carry the existing stable List order through partitioning and assert exact keys per section | Low |
| P1 | Direct row editor writes the wrong source | Aggregate row has several recipes | Wrong recipe need/substitute changes | High with per-source revision tests | Bind every editor to source ID + entry/recipe revision; never infer source from row name | Low |
| P2 | Failed save loses the selected substitute | Request fails after user edits | User must repeat the change | High in mocked failure e2e | Preserve draft, keep editor open, show inline/toast failure, restore focus | Low |
| P1 | AH product preference is conflated with a substitute term | New active preference appears in the same shopping row | Dutch lookup or product precedence breaks | Medium without boundary test | Rule editor edits approved Dutch terms only; product IDs remain in AH preview/preferences | Low |
| P1 | Failed AH attempt reads as a zero-item success | Status falls through because only pending/uncertain are special | Household trusts an external handoff that failed | High in state fixtures | Use explicit status precedence and test failed plus partial counts | Low |
| P1 | Uncertain send suggests retry | Activity copy/action is generalized from failure | Duplicate items may reach AH | High in state test | Dedicated uncertain variant with Check AH/Open AH and no Retry | Low |
| P2 | Latest AH result is still buried | Responsive order remains aside-after-main | User cannot verify handoff while shopping | High at mobile DOM order | Render/place the same latest activity before the list on phone | None expected |
| P1 | Public evidence exposes household data | Runtime verification saves screenshots or responses | Privacy breach in public repo | High in artifact review | Structural counts only; synthetic fixtures for visual evidence | Low |

## Verification matrix

| Layer | Required proof |
| --- | --- |
| Date/default | before/on/after delivery; week-start/grocery-day permutations; DST/year boundary; null grocery day; explicit query precedence |
| Pure projection | All/Weekly/recipe filters; Weekly-first partition; recipe-only Shared partition; mixed-source no duplicates; stable List order; done/covered/incompatible quantities |
| Rule editor | single and aggregate sources; need/substitute/use-in-recipe; revision failures; draft/focus recovery; unrelated sources unchanged |
| AH activity | empty, success, partial, failed, pending, uncertain; latest/older disclosures; no uncertain retry; destination/account/count agreement |
| Responsive UI | 320, 375, 768, 1280 px; EN/NL; light/dark; long recipe labels; 200% effective layout; no faded interactive edges or page overflow |
| Journey | default upcoming run → Weekly first → recipe filter → one-tap rule edit → check/undo → AH review result → durable activity |
| Repository gate | `npm test`; `npm run test:e2e:secondary`; `git diff --check`; Gitleaks |
| Production | Railway exact `main`, health `ok`, authenticated 320/1280 structural canary, zero app-origin console/HTTP errors |

## Plan critique

The chosen interaction model passes the deletion test: Store Route, A–Z, the sort controller
state, and the List options routing state are removed with all callers rather than left as dead
compatibility paths. The rule editor is extracted because both row and global manager need the
same source/revision contract; it is not a new domain abstraction. Source Ledger grouping changes
presentation only and never splits or duplicates the canonical item model.

**Steelman:** Editorial Cards would make provenance clearer and more inviting at a glance,
especially during planning. It is still the weaker repeated-shopping default because every card
repeats padding, borders, and header controls on the narrow surface. Source Ledger preserves the
chosen Source Board structure, but uses typography and compact bands to keep the phone page
bounded. Focus Deck is calmer within one source, but makes a complete run depend on horizontal
navigation.

Plan-readiness recommendation: **GO**. The primary critique found five P1 classes and integrated
their mitigations above: explicit-week precedence, single-ownership Weekly partitioning,
revision-bound per-source editing, AH product/term separation, and failed/uncertain handoff
semantics. The routed independent Opus check was unavailable because its session limit resets at
19:50 Europe/Amsterdam; no outside findings were accepted. No R3 stage gate is required.

## Open Questions

> **Q: When should a passed delivery advance the default week?** — Default: keep the current run
> through the delivery date and advance the next Amsterdam calendar day. Reason: the household may
> still shop or receive the order on that date.

> **Q: Should rule/substitute choices save immediately?** — Default: require explicit Save.
> Reason: these choices persist to recipe-owned shopping behavior, and a deliberate save preserves
> safe error recovery.

> **Q: Where should recent AH activity appear on phone?** — Default: show only the latest attempt
> between controls and the list; keep older attempts collapsed in Details. Reason: the latest
> handoff affects the current run, while history should not compete with items.

## Resume pack

- **Goal:** simplify Shopping around a Source Board with visible source navigation, fixed stable
  List order, Weekly-first sections, direct rule/substitute editing, delivery-aware default, and
  outcome-first AH activity.
- **Current state:** authenticated 300/1024 CSS-px runtime and source audits are complete; three
  interaction models and three Source Board treatments are compared; Source Board is selected and
  Source Ledger is the round-two recommendation; no application code or live data changed.
- **First command:** `/run`
- **Load first:** `docs/feature-lists/FEATURE_LIST_SHOPPING_JOURNEY_SIMPLIFICATION.md`
- **First files:** `src/lib/server/workflows/reconcile-shopping.ts`,
  `src/lib/shopping_list_view.ts`,
  `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/lib/components/shopping/list-controller.svelte.ts`,
  `src/lib/components/shopping/SourceDecisionSheet.svelte`,
  `src/lib/components/shopping/PushHistory.svelte`.
- **Dependency:** preserve and rebase over the active Assistant Recipe Options work before touching
  AH preview/preferences. Do not merge its product IDs into shopping-term/substitute controls.
- **Pending verification:** all tests in the matrix; no real AH push.
- **Defaults if unanswered:** Source Ledger, advance the day after delivery, explicit Save, latest
  AH activity above the phone list.
