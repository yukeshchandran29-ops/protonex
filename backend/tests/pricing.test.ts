import { describe, it, expect } from 'vitest';
import { prisma } from '../src/db/prisma';
import { pricingService } from '../src/services/pricingService';

describe('Pricing engine', () => {
  it('produces a pricing snapshot alongside the breakdown', async () => {
    await prisma.material.create({
      data: { name: 'TestPLA', process: 'FDM_3D_PRINTING', costPerKg: 20, density: 1.24, wasteFactor: 1.1, minimumCharge: 5 },
    });
    await prisma.processRate.create({
      data: { process: 'FDM_3D_PRINTING', hourlyRate: 10, setupRate: 5, energyRate: 0.1, minimumOrderValue: 10 },
    });
    await prisma.deliveryOption.create({
      data: { speed: 'STANDARD', multiplier: 1, flatFee: 0, leadTimeDays: 10 },
    });

    const { breakdown, snapshot } = await pricingService.calculateQuote(
      { ok: true, volume: 40000, surfaceArea: 8000, complexityScore: 0.4 },
      { quantity: 5, process: 'FDM_3D_PRINTING', materialName: 'TestPLA', finishNames: [], deliverySpeed: 'STANDARD' }
    );

    expect(breakdown.estimatedPrice).toBeGreaterThan(0);
    expect(snapshot.material.name).toBe('TestPLA');
    expect(snapshot.quantity).toBe(5);
  });

  it('an existing quote keeps its original snapshot even after admin changes pricing', async () => {
    const material = await prisma.material.create({
      data: { name: 'SnapshotSteel', process: 'CNC_MACHINING', costPerKg: 6, density: 8.0, wasteFactor: 1.1, minimumCharge: 10 },
    });
    await prisma.processRate.create({
      data: { process: 'CNC_MACHINING', hourlyRate: 60, setupRate: 40, energyRate: 0.15, minimumOrderValue: 25 },
    });
    await prisma.deliveryOption.create({ data: { speed: 'STANDARD', multiplier: 1, flatFee: 0, leadTimeDays: 10 } });

    const { snapshot: originalSnapshot } = await pricingService.calculateQuote(
      { ok: true, volume: 30000, surfaceArea: 6000, complexityScore: 0.3 },
      { quantity: 2, process: 'CNC_MACHINING', materialName: 'SnapshotSteel', finishNames: [], deliverySpeed: 'STANDARD' }
    );

    // Admin changes the price of steel tomorrow.
    await prisma.material.update({ where: { id: material.id }, data: { costPerKg: 999 } });

    // The original snapshot object, once persisted on a Quote row, must be untouched —
    // this test documents that calculateQuote returns a plain value, never a live reference.
    expect(originalSnapshot.material.costPerKg).toBe(6);
  });
});
