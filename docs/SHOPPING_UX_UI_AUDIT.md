# Shopping UX/UI audit — ready-first refinement

_Status: Implemented and verified — 2026-08-02_

Date: 2026-08-01
Companion workspace: `docs/artifacts/2026-08-01-ux-ui-shopping-ready-first.html`

## Outcome

The in-store interaction is dependable, but the page does not lead with the in-store task. At a
375 × 812 viewport, the first shopping item begins at y = 1,029 px. Planned-meal controls consume
387 px and an unresolved Albert Heijn (AH) result consumes another 332 px before the filters and
list. At 1280 × 900, the first row starts at y = 825 px and intersects the fixed action dock, which
occupies y = 776–836 px.

The recommended direction is **ready first**: show a compact preparation summary and any unresolved
AH warning, then put filters and shopping items immediately on screen. Keep portions, weekly-item
editing, lasting recipe defaults, and detailed AH history one tap away. This preserves the current
data ownership and recovery behavior while removing preparation controls from the repeated
in-store scan path.

## Implemented result

`/shopping` now follows that ready-first order. A compact readiness row and unresolved AH warning
lead into the action shelf, filters, and shopping ledger; planned portions, weekly-item editing,
recipe choices, and detailed AH history open only when requested. The phone shelf reserves its own
scroll space and keeps toasts above it, while desktop actions remain in normal document flow.

Rows expose a trash action directly when removal is their only available command. The three-dot
menu remains only when a row actually offers recipe choices or more than one manual-source action.
Direct removal is limited to editable active rows and retains the existing immediate Undo; covered,
completed, and read-only rows do not expose it.

Verification passed with zero Svelte warnings, 705 unit tests, the production build, and all 40
executed authenticated browser cases for each isolated household account. The single connected-AH
case remains intentionally skipped and no live AH request, provider call, or household data was
used.

## Journey and coverage

The real users are Freek and Ylfa. The page supports three related occasions:

1. **Prepare:** verify the selected week, adjust planned portions, add one-off or weekly items,
   decide what a recipe ingredient means for future lists, and review an AH order.
2. **Shop:** open the list repeatedly on a phone, recognize the next item, mark it bought, undo a
   mistake, and continue without losing position.
3. **Return:** understand whether the previous AH handoff succeeded and avoid an unsafe duplicate
   send.

The intended exit is either a completed list or a reviewed AH handoff with a trustworthy result.
The adjacent routes are Meal Plan, Settings → Connections, and AH itself.

Runtime evidence used the repository's isolated synthetic Playwright account and database. No
household data, provider credential, or real AH request was used.

- Viewports: 375 × 812 and 1280 × 900, English, light theme.
- Observed states: populated long list, unresolved AH history, bought + Undo, weekly-items filter
  and edit state, add-one-off-item sheet, disconnected AH action, and desktop layout.
- Source/test review: empty, covered, complete, stale-write, failed-write, Dutch dark-mode, reduced
  motion, and AH review triage states.
- Limitation: a connected AH preview was not exercised end to end because it is an external
  integration. Its triage-first component and existing mocked tests were inspected; this audit
  makes no live AH rendering claim.

## What already works well

- Marking an item bought moves keyboard focus to the next visible checkbox, preserves the user's
  list position, announces the result, and offers Undo. The 375 px run moved focus from the first
  item to `entries:16` while keeping that row visible.
- Add-item and weekly-item forms use labelled native fields, disable duplicate submission, retain
  drafts on failure, and return focus after editing.
- Stale and failed writes restore the previous value instead of leaving optimistic UI behind.
- Empty, filter-empty, complete, covered, and disconnected-AH states provide a next action.
- The AH review component separates “Needs a look” from “Confirmed,” keeps its summary and final
  send action visible, and blocks an unresolved or unconfirmed send.

These behaviors are constraints for any redesign, not targets for replacement.

## Ranked findings

### F1 — P2 UX: preparation and recovery push the shopping list below the first screen

