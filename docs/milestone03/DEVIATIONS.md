# Development decisions and deviations

| Date | Area | Decision and reason | Impact | Verification |
| --- | --- | --- | --- | --- |
| 2026-09-30 | S-05 mobile development | The team explicitly selected React Native with Expo Go instead of the original React Native CLI workflow. | Use Expo SDK 57 and its compatible dependencies; run the app on a phone by scanning a QR code. Native projects are generated later for standalone builds. The backend/service stack remains unchanged. | Dependencies are installed and the user confirmed the Expo Go phone launch. Navigation checks and Android/iOS Metro exports pass; phone testing of the new navigation is pending. |

This changes the development workflow. It does not remove the assignment's standalone installable-build requirement or approve any changes to the high-fidelity screens.

## M1-17 — session action beside service selection

On 2026-10-05, View OPD sessions moves from the bottom of Hospital Details to immediately below the service choices, before opening hours and secondary refresh. This implements the README's explicit CTA usability feedback. The current prototype remains unchanged; existing colors, rounded button, 52-point minimum height and scalable type are retained. Selected-service guidance clarifies the action without promising capacity or reserving a place. Automated checks pass; [phone/participant acceptance](../HOSPITAL_DETAILS.md#m1-17-session-action-refinement) remains pending.

## M1-16 — Home search hierarchy

On 2026-10-05, the current prototype is `opd-high-fidelity-screens .html` (PR #23). Its Home has a search-shaped entry and a Find a hospital quick-action tile. Following the README's explicit M1-16 usability feedback, the app keeps one Search hospitals button and now places it before appointment content, explains name/city and guest browsing, and groups appointment refresh with its section. Existing design tokens are retained. Five automated navigation regressions pass; the [Home checklist](../PATIENT_HOME.md) still requires phone and first-time user acceptance. Historical prototype references below describe the earlier implementation stage.

## Entry-screen design awaiting prototype comparison

The high-fidelity HTML was absent when the entry screens were built and is now present as `opd-high-fidelity-screens-square.html` after the develop merge. Splash and Welcome use the README’s color palette and permitted system-font fallbacks; their layout, copy, and code-drawn mark are interim choices. Exact visual fidelity is unverified. Member 1 must compare them with the prototype before accepting any visual deviation. The startup loader remains explicitly signed out until Member 2 connects S-13; no completed authentication flow is claimed.

## M1-07 hospital details — interim data and flow limitations

Screen 08's title/address, service list, opening-hours panel, explanatory note, and primary CTA are implemented. Square panels follow the merged prototype; the CTA reuses the existing rounded ActionButton and permitted system-font fallbacks. Device visual comparison is pending.

As of 2026-10-06, the hospital schema supports optional `openingHours` display text (1–500 characters after trimming). The details API and screen show stored values, or the missing-hours message for absent/invalid data. New Demo Central seeds have explicitly fictional hours; real hospital hours still require verified data. Hours are not an open-now calculation and do not determine booking eligibility. M1-08 now supplies sessions and capacity through a separate endpoint; session-count and “Full today” badges still need mobile integration. Service rows instead expose a single accessible selection state, and the CTA requires a selection. A listed service does not imply appointment availability.

The next route receives the selected hospital/service IDs. M1-09 now implements date/session selection and capacity; M1-11 now enables confirmation for a validated patient token/profile and available selection. M1-12 now loads the full persisted booking summary, including hospital/service and Asia/Colombo date/time, with current booking/session states. Notification/reminder promises from the prototype are omitted while those features remain pending. Member 2’s booking list/details screens remain placeholders. Patient summary uses the validated session profile when supplied, with an unavailable fallback while authentication/profile integration is pending. Guests encounter the existing sign-in gate. This records current implementation limits, not approval to omit these features from the final release.
