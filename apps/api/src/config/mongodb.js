import { MongoClient } from 'mongodb';
import { readConfig } from './env.js';

export async function connectMongo({ mongoUri, dbName }) {
  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    return { client, db };
  } catch (error) {
    await client.close();
    throw error;
  }
}

// Shared connection API from develop, using the same ESM/configuration contract.
// connectMongo remains available for callers that own an isolated connection.
let sharedConnection;
let pendingConnection;

export async function connectToMongoDB(config = readConfig()) {
  if (sharedConnection) return sharedConnection.db;
  if (!pendingConnection) {
    pendingConnection = connectMongo(config)
      .then((connection) => {
        sharedConnection = connection;
        return connection;
      })
      .finally(() => {
        pendingConnection = undefined;
      });
  }
  return (await pendingConnection).db;
}

export function getDatabase() {
  if (!sharedConnection) {
    throw new Error(
      'MongoDB has not been connected. Call connectToMongoDB() first.'
    );
  }

  return sharedConnection.db;
}

export async function closeMongoDB() {
  if (pendingConnection) await pendingConnection;
  if (sharedConnection) {
    await sharedConnection.client.close();
    sharedConnection = undefined;
  }
}
