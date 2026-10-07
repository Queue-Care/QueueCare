export const COLLECTIONS = Object.freeze({
  USERS: 'users',
  HOSPITALS: 'hospitals',
  SERVICES: 'services',
  OPD_SESSIONS: 'opdSessions',
  BOOKINGS: 'bookings',
  QUEUE_ENTRIES: 'queueEntries',
  PRIORITY_REQUESTS: 'priorityRequests',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'auditLogs',
});

export function getCollections(db) {
  return {
    users: db.collection(COLLECTIONS.USERS),
    hospitals: db.collection(COLLECTIONS.HOSPITALS),
    services: db.collection(COLLECTIONS.SERVICES),
    opdSessions: db.collection(COLLECTIONS.OPD_SESSIONS),
    bookings: db.collection(COLLECTIONS.BOOKINGS),
    queueEntries: db.collection(COLLECTIONS.QUEUE_ENTRIES),
    priorityRequests: db.collection(COLLECTIONS.PRIORITY_REQUESTS),
    notifications: db.collection(COLLECTIONS.NOTIFICATIONS),
    auditLogs: db.collection(COLLECTIONS.AUDIT_LOGS),
  };
}