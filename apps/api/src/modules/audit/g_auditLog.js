import { ObjectId } from 'mongodb';

// README 13.10: important staff actions are kept in the auditLogs collection.
export async function writeAuditLog(
  db,
  {
    actorUserId = null,
    action,
    entityType,
    entityId,
    metadata = {},
    ipAddress = null,
    createdAt = new Date(),
  },
  options = {}
) {
  await db.collection('auditLogs').insertOne(
    {
      _id: new ObjectId(),
      actorUserId,
      action,
      entityType,
      entityId: String(entityId),
      metadata,
      ipAddress,
      createdAt,
    },
    options
  );
}
