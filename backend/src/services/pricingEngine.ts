import { CADGeometry, PricingBreakdown } from '../db/db';

export interface PricingInput {
  geometry?: CADGeometry | null;
  process: string;
  material: string;
  quantity: number;
  finish?: string;
  deliverySpeed?: 'STANDARD' | 'RUSH' | 'EXPRESS';
  tolerance?: string;
}

interface MaterialSpec {
  densityGPerCm3: number;
  costPerGram: number;
  machineHourlyRate: number;
  baseSetupFee: number;
}

const MATERIAL_CATALOG: Record<string, MaterialSpec> = {
  // 3D Printing
  'pla': { densityGPerCm3: 1.24, costPerGram: 2.5, machineHourlyRate: 120, baseSetupFee: 150 },
  'abs': { densityGPerCm3: 1.04, costPerGram: 3.0, machineHourlyRate: 140, baseSetupFee: 180 },
  'petg': { densityGPerCm3: 1.27, costPerGram: 3.2, machineHourlyRate: 150, baseSetupFee: 180 },
  'resin': { densityGPerCm3: 1.15, costPerGram: 6.0, machineHourlyRate: 220, baseSetupFee: 300 },
  'tough resin': { densityGPerCm3: 1.15, costPerGram: 6.5, machineHourlyRate: 240, baseSetupFee: 300 },
  'nylon': { densityGPerCm3: 1.01, costPerGram: 8.0, machineHourlyRate: 320, baseSetupFee: 450 },
  'sls nylon': { densityGPerCm3: 1.01, costPerGram: 8.5, machineHourlyRate: 350, baseSetupFee: 500 },

  // Metal Cutting
  'aluminum 6061': { densityGPerCm3: 2.70, costPerGram: 1.8, machineHourlyRate: 300, baseSetupFee: 350 },
  'aluminum 6061-t6': { densityGPerCm3: 2.70, costPerGram: 1.8, machineHourlyRate: 300, baseSetupFee: 350 },
  'stainless steel 304': { densityGPerCm3: 8.00, costPerGram: 2.4, machineHourlyRate: 380, baseSetupFee: 400 },
  'stainless steel': { densityGPerCm3: 8.00, costPerGram: 2.4, machineHourlyRate: 380, baseSetupFee: 400 },
  'mild steel': { densityGPerCm3: 7.85, costPerGram: 1.2, machineHourlyRate: 250, baseSetupFee: 300 },
  'carbon steel': { densityGPerCm3: 7.85, costPerGram: 1.3, machineHourlyRate: 260, baseSetupFee: 300 },
  'brass': { densityGPerCm3: 8.50, costPerGram: 3.2, machineHourlyRate: 420, baseSetupFee: 450 },
  'copper': { densityGPerCm3: 8.96, costPerGram: 4.0, machineHourlyRate: 480, baseSetupFee: 500 },
};

const FINISH_FEES: Record<string, number> = {
  'as manufactured': 0,
  'bead blasted': 150,
  'anodized': 300,
  'powder coated': 250,
  'vapor smoothed': 350,
};

