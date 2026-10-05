# Member 1 accessibility refinements — M1-14

M1-12/M1-13 are merged through PR #19; the current branch also includes the patient frontend merge through PR #21. M1-14 reviews Patient Home, Hospital Search, Hospital Details, Book Appointment, and Booking Confirmation. Implementation and automated checks are complete; physical-device accessibility acceptance remains pending. M1-15’s [test coverage review](TESTING.md) is complete. M1-16’s [Home search clarification](PATIENT_HOME.md) is implemented. The next Member 1 task is **M1-17: improve the View OPD Sessions action**.

## Changes

- Shared action buttons have at least 52-point height and 48-point width, explicit disabled/busy state, optional contextual hints, and readable disabled labels. Font scaling remains enabled, labels wrap, and button heights can grow. All existing variants remain supported; urgent/danger variants now use a darker coral for readable text.
- Input, outline-button, and service/session-control borders use a stronger contrast token. Press feedback changes the border instead of fading text. Selected services/sessions retain text or radio-state indicators, so color is not the only signal.
- Visible refresh buttons supplement pull-to-refresh on Home, Search, Hospital Details, and Confirmation. Book Appointment already has Refresh availability. They call the same read/reload handlers; refreshing confirmation never creates a booking.
- Date navigation can wrap into separate rows on narrow screens. Date input errors are announced and included in the field hint. Confirmation explains missing authentication/profile/selection or recovery requirements through its accessibility hint, and exposes busy state during submission.
- Service/session choices keep radio semantics and selected/disabled state. Decorative radio/check glyphs and redundant spinners are hidden from screen readers. Their meaning remains available through labels, status text, and control state.
- Loading, error, empty, and result status text uses Android polite live regions. On iOS, the shared `StatusText` component announces after 400 ms so fast responses replace loading speech. Changed text, blur, and unmount cancel pending speech; background/inactive apps suppress it. The component does not move accessibility focus. Booking codes remain selectable and untruncated.

React Native documents [platform accessibility properties](https://reactnative.dev/docs/accessibility) and [announcement APIs](https://reactnative.dev/docs/accessibilityinfo). Android live regions and explicit iOS announcements are separate implementations; native-device checks are necessary for actual speech behavior.

## Contrast review

Ratios below are calculated from the shipped opaque sRGB tokens. The project checks at least 4.5:1 for normal text and 3:1 for control outlines; see [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). These measurements do not certify the entire application or replace a visual review.

| Pair | Ratio |
| --- | --- |
| White text / teal primary button | 6.41:1 |
| White text / dark teal confirmation ticket | 9.47:1 |
| Secondary text / white panel | 6.58:1 |
| Disabled text / disabled button fill | 5.56:1 |
| White text / strong coral urgent button | 6.61:1 |
| Strong coral text / coral tint danger button | 5.55:1 |
| Control border / white panel | 4.11:1 |
| Control border / mist page | 3.84:1 |
| Control border / teal tint | 3.52:1 |

## Automated checks

Verified on 2026-10-04: **237 mobile tests pass** across 17 suites, including 12 accessibility tests. TypeScript, ESLint, formatting checks, and Android/iOS Metro exports pass. No API implementation changed in M1-14; API tests were not rerun for this UI task.

Run from the repository root:

```bash
npm run test:mobile -- --watchman=false
npm run typecheck:mobile
npm run lint:mobile
```

The accessibility tests exercise VoiceOver announcement coalescing, blur/refocus, unmount and background suppression using real navigation, Android live-region behavior without duplicate explicit speech, busy-button semantics, touch-size minimums, and text/control contrast. Existing screen tests cover service/session selection, disabled submission, loading/error states, and navigation. React test rendering does not measure native layout, actual screen-reader speech, or large-font clipping.

## Expo Go acceptance checklist — pending

Use TalkBack on Android and VoiceOver on iOS. Record the device, OS, font size, screen reader, result, and any defect in the milestone evidence. Use an isolated development account/database when testing submission.

1. With the largest practical device text setting, browse Home → Hospital Search → Hospital Details at a narrow portrait width. Check long names, addresses, buttons, service rows, and scroll reachability. Repeat in landscape.
2. Swipe through focus targets. Confirm meaningful labels and order, no separate stops for decorative glyphs/spinners, and independently reachable buttons. Select a service and hear its checked state; hear why View OPD sessions is disabled before selection.
3. Submit a search, try an empty result and a connection failure, then retry. Hear result/error updates without a late announcement from a screen you have left. Activate the visible refresh button without a pull gesture.
4. With real patient authentication connected, enter an invalid appointment date. Hear the error and correction guidance. At large text size, check date buttons wrap and all session information remains visible. Confirm full sessions are announced as disabled and a selected session is announced as checked.
5. Submit one valid booking. Hear progress, then confirmation or the appropriate failure/recovery message. Check the full booking code can be read/copied and date/time are clear. Verify busy controls cannot trigger repeated submission.
6. Refresh Confirmation after changing booking/session status in a test database. Hear the current status. Test Back to Home and View booking with assistive technology; never announce a fresh success after cancellation.
7. Review keyboard coverage, focus visibility with a hardware keyboard/switch input if available, and touch targets on the actual device. Do not mark the project-wide README accessibility checklist or T-11 fully accepted until device evidence exists.

Real login/session restoration and several Member 2 backend endpoints remain pending, so authenticated end-to-end acceptance cannot yet be claimed. Member 4's notification API/screen integration is also pending. This task does not claim those dependencies are complete.
