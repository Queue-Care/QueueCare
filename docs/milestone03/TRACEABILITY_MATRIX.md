# Member 1 requirement-to-test mapping

IDs follow root README sections 21 and 33. This table covers Member 1's implemented portion only. “Automated pass” is distinct from full assessed-flow acceptance.

| Requirement / integration | Tasks | Evidence cases | Status and limits |
| --- | --- | --- | --- |
| FR-08 OPD departments | M1-06, M1-07 | M1-T02 | Automated pass; phone/visual acceptance pending |
| FR-09 Schedules | M1-08, M1-09 | M1-T03, M1-T07 | Automated pass; staff schedule-write integration belongs to Member 3 |
| FR-10 Book appointment | M1-10, M1-11 | M1-T04, M1-T06, M1-T08, M1-T11 | Automated pass; real login and phone flow pending |
| FR-11 Prevent double booking | M1-10 | M1-T05, M1-T06 | Real replica-set tests pass |
| FR-12 Unique appointment ID | M1-10, M1-12 | M1-T04, M1-T05, M1-T10 | Unique index, saved code and owner-scoped reads covered |
| FR-04 Role-based access (booking portion) | S-17, M1-10, M1-12 | M1-T08, M1-T10, M1-T11 | JWT/current-account checks covered; other protected modules need separate tests |
| NFR-05 Reliability | M1-10, M1-13 | M1-T05..M1-T09 | Capacity, duplicate and rollback behavior covered; no production failover test claimed |
| NFR-13 Accessibility | M1-14 | M1-T12 | Code/tests pass; device acceptance pending |
| NFR-14 / I-03 booking notification creation | M1-13, M4-06, M4-07 | M1-T04, M1-T09 | Persistence covered; Member 4 read/display integration pending |
| M1-15 discovery/booking regression coverage | M1-04..M1-13 | M1-T01..M1-T11 | Coverage review, added gaps and reproducible evidence complete |
| Usability feedback: clarify Home hospital search | M1-16 | M1-T13 | Single primary entry and navigation covered; phone and participant acceptance pending |
| Usability feedback: improve View OPD sessions hierarchy and touch target | M1-17 | M1-T14 | Action placement, minimum target, guidance and navigation covered; phone and participant acceptance pending |

See [functional cases](FUNCTIONAL_TEST_CASES.md) and [test setup/limits](../TESTING.md). Member 2/3/4 owners should extend this matrix with evidence from their modules; this table does not certify the whole application.
