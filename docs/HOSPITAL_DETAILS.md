# M1-06 — Hospital details/services API handoff

M1-04 search and M1-05 mobile search are implemented and their merge is complete. M1-06 now adds public hospital details and the hospital's active OPD service catalog. The mobile Hospital Details route is still a placeholder; building that screen is **M1-07**, the next Member 1 task.

## Run and check

Run commands in the **QueueCare repository root**. Configure the database using [API setup](../apps/api/README.md); retain an existing `apps/api/.env` rather than overwriting it.

```bash
npm run check:db
```

After the connection check succeeds, optionally add the fictional discovery dataset and start the server:

```bash
npm run db:seed:discovery
npm run dev:api
```

The discovery seed inserts missing demo hospitals plus two services for each active demo hospital (six services across the three hospitals). It preserves existing data and edits, including deactivated services. It skips services whose demo parent is missing or inactive. The existing `db:seed:hospitals` command remains hospital-only. No database seeding happens automatically at startup.

In another terminal, or by opening the URLs in a browser:

```bash
curl http://localhost:4000/api/v1/hospitals/000000000000000000000101
curl http://localhost:4000/api/v1/hospitals/000000000000000000000101/services
```

The complete response and error contract is in [API.md](API.md). IDs above are fixed fictional demo IDs; use the `_id` returned by search for other records. No new packages are needed for this task.

## M1-07 integration

- Read `route.params.hospitalId`, which Hospital Search already supplies. Load details and services from the two endpoints; neither requires a JWT.
- Preserve separate loading, failure, unavailable-hospital, and empty-service states. Retry failed requests and cancel them when navigating away.
- Use names, addresses, contact fields, and services from the database. Do not copy the prototype's real hospital contact information or static availability badges into live responses.
- The merged `opd-high-fidelity-screens-square.html`, screen 08, is now available as the layout reference. It includes opening hours and session-count/full badges. The current schema does not store opening hours; M1-07 must either display an honest unavailable-hours state or add a documented optional field backed by supplied data. Session counts/capacity require M1-08's session implementation.
- The service catalog is not evidence that appointments can be booked. Session discovery and booking creation remain M1-08 onward, with authentication work owned separately.

## Verification

On 2026-10-02, all **27 API tests passed**, including real temporary MongoDB and HTTP coverage for details, active-parent/service filtering, stable ordering, public-field projection, ID/query validation, empty and not-found states, safe database errors, service indexes, and repeatable seeds. Existing hospital search and shared connection tests also pass.

Tests create isolated databases and do not modify or verify the configured Atlas/development database. The earlier Atlas connection issue must be checked separately with `npm run check:db`. Live phone acceptance follows once M1-07 is connected.
