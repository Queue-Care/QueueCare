# Issue and fix evidence

## M1-15-01 — previous patient's route survives a direct account switch

- **Found:** 2026-10-04, automated regression in `ConfirmAppointment.test.tsx`.
- **Trigger:** Start a booking as patient A, then supply a validated patient B session without an intermediate signed-out render.
- **Observed before fix:** The pending transport was aborted, but `getCurrentRoute().name` remained `BookAppointment` instead of `PatientHome`. Keying only `Root.Navigator` did not clear state held by its parent navigation container.
- **Fix:** Key `NavigationContainer` by user ID and role, or signed-out identity. Account/role changes now discard navigation history and mounted per-account submission state. Token changes for the same identity keep the container, retaining uncertain-result recovery.
- **Regression evidence:** The new test asserts abort, return to Home, ignored late success, no old booking details read/display, and a fresh selectable booking for the second account. Existing token-replacement, sign-out and navigation tests also pass.
- **Limit:** Reproduced and verified with real navigation under React test rendering and mocked transport. Physical authenticated account-switch acceptance is still pending.
