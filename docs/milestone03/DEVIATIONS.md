# Development decisions and deviations

| Date | Area | Decision and reason | Impact | Verification |
| --- | --- | --- | --- | --- |
| 2026-09-30 | S-05 mobile development | The team explicitly selected React Native with Expo Go instead of the original React Native CLI workflow. | Use Expo SDK 57 and its compatible dependencies; run the app on a phone by scanning a QR code. Native projects are generated later for standalone builds. The backend/service stack remains unchanged. | Configuration prepared; dependency installation is blocked by the network certificate error. Checks and Expo Go phone launch are pending. |

This changes the development workflow. It does not remove the assignment's standalone installable-build requirement or approve any changes to the high-fidelity screens.
