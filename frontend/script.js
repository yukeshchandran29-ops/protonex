const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const menu = $('.menu'), nav = $('.site-nav');
if(menu) menu.addEventListener('click',()=>{nav.classList.toggle('open'); menu.setAttribute('aria-expanded',nav.classList.contains('open'))});

// ─────────────────────────────────────────────────────────────────────────────
// FAST QUOTE & INSTANT ORDER ENGINE (COLLEGE EDITION)
// ─────────────────────────────────────────────────────────────────────────────

const modal = $('#quoteModal');
const quoteType = $('#quoteType');
const quoteMaterial = $('#quoteMaterial');
const quoteQty = $('#quoteQty');
const quoteFinish = $('#quoteFinish');
const quoteDelivery = $('#quoteDelivery');
const quoteFile = $('#quoteFile');
const homeDropZone = $('#homeDropZone');
const homeBrowseBtn = $('#homeBrowseBtn');
const cadAnalysisPill = $('#cadAnalysisPill');
const quoteForm = $('#quoteForm');
const orderSuccessView = $('#orderSuccessView');
const emailModal = $('#emailModal');

let currentUploadedCad = null;
let lastEmailData = null;

function getMaterialsForProcess(process) {
  const p = (process || '').toLowerCase();
  if (p.includes('sla') || p.includes('resin')) {
    return [
      { value: 'Tough Resin', label: 'Tough Resin (High Precision & Impact Resistant)' },
      { value: 'Resin', label: 'Standard White Resin (Smooth Presentation Quality)' },
    ];
  }
  if (p.includes('sls') || p.includes('nylon')) {
    return [
      { value: 'SLS Nylon', label: 'SLS Nylon PA12 (Tooling-Free Strong Functional)' },
    ];
  }
  if (p.includes('fdm') || p.includes('print') || p.includes('3d')) {
    return [
      { value: 'PLA', label: 'PLA (Polylactic Acid - Standard Rapid Prototype)' },
      { value: 'ABS', label: 'ABS (Durable Impact & Heat Resistant)' },
      { value: 'PETG', label: 'PETG (High Toughness & Chemical Resistant)' },
      { value: 'Tough Resin', label: 'Tough Resin (High Detail)' },
      { value: 'SLS Nylon', label: 'SLS Nylon PA12' },
    ];
  }
  // Metal cutting / CNC
  return [
    { value: 'Aluminum 6061-T6', label: 'Aluminum 6061-T6 (Aircraft Grade Lightweight)' },
    { value: 'Stainless Steel 304', label: 'Stainless Steel 304 (Corrosion Resistant)' },
    { value: 'Mild Steel', label: 'Mild Steel (Economical Heavy-Duty Structural)' },
    { value: 'Brass', label: 'Brass (Low Friction Bearing Alloy)' },
    { value: 'Copper', label: 'Copper (High Electrical & Thermal Conductivity)' },
  ];
}

function updateMaterialOptions() {
  const process = quoteType ? quoteType.value : '3D Printing - FDM';
  const list = getMaterialsForProcess(process);
  if (quoteMaterial) {
    quoteMaterial.innerHTML = list.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  }
  calculateLiveEstimate();
}

if (quoteType) {
  quoteType.addEventListener('change', updateMaterialOptions);
}

function openQuote(type) {
  if (!modal) return;
  if (orderSuccessView) orderSuccessView.style.display = 'none';
  if (quoteForm) quoteForm.style.display = 'block';

  if (quoteType && type) {
    quoteType.value = type.toLowerCase().includes('metal') ? 'Metal Cutting - Laser' : '3D Printing - FDM';
  }
  updateMaterialOptions();

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#quoteName')?.focus(), 50);
}

function closeQuote() {
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

$$('[data-quote]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); openQuote(b.dataset.quote); }));
$('.close')?.addEventListener('click', closeQuote);
modal?.addEventListener('click', e => { if (e.target === modal) closeQuote(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeQuote(); closeEmailModal(); } });

// File browsing and drag-drop
if (homeBrowseBtn) {
  homeBrowseBtn.addEventListener('click', () => quoteFile?.click());
}

if (quoteFile) {
  quoteFile.addEventListener('change', () => {
    if (quoteFile.files && quoteFile.files[0]) {
      handleCADUpload(quoteFile.files[0]);
    }
  });
}

if (homeDropZone) {
  ['dragenter', 'dragover'].forEach(ev => homeDropZone.addEventListener(ev, e => {
    e.preventDefault();
    homeDropZone.style.borderColor = 'var(--metal)';
    homeDropZone.style.background = 'rgba(255,99,56,0.08)';
  }));
  ['dragleave', 'drop'].forEach(ev => homeDropZone.addEventListener(ev, e => {
    e.preventDefault();
    homeDropZone.style.borderColor = '';
    homeDropZone.style.background = '';
  }));
  homeDropZone.addEventListener('drop', e => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCADUpload(e.dataTransfer.files[0]);
    }
  });
}

