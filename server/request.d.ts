import type { User } from '../shared/types.js';
declare global {
  namespace Express {
    interface Request { user?: User; sessionHash?: string; csrfToken?: string; sessionExpiresAt?: string; }
  }
}
export {};
