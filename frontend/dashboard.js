const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = { user: null, projects: [], quotes: [], files: [], orders: [] };
const toast = msg => { const el = $('#dashToast'); el.textContent = msg; el.classList.add('show'); clearTimeout(window.__toast); window.__toast = setTimeout(() => el.classList.remove('show'), 2600); };
function money(v) { return '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatSize(n) { if (n < 1024) return n + ' B'; if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB'; return (n / 1024 / 1024).toFixed(1) + ' MB'; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; }
function niceStatus(s) { return String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

function openTab(tab) {
  $$('.dash-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.dash-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.dash-tab').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));
$$('[data-jump]').forEach(b => b.addEventListener('click', () => openTab(b.dataset.jump)));

// ── Data loading ─────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [projects, quotes, files, orders] = await Promise.all([
      ProtoNexAPI.listProjects(),
      ProtoNexAPI.listQuotes(),
      ProtoNexAPI.listCadFiles(),
      ProtoNexAPI.listOrders(),
    ]);
    state.projects = projects; state.quotes = quotes; state.files = files; state.orders = orders;
  } catch (err) {
    toast(err.message || 'Could not load your workspace');
  }
  renderActivity(); renderProjects(); renderQuotes(); renderFiles(); renderOrders();
  $('#metricProjects').textContent = state.projects.length;
  $('#metricQuotes').textContent = state.quotes.filter(q => ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'APPROVED'].includes(q.status)).length;
  $('#metricFiles').textContent = state.files.length;
  $('#metricOrders').textContent = state.orders.filter(o => o.productionStatus !== 'COMPLETE').length;
}