// Upload & geometry analysis
async function handleCADUpload(file) {
  if (!homeDropZone || !cadAnalysisPill) return;

  homeDropZone.innerHTML = `<strong>Uploading & Analyzing ${file.name}…</strong><span>Running geometry engine for volume & dimensions</span>`;

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || 'Upload failed');

    currentUploadedCad = json.data;
    const g = currentUploadedCad.geometryAnalysis;

    homeDropZone.style.display = 'none';
    cadAnalysisPill.style.display = 'block';

    const dims = g?.bboxMm ? `${g.bboxMm[0]} × ${g.bboxMm[1]} × ${g.bboxMm[2]} mm` : '—';
    const vol = g?.volumeCm3 ? `${g.volumeCm3} cm³` : '—';
    const faces = g?.faces ? g.faces.toLocaleString() + ' facets' : 'Mesh verified';

    cadAnalysisPill.innerHTML = `
      <div class="cad-analysis-pill">
        <div class="pill-header">
          <div class="pill-title">📦 ${currentUploadedCad.originalName}</div>
          <span class="pill-tag">${currentUploadedCad.fileType.toUpperCase()} Verified</span>
        </div>
        <div class="cad-metrics-row">
          <span>Envelope: <b>${dims}</b></span>
          <span>Volume: <b>${vol}</b></span>
          <span>Mesh: <b>${faces}</b></span>
          <button type="button" id="btnReplaceCad" style="background:transparent;border:0;color:var(--metal);cursor:pointer;font-size:0.75rem;margin-left:auto;">Replace file</button>
        </div>
      </div>
    `;

    $('#btnReplaceCad')?.addEventListener('click', () => {
      currentUploadedCad = null;
      cadAnalysisPill.style.display = 'none';
      homeDropZone.style.display = 'block';
      homeDropZone.innerHTML = `
        <strong>Drop your CAD file here</strong>
        <span>or click to browse from computer</span>
        <button type="button" class="btn btn-ghost btn-small" id="homeBrowseBtn" style="margin-top:10px">Select File</button>
      `;
      $('#homeBrowseBtn')?.addEventListener('click', () => quoteFile?.click());
      calculateLiveEstimate();
    });

    calculateLiveEstimate();
  } catch (err) {
    homeDropZone.innerHTML = `
      <strong style="color:#ff8787">Upload analysis notice</strong>
      <span>${err.message || 'Could not parse CAD geometry. Using standard estimate.'}</span>
      <button type="button" class="btn btn-ghost btn-small" id="homeBrowseBtn" style="margin-top:10px">Try another file</button>
    `;
    $('#homeBrowseBtn')?.addEventListener('click', () => quoteFile?.click());
    calculateLiveEstimate();
  }
}

// Live Estimate calculation
let estimateDebounce = null;
async function calculateLiveEstimate() {
  clearTimeout(estimateDebounce);
  estimateDebounce = setTimeout(async () => {
    const process = quoteType ? quoteType.value : '3D Printing';
    const material = quoteMaterial ? quoteMaterial.value : 'PLA';
    const quantity = quoteQty ? Math.max(1, parseInt(quoteQty.value) || 1) : 1;
    const finish = quoteFinish ? quoteFinish.value : 'As manufactured';
    const deliverySpeed = quoteDelivery ? quoteDelivery.value : 'STANDARD';

    try {
      const res = await fetch('/api/pricing/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cadFileId: currentUploadedCad?.id,
          process,
          material,
          quantity,
          finish,
          deliverySpeed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message);

      const b = json.data;
      if ($('#lqTotal')) $('#lqTotal').innerHTML = `&#8377;${Math.round(b.estimatedPrice).toLocaleString('en-IN')}`;
      if ($('#lqMaterial')) $('#lqMaterial').innerHTML = `&#8377;${Math.round(b.materialCost).toLocaleString('en-IN')}`;
      if ($('#lqMachine')) $('#lqMachine').innerHTML = `&#8377;${Math.round(b.machineCost).toLocaleString('en-IN')}`;
      if ($('#lqSetup')) $('#lqSetup').innerHTML = `&#8377;${Math.round(b.setupCost + b.finishingCost).toLocaleString('en-IN')}`;
      if ($('#lqTax')) $('#lqTax').innerHTML = `&#8377;${Math.round(b.tax).toLocaleString('en-IN')}`;
      if ($('#lqLeadTime')) $('#lqLeadTime').textContent = `Estimated turnaround: ${b.leadTimeDays} business days (${quantity} unit${quantity > 1 ? 's' : ''})`;
    } catch (err) {
      // Fallback display if offline
    }
  }, 150);
}

