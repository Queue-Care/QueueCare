# Database implementation status

The root README section 13 defines the planned MongoDB schemas. Hospital discovery and OPD service catalogs now have working repositories/indexes and seeds; other collections remain pending.

## Hospitals

Database selection comes from `MONGODB_DB_NAME` (default `opd_queue`). The `hospitals` documents follow README section 13.2: `_id` as ObjectId; `name`, `address`, and `city` as strings; optional `phone`, `imageUrl`, and `imagePublicId`; `isActive` as boolean; and `createdAt`/`updatedAt` as dates. There is no hospital write API or collection-level schema validator yet.

Startup and the hospital seed create these indexes idempotently:

| Index | Fields | Collation |
| --- | --- | --- |
| `hospital_active_name` | `isActive`, `name`, `_id` ascending | `en`, strength 2 |
| `hospital_active_city_name` | `isActive`, `city`, `name`, `_id` ascending | `en`, strength 2 |

The repository includes only active documents and exposes a fixed set of public fields. Name ordering ignores case and uses `_id` to break ties. Text filters are escaped before being used in regex queries. Case-insensitive substring regex search can scan the active records even with these indexes; it is intended for the small academic dataset. Review query plans before scaling. Each query has a three-second MongoDB execution limit, with a maximum page size of 50.

`npm run db:seed:hospitals` adds three clearly named fictional demo hospitals using fixed IDs and `$setOnInsert`. It neither deletes data nor overwrites existing records. No real hospital contact details are invented. See [run and seed instructions](../apps/api/README.md).

## OPD services — M1-06

The `opdServices` documents follow README section 13.3: `_id` and `hospitalId` as ObjectIds, `name` as a string, `isActive` as a boolean, and `createdAt`/`updatedAt` as dates. There is no service write endpoint or database schema validator yet.

Startup/seed index setup also creates `service_hospital_active_name` on `{ hospitalId: 1, isActive: 1, name: 1, _id: 1 }`, with `en` collation at strength 2. The service read first verifies the parent is active, then reads only that hospital's active services with a three-second query execution limit. The response exposes only `_id`, `hospitalId`, and `name`.

`npm run db:seed:discovery` extends the explicit hospital seed with six fictional service records, using fixed IDs and `$setOnInsert`. Missing/inactive demo parents are skipped. Reruns preserve service edits and existing records. Services do not imply open sessions or available booking capacity. Opening hours are not yet represented in the hospital schema.
