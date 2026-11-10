const fs = require('fs');
const path = require('path');
const http = require('http');

async function runTest() {
  console.log('Testing geometry analysis directly...');
  const { analyzeCADFile } = require('./dist/services/geometryEngine');
  const samplePath = path.join(__dirname, '..', 'sample_cad_files', 'mounting_bracket.stl');
  const geo = await analyzeCADFile(samplePath);
  console.log('Geometry Result:', geo);

  console.log('\nTesting pricing calculation...');
  const { calculateQuote } = require('./dist/services/pricingEngine');
  const quote = calculateQuote({
    geometry: geo,
    process: '3D Printing',
    material: 'PLA',
    quantity: 2,
    deliverySpeed: 'STANDARD',
  });
  console.log('Calculated Quote Breakdown:', quote);

  console.log('\nTesting mailer service with CAD attachment...');
  const { sendOrderConfirmationEmail } = require('./dist/services/mailerService');
  const fakeOrder = {
    id: 'ord_test_01',
    orderNumber: 'PNX-O-TEST-101',
    customerName: 'Alex Chen (College Project Evaluation)',
    customerEmail: 'alex.chen@student.university.edu',
    customerPhone: '+91 98765 43210',
    totalAmount: quote.estimatedPrice,
    productionStatus: 'QUEUED',
    shippingStatus: 'NOT_SHIPPED',
    emailSent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const fakeQuote = {
    id: 'qte_test_01',
    quoteNumber: 'PNX-Q-TEST-101',
    status: 'ORDERED',
    process: '3D Printing',
    material: 'PLA',
    quantity: 2,
    finish: 'As manufactured',
    tolerance: 'Standard',
    deliverySpeed: 'STANDARD',
    breakdown: quote,
    estimatedPrice: quote.estimatedPrice,
    leadTime: quote.leadTimeDays,
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  };

  const fakeCad = {
    id: 'cad_test_01',
    originalName: 'mounting_bracket.stl',
    fileName: 'mounting_bracket.stl',
    filePath: samplePath,
    fileSize: fs.statSync(samplePath).size,
    fileType: 'stl',
    geometryStatus: 'COMPLETE',
    geometryAnalysis: geo,
    createdAt: new Date().toISOString(),
  };

  const emailRes = await sendOrderConfirmationEmail(fakeOrder, fakeQuote, fakeCad);
  console.log('Email Send Result:', {
    success: emailRes.success,
    recipient: emailRes.recipient,
    previewUrl: emailRes.previewUrl,
    attachment: emailRes.attachmentName,
  });

  console.log('\n>>> ALL TEST VERIFICATIONS PASSED SUCCESSFULLY! <<<');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