[quoteQty, quoteMaterial, quoteFinish, quoteDelivery, quoteType].forEach(el => {
  el?.addEventListener('input', calculateLiveEstimate);
  el?.addEventListener('change', calculateLiveEstimate);
});

// Form submission -> Order Creation + Email with CAD attached!
quoteForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#btnSubmitOrder');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processing & Sending Email…';
  }

  const fd = new FormData(quoteForm);
  if (currentUploadedCad) {
    fd.append('cadFileId', currentUploadedCad.id);
  } else if (quoteFile?.files && quoteFile.files[0]) {
    fd.append('file', quoteFile.files[0]);
  }

  try {
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || 'Order submission failed');

    const { order, quote, email, cadFile } = json.data;
    lastEmailData = {
      order,
      quote,
      email,
      cadFile,
    };

    // Show success view
    quoteForm.style.display = 'none';
    if (orderSuccessView) {
      orderSuccessView.style.display = 'block';
      if ($('#successOrderNumber')) $('#successOrderNumber').textContent = order.orderNumber;
      if ($('#successOrderDesc')) {
        $('#successOrderDesc').innerHTML = `
          We have generated your instant quote of <strong>&#8377;${order.totalAmount.toLocaleString('en-IN')}</strong>.<br>
          A confirmation email with order details and your CAD file (<strong>${cadFile?.originalName || 'CAD design'}</strong>) has been sent to <strong>${order.customerEmail}</strong>.
        `;
      }
    }
  } catch (err) {
    alert(err.message || 'Error creating order');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Confirm Order & Send CAD Quote ↗';
    }
  }
});

// Email Viewer Modal
function openEmailModal() {
  if (!emailModal || !lastEmailData) return;
  const { order, email, cadFile } = lastEmailData;

  $('#emailViewerRecipient').textContent = order.customerEmail;
  $('#emailViewerSubject').textContent = `Order Confirmed: ${order.orderNumber} — ProtoNex CAD Fabrication Quote`;
  $('#emailViewerAttachment').textContent = cadFile?.originalName ? `📎 ${cadFile.originalName}` : '📎 CAD Model';

  const linkDiv = $('#emailViewerEtherealLink');
  const webLink = $('#etherealWebLink');
  if (email?.previewUrl) {
    linkDiv.style.display = 'block';
    webLink.href = email.previewUrl;
  } else {
    linkDiv.style.display = 'none';
  }

  const iframe = $('#emailIframe');
  if (iframe) {
    iframe.srcdoc = email?.emailHtml || '<p style="padding:20px;font-family:sans-serif">Loading email content...</p>';
  }

  emailModal.classList.add('open');
}

function closeEmailModal() {
  if (emailModal) emailModal.classList.remove('open');
}

$('#btnPreviewSentEmail')?.addEventListener('click', e => {
  e.preventDefault();
  openEmailModal();
});
$('#emailModalClose')?.addEventListener('click', closeEmailModal);
emailModal?.addEventListener('click', e => { if (e.target === emailModal) closeEmailModal(); });
$('#btnDoneClose')?.addEventListener('click', closeQuote);

// Initialize quote on load
updateMaterialOptions();


/* =========================================================
   ProtoNex Premium Interaction Layer
   ========================================================= */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll progress + compact header
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  document.body.appendChild(progress);

  const updateScrollUI = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
    document.querySelector('.site-header')?.classList.toggle('scrolled', window.scrollY > 12);
  };
  updateScrollUI();
  window.addEventListener('scroll', updateScrollUI, {passive:true});

  // Add reveal classes automatically to content
  document.querySelectorAll('.choice-grid, .trust-grid, .card-grid, .steps, .specs, .materials').forEach(el => el.classList.add('stagger', 'is-visible'));
  document.querySelectorAll('.section .label, .page-hero > div:first-child').forEach(el => el.classList.add('reveal-left', 'is-visible'));
  document.querySelectorAll('.quote').forEach(el => el.classList.add('reveal-scale', 'is-visible'));

  const revealTargets = document.querySelectorAll('.reveal, .reveal-left, .reveal-scale, .stagger, .section h2');

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, { threshold: 0.05, rootMargin: '40px 0px 40px 0px' });

    revealTargets.forEach(el => observer.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }
})();
