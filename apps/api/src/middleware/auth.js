import { jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';
import { HttpError } from '../utils/HttpError.js';

export function authenticate(db, config, { now = () => new Date() } = {}) {
  return async (request, _response, next) => {
    const authorization = request.get('authorization');
    const match =
      typeof authorization === 'string' &&
      /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match || match[1].length > 8192)
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    if (!config)
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Sign-in verification is not configured.'
      );
    let payload;
    try {
      ({ payload } = await jwtVerify(match[1], config.key, {
        algorithms: ['HS256'],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ['sub', 'exp', 'iat'],
        currentDate: now(),
        maxTokenAge: '24h',
      }));
      if (
        typeof payload.sub !== 'string' ||
        !/^[a-f\d]{24}$/i.test(payload.sub)
      )
        throw new Error('Invalid subject');
    } catch {
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again.');
    }
    const user = await db
      .collection('users')
      .findOne(
        { _id: new ObjectId(payload.sub) },
        { projection: { _id: 1, role: 1, status: 1 }, maxTimeMS: 3000 }
      );
    if (!user)
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again.');
    if (user.status !== 'ACTIVE')
      throw new HttpError(
        403,
        'FORBIDDEN',
        'This account cannot make bookings.'
      );
    // Token role/profile claims and request body identity are never authority.
    request.auth = { userId: user._id, role: user.role };
    next();
  };
}
