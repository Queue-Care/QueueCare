import { readConfig } from './env.js';
import { connectMongo } from './mongodb.js';
import { connectionDiagnostic } from './connectionDiagnostic.js';

let connection;
try {
  const config = readConfig();
  connection = await connectMongo(config);
  console.log('MongoDB connection and ping succeeded.');
  console.log(`Selected database: ${config.dbName}`);
} catch (error) {
  console.error(`MongoDB check failed. ${connectionDiagnostic(error)}`);
  process.exitCode = 1;
} finally {
  await connection?.client.close();
}