export function calculateQuote(input: PricingInput): PricingBreakdown {
  const qty = Math.max(1, input.quantity || 1);
  const materialKey = (input.material || 'PLA').toLowerCase().trim();
  const finishKey = (input.finish || 'as manufactured').toLowerCase().trim();
  const deliverySpeed = input.deliverySpeed || 'STANDARD';

  // Match material spec
  let spec = MATERIAL_CATALOG[materialKey];
  if (!spec) {
    const foundKey = Object.keys(MATERIAL_CATALOG).find((k) => materialKey.includes(k) || k.includes(materialKey));
    spec = foundKey ? MATERIAL_CATALOG[foundKey] : MATERIAL_CATALOG['pla'];
  }

  // Volume and envelope
  const volumeCm3 = Math.max(2, input.geometry?.volumeCm3 || 25);
  const partWeightGrams = volumeCm3 * spec.densityGPerCm3;

  // Material cost per part
  const materialUnitCost = partWeightGrams * spec.costPerGram;
  const materialTotalCost = materialUnitCost * qty;

  // Machine time estimation
  // For 3D printing: ~1.5 hours per 50cm3 of solid volume at normal infill (20%)
  // For metal cutting: ~0.5 hours setup + 0.2 hours per part
  const is3D = input.process.toLowerCase().includes('3d') || input.process.toLowerCase().includes('print');
  const machineHoursPerPart = is3D
    ? Math.max(0.4, (volumeCm3 * 0.25) / 18)
    : Math.max(0.2, (volumeCm3 * 0.1) / 30);

  const machineTotalCost = machineHoursPerPart * spec.machineHourlyRate * qty;

  // Setup fee (amortized over batch, with small per-part alignment)
  const setupCost = spec.baseSetupFee + Math.min(500, qty * 15);

  // Finishing fee
  const finishFeePerPart = FINISH_FEES[finishKey] ?? 0;
  const finishingCost = finishFeePerPart * qty;

  // Subtotal before discounts
  const subtotalBeforeDiscount = materialTotalCost + machineTotalCost + setupCost + finishingCost;

  // Bulk quantity discount
  let discountPercent = 0;
  if (qty >= 50) discountPercent = 0.20;
  else if (qty >= 25) discountPercent = 0.15;
  else if (qty >= 10) discountPercent = 0.10;
  else if (qty >= 5) discountPercent = 0.05;

  const discount = subtotalBeforeDiscount * discountPercent;
  const discountedSubtotal = subtotalBeforeDiscount - discount;

  // Rush multipliers
  let speedMultiplier = 1.0;
  let leadTimeDays = is3D ? 4 : 5;
  if (deliverySpeed === 'RUSH') {
    speedMultiplier = 1.25;
    leadTimeDays = is3D ? 2 : 3;
  } else if (deliverySpeed === 'EXPRESS') {
    speedMultiplier = 1.50;
    leadTimeDays = 1;
  }

  const rushCost = (discountedSubtotal * (speedMultiplier - 1.0));
  const subtotalWithSpeed = discountedSubtotal + rushCost;

  // GST / Tax (18%)
  const tax = subtotalWithSpeed * 0.18;
  const total = subtotalWithSpeed + tax;

  return {
    materialCost: Number(materialTotalCost.toFixed(2)),
    machineCost: Number(machineTotalCost.toFixed(2)),
    setupCost: Number(setupCost.toFixed(2)),
    finishingCost: Number(finishingCost.toFixed(2)),
    subtotal: Number(discountedSubtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    rushCost: Number(rushCost.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    estimatedPrice: Number(total.toFixed(2)),
    unitPrice: Number((total / qty).toFixed(2)),
    leadTimeDays,
  };
}

export function getAvailableOptions() {
  return {
    processes: [
      { id: '3D Printing', name: '3D Printing (Additive)', methods: ['FDM (Fused Deposition)', 'SLA (Resin)', 'SLS (Selective Laser Sintering)'] },
      { id: 'Metal Cutting', name: 'Metal Cutting (Subtractive)', methods: ['Laser Cutting', 'Waterjet Cutting', 'Plasma Cutting'] },
    ],
    materials: [
      { name: 'PLA', process: '3D Printing', description: 'Standard prototype polymer, high detail, biodegradable', category: 'Polymer' },
      { name: 'ABS', process: '3D Printing', description: 'Impact resistant, heat tolerant functional engineering plastic', category: 'Polymer' },
      { name: 'PETG', process: '3D Printing', description: 'Chemical resistant, strong, durable semi-rigid polymer', category: 'Polymer' },
      { name: 'Tough Resin', process: '3D Printing', description: 'Ultra-high detail stereolithography for tight tolerance parts', category: 'Resin' },
      { name: 'SLS Nylon', process: '3D Printing', description: 'Industrial grade strong mechanical prototypes, no support marks', category: 'Polymer' },
      { name: 'Aluminum 6061-T6', process: 'Metal Cutting', description: 'Structural aerospace alloy, light weight, excellent machinability', category: 'Metal' },
      { name: 'Stainless Steel 304', process: 'Metal Cutting', description: 'Corrosion resistant, high strength, marine and food grade', category: 'Metal' },
      { name: 'Mild Steel', process: 'Metal Cutting', description: 'Cost-effective structural steel for frames and brackets', category: 'Metal' },
      { name: 'Brass', process: 'Metal Cutting', description: 'Low friction, decorative, conductive precision component alloy', category: 'Metal' },
    ],
    finishes: [
      { name: 'As manufactured', description: 'Deburred standard machine/print finish (no extra fee)' },
      { name: 'Bead blasted', description: 'Uniform matte satin surface finish (+₹150/unit)' },
      { name: 'Anodized', description: 'Hard protective anodic layer (Type II/III) (+₹300/unit)' },
      { name: 'Powder coated', description: 'Durable protective electrostatic polymer coating (+₹250/unit)' },
      { name: 'Vapor smoothed', description: 'Sealed smooth gloss surface for FDM prints (+₹350/unit)' },
    ],
    delivery: [
      { name: 'Standard', leadTime: '5–7 business days', fee: 'Standard pricing' },
      { name: 'Rush', leadTime: '3–4 business days', fee: '+25% expedite' },
      { name: 'Express', leadTime: '1–2 business days', fee: '+50% priority dispatch' },
    ],
  };
}
