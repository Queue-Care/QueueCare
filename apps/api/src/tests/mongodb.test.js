import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  connectToMongoDB,
  getDatabase,
  closeMongoDB,
} from '../config/mongodb.js';
import { startMongo } from './testServer.js';

test(
  'merged shared MongoDB helpers reuse one connection and preserve isolated connections',
  { timeout: 40000 },
  async (t) => {
    const { db, config } = await startMongo(t);
    t.after(closeMongoDB);
    assert.throws(getDatabase, /has not been connected/);
    // A failed connection must not leave a cached rejected promise.
    await assert.rejects(
      connectToMongoDB({ ...config, mongoUri: 'invalid://host' })
    );
    const [first, second] = await Promise.all([
      connectToMongoDB(config),
      connectToMongoDB(config),
    ]);
    assert.equal(first, second);
    assert.equal(getDatabase(), first);
    assert.equal(await connectToMongoDB(config), first);
    assert.equal(first.databaseName, config.dbName);
    await db.collection('connection_probe').insertOne({ value: 'shared' });
    assert.equal(
      await first
        .collection('connection_probe')
        .countDocuments({ value: 'shared' }),
      1
    );
    await closeMongoDB();
    assert.throws(getDatabase, /has not been connected/);
    // Closing the shared helper must not close the server/test-owned connection.
    assert.equal((await db.command({ ping: 1 })).ok, 1);
    const reopened = await connectToMongoDB(config);
    assert.notEqual(reopened, first);
    assert.equal((await reopened.command({ ping: 1 })).ok, 1);
    await closeMongoDB();
    await closeMongoDB();
  }
);
