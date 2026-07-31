# Household Work Surfaces — Design Shotgun

_Status: Shipped — 2026-07-31_

Risk: R2 — responsive presentation and interaction composition only; no schema, auth, household-data,
provider, shopping derivation, or Albert Heijn request changes

Artifact:
docs/artifacts/archive/2026-07-31-design-shotgun-household-work-surfaces.html

## Decision

Choose one coherent refinement, or a named mix of refinements, for the Meal plan, Recipes, Stock,
and Review AH order surfaces. The result must be more compact and calmer while remaining recognizably
Keukenbrein.

The most important choice is how far to push density. The recommended answer is not the smallest
possible interface. It is a two-line object rhythm: the first line identifies the object and its
essential quantity; the second line holds the current choice and the next useful action. Extra
explanation and rare choices appear only on demand.

## Grounded baseline

The exploration is based on origin/main at ac3a1a1 after the shipped Deep Grove and Recipe Rotation
work.

The durable house style in docs/ui-house-style.md is authoritative:

- Soft Utility content inside one Deep Grove chassis using Grove #344f3e.
- Green identity ribbon and visually continuous green utility band.
- Warm paper and charcoal work surfaces, clay primary actions, and quiet Grove outlines.
- Clean sans-serif type, 4/8/12 spacing, 8 px control corners, and 14 px work-surface corners.
- Native controls, visible focus, 44 CSS px targets, and responsive checks at 320, 393, 768, and
  1280 px.
- Independent Meals, Recipes, and Stock items retain their own boundaries.
- Status is passive dot plus text. Filters are interactive controls with selected state.
- Recipe imagery is optional; no placeholder block appears when an image is absent.
- Warning wash is reserved for genuine risk or ambiguity.

The current implementation creates the following pressure:

- Meal plan separates Add meal in the identity ribbon from Shopping and overflow in the week band.
  Delivery is passive text even though Shopping is the useful destination.
- Planned-meal cards can occupy three visual lines because servings, batch size, and Serve/Cook are
  stacked below the title.
- Recommended shortlist repeats a board heading, lane heading, and explanatory sentence before the
  candidate.
- Recipe filters form a horizontally scrolling rail on phones.
- Recipe cards are functional but spread metadata over a loose wrap and reserve a full footer for
  two equal actions.
- Stock has a useful green utility band, but search, scope, and all detailed filters move below it;
  detailed filters always open a sheet.
- Stock cards can show an ageing dot, review dot, freezer or pantry emoji, food-class emoji, status
  dots, warning icon, and action icon in one compact object.
- Review AH order uses generous nested cards and exposes quantity, favorite, alternate-product,
  text, skip, and warning controls at similar visual weight.

## Narrow house-style evolution

The current style guide says the identity ribbon normally owns at most one highest-value action.
The Meal plan request needs three adjacent affordances. This exploration treats that as one narrow
exception:

- one clay primary action: Add meal;
- one compact delivery action that is also the Shopping link;
- one quiet overflow action.

The exception does not turn the ribbon into a general toolbar. Stock search and filter controls use
the visually continuous green utility band, not the identity row.

## Non-negotiable behavior

### Meal plan

- Delivery Tue 28 Jul becomes the Shopping destination when a delivery date exists; Shopping remains
  the fallback label when it does not.
- Add meal, delivery/shopping, and overflow sit in one compact top action group.
- Every ordinary planned-meal card has two visual rows.
- Row one carries completion, meal title, and portions near the left side.
- Row two places the batch/options control beside the Serve/Cook choice.
- Day planning, cooked state, pending state, remove, and long-title behavior remain available.
- Recommended shortlist uses a maximum of two introductory text rows. Freezer low and its explanation
  become one concise line such as Freezer low · below target.

### Recipes

- No filter control requires horizontal page or rail scrolling at any supported width.
- Desktop may expose all filter groups at once.
- Phone uses wrapping status toggles plus native select controls for long or dynamic categories.
- Search, sort, four status filters, food type, dish type, active-filter visibility, clear, URL state,
  Back/Forward, and keyboard behavior remain.
- Cards remain useful with and without images, with long titles, multiple statuses, and English or
  Dutch labels.
