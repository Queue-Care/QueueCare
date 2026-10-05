export function readAuthConfig(env = process.env) {
  const secret = env.JWT_SECRET;
  if (!secret) return undefined;
  const issuer = env.JWT_ISSUER?.trim() || 'queuecare-api';
  const audience = env.JWT_AUDIENCE?.trim() || 'queuecare-mobile';
  if (Buffer.byteLength(secret, 'utf8') < 32 || !secret.trim()) {
    throw Object.assign(
      new Error('JWT_SECRET must contain at least 32 bytes.'),
      { code: 'AUTH_CONFIG' }
    );
  }
  return { key: new TextEncoder().encode(secret), issuer, audience };
}
