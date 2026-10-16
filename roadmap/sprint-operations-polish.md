# Sprint: Operations polish

## Goal

Make `/operacion` trustworthy at a glance and practical during a live shift. Preserve the existing store-hours, manual override, audit, and cash-close contracts. This is a UI/UX sprint; it does not deploy or change Firebase data.

Sequence agreed for the product:

1. Operations polish.
2. Metrics design and data presentation.
3. Home visual direction and redesign.

Metrics and Home remain outside this sprint. Their current design is not approved. Seeded sales visible in local screenshots are demo data and are not treated as production values.

## Calendar acceptance criteria

- Show the complete local day from 00:00 through 24:00. The visual interval must use the same scale as the time inputs.
- Keep opening and closing inputs visible and independently editable; never place them inside a clipped time block.
- Make closed days explicit and disable their time inputs without discarding the saved times.
- Keep the weekly view readable at mobile and desktop widths, with keyboard-operable controls and accessible labels.
- Validate the same-day interval and close-warning range before saving. Preserve the existing no-overnight-hours contract.
- Keep save, discard, audit reason, and server refresh behavior intact.

## Current implementation

- Replaced the 08:00–24:00 calendar scale with an accurate 00:00–24:00 weekly timeline.
- Separated the visual interval from the editable time controls and made day status explicit.
- Reduced oversized card and control radii across the Operations page to give the status, schedule, cash, and audit sections a more precise control-room feel.
- Added pure timeline math and regression cases for midnight, default business hours, late-night hours, invalid times, and overnight intervals.
- Corrected a stale cash-close unit expectation: the architecture contract and implementation both block active Web/WhatsApp orders, but one unit test still described them as warnings.

## Scope boundaries

- No backend, API, Firestore, auth, store hours configuration, delivery, or order flow changes.
- No automatic changes to seeded data or store settings.
- No Metrics or Home edits in this sprint.
- No deployment. The Firebase destination has not been confirmed.

## Validation

```bash
npm --workspace apps/admin run build
npx playwright test e2e/unit/m6j-control-room.spec.ts e2e/unit/m6j-store-hours.spec.ts --config=playwright.config.ts
git diff --check
```

## Remaining work

- Complete visual review of the full `/operacion` page at desktop and mobile widths.
- Continue operations hierarchy and cash-panel polish after the calendar review.
- Keep Metrics and Home queued in that order after Operations is accepted.