function renderActivity() {
  const events = [
    ...state.quotes.map(q => ({ icon: '$', title: `Quote ${q.quoteNumber} — ${niceStatus(q.status)}`, sub: q.project?.name || '', date: q.updatedAt })),
    ...state.orders.map(o => ({ icon: '↗', title: `Order ${o.orderNumber} — ${niceStatus(o.productionStatus)}`, sub: niceStatus(o.shippingStatus), date: o.updatedAt })),
    ...state.files.slice(0, 5).map(f => ({ icon: '▧', title: 'CAD file uploaded', sub: f.originalName, date: f.createdAt })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
  $('#activityList').innerHTML = events.length
    ? events.map(e => `<div class="activity"><div class="activity-icon">${e.icon}</div><div><b>${e.title}</b><span>${e.sub}</span></div><time>${formatDate(e.date)}</time></div>`).join('')
    : `<div style="padding:20px;color:#7f8994;font-size:.8rem">No activity yet — upload a CAD file to get started.</div>`;
}

function renderProjects(filter = 'all') {
  const statusMap = { active: 'ACTIVE', complete: 'COMPLETED', review: 'ACTIVE' };
  const list = filter === 'all' ? state.projects : state.projects.filter(p => p.status === statusMap[filter]);
  $('#projectGrid').innerHTML = list.length ? list.map(p => `
    <article class="project-card">
      <div class="project-top">
        <div><div class="eyebrow">${p.projectNumber}</div><h3>${p.name}</h3><p>${p.description || 'No description yet'}</p></div>
        <span class="status ${p.status === 'ACTIVE' ? 'active' : p.status === 'COMPLETED' ? 'complete' : 'review'}">${niceStatus(p.status)}</span>
      </div>
      <div class="project-meta">
        <span><b>${p._count?.cadFiles ?? 0}</b> CAD files</span>
        <span><b>${p._count?.quotes ?? 0}</b> quotes</span>
        <span>${formatDate(p.createdAt)}</span>
      </div>
    </article>`).join('') : `<div style="padding:24px;color:#7f8994;font-size:.85rem">No projects yet. Start a new quote to create one.</div>`;
}
$$('[data-project-filter]').forEach(b => b.addEventListener('click', () => { $$('.filter').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderProjects(b.dataset.projectFilter); }));

function renderQuotes() {
  $('#quoteTable').innerHTML = `<div class="quote-row head"><span>Quote</span><span>Process</span><span>Quantity</span><span>Total</span><span></span></div>` +
    (state.quotes.length ? state.quotes.map(q => `
      <div class="quote-row">
        <div><b>${q.project?.name || 'Project'}</b><span>${q.quoteNumber} • ${q.material}${q.items?.length ? ' • ' + q.items.length + ' CAD' : ''}</span></div>
        <span>${niceStatus(q.process)}</span>
        <span>${q.quantity} units</span>
        <strong>${money(q.finalPrice ?? q.estimatedPrice)}</strong>
        <button class="quote-action" data-quote-id="${q.id}">${['APPROVED'].includes(q.status) ? 'Review' : 'Open'}</button>
      </div>`).join('') : `<div style="padding:20px;color:#7f8994;font-size:.8rem">No quotes yet.</div>`);
  $$('.quote-action').forEach(b => b.addEventListener('click', () => openQuoteDetail(b.dataset.quoteId)));
  $('#quoteCountBadge').textContent = state.quotes.length;
}

async function openQuoteDetail(quoteId) {
  try {
    const q = await ProtoNexAPI.getQuote(quoteId);
    const lines = [
      ['Status', niceStatus(q.status)],
      ['Process', niceStatus(q.process)],
      ['Material', q.material],
      ['Quantity', `${q.quantity} units`],
      ['Lead time', q.leadTime ? `${q.leadTime} days` : 'TBD'],
      ['Price', money(q.finalPrice ?? q.estimatedPrice)],
    ];
    const notes = q.customerNotes ? `<p style="margin-top:12px;color:#b8bfc7;font-size:.85rem">${q.customerNotes}</p>` : '';
    const actions = q.status === 'APPROVED'
      ? `<div style="margin-top:16px;display:flex;gap:10px">
           <button class="btn btn-light btn-small" id="qdAccept">Accept quote</button>
           <button class="btn btn-ghost btn-small" id="qdChanges">Request changes</button>
           <button class="btn btn-ghost btn-small" id="qdPdf">Download PDF</button>
         </div>`
      : `<div style="margin-top:16px"><button class="btn btn-ghost btn-small" id="qdPdf">Download PDF</button></div>`;

    showModal(`Quote ${q.quoteNumber}`, `
      <div class="review-card">${lines.map(([a, b]) => `<div class="review-line"><span>${a}</span><b>${b}</b></div>`).join('')}</div>
      ${notes}${actions}
    `);

    $('#qdAccept')?.addEventListener('click', async () => {
      try { await ProtoNexAPI.acceptQuote(q.id); toast('Quote accepted — order created'); closeGenericModal(); await loadAll(); openTab('orders'); }
      catch (err) { toast(err.message); }
    });
    $('#qdChanges')?.addEventListener('click', async () => {
      const message = prompt('What would you like changed?');
      if (!message) return;
      try { await ProtoNexAPI.requestQuoteChanges(q.id, message); toast('Requested changes sent to our engineers'); closeGenericModal(); await loadAll(); }
      catch (err) { toast(err.message); }
    });
    $('#qdPdf')?.addEventListener('click', async () => {
      try { const { url } = await ProtoNexAPI.getQuotePdf(q.id); window.open(url, '_blank'); }
      catch (err) { toast(err.message); }
    });
  } catch (err) {
    toast(err.message || 'Could not open quote');
  }
}

function renderFiles() {
  $('#fileGrid').innerHTML = state.files.length ? state.files.map(f => `
    <article class="file-card">
      <div class="file-type">${(f.fileType || '').toUpperCase().slice(0, 4)}</div>
      <b title="${f.originalName}">${f.originalName}</b>
      <span>${formatSize(f.fileSize)} • ${formatDate(f.createdAt)}</span>
      <small class="geometry-status ${f.geometryStatus === 'COMPLETE' ? 'ready' : f.geometryStatus === 'PROCESSING' ? 'analyzing' : 'unavailable'}">${niceStatus(f.geometryStatus)}</small>
      <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
        <a href="/api/cad-files/${f.id}/download" class="text-btn" style="color:var(--metal);font-size:.72rem;">⬇ Download</a>
      </div>
    </article>`).join('') : `<div style="padding:24px;color:#7f8994;font-size:.85rem">No CAD files uploaded yet.</div>`;
}

function renderOrders() {
  const labels = ['Queued', 'In production', 'Quality check', 'Ready to ship'];
  const stepIndex = { QUEUED: 1, IN_PRODUCTION: 2, QUALITY_CHECK: 3, READY_TO_SHIP: 4, COMPLETE: 4 };
  $('#orderList').innerHTML = state.orders.length ? state.orders.map(o => {
    const step = stepIndex[o.productionStatus] || 1;
    const material = o.quote?.material || 'Custom Material';
    const total = money(o.totalAmount || (o.quote?.finalPrice ?? o.quote?.estimatedPrice ?? 0));
    const previewUrl = o.emailPreviewUrl || `/api/orders/${o.id}/email-preview`;

    return `<article class="order-card">
      <div class="order-head">
        <div>
          <div class="order-number">${o.orderNumber} &bull; <strong style="color:var(--print)">${total}</strong></div>
          <h3>${material} — ${o.customerName || 'Prototype'}</h3>
          <p>${niceStatus(o.quote?.process || 'Fabrication')} &bull; Sent to ${o.customerEmail}</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <a href="${previewUrl}" target="_blank" class="btn btn-ghost btn-small" style="font-size:.75rem;padding:6px 10px;">📧 View Sent Email</a>
          <span class="status ${o.shippingStatus === 'DELIVERED' ? 'complete' : step >= 3 ? 'review' : 'active'}">${niceStatus(o.shippingStatus === 'NOT_SHIPPED' ? o.productionStatus : o.shippingStatus)}</span>
        </div>
      </div>
      <div class="order-track">${labels.map((l, i) => `<div class="track-step ${i + 1 <= step ? 'done' : ''} ${i + 1 === step ? 'current' : ''}">${l}</div>`).join('')}</div>
      <div class="project-meta" style="margin-top:12px">
        <span>Attached CAD: <b>${o.cadFile?.originalName || 'CAD Model'}</b></span>
        <span>Tracking <b>${o.trackingNumber || 'PNX-TRK-' + o.orderNumber.slice(-4)}</b></span>
      </div>
    </article>`;
  }).join('') : `<div style="padding:24px;color:#7f8994;font-size:.85rem">No orders yet.</div>`;
}

// ── Generic modal for quote detail (reuses existing dashboard modal styling) ──
function showModal(title, bodyHtml) {
  let modal = $('#genericModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'genericModal';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-card"><div class="modal-head"><div><h2 id="genericModalTitle"></h2></div><button class="close" id="genericModalClose" aria-label="Close">×</button></div><div id="genericModalBody" style="padding:0 4px"></div></div>`;
    document.body.appendChild(modal);
    $('#genericModalClose').addEventListener('click', closeGenericModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeGenericModal(); });
  }
  $('#genericModalTitle').textContent = title;
  $('#genericModalBody').innerHTML = bodyHtml;
  modal.classList.add('open');
}
function closeGenericModal() { $('#genericModal')?.classList.remove('open'); }

// ── CAD quote builder ────────────────────────────────────────────────────
const quoteBuilder = { stage: 1, files: [], projectId: null, pricingOptions: null };

function geometryLabel(f) {
  if (!f) return 'Pending';
  if (f.geometryStatus === 'PROCESSING' || f.geometryStatus === 'PENDING') return 'Analyzing geometry…';
  if (f.geometryStatus === 'FAILED') return f.geometryMetadata?.error || 'Geometry analysis unavailable';
  const g = f.geometryAnalysis;
  if (!g) return 'Geometry unavailable';
  const dims = [g.boundingBoxX, g.boundingBoxY, g.boundingBoxZ].every(x => x != null) ? [g.boundingBoxX, g.boundingBoxY, g.boundingBoxZ].map(x => Number(x).toFixed(1)).join(' × ') : '—';
  const volume = g.volume != null ? `${(g.volume / 1000).toFixed(2)} cm³` : 'volume n/a';
  return `${dims} mm · ${volume}`;
}

function renderQuoteFiles() {
  $('#quoteFileList').innerHTML = quoteBuilder.files.map((f, i) => `
    <div class="quote-file">
      <div class="file-type">${f.name.split('.').pop().toUpperCase().slice(0, 4)}</div>
      <div class="quote-file-main">
        <b title="${f.name}">${f.name}</b><span>${formatSize(f.size)}</span>
        <small class="geometry-status ${f.record?.geometryStatus === 'COMPLETE' ? 'ready' : f.uploading ? 'analyzing' : 'unavailable'}">${f.uploading ? `Uploading… ${Math.round((f.progress || 0) * 100)}%` : geometryLabel(f.record)}</small>
      </div>
      <button type="button" data-remove-file="${i}" aria-label="Remove file">×</button>
    </div>`).join('');
  $$('[data-remove-file]').forEach(b => b.addEventListener('click', () => { quoteBuilder.files.splice(Number(b.dataset.removeFile), 1); renderQuoteFiles(); calculateEstimate(); }));
}

async function ensureProject() {
  if (quoteBuilder.projectId) return quoteBuilder.projectId;
  const nameInput = $('#dashboardQuoteForm [name=project]');
  const name = nameInput?.value.trim();
  if (!name) { toast('Enter a project name before attaching CAD files'); nameInput?.focus(); return null; }
  const project = await ProtoNexAPI.createProject({ name });
  quoteBuilder.projectId = project.id;
  return project.id;
}

async function addQuoteFiles(fileList) {
  const projectId = await ensureProject();
  if (!projectId) return;

  const valid = [...fileList].filter(f => f.size <= 200 * 1024 * 1024);
  const rejected = [...fileList].length - valid.length;
  const start = quoteBuilder.files.length;
  quoteBuilder.files.push(...valid.map(f => ({ name: f.name, size: f.size, type: f.type, file: f, uploading: true, progress: 0, record: null, cadFileId: null })));
  renderQuoteFiles();

  for (let i = 0; i < valid.length; i++) {
    const item = quoteBuilder.files[start + i];
    try {
      const record = await ProtoNexAPI.uploadCadFile(projectId, item.file, p => { item.progress = p; renderQuoteFiles(); });
      item.cadFileId = record.id;
      item.uploading = false;
      renderQuoteFiles(); calculateEstimate();
      const polled = await ProtoNexAPI.pollGeometry(record.id);
      item.record = polled;
      renderQuoteFiles(); calculateEstimate();
    } catch (err) {
      item.uploading = false;
      item.record = { geometryStatus: 'FAILED', geometryMetadata: { error: err.message } };
      renderQuoteFiles();
    }
  }

  if (rejected) toast(`${rejected} file${rejected > 1 ? 's' : ''} exceeded the 200 MB limit`);
  else if (valid.length) toast(`${valid.length} CAD file${valid.length > 1 ? 's' : ''} attached — analyzing geometry`);
}

async function loadPricingOptions() {
  if (quoteBuilder.pricingOptions) return quoteBuilder.pricingOptions;
  quoteBuilder.pricingOptions = await ProtoNexAPI.pricingOptions();
  return quoteBuilder.pricingOptions;
}

async function updateMaterials() {
  const options = await loadPricingOptions();
  const processGroup = $('#quoteProcess')?.value || '3D Printing';
  const is3D = processGroup.toLowerCase().includes('3d') || processGroup.toLowerCase().includes('print');
  const materials = options.materials.filter(m => {
    const mIs3D = m.process.toLowerCase().includes('3d') || m.process.toLowerCase().includes('print');
    return is3D === mIs3D;
  });
  if ($('#quoteMaterial')) {
    $('#quoteMaterial').innerHTML = materials.map(m => `<option value="${m.name}">${m.name} (${m.description || m.category})</option>`).join('');
  }
  calculateEstimate();
}

let estimateTimer = null;
function calculateEstimate() {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(async () => {
    const form = $('#dashboardQuoteForm');
    if (!form) return;
    const processGroup = form.process.value || '3D Printing';
    const quantity = Math.max(1, Number(form.quantity.value || 1));
    const material = form.material.value;
    if (!material) return;

    const readyFile = quoteBuilder.files.find(f => f.record?.geometryStatus === 'COMPLETE');
    try {
      const breakdown = await ProtoNexAPI.priceEstimate({
        cadFileId: readyFile?.cadFileId || undefined,
        process: processGroup,
        material,
        quantity,
        deliverySpeed: (form.delivery.value.includes('Rush') ? 'RUSH' : form.delivery.value.includes('Express') ? 'EXPRESS' : 'STANDARD'),
      });
      $('#quoteEstimate').textContent = money(breakdown.estimatedPrice);
      $('#quoteEstimateMeta').textContent = breakdown.geometryUsed ? `Based on analyzed CAD geometry • ${breakdown.leadTimeDays} day lead time` : `Provisional estimate — CAD geometry still processing`;
      $('#estimateBar').style.width = Math.min(100, breakdown.geometryUsed ? 85 : 40) + '%';
      const g = readyFile?.record?.geometryAnalysis;
      const metric = $('#geometrySummary');
      if (metric) {
        const analyzed = quoteBuilder.files.filter(f => f.record?.geometryStatus === 'COMPLETE').length;
        metric.innerHTML = `<div><span>Analyzed</span><b>${analyzed}/${quoteBuilder.files.length} file${quoteBuilder.files.length !== 1 ? 's' : ''}</b></div><div><span>Model volume</span><b>${g?.volume ? (g.volume / 1000).toFixed(2) + ' cm³' : '—'}</b></div><div><span>Surface area</span><b>${g?.surfaceArea ? (g.surfaceArea / 100).toFixed(2) + ' cm²' : '—'}</b></div><div><span>Largest envelope</span><b>${g ? [g.boundingBoxX, g.boundingBoxY, g.boundingBoxZ].map(x => Number(x || 0).toFixed(1)).join(' × ') + ' mm' : '—'}</b></div>`;
      }
    } catch (err) {
      $('#quoteEstimateMeta').textContent = 'Estimate unavailable — ' + err.message;
    }
  }, 350);
}

function reviewQuote() {
  const f = new FormData($('#dashboardQuoteForm'));
  const lines = [['Project', f.get('project') || '—'], ['CAD', quoteBuilder.files.length ? quoteBuilder.files.map(x => x.name).join(', ') : 'No CAD attached'], ['Process', f.get('process')], ['Material', f.get('material')], ['Quantity', `${f.get('quantity')} units`], ['Finish', f.get('finish')], ['Delivery', f.get('delivery')], ['Tolerance', f.get('tolerance')]];
  $('#quoteReview').innerHTML = lines.map(([a, b]) => `<div class="review-line"><span>${a}</span><b>${b}</b></div>`).join('');
  calculateEstimate();
}

function setStage(n) {
  quoteBuilder.stage = n;
  $$('.quote-stage').forEach(s => s.classList.toggle('active', Number(s.dataset.stage) === n));
  $$('.qstep').forEach((s, i) => { s.classList.toggle('active', i + 1 === n); s.classList.toggle('done', i + 1 < n); });
  $('#quoteBack').hidden = n === 1; $('#quoteNext').hidden = n === 3; $('#quoteSubmit').hidden = n !== 3;
  if (n === 3) reviewQuote();
}

async function openQuoteModal(process) {
  const modal = $('#dashboardQuoteModal'); modal.classList.add('open');
  quoteBuilder.stage = 1; quoteBuilder.files = []; quoteBuilder.projectId = null;
  $('#dashboardQuoteForm').reset(); $('#quoteFileList').innerHTML = '';
  await updateMaterials();
  if (process) { $('#quoteProcess').value = process; await updateMaterials(); }
  setStage(1);
  setTimeout(() => $('#dashboardQuoteForm input[name=project]')?.focus(), 80);
}
function closeQuoteModal() { $('#dashboardQuoteModal').classList.remove('open'); }
['#sideNewQuote', '#mobileNewQuote', '#quotesNew', '#dashQuoteNav'].forEach(s => $(s)?.addEventListener('click', e => { e.preventDefault(); openQuoteModal(); }));
$$('.quick-card').forEach(b => b.addEventListener('click', () => openQuoteModal(b.dataset.process)));
$('#dashModalClose').addEventListener('click', closeQuoteModal);
$('#dashModalCancel').addEventListener('click', closeQuoteModal);
$('#dashboardQuoteModal').addEventListener('click', e => { if (e.target.id === 'dashboardQuoteModal') closeQuoteModal(); });
$('#quoteProcess').addEventListener('change', updateMaterials);
$('#dashboardQuoteForm').addEventListener('input', () => { if (quoteBuilder.stage === 3) reviewQuote(); else calculateEstimate(); });
$('#quoteNext').addEventListener('click', () => {
  const form = $('#dashboardQuoteForm');
  if (quoteBuilder.stage === 1 && !form.reportValidity()) return;
  if (quoteBuilder.stage === 1 && quoteBuilder.files.length === 0) { toast('Add at least one CAD file to continue'); return; }
  if (quoteBuilder.stage === 2 && !form.reportValidity()) return;
  setStage(quoteBuilder.stage + 1);
});
$('#quoteBack').addEventListener('click', () => setStage(quoteBuilder.stage - 1));
$('#browseQuoteCad').addEventListener('click', () => $('#quoteCadInput').click());
$('#quoteCadInput').addEventListener('change', e => addQuoteFiles(e.target.files));
const quoteDrop = $('#quoteDrop');
['dragenter', 'dragover'].forEach(ev => quoteDrop.addEventListener(ev, e => { e.preventDefault(); quoteDrop.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => quoteDrop.addEventListener(ev, e => { e.preventDefault(); quoteDrop.classList.remove('drag'); }));
quoteDrop.addEventListener('drop', e => addQuoteFiles(e.dataTransfer.files));

$('#dashboardQuoteForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  const pendingUploads = quoteBuilder.files.some(f => f.uploading);
  const cadFileIds = quoteBuilder.files.map(f => f.cadFileId).filter(Boolean);
  if (!cadFileIds.length || pendingUploads) { toast('Wait for CAD upload to finish before submitting'); setStage(1); return; }

  const submit = $('#quoteSubmit'); submit.disabled = true; submit.textContent = 'Submitting…';
  try {
    const process = data.get('process') || '3D Printing';
    const deliverySpeed = data.get('delivery').includes('Rush') ? 'RUSH' : data.get('delivery').includes('Express') ? 'EXPRESS' : 'STANDARD';
    const quote = await ProtoNexAPI.createQuote({
      projectId: quoteBuilder.projectId,
      cadFileIds,
      process,
      material: data.get('material'),
      quantity: Number(data.get('quantity') || 1),
      finish: data.get('finish') || undefined,
      tolerance: data.get('tolerance') || undefined,
      deliverySpeed,
      customerNotes: data.get('notes') || undefined,
    });
    await loadAll();
    closeQuoteModal(); openTab('quotes');
    toast(`${quote.quoteNumber} submitted — engineering review started`);
  } catch (err) {
    toast(err.message || 'Could not submit quote request');
  } finally {
    submit.disabled = false; submit.textContent = 'Submit quote request ↗';
  }
});

$('#newProject').addEventListener('click', async () => {
  const name = prompt('Project name'); if (!name) return;
  try { await ProtoNexAPI.createProject({ name }); toast('Project created'); await loadAll(); }
  catch (err) { toast(err.message); }
});

// Standalone "Upload CAD" tab — attaches to the most recently created project, or prompts for one.
const uploadZone = $('#uploadZone'), cadUploadInput = $('#cadUpload');
async function addFilesToLibrary(fileList) {
  let projectId = state.projects[0]?.id;
  if (!projectId) {
    const name = prompt('Which project are these files for?');
    if (!name) return;
    const project = await ProtoNexAPI.createProject({ name });
    projectId = project.id;
  }
  const files = [...fileList];
  for (const file of files) {
    try { await ProtoNexAPI.uploadCadFile(projectId, file); }
    catch (err) { toast(`${file.name}: ${err.message}`); }
  }
  toast(`${files.length} CAD file${files.length > 1 ? 's' : ''} uploaded — analyzing geometry`);
  await loadAll();
}
cadUploadInput?.addEventListener('change', e => addFilesToLibrary(e.target.files));
['dragenter', 'dragover'].forEach(ev => uploadZone?.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => uploadZone?.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.remove('drag'); }));
uploadZone?.addEventListener('drop', e => addFilesToLibrary(e.dataTransfer.files));
uploadZone?.addEventListener('click', () => cadUploadInput.click());

$('.menu')?.addEventListener('click', () => $('.site-nav')?.classList.toggle('open'));
$('.dash-signout')?.addEventListener('click', async e => { e.preventDefault(); await ProtoNexAPI.logout().catch(() => {}); window.location.href = 'login.html'; });

// ── Boot ─────────────────────────────────────────────────────────────────
(async () => {
  state.user = await protoNexRequireAuth();
  if (!state.user) return;
  const profileName = $('.dash-profile strong');
  if (profileName) profileName.textContent = state.user.name;
  await loadAll();
})();
