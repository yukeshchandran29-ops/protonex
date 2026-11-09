import { DeliverySpeed, ManufacturingProcess } from '@prisma/client';
import { prisma } from '../db/prisma';
import { ApiError } from '../utils/apiError';
import type { GeometryResult } from './geometryService';

export interface PricingConfiguration {
  quantity: number;
  process: ManufacturingProcess;
  materialName: string;
  finishNames: string[];
  deliverySpeed: DeliverySpeed;
}

export interface PricingBreakdown {
  materialCost: number;
  machineCost: number;
  setupCost: number;
  finishingCost: number;
  rushCost: number;
  basePrice: number;
  estimatedPrice: number;
  currency: 'USD';
  leadTimeDays: number;
}

export interface PricingSnapshot {
  calculatedAt: string;
  material: { name: string; costPerKg: number; density: number; wasteFactor: number; minimumCharge: number };
  process: { process: ManufacturingProcess; hourlyRate: number; setupRate: number; energyRate: number };
  finishes: { name: string; costFlat: number; costPerCm2: number }[];
  delivery: { speed: DeliverySpeed; multiplier: number; flatFee: number; leadTimeDays: number };
  geometry: { volumeCm3: number | null; surfaceAreaCm2: number | null; complexityScore: number | null };
  quantity: number;
}

/**
 * calculateQuote — the single source of truth for turning (geometry + configuration + pricing
 * rules) into a price. Deliberately has no knowledge of HTTP, the UI, or quote persistence.
 * Every call also returns the exact rules snapshot used, so a later admin pricing change can
 * never retroactively alter an already-issued quote.
 */
export async function calculateQuote(
  geometry: GeometryResult | null,
  config: PricingConfiguration
): Promise<{ breakdown: PricingBreakdown; snapshot: PricingSnapshot }> {
  const material = await prisma.material.findUnique({ where: { name: config.materialName } });
  if (!material || !material.active) throw ApiError.badRequest('INVALID_MATERIAL', 'Selected material is not available');

  const processRate = await prisma.processRate.findUnique({ where: { process: config.process } });
  if (!processRate || !processRate.active) throw ApiError.badRequest('INVALID_PROCESS', 'Selected process is not available');

  const finishes = config.finishNames.length
    ? await prisma.finishingOption.findMany({ where: { name: { in: config.finishNames }, active: true } })
    : [];

  const delivery = await prisma.deliveryOption.findUnique({ where: { speed: config.deliverySpeed } });
  if (!delivery || !delivery.active) throw ApiError.badRequest('INVALID_DELIVERY', 'Selected delivery option is not available');

  const volumeCm3 = geometry?.ok && geometry.volume ? geometry.volume / 1000 : null; // engine reports mm^3
  const surfaceAreaCm2 = geometry?.ok && geometry.surfaceArea ? geometry.surfaceArea / 100 : null; // mm^2 -> cm^2
  const complexityScore = geometry?.ok ? geometry.complexityScore ?? null : null;

  // Material cost: mass(kg) * costPerKg * wasteFactor, floored by minimumCharge.
  const massKg = volumeCm3 !== null ? (volumeCm3 * material.density) / 1000 : 0.05; // fallback nominal mass if geometry unavailable
  const materialCostPerUnit = Math.max(massKg * material.costPerKg * material.wasteFactor, material.minimumCharge);

  // Machine cost: complexity-scaled runtime estimate * hourly rate.
  const baseRuntimeHours = volumeCm3 !== null ? Math.max(0.1, volumeCm3 / 40) : 0.5;
  const complexityMultiplier = 1 + (complexityScore ?? 0.3);
  const machineCostPerUnit = baseRuntimeHours * complexityMultiplier * processRate.hourlyRate;

  const setupCost = processRate.setupRate; // one-time, not multiplied by quantity
  const finishingCostPerUnit = finishes.reduce(
    (sum, f) => sum + f.costFlat + f.costPerCm2 * (surfaceAreaCm2 ?? 0),
    0
  );

  const perUnitCost = materialCostPerUnit + machineCostPerUnit + finishingCostPerUnit;
  const subtotal = perUnitCost * config.quantity + setupCost;
  const rushCost = Math.max(0, subtotal * (delivery.multiplier - 1)) + delivery.flatFee;

  const basePrice = Math.round(subtotal * 100) / 100;
  const estimatedPrice = Math.max(
    Math.round((subtotal + rushCost) * 100) / 100,
    processRate.minimumOrderValue
  );

  const breakdown: PricingBreakdown = {
    materialCost: Math.round(materialCostPerUnit * config.quantity * 100) / 100,
    machineCost: Math.round(machineCostPerUnit * config.quantity * 100) / 100,
    setupCost: Math.round(setupCost * 100) / 100,
    finishingCost: Math.round(finishingCostPerUnit * config.quantity * 100) / 100,
    rushCost: Math.round(rushCost * 100) / 100,
    basePrice,
    estimatedPrice,
    currency: 'USD',
    leadTimeDays: delivery.leadTimeDays,
  };

  const snapshot: PricingSnapshot = {
    calculatedAt: new Date().toISOString(),
    material: {
      name: material.name,
      costPerKg: material.costPerKg,
      density: material.density,
      wasteFactor: material.wasteFactor,
      minimumCharge: material.minimumCharge,
    },
    process: {
      process: processRate.process,
      hourlyRate: processRate.hourlyRate,
      setupRate: processRate.setupRate,
      energyRate: processRate.energyRate,
    },
    finishes: finishes.map((f) => ({ name: f.name, costFlat: f.costFlat, costPerCm2: f.costPerCm2 })),
    delivery: { speed: delivery.speed, multiplier: delivery.multiplier, flatFee: delivery.flatFee, leadTimeDays: delivery.leadTimeDays },
    geometry: { volumeCm3, surfaceAreaCm2, complexityScore },
    quantity: config.quantity,
  };

  return { breakdown, snapshot };
}

export const pricingService = { calculateQuote };
