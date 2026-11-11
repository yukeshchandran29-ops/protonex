import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';

const SALT_ROUNDS = 12;

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
  companyId: string | null;
}

export const authService = {
  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET ?? 'dev-secret', { expiresIn: env.JWT_ACCESS_TTL ?? 3600 });
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, env.JWT_ACCESS_SECRET ?? 'dev-secret') as AccessTokenPayload;
  },

  /** Refresh tokens are opaque random strings; only their hash is stored (like a password). */
  generateRefreshToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(48).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
  },

  hashOpaqueToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  },

  generateUrlSafeToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  },
};
