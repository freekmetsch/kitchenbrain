# Feature List — Remove Shopping Readiness Strip

_Status: Shipped - 2026-08-02_

## Problem framing

The Shopping page shows a 59 px “Ready” strip between the page heading and the action bar. Including its spacing, it consumes about 68 px at both 375 × 812 and 1280 × 900. Its headline and item count repeat information already visible in the shopping list and Albert Heijn action. The strip's only unique job is opening Shopping setup for planned-meal portions and the weekly-list handoff.

The goal is to remove the strip completely while keeping Shopping setup one tap away, preserving synchronized portion updates, and making the first shopping items visible sooner.

## Existing system inventory

- `src/routes/shopping/+page.svelte` owns the readiness markup, derived copy, action dock, Shopping setup sheet, portion updates, and weekly-list handoff.
- `ShoppingMealPortions` remains the portion editor inside the existing non-dismissible-while-saving setup sheet.
- The sticky action dock already contains Add and Albert Heijn actions and is the natural home for a compact Setup action.
- `messages/en.json` and `messages/nl.json` own readiness and setup labels.
- Source-contract and Playwright tests cover component order, responsive geometry, portion updates, and setup-to-weekly focus handoff.
- `docs/ui-house-style.md` and `docs/SHOPPING_UX_UI_AUDIT.md` currently describe the readiness strip as the intended design.

## Scope

### In

- Remove the readiness component, its derived presentation state, styles, translations, and obsolete assertions.
- Add a direct Setup action to the existing Shopping action dock.
- Retain the setup sheet, meal-portion synchronization, pending feedback, and Manage weekly handoff.
- Verify narrow phones, desktop, Dutch, dark mode, 200% zoom, keyboard focus, handoffs, and horizontal overflow.
- Update the Shopping design documentation to match the implemented page.

### Out

- Shopping-list generation, database schema, authentication, Albert Heijn search/basket behavior, and recipe data.
- Redesigning the Shopping setup sheet or weekly-list editor.
- Changing the Add-item sheet.

## Decision

Use a direct Settings/Setup action in the sticky action dock, before Add and Albert Heijn. It has a full accessible name, `aria-haspopup="dialog"`, and `aria-expanded`. The visible label is short (`Setup` / `Instellen`) and becomes icon-only below 23 rem while retaining its accessible name and 44 px target.

This reclaims the full readiness-strip height without hiding the only unique action in an overflow menu. Saving feedback stays in the setup sheet where the change is made; the Albert Heijn action keeps its existing disabled and busy state.

### Rejected alternatives

- Remove Shopping setup and rely on Meal plan: this would regress the recently shipped synchronized portion workflow.
- Put Setup inside the Add sheet or an overflow menu: this saves little additional room and makes a recurring action harder to find.
- Keep a smaller readiness summary: it still repeats the item ledger and does not meet the request to remove the component fully.

## Execution phases

1. Remove readiness state, markup, styles, and copy; add the direct Setup action.
2. Update source-contract and browser tests for the new action bar and preserved setup behavior.
3. Correct house-style and UX audit documentation.
4. Run focused checks, full primary and secondary gates, simplify, archive this list, commit, and push the feature branch.

## Execution tickets

| Ticket | Scope and targets | Risk | Verification | Rollback |
| --- | --- | --- | --- | --- |
| SHOP-READY-01 | Remove readiness UI from `src/routes/shopping/+page.svelte`; add direct dock Setup action | R1 | Source contract; 320/375/1280 geometry; keyboard and dialog checks | Revert page and translation changes |
| SHOP-READY-02 | Remove dead readiness keys; add short EN/NL Setup label | R0 | Paraglide generation through check/build; `rg` for dead keys | Restore prior message keys |
| SHOP-READY-03 | Preserve portions, saving state, and weekly handoff in focused E2E coverage | R1 | Portion mutation tests and focus handoff | Revert test and trigger changes |
| SHOP-READY-04 | Update house style, audit, log, and archive the shipped feature list | R0 | Documentation review and archive scan | Restore prior documentation |

## Failure-mode review

| Failure mode | Prevention | Evidence required |
| --- | --- | --- |
| Shopping setup becomes unreachable | Direct dock action, not a hidden menu | Dialog opens from Setup in E2E |
| Three actions crowd at 320 px, Dutch, or 200% zoom | Short label; icon-only below 23 rem; flexible grid | No overlap or horizontal overflow |
| Portion update loses saving feedback | Sheet cannot dismiss while pending; existing busy/disabled AH state remains | Focused portion-update tests |
| Households without planned meals lose weekly access | Setup action always renders; Manage weekly stays in sheet | No-meal path and handoff checks |
| Removed UI leaves stale CSS/copy/tests | Delete by source-contract and `rg` sweep | No readiness selectors or message keys remain |
| Albert Heijn action/count regresses | Leave `visibleToBuyCount` and basket path unchanged | Existing AH UI/E2E coverage passes |

## Risk and verification matrix

| Area | Risk | Checks |
| --- | --- | --- |
| Visual density | Low | Compare first-item position; 320/375/1280; dark; Dutch; 200% zoom |
| Accessibility | Low | 44 px target, accessible name, dialog state, keyboard focus restoration |
| Interaction | Low | Setup sheet opens; portions save; weekly handoff returns focus correctly |
| Data/provider seams | None expected | No server, schema, Dutch AH lookup, or provider code changes |
| Regression | Low | `npm run check`, unit/source tests, full `npm test`, secondary E2E |

## Independent critique

Claude Opus independently identified the setup entry point and pending/saving status as the two load-bearing concerns. Both are preserved explicitly. It also flagged the UX audit as stale; that document is in scope. Recommendation: GO, subject to narrow-layout and handoff verification.

## Open questions

- Should Shopping setup remain directly reachable after removal? Default: yes. A direct dock action preserves the synchronized portion workflow without restoring the wasted vertical block.

## Completion summary

- Removed the readiness component, derived presentation state, styles, and seven obsolete EN/NL messages.
- Added an always-available direct Setup action to the existing Shopping shelf; its label collapses at 320 px while its accessible name and 44 px target remain.
- Preserved portion synchronization, pending-state protection, Manage weekly handoff, AH action state, and all shopping-list behavior.
- Rendered verification found no console errors or horizontal overflow and moved the first phone ledger section about 69 px upward.
- Passed `npm run check`, the focused source and Shopping browser checks, full `npm test` (705 unit tests, 40 primary browser cases, production build), and `npm run test:e2e:secondary` (40 secondary browser cases). Each browser suite retains one intentional connected-AH skip.

## Resume pack

- Goal: remove the Shopping readiness strip completely while preserving its unique setup capability.
- Current state: audited and plan ready; no production code changed yet.
- First command: `$run docs/feature-lists/FEATURE_LIST_SHOPPING_REMOVE_READINESS.md`.
- Main files: `src/routes/shopping/+page.svelte`, `messages/*.json`, Shopping E2E/source tests, `docs/ui-house-style.md`, and `docs/SHOPPING_UX_UI_AUDIT.md`.
- Verification: focused diagnostics and E2E, then full primary and secondary test gates.
- Open question default: keep Setup as a direct dock action.
