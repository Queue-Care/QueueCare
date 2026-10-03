import { readConfig } from '../config/env.js';
import { connectMongo } from '../config/mongodb.js';
import { connectionDiagnostic } from '../config/connectionDiagnostic.js';
import { ensureHospitalIndexes } from '../modules/hospitals/hospitalRepository.js';
import { seedHospitals } from './hospitals.js';
import { seedServices } from './services.js';
import { seedSessions } from './sessions.js';
import { isSessionDate } from '../modules/hospitals/sessionQuery.js';

let connection;
try {
  const dateArg = process.argv.find((arg) => arg.startsWith('--date='));
  const date = dateArg?.slice('--date='.length);
  if (date !== undefined && !isSessionDate(date)) {
    throw Object.assign(new Error('Invalid session seed date.'), {
      code: 'INVALID_SEED_DATE',
    });
  }
  connection = await connectMongo(readConfig());
  await ensureHospitalIndexes(connection.db);
  const result = await seedHospitals(connection.db);
  console.log(
    `Inserted ${result.upsertedCount} demo hospitals. Existing records were preserved.`
  );
  if (process.argv.includes('--services')) {
    const services = await seedServices(connection.db);
    console.log(
      `Inserted ${services.upsertedCount} demo OPD services. Existing records were preserved.`
    );
  }
  if (process.argv.includes('--sessions')) {
    const sessions = await seedSessions(connection.db, { date });
    console.log(
      `Inserted ${sessions.upsertedCount} demo OPD sessions for ${sessions.date} (Asia/Colombo). Existing records were preserved.`
    );
  }
} catch (error) {
  console.error(
    error.code === 'INVALID_SEED_DATE'
      ? 'Session seed date must be a real YYYY-MM-DD date, passed as --date=YYYY-MM-DD.'
      : `Discovery seed failed. ${connectionDiagnostic(error)}`
  );
  process.exitCode = 1;
} finally {
  await connection?.client.close();
}
