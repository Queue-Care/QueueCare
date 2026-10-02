const { MongoClient } = require('mongodb');

let client;
let database;

async function connectToMongoDB() {
  const mongoUri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB_NAME || 'queuecare';

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured.');
  }

  if (database) {
    return database;
  }

  client = new MongoClient(mongoUri);

  await client.connect();

  database = client.db(databaseName);

  console.log(`MongoDB connected: ${databaseName}`);

  return database;
}

function getDatabase() {
  if (!database) {
    throw new Error(
      'MongoDB has not been connected. Call connectToMongoDB() first.'
    );
  }

  return database;
}

async function closeMongoDB() {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
  }
}

module.exports = {
  connectToMongoDB,
  getDatabase,
  closeMongoDB,
};