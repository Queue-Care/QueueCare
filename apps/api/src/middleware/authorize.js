import { HttpError } from '../utils/HttpError.js';

export function authorize(...roles) {
  return (request, _response, next) => {
    if (!request.auth)
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    if (!roles.includes(request.auth.role))
      throw new HttpError(403, 'FORBIDDEN', 'A patient account is required.');
    next();
  };
}
