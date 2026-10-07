import { connectToMongoDB, closeMongoDB } from './mongodb.js';
import { createIndexes } from './indexes.js';

async function setupDatabase() {
  try {
    const db = await connectToMongoDB();

    await createIndexes(db);

    console.log('QueueCare database setup completed');
  } catch (error) {
    console.error('Database setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    await closeMongoDB();
  }
}

await setupDatabase();