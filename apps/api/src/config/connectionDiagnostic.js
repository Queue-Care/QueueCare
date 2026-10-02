// Driver errors can contain credentials/URIs. Return fixed diagnostic text only.
export function connectionDiagnostic(error) {
  const pending = [error];
  const seen = new Set();
  const codes = new Set();
  const names = new Set();
  let dnsFailure = false;
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    codes.add(item.code);
    names.add(item.name);
    if (['querySrv', 'queryTxt'].includes(item.syscall)) dnsFailure = true;
    pending.push(item.cause);
    if (item.reason?.servers instanceof Map) {
      for (const server of item.reason.servers.values())
        pending.push(server.error);
    }
  }
  if (codes.has('EADDRINUSE'))
    return 'The API port is already in use. Stop the other API instance or change PORT in apps/api/.env.';
  if (codes.has(18) || codes.has('AuthenticationFailed'))
    return 'MongoDB authentication failed. Check the database username, password, and authSource in apps/api/.env.';
  if (codes.has(13))
    return 'The MongoDB user lacks permission for this operation. Check its access to MONGODB_DB_NAME.';
  if (dnsFailure || codes.has('ENOTFOUND') || codes.has('EAI_AGAIN'))
    return 'MongoDB DNS lookup failed. Check the cluster hostname, cluster availability, and network DNS settings.';
  if (
    [...codes].some(
      (code) =>
        typeof code === 'string' && /SSL|TLS|CERT|SELF_SIGNED/.test(code)
    )
  ) {
    return 'MongoDB TLS connection failed before authentication. For Atlas, check Network Access allows your current public IP and the cluster is available. Also check VPN/firewall/TLS interception. Keep certificate verification enabled.';
  }
  if (codes.has('ECONNREFUSED'))
    return 'MongoDB refused the connection. For local MongoDB, check mongod is running on the configured port. For Atlas, check the cluster and network access settings.';
  if (
    names.has('MongoServerSelectionError') ||
    names.has('MongoNetworkError') ||
    codes.has('ETIMEDOUT')
  )
    return 'MongoDB is unreachable. Check the configured host, network/firewall, and Atlas IP access list if using Atlas.';
  if (names.has('MongoParseError'))
    return 'The MongoDB connection string is invalid. Check MONGODB_URI in apps/api/.env and URL-encode special characters in credentials.';
  return 'Check apps/api/.env (PORT, MONGODB_URI, MONGODB_DB_NAME), MongoDB availability, and database permissions. Run npm run check:db for a connection check.';
}
