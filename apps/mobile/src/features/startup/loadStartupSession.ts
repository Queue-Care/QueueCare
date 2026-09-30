import type { SessionLoader } from './useAppStartup';

// S-13 handoff: replace this with the authentication provider's validated session
// restoration. Until authentication exists, every launch is explicitly signed out.
// Do not decode a JWT or trust a stored role here as proof of authentication.
export const loadStartupSession: SessionLoader = async () => null;
