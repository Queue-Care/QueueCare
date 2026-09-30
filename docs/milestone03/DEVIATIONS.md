# Development decisions and deviations

| Date | Area | Decision and reason | Impact | Verification |
| --- | --- | --- | --- | --- |
| 2026-09-30 | S-05 mobile development | The team explicitly selected React Native with Expo Go instead of the original React Native CLI workflow. | Use Expo SDK 57 and its compatible dependencies; run the app on a phone by scanning a QR code. Native projects are generated later for standalone builds. The backend/service stack remains unchanged. | Dependencies are installed and the user confirmed the Expo Go phone launch. Navigation checks and Android/iOS Metro exports pass; phone testing of the new navigation is pending. |

This changes the development workflow. It does not remove the assignment's standalone installable-build requirement or approve any changes to the high-fidelity screens.

## Entry-screen design awaiting prototype comparison

The high-fidelity HTML referenced by the README is absent from this checkout. Splash and Welcome use the README’s color palette and permitted system-font fallbacks; their layout, copy, and code-drawn mark are interim choices. Exact visual fidelity is unverified. Member 1 must compare them with the prototype before accepting any visual deviation. The startup loader remains explicitly signed out until Member 2 connects S-13; no completed authentication flow is claimed.
