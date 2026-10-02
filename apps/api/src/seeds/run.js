import { readConfig } from '../config/env.js';
import { connectMongo } from '../config/mongodb.js';
import { connectionDiagnostic } from '../config/connectionDiagnostic.js';
import { ensureHospitalIndexes } from '../modules/hospitals/hospitalRepository.js';
import { seedHospitals } from './hospitals.js';

let connection;
try {
  connection = await connectMongo(readConfig());
  await ensureHospitalIndexes(connection.db);
  const result = await seedHospitals(connection.db);
  console.log(
    `Inserted ${result.upsertedCount} demo hospitals. Existing records were preserved.`
  );
} catch (error) {
  console.error(`Hospital seed failed. ${connectionDiagnostic(error)}`);
  process.exitCode = 1;
} finally {
  await connection?.client.close();
}
