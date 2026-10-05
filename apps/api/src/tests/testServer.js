import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectMongo } from '../config/mongodb.js';

export async function startHttp(t, app) {
  const server = createServer(app);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

export async function startMongo(t, { replicaSet = false } = {}) {
  // Never connect to a developer's configured database. Each run owns a new directory and process.
  const directory = await mkdtemp(join(tmpdir(), 'queuecare-api-test-'));
  let child;
  let connection;
  t.after(async () => {
    try {
      if (connection) await connection.client.close();
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
        try {
          await exited;
        } finally {
          clearTimeout(timeout);
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  child = spawn(
    process.env.MONGOD_BINARY || 'mongod',
    [
      '--dbpath',
      directory,
      '--bind_ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--nounixsocket',
      '--quiet',
      ...(replicaSet ? ['--replSet', 'queuecareTest'] : []),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(
      () =>
        finish(
          new Error(`Temporary MongoDB did not start: ${output.slice(-1000)}`)
        ),
      20000
    );
    function finish(error) {
      clearTimeout(timeout);
      child.off('error', failed);
      child.off('exit', exited);
      child.stdout.off('data', read);
      child.stderr.off('data', read);
      error ? reject(error) : resolve();
    }
    function failed(error) {
      finish(
        new Error(
          `Install MongoDB or set MONGOD_BINARY to run API integration tests: ${error.message}`
        )
      );
    }
    function exited(code) {
      finish(
        new Error(`Temporary MongoDB exited (${code}): ${output.slice(-1000)}`)
      );
    }
    function read(chunk) {
      output = (output + chunk.toString()).slice(-10000);
      if (output.includes('Waiting for connections')) finish();
    }
    child.on('error', failed);
    child.on('exit', exited);
    child.stdout.on('data', read);
    child.stderr.on('data', read);
  });
  // Drain logs after startup so the child cannot block on a full pipe.
  child.stdout.resume();
  child.stderr.resume();
  const config = {
    mongoUri: `mongodb://127.0.0.1:${port}${
      replicaSet ? '/?directConnection=true' : ''
    }`,
    dbName: 'queuecare_test',
  };
  connection = await connectMongo(config);
  if (replicaSet) {
    await connection.db.admin().command({
      replSetInitiate: {
        _id: 'queuecareTest',
        members: [{ _id: 0, host: `127.0.0.1:${port}` }],
      },
    });
    const deadline = Date.now() + 20000;
    while (
      !(await connection.db.admin().command({ hello: 1 })).isWritablePrimary
    ) {
      if (Date.now() > deadline)
        throw new Error('Temporary replica set did not elect a primary.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return { db: connection.db, client: connection.client, config };
}