**Observed:** `/shopping`, populated synthetic week, 375 × 812 and 1280 × 900. On phone, the week
band ends at y = 126, planned meals occupy y = 136–523, unresolved AH history occupies y = 535–867,
filters begin at y = 878, and the first item begins at y = 1,029. Desktop still places the first
item at y = 825. The route renders `ShoppingMealPortions`, push history, and only then
`ShoppingLists` (`src/routes/shopping/+page.svelte:206`, `:214`, `:231`).

**Impact:** the recurring task is “find the next thing to buy,” but arrival first asks the household
to re-read planning controls and an earlier handoff. A returning shopper must remember that the
list exists below content that often has no action for the current moment.

**Smallest durable direction:** replace the expanded planned-meals block with a one-line readiness
summary and an Adjust action. Keep the unresolved AH outcome inline, as the house style requires,
but compress it to one warning row with Open AH and Details. Put filters and items next.

### F2 — P2 UX/UI: lasting recipe defaults live inside the repeated in-store row

**Observed:** populated phone list. A recipe-owned row renders one or more
`ShoppingSourceQuickControls` inline (`ShoppingLists.svelte:394–420`). The row simultaneously shows
the ingredient, source context, “Change future lists,” and a current-run product term. Synthetic
recipe rows measured about 85 px high; ordinary one-off rows were about 50 px. At 375 px the labels
and selected values visibly truncate.

**Impact:** a shopper scanning for “tomatoes, 2 cans” must parse controls that make durable future
changes. Dense, truncated selects also make an accidental lasting edit more likely precisely when
the user is moving through the shop.

**Smallest durable direction:** keep the default row to checkbox, item, quantity, source cue, and
one More action. Put “This week” and “Future lists” in that item's action sheet, or collect lasting
defaults in the preparation panel. Preserve the existing guarded mutations and Undo behavior.

### F3 — P2 UI: the fixed action dock occupies the list's visible space

**Observed:** `/shopping`, 1280 × 900. The first list row occupied y = 825–910 while the fixed dock
occupied y = 776–836. Mobile content also scrolls underneath the shelf; focus management avoids
losing the active checkbox, but nearby rows remain visually covered. The dock is `position: fixed`
(`src/routes/shopping/+page.svelte:400–401`) and bottom padding only protects the end of the
document (`:380`, `:456`).

**Impact:** the page can show a row that looks clipped or unreachable until the user scrolls again.
The shelf, toast, and global navigation together can consume a large part of a short phone viewport.

**Smallest durable direction:** reserve physical space for the action shelf above global navigation
so the shopping scrollport ends at the shelf's top. On desktop, keep the actions in flow or in a
non-overlapping sticky rail inside the 52 rem work column.

### F4 — P2 UX/UI: the unresolved AH result is safe but too expansive

**Observed:** the phone attention card measured 332 px and repeats “Sent to AH,” the outcome title,
timestamp/account, warning explanation, affected item, detail disclosure, Open AH, and a second
Sent to AH history control. The repository correctly requires the latest unresolved outcome to
remain inline (`docs/ui-house-style.md:80`).

**Impact:** the safety message is important, but its presentation makes the previous handoff more
prominent than today's list. The repeated “Sent to AH” wording blurs current warning and history.

**Smallest durable direction:** use one compact attention strip: “AH send unclear — check AH before
resending,” with Open AH as the primary recovery action and Details/History as secondary disclosure.
Do not move uncertainty into a transient toast or badge.

### F5 — P3 hierarchy/copy: duplicate Add item entries and mixed page terminology dilute orientation

**Observed:** Add item is visible in both the page header (`WeekNav.svelte:59–73`) and the fixed dock
(`+page.svelte:306`). The English navigation calls the destination “Groceries” while the page H1 is
“Shopping” (`messages/en.json:6`, `:556`). The current house-style document explicitly permits the
header duplicate on narrow screens, so changing this requires updating that product rule.

**Impact:** two controls with the same outcome compete for primary status; mixed nouns make the
active tab and page title feel like neighboring concepts instead of the same place.

