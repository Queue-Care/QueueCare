# Issue and fix evidence

## M1-17-01 — make View OPD sessions the clear next action

- **Source:** README usability feedback records hesitation around the View OPD Sessions CTA; M1-17 requests clearer hierarchy and an adequate touch target.
- **Reviewed:** 2026-10-05, after PR #25. The action followed opening hours, a note, and the secondary refresh action, separate from service selection.
- **Change:** Place the full-width primary action immediately below the service choices in a highlighted panel. Show the selected service or specific selection/error/empty guidance. Move refresh after opening hours. Retain the existing 52-point minimum button height and scalable label.
- **Evidence:** `HospitalDetails.test.tsx` covers action order, touch target/scaling, selection guidance, refresh invalidation, empty/error states, correct route IDs and guest gates. All 247 mobile tests, TypeScript and Android/iOS exports pass; lint has zero errors and two pre-existing duplicate-import warnings in patient-page tests.
- **Limit:** Physical touch/layout, screen-reader behavior and participant hesitation still require the [phone checklist](../HOSPITAL_DETAILS.md#m1-17-session-action-refinement). No participant outcome is inferred from automated tests.

## M1-16-01 — clarify the first hospital-search action

- **Source:** Root README usability feedback and screen 06 of `opd-high-fidelity-screens .html`, which shows both a search-shaped entry and a Find a hospital quick-action tile.
- **Reviewed:** 2026-10-05, after PR #23. The running Home already had one search button, but it followed appointment/sign-in content; no new participant observation is claimed.
- **Change:** Place the single primary Search hospitals action before appointment content. Explain name/city search and guest browsing, add a destination hint, and keep refresh inside the appointment section.
- **Regression evidence:** Five Home navigation cases cover guest, loading, empty, error, and saved appointment states. Each exposes one enabled primary search action first and opens HospitalSearch; guests make no private appointment request. All 244 mobile tests, TypeScript, lint, and Android/iOS exports pass.
- **Limit:** Phone layout, native screen-reader order, and first-time participant acceptance remain pending. Follow the [Home checklist](../PATIENT_HOME.md).

## M1-15-01 — previous patient's route survives a direct account switch

- **Found:** 2026-10-04, automated regression in `ConfirmAppointment.test.tsx`.
- **Trigger:** Start a booking as patient A, then supply a validated patient B session without an intermediate signed-out render.
- **Observed before fix:** The pending transport was aborted, but `getCurrentRoute().name` remained `BookAppointment` instead of `PatientHome`. Keying only `Root.Navigator` did not clear state held by its parent navigation container.
- **Fix:** Key `NavigationContainer` by user ID and role, or signed-out identity. Account/role changes now discard navigation history and mounted per-account submission state. Token changes for the same identity keep the container, retaining uncertain-result recovery.
- **Regression evidence:** The new test asserts abort, return to Home, ignored late success, no old booking details read/display, and a fresh selectable booking for the second account. Existing token-replacement, sign-out and navigation tests also pass.
- **Limit:** Reproduced and verified with real navigation under React test rendering and mocked transport. Physical authenticated account-switch acceptance is still pending.
