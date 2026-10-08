import { readConfig } from '../src/config/env.js';
import { connectMongo } from '../src/config/mongodb.js';
import { readAuthConfig } from '../src/config/auth.js';
import { createApiApp } from '../src/bootstrap.js';

// Vercel entry point. A warm function instance reuses the app and its MongoDB
// connection; a failed start is forgotten so the next request tries again.
let pendingApp;

function getApp() {
  pendingApp ??= (async () => {
    const connection = await connectMongo(readConfig());
    try {
      return await createApiApp(connection, readAuthConfig());
    } catch (error) {
      await connection.client.close();
      throw error;
    }
  })().catch((error) => {
    pendingApp = undefined;
    throw error;
  });
  return pendingApp;
}

export default async function handler(request, response) {
  let app;
  try {
    app = await getApp();
  } catch (error) {
    console.error('API startup failed.', error);
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is starting up. Please try again.',
        },
      })
    );
    return;
  }
  return app(request, response);
}
