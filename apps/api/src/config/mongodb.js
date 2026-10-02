import { MongoClient } from 'mongodb';

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