- Plan and Make remain distinct actions, but they do not need a full-height footer when a more compact
  arrangement stays clear.

### Stock

- Add item remains the clay primary action.
- Ready-meal and below-target outcomes, activity, search, scope, section, food class, review-only, and
  clear remain available.
- Desktop shows scope and detailed filters without a Filters sheet.
- Phone uses labeled native dropdowns for Section and Food type plus a compact review toggle.
- Search and the highest-value outcomes may move into the green utility band.
- Each ordinary Stock card uses at most one leading visual signal. Text carries section, class,
  staple, expiry, relationship, and review meaning.
- Quantity controls remain visible and every repair/review path remains reachable.

### Review AH order

- Product, free-text, skipped, unresolved, low-confidence, favorite, incompatible-quantity, alternate,
  stale, failure, sending, and success states remain.
- The default view emphasizes ingredient, selected product, price, pack count, and whether attention
  is needed.
- Alternate candidates and household-favorite management use disclosure instead of equal prominence.
- A compact sticky summary keeps product/text/skipped counts and the Send to AH action visible.
- No real Albert Heijn request, Dutch-field seam, preview token, or write behavior changes.

## Five complete directions

Every direction uses the same example content and supports phone and desktop layouts.

### A — Calm Ledger

Visual thesis: quiet two-line objects with one strong reading path and rare choices behind disclosure.

Main strength: closest to the current house style and easiest to scan repeatedly.

Main trade-off: less imagery and fewer at-a-glance secondary facts.

Optimizes: frequent household maintenance with low cognitive load.

Key moves:

- Meal title and portion stepper share row one; day, batch, and Serve/Cook share row two.
- Recipe filters use a responsive field grid; recipe cards are compact horizontal objects.
- Stock metadata becomes one plain text sentence with a single urgency bar only when needed.
- AH items are compact accordion rows with the selected product always visible.

### B — Grove Console

Visual thesis: use the green utility band as a compact command surface, then keep paper objects very
simple.

Main strength: makes search, outcomes, and filters immediately available without stealing body space.

Main trade-off: the green band becomes busier and needs careful long-label wrapping.

Optimizes: switching scopes and filters often.

Key moves:

- Meal week, delivery, and actions form one compact green console.
- Recipe filters use a strict responsive grid: four status keys plus two selects, never a rail.
- Stock moves outcomes, search, scope, and desktop filters into the green utility band.
- AH review starts with a green summary strip and dense selected-product rows.

### C — Paper Shelf

Visual thesis: warm, image-aware shelf cards with restrained editorial polish.

Main strength: the prettiest Recipe direction while preserving useful density.

Main trade-off: imagery creates slightly more height and image quality has greater visual impact.

Optimizes: browsing and choosing meals.

Key moves:

- Meal cards use a small day marker and a paper shelf split.
- Recipe filters are grouped in a two-tier shelf; cards use a shallow image strip or compact thumbnail.
- Stock cards use typographic category labels and warm paper layers instead of dots or emoji.
- AH review resembles a calm grocery receipt with product thumbnails only where helpful.

### D — Triage First

Visual thesis: show what needs a decision; compress settled work.

Main strength: best for the AH review and low-stock/review workflows.

Main trade-off: less neutral as a general browsing surface because attention states shape the layout.

Optimizes: resolving exceptions quickly.

Key moves:

- Meal cards keep ordinary choices quiet and surface only source or quantity conflicts.
- Recipe filters put Below target and In rotation first; recipe cards emphasize the next useful action.
- Stock separates Needs attention from All good without adding icon noise.
- AH groups Needs a look above Confirmed; confirmed rows collapse to a single dense line.

### E — Quiet Table

Visual thesis: table-like alignment on desktop with the same fields becoming two-line definition rows
on phone.

Main strength: maximum comparison density and strongest numeric alignment.

Main trade-off: more utilitarian and less warm than the other directions.

Optimizes: large collections and desktop use.

Key moves:

- Meal plan uses aligned columns inside independent two-line rows.
- Recipe filters become a compact form header and recipes become border-separated object rows.
- Stock uses stable quantity and status columns with one textual exception cell.
- AH review aligns ingredient, selection, packs, and price like a purchasing table.

