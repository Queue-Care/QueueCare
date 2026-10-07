import { COLLECTIONS } from './collections.js';

const NAME = 'notification_user_recent';
const KEYS = { userId: 1, createdAt: -1 };

function hasRequiredKeys(index) {
  const entries = Object.entries(index.key ?? {});
  return entries.length === 2 && entries[0][0] === 'userId' && entries[0][1] === 1
    && entries[1][0] === 'createdAt' && entries[1][1] === -1;
}

function compatible(index) {
  return hasRequiredKeys(index) && !index.unique && !index.sparse && !index.hidden
    && index.partialFilterExpression === undefined && index.expireAfterSeconds === undefined
    && (index.collation === undefined || index.collation.locale === 'simple');
}

async function readIndexes(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (error.code === 26) return []; // A fresh collection does not exist yet.
    throw error;
  }
}

function equivalentIndex(indexes) {
  const relevant = indexes.filter(index => index.name === NAME || hasRequiredKeys(index));
  if (relevant.some(index => !compatible(index))) {
    throw new Error('Incompatible notification user-recent index definition.');
  }
  return relevant.find(compatible);
}

// Both startup paths accept the legacy name without dropping or rebuilding it.
export async function ensureNotificationUserRecentIndex(db) {
  const collection = db.collection(COLLECTIONS.NOTIFICATIONS);
  if (equivalentIndex(await readIndexes(collection))) return;
  try {
    await collection.createIndex(KEYS, { name: NAME });
  } catch (error) {
    if (error.code !== 85) throw error;
    // Another initializer may have created the equivalent legacy index meanwhile.
    const indexes = await readIndexes(collection);
    if (indexes.some(index => (index.name === NAME || hasRequiredKeys(index)) && !compatible(index))
      || !indexes.some(compatible)) throw error;
  }
}
