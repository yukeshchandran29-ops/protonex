import fs from 'fs';
import path from 'path';

export interface CADGeometry {
  ok: boolean;
  engine: string;
  parts: number;
  solids: number;
  faces: number;
  edges: number | null;
  volumeMm3: number;
  volumeCm3: number;
  surfaceAreaMm2: number;
  surfaceAreaCm2: number;
  bboxMm: [number, number, number];
  bboxVolumeMm3: number;
  watertight: boolean;
  complexityScore: number;
  warning?: string;
  error?: string;
}

export interface CADFileRecord {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  projectId?: string;
  uploadedBy?: string;
  geometryStatus: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  geometryAnalysis?: CADGeometry;
  createdAt: string;
}

export interface PricingBreakdown {
  materialCost: number;
  machineCost: number;
  setupCost: number;
  finishingCost: number;
  subtotal: number;
  discount: number;
  tax: number;
  rushCost: number;
  estimatedPrice: number;
  unitPrice: number;
  leadTimeDays: number;
}

export interface QuoteRecord {
  id: string;
  quoteNumber: string;
  projectId?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  cadFileId?: string;
  cadFiles?: CADFileRecord[];
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'ORDERED';
  process: string;
  material: string;
  quantity: number;
  finish: string;
  tolerance: string;
  deliverySpeed: 'STANDARD' | 'RUSH' | 'EXPRESS';
  customerNotes?: string;
  breakdown: PricingBreakdown;
  estimatedPrice: number;
  finalPrice?: number;
  leadTime: number;
  createdAt: string;
  expiresAt: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  quoteId?: string;
  quote?: QuoteRecord;
  cadFileId?: string;
  cadFile?: CADFileRecord;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerNotes?: string;
  shippingAddress?: string;
  totalAmount: number;
  productionStatus: 'QUEUED' | 'IN_PRODUCTION' | 'QUALITY_CHECK' | 'READY_TO_SHIP' | 'COMPLETE';
  shippingStatus: 'NOT_SHIPPED' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED';
  trackingNumber?: string;
  emailSent: boolean;
  emailPreviewUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  projectNumber: string;
  name: string;
  description?: string;
  userId: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  createdAt: string;
  _count?: {
    cadFiles: number;
    quotes: number;
  };
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'ENGINEER' | 'ADMIN';
  createdAt: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  projects: ProjectRecord[];
  cadFiles: CADFileRecord[];
  quotes: QuoteRecord[];
  orders: OrderRecord[];
}

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const DEFAULT_DB: DatabaseSchema = {
  users: [
    {
      id: 'usr_demo_01',
      name: 'Prototype Lab',
      email: 'demo@protonex.local',
      role: 'CUSTOMER',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'usr_admin_01',
      name: 'Faculty / Admin',
      email: 'admin@protonex.local',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    },
  ],
  projects: [
    {
      id: 'prj_demo_01',
      projectNumber: 'PNX-P-101',
      name: 'Robotics Chassis Prototype',
      description: 'College robotics team chassis and mounting brackets',
      userId: 'usr_demo_01',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'prj_demo_02',
      projectNumber: 'PNX-P-102',
      name: 'Aerodynamic Drone Arm',
      description: 'Lightweight SLA / FDM drone arm with hollow core',
      userId: 'usr_demo_01',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    },
  ],
  cadFiles: [],
  quotes: [],
  orders: [],
};

class LocalDB {
  private data: DatabaseSchema;

  constructor() {
    ensureDataDir();
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = { ...DEFAULT_DB, ...JSON.parse(raw) };
      } catch {
        this.data = DEFAULT_DB;
        this.save();
      }
    } else {
      this.data = DEFAULT_DB;
      this.save();
    }
  }

  private save() {
    try {
      ensureDataDir();
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save database.json', err);
    }
  }

  // Users
  getUsers() { return this.data.users; }
  getUserById(id: string) { return this.data.users.find((u) => u.id === id); }
  getUserByEmail(email: string) { return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase()); }
  createUser(user: Omit<UserRecord, 'id' | 'createdAt'>): UserRecord {
    const record: UserRecord = {
      ...user,
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(record);
    this.save();
    return record;
  }

  // Projects
  getProjects(userId?: string) {
    const list = userId ? this.data.projects.filter((p) => p.userId === userId) : this.data.projects;
    return list.map((p) => ({
      ...p,
      _count: {
        cadFiles: this.data.cadFiles.filter((f) => f.projectId === p.id).length,
        quotes: this.data.quotes.filter((q) => q.projectId === p.id).length,
      },
    }));
  }
  getProjectById(id: string) { return this.data.projects.find((p) => p.id === id); }
  createProject(project: { name: string; description?: string; userId: string }): ProjectRecord {
    const count = this.data.projects.length + 101;
    const record: ProjectRecord = {
      id: `prj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      projectNumber: `PNX-P-${count}`,
      name: project.name,
      description: project.description || '',
      userId: project.userId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    this.data.projects.push(record);
    this.save();
    return record;
  }

  // CAD Files
  getCadFiles(projectId?: string) {
    if (projectId) return this.data.cadFiles.filter((f) => f.projectId === projectId);
    return this.data.cadFiles;
  }
  getCadFileById(id: string) { return this.data.cadFiles.find((f) => f.id === id); }
  createCadFile(file: Omit<CADFileRecord, 'id' | 'createdAt'>): CADFileRecord {
    const record: CADFileRecord = {
      ...file,
      id: `cad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.cadFiles.unshift(record);
    this.save();
    return record;
  }
  updateCadFile(id: string, updates: Partial<CADFileRecord>): CADFileRecord | null {
    const idx = this.data.cadFiles.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    this.data.cadFiles[idx] = { ...this.data.cadFiles[idx], ...updates };
    this.save();
    return this.data.cadFiles[idx];
  }

  // Quotes
  getQuotes() { return this.data.quotes; }
  getQuoteById(id: string) { return this.data.quotes.find((q) => q.id === id); }
  createQuote(quote: Omit<QuoteRecord, 'id' | 'quoteNumber' | 'createdAt' | 'expiresAt'>): QuoteRecord {
    const count = this.data.quotes.length + 1001;
    const record: QuoteRecord = {
      ...quote,
      id: `qte_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      quoteNumber: `PNX-Q-${count}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.data.quotes.unshift(record);
    this.save();
    return record;
  }
  updateQuote(id: string, updates: Partial<QuoteRecord>): QuoteRecord | null {
    const idx = this.data.quotes.findIndex((q) => q.id === id);
    if (idx === -1) return null;
    this.data.quotes[idx] = { ...this.data.quotes[idx], ...updates };
    this.save();
    return this.data.quotes[idx];
  }

  // Orders
  getOrders() { return this.data.orders; }
  getOrderById(id: string) { return this.data.orders.find((o) => o.id === id); }
  createOrder(order: Omit<OrderRecord, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>): OrderRecord {
    const count = this.data.orders.length + 1001;
    const now = new Date().toISOString();
    const record: OrderRecord = {
      ...order,
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderNumber: `PNX-O-${count}`,
      createdAt: now,
      updatedAt: now,
    };
    this.data.orders.unshift(record);
    this.save();
    return record;
  }
  updateOrder(id: string, updates: Partial<OrderRecord>): OrderRecord | null {
    const idx = this.data.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    this.data.orders[idx] = {
      ...this.data.orders[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.orders[idx];
  }
}

export const db = new LocalDB();
