# Patient pages handoff

Implemented from the supplied high-fidelity HTML screens 02, 05, and 11–14: Welcome, Create Account, My Bookings, Booking Details, Request Priority, and Request Status. Existing Patient Home, staff screens, guest gates, and session restoration remain in place. The screens reuse the project's palette, system font fallbacks, native stack headers, and action buttons.

Welcome → Get Started → Patient opens Create Account. Registration validates full name, both Sri Lankan NIC formats, mobile, optional email, and an eight-character minimum password. Only a successful server response opens the existing VerifyMobile route; verification itself is a separate, currently placeholder screen.

The authenticated Bookings tab opens My Bookings. Selecting a booking opens details. Cancellation requires confirmation. A confirmed booking can submit a priority reason and optional note, then open Request Status. Existing requests can be opened from details when the API supplies priorityRequestId. Status supports pending, accepted, and declined, with manual refresh. Lists and details refresh on focus; requests are aborted on blur and time out after 15 seconds. Dates display in Asia/Colombo.

## Integration still required

These are frontend pages and API adapters, not implemented backend endpoints. There is no fabricated account, booking, or staff decision fallback. Registration, cancellation, and priority submission show errors if the backend is unavailable. S-13 must supply a validated patient session and accessToken to reach the Bookings tab. Guest access stays gated.

Set EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env to the backend's reachable /api/v1 URL (use the computer's LAN address for Expo Go on a phone). Never put a JWT in an EXPO_PUBLIC variable.

The API shapes are documented in API.md. Backend owners must implement these contracts or update the adapters together. The two-hour review message comes from the prototype, not a measured service guarantee. Notifications and mobile verification need their owners' implementations. The prototype's NIC is represented only by a server-provided maskedNic; do not return an unmasked NIC in booking summaries.

## Verification

Run npm run typecheck:mobile, npm run lint:mobile, and npm run test:mobile. PatientPages tests cover registration validation/submission, authentication requirements, and malformed data. Phone checks should cover keyboard scrolling, large text, Upcoming/Past, cancellation, repeated submissions, loading/errors, and pending/accepted/declined decisions against a working API. No live CRUD or physical-device fidelity claim is made by these tests.