## Recommendation

Use a composite built from the strongest house-style-compatible part of each direction:

| Surface | Recommended source | Why |
|---|---|---|
| Meal plan | A — Calm Ledger | It satisfies the exact two-row requirement with the least visual churn. |
| Recipe filters | B — Grove Console | A responsive grid and native selects eliminate horizontal scrolling at every width. |
| Recipe cards | C — Paper Shelf | It is visibly prettier without returning to tall marketing cards. |
| Stock header and filters | B — Grove Console | It makes the underused green utility area useful and removes the all-width filter sheet. |
| Stock cards | A — Calm Ledger | One signal plus plain metadata directly addresses the dot and icon overload. |
| Review AH order | D — Triage First | Confirmed matches compress while unresolved and quantity-risk items stay explicit. |

If implementation simplicity is more important than the best surface-by-surface fit, choose A —
Calm Ledger for every surface. It changes the fewest concepts and is the safest whole direction.

## Pressure-test findings

### Long copy and narrow screens

At 320 px, Add meal retains its label. The delivery action may shorten from Delivery Tue 28 Jul to
Tue 28 Jul while keeping the full accessible name. Overflow remains a 44 px target. Recipe and Stock
filter groups stack; they do not clip or create a horizontal rail.

### Too many dynamic dish types

Rendering every dish type as a chip cannot guarantee fit. All five directions therefore use a
labeled Dish type select on phone. Directions A, B, and E also use a select on desktop; C and D may
show a short curated row plus More, but the selected value remains visible and the full set stays in
one menu.

### Optional images

Recipe and AH layouts do not reserve a blank image box. No-image objects promote text into the freed
space. Poor or missing imagery therefore does not break alignment.

### Status versus action

Status text does not become a clickable pill. Filters remain buttons or native selects. Ageing,
review, low stock, and ambiguous AH quantity use words and at most one semantic wash or marker.

### Forty-four-pixel targets versus visual density

Controls may look 32–36 px tall inside a 44 px hit area. Density comes from shared hit areas,
two-line composition, alignment, and disclosure—not from making targets too small.

### Failure and recovery

The AH footer never enables Send while an explicit decision or quantity confirmation is unresolved.
Stale preview, connection failure, uncertain send, and not-connected states replace the item ledger
with one plain recovery notice and one clear next action.

## Decisions carried by the HTML

The HTML stores choices locally and generates a forward handoff for the implementation plan. An
untouched artifact accepts the recommended composite above.

Decisions:

1. Whole-direction baseline: Calm Ledger is recommended if a single direction is required.
2. Meal-plan composition: A — Calm Ledger recommended.
3. Recipe-filter composition: B — Grove Console recommended.
4. Recipe-card composition: C — Paper Shelf recommended.
5. Stock header/filter composition: B — Grove Console recommended.
6. Stock-card composition: A — Calm Ledger recommended.
7. Review AH order composition: D — Triage First recommended.
8. House-style exception: accept the narrow three-affordance Meal plan action group.

Each decision may be accepted, overridden, excluded, or clarified with a verbatim note.

## Shipped result

The recommended composite was implemented without changing schema, auth, household data, Shopping
derivation, preview tokens, AH request payloads, or the Dutch-field seam:

- Meal plan uses the three-affordance ribbon exception, delivery as the Shopping destination,
  two-row meal cards, title-adjacent portions, and a two-line shortlist introduction.
- Recipes use a no-scroll status/select filter grid and compact Paper Shelf cards with prioritized
  metadata plus distinct Plan and Make actions.
- Stock outcomes, search, scope, and visible native filters share the green utility band. The old
  Filters sheet was removed; cards use text metadata and at most one urgency marker.
- Review AH order groups unresolved/unconfirmed/unreviewed low-confidence choices above compact
  confirmed rows, with details disclosure and a sticky send summary.

The house-style source contract and authenticated Playwright coverage now guard these decisions at
320, 393, 768, and 1280 px.

## Original implementation boundary

The design exploration did not itself authorize production changes. Freek later invoked `$run` on
the recommended composite. No schema, migration, auth, household-data, provider, Dutch shopping
derivation, or AH request change was needed; at beta this remained ordinary code-only R2 work.
