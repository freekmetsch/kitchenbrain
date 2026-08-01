# Stock and Recipe Header Design Shotgun

**Status:** Archived — superseded by the focused Joined Command Bar exploration
**Date:** 2026-08-01
**Scope:** `/inventory`, `/recipes`, and `/recipes/[slug]` headers only

## Outcome sought

Create one recognisable header family for Stock, Recipes, and individual recipes that:

- uses materially less vertical space on phones;
- feels calmer and less dominant on phone and desktop;
- preserves the current UX, labels, actions, state, and route behavior;
- makes route identity, contextual information, and tools read as three distinct roles;
- leaves menu and overflow polish until the structure is chosen.

The header redesign is presentation-only. Search, sort, Stock quick views, History, Add, New meal,
Import, Back, Plan, Edit, translation recovery, and existing recipe overflow actions remain
available. Filter chips and the content below the header are shown only to judge the boundary; they
are not redesigned here.

## Grounded current-state evidence

The current responsive app was inspected with the repository's isolated Playwright account at
393 × 852 and 1280 × 900.

- Stock places route identity and two large outcome tiles inside one full-width olive field. On
  desktop the title sits at the far left while actions and outcomes occupy the far right, leaving a
  large inactive middle. On phone the two outcome tiles become the visually strongest objects.
- Recipes places identity, two actions, search, and sort inside the olive field, then immediately
  follows it with a second full-width filter rail. The controls are useful, but the combined stack
  reads as one large block before any recipe appears.
- Recipe detail uses a separate white utility bar with Back, title, Plan, Edit, and conditional
  overflow. Metadata, freezer status, suggestions, view controls, and language controls then form
  several adjacent bands. Its behavior is sound, but it does not belong to the same header family.
- The shared `KitchenPageHeader` currently owns the olive identity field for Stock and Recipes;
  `RecipeHeader` owns the separate detail header. Shared tokens already provide warm paper, deep
  olive, honey, terra, serif display type, 44 px targets, and responsive content widths.

## Non-negotiable interaction inventory

| Surface | Identity | Header actions | Context carried near the header |
|---|---|---|---|
| Stock | Household / Stock | History, Add | Ready-meal quick view, target status |
| Recipes | Cookbook / Recipes | New meal, Import | Search, sort |
| Recipe detail | Back / recipe title | Plan, Edit, conditional More | Servings, time, freezer status; translation status when needed |

Actions may move between identity and utility regions, but they are not removed or renamed in this
exploration. Tap targets remain at least 44 px even when the visible treatment is compact. Long
Dutch labels, long recipe titles, attention states, dark theme, keyboard focus, 200% equivalent
reflow, and safe-area padding remain implementation requirements.

## Five complete directions

### A. Green Ribbon — recommended

A narrow, full-width olive identity ribbon carries the eyebrow, title, and route actions. A separate
warm-paper utility shelf carries Stock outcomes, Recipe search/sort, or recipe metadata. On phone,
both rows stay compact and stack only when copy genuinely needs it.

- **Main strength:** clearest shared grammar with a much smaller green footprint.
- **Main trade-off:** still uses a full-width color band, though only for identity and actions.
- **Optimizes:** recognition, calm hierarchy, and low-risk migration from the current component.

### B. Paper Ledger

The header becomes a paper surface with a narrow olive rule and small olive route marker. Identity,
actions, and utilities share the page material instead of sitting in a colored slab.

- **Main strength:** calmest option and the easiest fit for recipe detail.
- **Main trade-off:** loses some of the strong route landmark provided by the current green field.
- **Optimizes:** low visual weight, reading flow, and continuity with content.

### C. Split Block

On desktop, a bounded olive identity block sits beside a wider paper command block. On phone, the
identity block becomes a short top row while the command block stays neutral below it.

- **Main strength:** preserves a strong Keukenbrein signature without painting the whole viewport.
- **Main trade-off:** has the most breakpoint-specific composition and therefore the most layout
  rules to maintain.
- **Optimizes:** desktop balance and clear separation between “where am I?” and “what can I do?”.

### D. Command Line

Desktop compresses identity, actions, and route utility into one continuous olive console. Phone
uses one identity row and one compact dark utility row, both within the same material.

- **Main strength:** densest and most operational; content starts earliest.
- **Main trade-off:** controls compete with identity and the green treatment remains comparatively
  intense.
- **Optimizes:** frequent expert use and minimum vertical height.

### E. Floating Workbench

A shallow olive backplane sits behind a single raised paper workbench containing title, actions,
and contextual controls. The workbench overlaps the page rather than forming a full-width slab.

- **Main strength:** softens the green while keeping a distinctive header object.
- **Main trade-off:** adds elevation and a container, which can feel more decorative than the
  ledger-like content below.
- **Optimizes:** a welcoming visual transition and a bounded focus area.

## Recommendation and assumptions

Choose **A. Green Ribbon** as the base. It directly answers all three goals while reusing the shared
header seam: one compact identity row across the routes, then one route-specific paper utility
shelf. Borrow Paper Ledger's quiet rule treatment for dividers and Split Block's bounded desktop
spacing only if the full-width ribbon still feels too branded after a real implementation pass.

This recommendation assumes the olive route identity remains desirable, current actions should
stay visibly discoverable until the later menu pass, and the useful Stock outcomes should remain
one-tap quick views rather than becoming passive copy. A preference for an almost colorless app
would change the recommendation to Paper Ledger. A preference for maximum operational density
would change it to Command Line.

## Selection needed

1. Choose one direction or name a composite using the lettered directions.
2. Choose how much green should remain: narrow ribbon, bounded marker, or dark console.
3. Confirm whether all current primary/secondary actions should stay visible during the structural
   pass. The recommendation is yes; overflow/menu polish can follow once the layout is stable.

The companion decision workspace renders all five directions with the same Stock, Recipes, and
recipe-detail content at phone and desktop widths, including long Dutch and attention states.

## Implementation boundary after selection

The selected pass should remain R2 presentation work: shared header structure/styles and the three
callers, with no schema, auth, persisted-data, provider, Albert Heijn, shopping derivation, or
deployment change. It should be verified at 320, 393, 768, and 1280 px; English and Dutch; light and
dark; normal, long-copy, attention, translation, and conditional-overflow states; keyboard and
touch; and 200% equivalent reflow. Production routes are intentionally unchanged by this shotgun.
