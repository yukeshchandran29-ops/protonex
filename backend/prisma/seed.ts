import { PrismaClient, ManufacturingProcess, DeliverySpeed, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── Pricing configuration (always seeded — this is real config, not demo data) ──
  const materials: Array<{
    name: string;
    process: ManufacturingProcess;
    costPerKg: number;
    density: number;
  }> = [
    { name: 'PLA', process: 'FDM_3D_PRINTING', costPerKg: 22, density: 1.24 },
    { name: 'PETG', process: 'FDM_3D_PRINTING', costPerKg: 26, density: 1.27 },
    { name: 'ABS', process: 'FDM_3D_PRINTING', costPerKg: 24, density: 1.04 },
    { name: 'Nylon', process: 'SLS_3D_PRINTING', costPerKg: 55, density: 1.15 },
    { name: 'Resin', process: 'SLA_3D_PRINTING', costPerKg: 60, density: 1.1 },
    { name: 'Aluminum', process: 'CNC_MACHINING', costPerKg: 8, density: 2.7 },
    { name: 'Stainless Steel', process: 'CNC_MACHINING', costPerKg: 6, density: 8.0 },
    { name: 'Mild Steel', process: 'SHEET_METAL', costPerKg: 3, density: 7.85 },
    { name: 'Brass', process: 'CNC_MACHINING', costPerKg: 12, density: 8.5 },
  ];

  for (const m of materials) {
    await prisma.material.upsert({
      where: { name: m.name },
      update: {},
      create: { ...m, wasteFactor: 1.15, minimumCharge: 8 },
    });
  }

  const processRates: Array<{ process: ManufacturingProcess; hourlyRate: number; setupRate: number }> = [
    { process: 'FDM_3D_PRINTING', hourlyRate: 12, setupRate: 5 },
    { process: 'SLA_3D_PRINTING', hourlyRate: 18, setupRate: 8 },
    { process: 'SLS_3D_PRINTING', hourlyRate: 35, setupRate: 20 },
    { process: 'CNC_MACHINING', hourlyRate: 60, setupRate: 40 },
    { process: 'SHEET_METAL', hourlyRate: 45, setupRate: 30 },
    { process: 'LASER_CUTTING', hourlyRate: 40, setupRate: 15 },
    { process: 'INJECTION_MOLDING', hourlyRate: 90, setupRate: 500 },
  ];
  for (const p of processRates) {
    await prisma.processRate.upsert({
      where: { process: p.process },
      update: {},
      create: { ...p, energyRate: 0.15, minimumOrderValue: 25 },
    });
  }

  const finishes = [
    { name: 'Powder Coating', costFlat: 15, costPerCm2: 0.02 },
    { name: 'Anodizing', costFlat: 20, costPerCm2: 0.03 },
    { name: 'Polishing', costFlat: 10, costPerCm2: 0.015 },
    { name: 'Sanding', costFlat: 5, costPerCm2: 0.005 },
    { name: 'Painting', costFlat: 12, costPerCm2: 0.02 },
    { name: 'Support Removal', costFlat: 5, costPerCm2: 0 },
  ];
  for (const f of finishes) {
    await prisma.finishingOption.upsert({ where: { name: f.name }, update: {}, create: f });
  }

  const deliveries: Array<{ speed: DeliverySpeed; multiplier: number; flatFee: number; leadTimeDays: number }> = [
    { speed: 'STANDARD', multiplier: 1.0, flatFee: 0, leadTimeDays: 10 },
    { speed: 'EXPRESS', multiplier: 1.35, flatFee: 15, leadTimeDays: 5 },
    { speed: 'RUSH', multiplier: 1.75, flatFee: 40, leadTimeDays: 2 },
  ];
  for (const d of deliveries) {
    await prisma.deliveryOption.upsert({ where: { speed: d.speed }, update: {}, create: d });
  }

  // ── Dev-only demo accounts — never seeded in production ────────────────
  if (process.env.NODE_ENV !== 'production') {
    const passwordHash = await bcrypt.hash('DemoPass123!', 12);

    const company = await prisma.company.upsert({
      where: { id: 'demo-company' },
      update: {},
      create: { id: 'demo-company', name: 'Acme Robotics', email: 'ops@acme-robotics.example' },
    });

    await prisma.user.upsert({
      where: { email: 'admin@protonex.example' },
      update: {},
      create: { email: 'admin@protonex.example', name: 'Priya Admin', passwordHash, role: Role.ADMIN, emailVerified: true },
    });
    await prisma.user.upsert({
      where: { email: 'engineer@protonex.example' },
      update: {},
      create: { email: 'engineer@protonex.example', name: 'Sam Engineer', passwordHash, role: Role.ENGINEER, emailVerified: true },
    });
    await prisma.user.upsert({
      where: { email: 'customer@protonex.example' },
      update: {},
      create: {
        email: 'customer@protonex.example',
        name: 'Jordan Customer',
        passwordHash,
        role: Role.CUSTOMER,
        emailVerified: true,
        companyId: company.id,
      },
    });

    console.log('Seeded dev demo accounts (password: DemoPass123!):');
    console.log('  admin@protonex.example / engineer@protonex.example / customer@protonex.example');
  }

  console.log('Pricing configuration seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
