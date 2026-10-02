import { HttpError } from '../../utils/HttpError.js';

export function parseHospitalQuery(query) {
  const errors = Object.create(null);
  const allowed = new Set(['search', 'city', 'page', 'limit']);
  for (const name of Object.keys(query)) {
    if (!allowed.has(name)) errors[name] = 'Unsupported query parameter.';
  }
  function readText(name, max) {
    const value = query[name];
    if (value === undefined) return '';
    if (
      typeof value !== 'string' ||
      value.trim().length > max ||
      /[\u0000-\u001f\u007f]/.test(value)
    ) {
      errors[
        name
      ] = `Must be a single text value of at most ${max} characters without control characters.`;
      return '';
    }
    return value.trim();
  }
  function readNumber(name, fallback, max) {
    const value = query[name];
    if (value === undefined) return fallback;
    if (
      typeof value !== 'string' ||
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    ) {
      errors[name] = `Must be a whole number between 1 and ${max}.`;
      return fallback;
    }
    return Number(value);
  }
  const result = {
    search: readText('search', 100),
    city: readText('city', 80),
    page: readNumber('page', 1, 1000),
    limit: readNumber('limit', 20, 50),
  };
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the hospital search filters.',
      errors
    );
  return result;
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildHospitalFilter({ search, city }) {
  const filter = { isActive: true };
  if (search) {
    const literal = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: literal }, { city: literal }];
  }
  if (city) filter.city = { $regex: `^${escapeRegex(city)}$`, $options: 'i' };
  return filter;
}
