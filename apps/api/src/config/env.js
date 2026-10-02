export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const mongoUri =
    env.MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017/opd_queue';
  if (!/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) {
    throw new Error('MONGODB_URI must be a MongoDB connection string.');
  }
  const dbName = env.MONGODB_DB_NAME?.trim() || 'opd_queue';
  if (!/^[a-zA-Z0-9_-]+$/.test(dbName)) {
    throw new Error(
      'MONGODB_DB_NAME must contain only letters, digits, underscores, or hyphens.'
    );
  }
  return { port, host: env.HOST?.trim() || '0.0.0.0', mongoUri, dbName };
}
