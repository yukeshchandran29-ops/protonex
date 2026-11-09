import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { authService } from '../services/authService';
import { ApiError } from '../utils/apiError';
import { prisma } from '../db/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        companyId: string | null;
      };
    }
  }
}

/**
 * Verifies the access token from the HttpOnly cookie (or Authorization header for
 * non-browser clients) and attaches the authenticated user to the request.
 * This is the ONLY source of truth for identity/role — the frontend never gets to
 * assert its own role.
 */
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = req.cookies?.protonex_access_token || bearer;

    if (!token) throw ApiError.unauthorized();

    const payload = authService.verifyAccessToken(token);

    // Re-check the user still exists / role hasn't been revoked since token issuance.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, companyId: true },
    });
    if (!user) throw ApiError.unauthorized('Account no longer exists');

    req.user = user;
    next();
  } catch (err) {
    next(ApiError.unauthorized('Invalid or expired session'));
  }
};

/** Optional auth: attaches req.user if present, but does not reject the request. */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.protonex_access_token;
  if (!token) return next();
  try {
    const payload = authService.verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, companyId: true },
    });
    if (user) req.user = user;
  } catch {
    /* ignore invalid token for optional auth */
  }
  next();
};

/** Restricts a route to one or more roles. Must run after requireAuth. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

/** Convenience: ENGINEER and ADMIN share most internal-review permissions. */
export const requireStaff = requireRole(Role.ENGINEER, Role.ADMIN);
export const requireAdmin = requireRole(Role.ADMIN);
