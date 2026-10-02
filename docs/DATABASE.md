# Database implementation status

The root README section 13 defines the planned MongoDB schemas. Currently only hospital discovery has a working repository and seed; other collections remain pending.

## Hospitals

Database selection comes from `MONGODB_DB_NAME` (default `opd_queue`). The `hospitals` documents follow README section 13.2: `_id` as ObjectId; `name`, `address`, and `city` as strings; optional `phone`, `imageUrl`, and `imagePublicId`; `isActive` as boolean; and `createdAt`/`updatedAt` as dates. There is no hospital write API or collection-level schema validator yet.

Startup and the hospital seed create these indexes idempotently:

| Index | Fields | Collation |
| --- | --- | --- |
| `hospital_active_name` | `isActive`, `name`, `_id` ascending | `en`, strength 2 |
| `hospital_active_city_name` | `isActive`, `city`, `name`, `_id` ascending | `en`, strength 2 |

The repository includes only active documents and exposes a fixed set of public fields. Name ordering ignores case and uses `_id` to break ties. Text filters are escaped before being used in regex queries. Case-insensitive substring regex search can scan the active records even with these indexes; it is intended for the small academic dataset. Review query plans before scaling. Each query has a three-second MongoDB execution limit, with a maximum page size of 50.

`npm run db:seed:hospitals` adds three clearly named fictional demo hospitals using fixed IDs and `$setOnInsert`. It neither deletes data nor overwrites existing records. No real hospital contact details are invented. See [run and seed instructions](../apps/api/README.md).
