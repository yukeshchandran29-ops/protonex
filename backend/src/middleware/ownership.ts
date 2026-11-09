import { Role } from '@prisma/client';
import { Request } from 'express';
import { ApiError } from '../utils/apiError';

/**
 * Central IDOR guard: a CUSTOMER may only ever touch resources whose
 * customerId/userId matches their own id. ENGINEER and ADMIN can see
 * everything needed for review. Call this after loading the resource,
 * before returning or mutating it — never trust a resource id in the URL
 * alone as proof of access.
 */
export const assertOwnsOrStaff = (req: Request, resourceOwnerUserId: string) => {
  if (!req.user) throw ApiError.unauthorized();
  const isOwner = req.user.id === resourceOwnerUserId;
  const isStaff = req.user.role === Role.ENGINEER || req.user.role === Role.ADMIN;
  if (!isOwner && !isStaff) {
    throw ApiError.forbidden('You do not have access to this resource');
  }
};

/** Stricter variant for actions only the owning customer may take (e.g. accepting a quote). */
export const assertIsOwner = (req: Request, resourceOwnerUserId: string) => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.id !== resourceOwnerUserId) {
    throw ApiError.forbidden('Only the account that owns this resource can perform this action');
  }
};