**Smallest durable direction:** keep one persistent Add item control in the reserved shelf and use
one English noun across tab, title, and supporting copy. “Shopping” matches the existing route and
most page copy; “Groceries” is also viable if changed consistently.

### F6 — P3 recovery/navigation: the add sheet points to a control that is not directly available

**Observed:** the one-off sheet says, “Use Manage weekly items for recurring basics”
(`messages/en.json:563`). The actual path is close the sheet → choose Weekly items → choose Edit
weekly → choose Add weekly item. There is no visible “Manage weekly items” control.

**Impact:** a user who realizes an item should recur must remember a multi-step path after closing
the sheet.

**Smallest durable direction:** add a “Manage weekly items” link in the sheet that closes it, selects
the weekly filter, enters edit mode, and focuses Add weekly item. If a direct handoff is deferred,
name the current path literally in the help text.

### F7 — P3 interaction semantics: item copy advertises a click without owning an action

**Source evidence:** `.market-row-copy` uses `cursor: pointer`
(`ShoppingLists.svelte:873–875`), but the corresponding element has no click handler
(`:416`). Only the checkbox and More button act.

**Impact:** desktop users receive a false affordance and may click the item name expecting details
or completion.

**Smallest durable direction:** either make the copy open the item's action sheet with keyboard
parity, or return it to the default cursor.

## Recommended page model

Use progressive disclosure rather than a hard Prepare/Shop mode switch.

1. **Header:** page identity, week navigation, passive AH connection state. No duplicate Add item.
2. **Safety strip, only when needed:** compact unresolved AH outcome with Open AH, Details, and
   History.
3. **Readiness strip:** “2 meals · 8 portions · 15 items” plus Adjust. If a portion change is saving,
   say so here and temporarily block AH review as today.
4. **List:** filters, Not this run disclosure, and compact grouped rows. Future defaults and product
   terms move behind item More or the preparation panel.
5. **Reserved action shelf:** Add item and Review AH/Connect AH. It does not cover list content.
6. **Preparation panel:** planned-meal portions, weekly items, and lasting source defaults. Opening
   from Adjust preserves list scroll; closing returns focus to Adjust.

Suggested design targets for verification, not universal standards:

- first shopping row at or above y = 320 on a 375 × 812 populated page without an unresolved AH
  warning, and at or above y = 400 with the warning;
- ordinary and recipe rows near the same compact height unless extra quantity evidence is needed;
- exactly one persistent Add item entry;
- no shopping row intersects the action shelf at any scroll position;
- complete keyboard, focus, Undo, stale-write, reduced-motion, dark-mode, Dutch, and 200% text
  parity with the current page.

## Decisions for review

The companion HTML defaults to these recommendations and generates a forward implementation prompt.

1. **Page hierarchy:** ready-first progressive disclosure; alternative is an explicit Prepare/Shop
   switch or the current all-in-one stack.
2. **Recipe-source controls:** item details by default; alternative is one preparation panel or the
   current inline controls.
3. **Action shelf:** reserved mobile shelf plus in-flow/sticky desktop actions; alternatives keep a
   fixed overlay or move actions to the header.
4. **Unresolved AH outcome:** compact inline warning; alternatives keep the expanded card or reduce
   it to a dock badge, which is not recommended because uncertainty must remain visible.
5. **Add and terminology:** one shelf Add action and consistent “Shopping” terminology; alternatives
   retain the duplicate or standardize on “Groceries.”
6. **Single-action cards:** when a card or row has only one secondary action, render that action
   directly. Reserve an options menu for two or more genuinely distinct choices; Delete must not be
   the only command hidden behind a menu.

## Implementation order if approved

1. Characterize the current DOM order, shelf intersection, focus, Undo, and AH-warning behavior in
   focused tests.
2. Introduce the readiness summary and preparation sheet while reusing the current planned-serving
   and source-mutation controllers.
3. Simplify default rows and move lasting controls without changing their server commands.
4. Reserve shelf space, then align Add item and English terminology.
5. Re-run the repository's complete authenticated gate and the route-specific narrow, desktop,
   Dutch, dark, reduced-motion, long-content, failure, and AH mock states.
