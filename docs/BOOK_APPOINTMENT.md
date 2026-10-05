# Book Appointment screen — M1-09

M1-08's Available Sessions API is merged in local history (PR #16). M1-09 replaces the patient BookAppointment placeholder with a screen that loads hospital details and date/service-filtered sessions. M1-10’s [protected transactional booking API](BOOKING_API.md) is now implemented. M1-11’s [Confirm Appointment integration](CONFIRM_APPOINTMENT.md) is implemented. M1-12’s [Booking Confirmation screen](BOOKING_CONFIRMATION.md) is implemented. M1-13’s [booking notification producer](BOOKING_NOTIFICATIONS.md) is implemented; Member 4’s read API/screen integration remains pending. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. M1-16’s [Home search clarification](PATIENT_HOME.md) is implemented. **Next: M1-17 — improve the View OPD Sessions action.** Real login/token issuance is still pending.

## Current behavior

- Hospital Details passes `hospitalId` and the selected `serviceId` into the screen. Older callers without a service ID see all active services. Existing optional `sessionId` route data is retained for compatibility but does not select or authorize a session; users explicitly choose from the loaded list.
- The initial date is today in Asia/Colombo. Enter a real `YYYY-MM-DD` date and tap Show sessions, or use Previous day / Next day. Past dates are rejected. The heading always identifies the applied date, which can differ from an unsubmitted input draft.
- Cards show service, doctor/team, Sri Lanka time, and remaining capacity. Exactly one available session can be selected. Full sessions stay visible and disabled. Already-started sessions are hidden; the screen checks time every 30 seconds while focused and checks again when selecting.
- Date/hospital/service changes, refresh, screen refocus, and foregrounding reload data and clear selection. Discovery requests time out after 15 seconds and are cancelled on blur, backgrounding, unmount, or replacement. Booking POST lifecycle and uncertain results follow the [M1-11 handoff](CONFIRM_APPOINTMENT.md). Late responses cannot overwrite a newer selection of hospital/date.
- Loading, empty, failure, unavailable-hospital/service, retry, and pull-to-refresh states are implemented. A database/network failure does not become an empty list. Public response validation rejects incorrect IDs, date/time mismatches, inconsistent capacity, and duplicate sessions.
- Patient summary displays the validated account's name and only the final four NIC characters. Missing profile data shows an explicit unavailable message. Patient data and JWTs are not sent to public discovery endpoints or put in route parameters.
- Confirm appointment submits to the protected API when a token, account ID, patient name, and future bookable selection are present. It disables repeat taps, handles errors and uncertain outcomes, and opens confirmation only after validating a saved booking. Selecting a session alone never reserves a place.

The design uses screen 09 in `opd-high-fidelity-screens-square.html` for the session-card, radio-selection, patient-summary, and confirmation layout, with the existing theme and system fonts. Date controls, network states, missing-profile guidance, and confirmation progress and recovery states support the live data flow. Visual acceptance on a phone remains pending.

## Authentication handoff

The default startup loader still returns signed out, and guests still reach a sign-in gate before BookAppointment. Member 2's real authentication provider must supply a validated `NavigationSession` to `AppNavigator`. Its optional `patient` field accepts `{ fullName: string, nic?: string }` from the authenticated account/profile response. `AppNavigator` passes this in memory through `PatientNavigator` to the screen; user/role changes reset the navigation stack. Do not derive the patient from a URL, public environment variable, or unverified token.

This completes the screen and its integration contract; real profile loading, login, and an end-to-end booking remain pending. No authentication bypass or demo login has been added. On the current default Expo Go launch, the guest sign-in gate is expected; authenticated screen behavior is covered by automated navigation tests until the provider is connected.

## Run and phone checklist

From the repository root, with a working MongoDB connection:

```bash
npm run check:db
npm run db:seed:sessions
npm run dev:api
```

The seed prints **tomorrow's Sri Lanka date**. Existing data is preserved. In a separate terminal:

```bash
npm run dev:mobile
```

Configure `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` using your computer's LAN IP, and put the phone and computer on the same network. See [API setup](../apps/api/README.md) and [session seed instructions](SESSIONS.md).

1. As a guest, search for a demo hospital, select a service in Hospital Details, and tap View OPD sessions. Confirm patient sign-in is required.
2. After real patient authentication is connected, repeat that flow and choose the date printed by the seed (Next day for the default seed). Verify the hospital/service, two sessions, and remaining capacity.
3. Select one card, then the other. Only one radio should be selected. Verify your profile name and masked NIC; no fabricated patient details should appear.
4. Change the date, refresh, switch tabs and return, or background and reopen the app. Verify selection clears and availability reloads. Test invalid dates, empty dates, lost network, retry, and unavailable services.
5. Check full sessions are disabled and session times stay in Sri Lanka time even with a different phone timezone. Check text scaling, screen-reader labels, scrolling, keyboard use, and Back navigation.
6. With a real patient JWT and profile loaded, confirm a booking and verify the saved ID. Without them, confirmation stays disabled. Follow the [M1-11 failure/recovery checklist](CONFIRM_APPOINTMENT.md).

## Validation

All 181 mobile tests pass, including adapter validation, actual navigation, single selection, full capacity, masked/missing patient data, guest gates, date changes, cancellation/stale responses, focus/foreground refresh, and time-based expiry. TypeScript and ESLint pass. Android and iOS Metro exports pass; these are bundle checks, not physical-device acceptance or standalone native builds.

Availability is only a read-time snapshot. M1-10 identifies the patient from verified authentication and atomically rechecks duplicate booking, session status/time, hospital/service activity, and remaining capacity before creating a unique booking code. Client selection and `isBookable` are not authorization or a reservation.
