import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/db';
import { analyzeCADFile } from '../services/geometryEngine';
import { calculateQuote, getAvailableOptions } from '../services/pricingEngine';
import { sendOrderConfirmationEmail } from '../services/mailerService';

export const apiRouter = Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage for CAD files
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const uniqueName = `${Date.now()}-${safeBase}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250 MB
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH COMPATIBILITY
// ─────────────────────────────────────────────────────────────────────────────
apiRouter.get('/auth/me', (req, res) => {
  const users = db.getUsers();
  res.json({ success: true, data: users[0] });
});

apiRouter.post('/auth/login', (req, res) => {
  const { email } = req.body || {};
  let user = email ? db.getUserByEmail(email) : null;
  if (!user) {
    user = db.getUsers()[0];
  }
  res.json({ success: true, data: { user } });
});

apiRouter.post('/auth/logout', (_req, res) => {
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────
apiRouter.get('/projects', (req, res) => {
  const projects = db.getProjects();
  res.json({ success: true, data: projects });
});

apiRouter.post('/projects', (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: { message: 'Project name is required' } });
  const project = db.createProject({
    name,
    description,
    userId: 'usr_demo_01',
  });
  res.status(201).json({ success: true, data: project });
});

// ─────────────────────────────────────────────────────────────────────────────
// CAD FILES & DIRECT UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
// Direct multipart upload endpoint: analyzes CAD geometry immediately
apiRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No CAD file provided' } });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const geometry = await analyzeCADFile(req.file.path);

    const cadFile = db.createCadFile({
      originalName: req.file.originalname,
      fileName: req.file.filename,
      filePath: req.file.path,
      fileSize: req.file.size,
      fileType: ext.replace('.', ''),
      projectId: req.body.projectId || db.getProjects()[0]?.id,
      uploadedBy: 'usr_demo_01',
      geometryStatus: geometry.ok ? 'COMPLETE' : 'FAILED',
      geometryAnalysis: geometry,
    });

    res.status(201).json({ success: true, data: cadFile });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: { message: err.message || 'File upload failed' } });
  }
});

// Backward compatibility with previous presigned flow in dashboard.js
apiRouter.post('/cad-files/request-upload', (req, res) => {
  const { fileName, fileSize } = req.body || {};
  const tempId = `cad_tmp_${Date.now()}`;
  res.json({
    success: true,
    data: {
      cadFileId: tempId,
      uploadUrl: `/api/upload-direct/${tempId}`,
      storageKey: `local/${fileName}`,
    },
  });
});

apiRouter.put('/upload-direct/:id', (req, res) => {
  // Catch direct PUT if sent
  res.json({ success: true });
});

apiRouter.post('/cad-files/confirm-upload', (req, res) => {
  res.json({ success: true });
});

apiRouter.get('/cad-files', (_req, res) => {
  const files = db.getCadFiles();
  res.json({ success: true, data: files });
});

apiRouter.get('/cad-files/:id', (req, res) => {
  const file = db.getCadFileById(req.params.id);
  if (!file) return res.status(404).json({ error: { message: 'CAD file not found' } });
  res.json({ success: true, data: file });
});

apiRouter.get('/cad-files/:id/download', (req, res) => {
  const file = db.getCadFileById(req.params.id);
  if (!file || !fs.existsSync(file.filePath)) {
    return res.status(404).json({ error: { message: 'File not found on server' } });
  }
  res.download(file.filePath, file.originalName);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRICING & QUOTES
// ─────────────────────────────────────────────────────────────────────────────
apiRouter.get('/pricing/options', (_req, res) => {
  res.json({ success: true, data: getAvailableOptions() });
});

apiRouter.post('/pricing/estimate', (req, res) => {
  try {
    const { cadFileId, process, material, quantity, finish, deliverySpeed } = req.body || {};
    let geometry = null;
    if (cadFileId) {
      const file = db.getCadFileById(cadFileId);
      geometry = file?.geometryAnalysis || null;
    }

    const breakdown = calculateQuote({
      geometry,
      process: process || '3D Printing',
      material: material || 'PLA',
      quantity: Number(quantity) || 1,
      finish,
      deliverySpeed,
    });

    res.json({
      success: true,
      data: {
        ...breakdown,
        geometryUsed: Boolean(geometry),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message || 'Pricing estimation failed' } });
  }
});

apiRouter.get('/quotes', (_req, res) => {
  const quotes = db.getQuotes();
  res.json({ success: true, data: quotes });
});

apiRouter.get('/quotes/:id', (req, res) => {
  const quote = db.getQuoteById(req.params.id);
  if (!quote) return res.status(404).json({ error: { message: 'Quote not found' } });
  res.json({ success: true, data: quote });
});

apiRouter.post('/quotes', (req, res) => {
  try {
    const {
      projectId,
      cadFileIds,
      process,
      material,
      quantity,
      finish,
      tolerance,
      deliverySpeed,
      customerNotes,
      customerName,
      customerEmail,
    } = req.body || {};

    const primaryCadId = Array.isArray(cadFileIds) ? cadFileIds[0] : req.body.cadFileId;
    const cadFile = primaryCadId ? db.getCadFileById(primaryCadId) : null;

    const breakdown = calculateQuote({
      geometry: cadFile?.geometryAnalysis || null,
      process: process || '3D Printing',
      material: material || 'PLA',
      quantity: Number(quantity) || 1,
      finish: finish || 'As manufactured',
      deliverySpeed: deliverySpeed || 'STANDARD',
      tolerance,
    });

    const quote = db.createQuote({
      projectId: projectId || db.getProjects()[0]?.id,
      customerId: 'usr_demo_01',
      customerName: customerName || 'Prototype Maker',
      customerEmail: customerEmail || 'customer@example.com',
      cadFileId: primaryCadId,
      status: 'APPROVED', // Ready for acceptance or review
      process: process || '3D Printing',
      material: material || 'PLA',
      quantity: Number(quantity) || 1,
      finish: finish || 'As manufactured',
      tolerance: tolerance || 'Standard',
      deliverySpeed: deliverySpeed || 'STANDARD',
      customerNotes,
      breakdown,
      estimatedPrice: breakdown.estimatedPrice,
      finalPrice: breakdown.estimatedPrice,
      leadTime: breakdown.leadTimeDays,
    });

    res.status(201).json({ success: true, data: quote });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message || 'Failed to create quote' } });
  }
});

// Accept quote -> generates Order and sends confirmation email with CAD file attached
apiRouter.post('/quotes/:id/accept', async (req, res) => {
  try {
    const quote = db.getQuoteById(req.params.id);
    if (!quote) return res.status(404).json({ error: { message: 'Quote not found' } });

    const cadFile = quote.cadFileId ? db.getCadFileById(quote.cadFileId) : undefined;

    // Create order
    const order = db.createOrder({
      quoteId: quote.id,
      quote,
      cadFileId: quote.cadFileId,
      cadFile,
      customerName: quote.customerName || 'Prototype Maker',
      customerEmail: quote.customerEmail || 'demo@protonex.local',
      customerNotes: quote.customerNotes,
      totalAmount: quote.finalPrice || quote.estimatedPrice,
      productionStatus: 'QUEUED',
      shippingStatus: 'NOT_SHIPPED',
      emailSent: false,
    });

    // Update quote status
    db.updateQuote(quote.id, { status: 'ORDERED' });

    // Send confirmation email with attached CAD file!
    const emailResult = await sendOrderConfirmationEmail(order, quote, cadFile);

    // Update order with email status
    const updatedOrder = db.updateOrder(order.id, {
      emailSent: emailResult.success,
      emailPreviewUrl: emailResult.previewUrl,
    });

    res.status(201).json({
      success: true,
      data: updatedOrder,
      email: {
        sent: emailResult.success,
        previewUrl: emailResult.previewUrl,
        attachment: emailResult.attachmentName,
      },
    });
  } catch (err: any) {
    console.error('Accept quote error:', err);
    res.status(500).json({ error: { message: err.message || 'Failed to accept quote' } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT QUICK ORDER (Used by Landing Page Quote Modal)
// ─────────────────────────────────────────────────────────────────────────────
apiRouter.post('/orders/create', upload.single('file'), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      process,
      material,
      quantity,
      finish,
      deliverySpeed,
      notes,
      address,
    } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ error: { message: 'Name and email are required.' } });
    }

    let cadFile: any = null;
    let existingCadId = req.body.cadFileId;

    // If a file was uploaded in this request
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const geometry = await analyzeCADFile(req.file.path);
      cadFile = db.createCadFile({
        originalName: req.file.originalname,
        fileName: req.file.filename,
        filePath: req.file.path,
        fileSize: req.file.size,
        fileType: ext.replace('.', ''),
        projectId: db.getProjects()[0]?.id,
        uploadedBy: 'usr_demo_01',
        geometryStatus: geometry.ok ? 'COMPLETE' : 'FAILED',
        geometryAnalysis: geometry,
      });
    } else if (existingCadId) {
      cadFile = db.getCadFileById(existingCadId);
    }

    // Calculate quote
    const breakdown = calculateQuote({
      geometry: cadFile?.geometryAnalysis || null,
      process: process || '3D Printing',
      material: material || 'PLA',
      quantity: Number(quantity) || 1,
      finish: finish || 'As manufactured',
      deliverySpeed: deliverySpeed || 'STANDARD',
    });

    // Create quote
    const quote = db.createQuote({
      projectId: db.getProjects()[0]?.id,
      customerId: 'usr_demo_01',
      customerName: name,
      customerEmail: email,
      cadFileId: cadFile?.id,
      status: 'ORDERED',
      process: process || '3D Printing',
      material: material || 'PLA',
      quantity: Number(quantity) || 1,
      finish: finish || 'As manufactured',
      tolerance: 'Standard',
      deliverySpeed: deliverySpeed || 'STANDARD',
      customerNotes: notes,
      breakdown,
      estimatedPrice: breakdown.estimatedPrice,
      finalPrice: breakdown.estimatedPrice,
      leadTime: breakdown.leadTimeDays,
    });

    // Create order
    const order = db.createOrder({
      quoteId: quote.id,
      quote,
      cadFileId: cadFile?.id,
      cadFile: cadFile || undefined,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      customerNotes: notes,
      shippingAddress: address || 'Campus / Standard Shipping',
      totalAmount: quote.finalPrice || quote.estimatedPrice,
      productionStatus: 'QUEUED',
      shippingStatus: 'NOT_SHIPPED',
      emailSent: false,
    });

    // Send email with order details AND CAD file attachment!
    const emailResult = await sendOrderConfirmationEmail(order, quote, cadFile || undefined);

    // Update order with email status
    const updatedOrder = db.updateOrder(order.id, {
      emailSent: emailResult.success,
      emailPreviewUrl: emailResult.previewUrl,
    });

    res.status(201).json({
      success: true,
      data: {
        order: updatedOrder,
        quote,
        cadFile,
        email: {
          sent: emailResult.success,
          previewUrl: emailResult.previewUrl,
          recipient: email,
          attachment: emailResult.attachmentName,
          emailHtml: emailResult.emailHtml,
        },
      },
    });
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: { message: err.message || 'Failed to submit order' } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────
apiRouter.get('/orders', (_req, res) => {
  const orders = db.getOrders();
  res.json({ success: true, data: orders });
});

apiRouter.get('/orders/:id', (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  res.json({ success: true, data: order });
});

apiRouter.get('/orders/:id/email-preview', (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).send('Order not found');
  const quote = order.quoteId ? db.getQuoteById(order.quoteId) : undefined;
  const cadFile = order.cadFileId ? db.getCadFileById(order.cadFileId) : undefined;

  // Import renderer
  const { generateOrderEmailHtml } = require('../services/mailerService');
  const html = generateOrderEmailHtml(order, quote, cadFile);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Admin dashboard summary
apiRouter.get('/admin/dashboard', (_req, res) => {
  const orders = db.getOrders();
  const quotes = db.getQuotes();
  const files = db.getCadFiles();
  res.json({
    success: true,
    data: {
      metrics: {
        totalOrders: orders.length,
        totalQuotes: quotes.length,
        totalFiles: files.length,
        revenue: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
      },
      recentOrders: orders.slice(0, 5),
    },
  });
});
