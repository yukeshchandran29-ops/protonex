const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const state = { user: null, quotes: [], filter: 'All', selected: null, search: '' };
const toast = m => { const e = $('#adminToast'); e.textContent = m; e.classList.add('show'); clearTimeout(window.__t); window.__t = setTimeout(() => e.classList.remove('show'), 2600); };
function money(v) { return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function statusClass(s) { return String(s || '').toLowerCase().replace(/_/g, '-'); }
function niceStatus(s) { return String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

// Keys must match the data-filter attributes in admin.html exactly.
const STATUS_FILTERS = {
  All: null,
  Submitted: ['SUBMITTED'],
  'Needs review': ['UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO'],
  Approved: ['APPROVED'],
  Rejected: ['REJECTED'],
};

async function loadQuotes() {
  try {
    state.quotes = await ProtoNexAPI.listQuotes();
  } catch (err) {
    state.quotes = [];
    toast(err.message || 'Could not load the quotation queue');
  }
  renderList();
  if (state.selected) selectQuote(state.selected);
}

function filtered() {
  const wanted = STATUS_FILTERS[state.filter];
  return state.quotes.filter(q => {
    const matchesFilter = !wanted || wanted.includes(q.status);
    const s = state.search.toLowerCase();
    const haystack = [q.quoteNumber, q.project?.name, q.process, q.material, q.customer?.name].filter(Boolean).join(' ').toLowerCase();
    return matchesFilter && (!s || haystack.includes(s));
  });
}

function renderList() {
  const el = $('#adminQuoteList'), rows = filtered();
  el.innerHTML = rows.length ? rows.map(q => `
    <div class="admin-quote-item ${q.id === state.selected ? 'selected' : ''}" data-id="${q.id}">
      <div class="row"><b>${q.quoteNumber}</b><span class="admin-status ${statusClass(q.status)}">${niceStatus(q.status)}</span></div>
      <strong style="display:block;margin-top:8px;font-size:.8rem">${q.project?.name || 'Untitled project'}</strong>
      <small>${niceStatus(q.process)} · ${q.material}</small>
      <span>${q.quantity} units · ${money(q.finalPrice ?? q.estimatedPrice)}</span>
    </div>`).join('') : `<div style="padding:20px;color:#7f8994;font-size:.76rem">No quotations match this queue.</div>`;
  $$('.admin-quote-item').forEach(e => e.onclick = () => selectQuote(e.dataset.id));
}

function summarizeGeometry(quote) {
  const analyses = (quote.items || []).map(i => i.cadFile?.geometryAnalysis).filter(Boolean);
  const volume = analyses.reduce((a, g) => a + Number(g.volume || 0), 0);
  const area = analyses.reduce((a, g) => a + Number(g.surfaceArea || 0), 0);
  const faces = analyses.reduce((a, g) => a + Number(g.faceCount || 0), 0);
  const dims = analyses.length
    ? [0, 1, 2].map(i => Math.max(...analyses.map(g => Number([g.boundingBoxX, g.boundingBoxY, g.boundingBoxZ][i] || 0))))
    : null;
  return { analyzed: analyses.length, total: (quote.items || []).length, volume, area, faces, dims };
}

async function selectQuote(id) {
  state.selected = id;
  renderList();
  let q;
  try {
    q = await ProtoNexAPI.getQuote(id);
  } catch (err) {
    toast(err.message || 'Could not load quote'); return;
  }

  const g = summarizeGeometry(q);
  const estimate = Number(q.estimatedPrice || 0);
  const final = Number(q.finalPrice ?? estimate);

  const cadRows = (q.items || []).map(item => {
    const f = item.cadFile;
    const status = f?.geometryStatus;
    return `<div class="cad-row"><div><b>${f?.originalName || 'CAD file'}</b><span>${f?.fileSize ? Math.round(f.fileSize / 1024) + ' KB' : ''}</span></div><span>${status === 'COMPLETE' ? 'Geometry ready' : status === 'FAILED' ? 'Analysis failed' : 'Analyzing…'}</span></div>`;
  }).join('');

  $('#adminDetail').innerHTML = `
    <div class="admin-detail-head">
      <div><div class="eyebrow">${q.quoteNumber} · submitted ${q.createdAt ? new Date(q.createdAt).toLocaleString('en-US') : '—'}</div>
        <h2>${q.project?.name || 'Untitled project'}</h2>
        <p>${q.customer?.name || ''} (${q.customer?.email || ''}) · ${niceStatus(q.process)} · ${q.material} · ${q.quantity} units</p>
      </div>
      <div class="admin-actions">
        <button class="admin-btn" id="downloadQuote">Download PDF</button>
        <button class="admin-btn danger" id="rejectQuote">Reject</button>
        <button class="admin-btn primary" id="approveQuote">Approve & send</button>
      </div>
    </div>
    <div class="admin-grid">
      <div>
        <div class="admin-card">
          <h3>Geometry intelligence</h3>
          <div class="admin-kpis">
            <div class="admin-kpi"><span>CAD analyzed</span><b>${g.analyzed}/${g.total}</b></div>
            <div class="admin-kpi"><span>Total volume</span><b>${g.volume ? (g.volume / 1000).toFixed(1) + ' cm³' : '—'}</b></div>
            <div class="admin-kpi"><span>Surface area</span><b>${g.area ? (g.area / 100).toFixed(1) + ' cm²' : '—'}</b></div>
            <div class="admin-kpi"><span>Faces</span><b>${g.faces || '—'}</b></div>
          </div>
          <table class="geometry-table" style="margin-top:12px">
            <tr><td>Largest envelope</td><td>${g.dims ? g.dims.map(x => x.toFixed(1)).join(' × ') + ' mm' : '—'}</td></tr>
            <tr><td>Requested delivery</td><td>${niceStatus(q.deliverySpeed)}</td></tr>
            <tr><td>Finish / tolerance</td><td>${q.finish || 'Standard'} · ${q.tolerance || 'Standard'}</td></tr>
          </table>
        </div>
        <div class="admin-card" style="margin-top:14px">
          <h3>Price breakdown (system estimate)</h3>
          <table class="geometry-table">
            <tr><td>Material</td><td>${money(q.materialCost)}</td></tr>
            <tr><td>Machine</td><td>${money(q.machineCost)}</td></tr>
            <tr><td>Setup</td><td>${money(q.setupCost)}</td></tr>
            <tr><td>Finishing</td><td>${money(q.finishingCost)}</td></tr>
            <tr><td>Rush/delivery</td><td>${money(q.rushCost)}</td></tr>
            <tr><td><b>System estimate</b></td><td><b>${money(estimate)}</b></td></tr>
          </table>
        </div>
        <div class="admin-card" style="margin-top:14px">
          <h3>CAD submissions</h3>
          <div class="cad-list">${cadRows || '<div class="admin-note">No CAD files attached.</div>'}</div>
        </div>
      </div>
      <div>
        <div class="admin-card">
          <h3>Commercial decision</h3>
          <div class="price-editor">
            <div class="admin-field"><label>Final customer price (USD)</label><input id="finalPrice" type="number" min="0" step="0.01" value="${final || ''}"></div>
            <button class="admin-btn primary" id="savePrice">Save</button>
          </div>
          <div class="admin-field" style="margin-top:13px"><label>Status</label>
            <select id="quoteStatus">
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="NEEDS_CUSTOMER_INFO">Needs customer info</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div class="admin-field"><label>Lead time (days)</label><input id="leadTime" type="number" min="1" value="${q.leadTime || 10}"></div>
          <div class="admin-note">System estimate: <b>${money(estimate)}</b>. Final price is controlled by the engineer and should account for DFM, finishing, and any manual adjustments.</div>
        </div>
        <div class="admin-card" style="margin-top:14px">
          <h3>Internal notes</h3>
          <div class="admin-field"><textarea id="internalNotes" placeholder="Record DFM observations, tooling, setup notes — never shown to the customer…">${q.internalNotes || ''}</textarea></div>
          <button class="admin-btn" id="saveNotes">Save notes</button>
        </div>
        <div class="admin-card" style="margin-top:14px">
          <h3>Customer-facing note</h3>
          <div class="admin-field"><textarea id="customerNotes" placeholder="Message included with the final quote…">${q.customerNotes || ''}</textarea></div>
        </div>
      </div>
    </div>`;

  $('#quoteStatus').value = q.status;
  $('#savePrice').onclick = () => save({ finalPrice: Number($('#finalPrice').value || 0) });
  $('#saveNotes').onclick = () => save({ internalNotes: $('#internalNotes').value, customerNotes: $('#customerNotes').value });
  $('#quoteStatus').onchange = () => save({ status: $('#quoteStatus').value });
  $('#approveQuote').onclick = () => save({
    status: 'APPROVED',
    finalPrice: Number($('#finalPrice').value || final || estimate),
    leadTime: Number($('#leadTime').value || q.leadTime || 10),
    internalNotes: $('#internalNotes').value,
    customerNotes: $('#customerNotes').value,
  });
  $('#rejectQuote').onclick = () => save({ status: 'REJECTED', internalNotes: $('#internalNotes').value });
  $('#downloadQuote').onclick = async () => {
    try { const { url } = await ProtoNexAPI.getQuotePdf(q.id); window.open(url, '_blank'); }
    catch (err) { toast(err.message || 'Could not generate PDF'); }
  };
}

async function save(patch) {
  if (!state.selected) return;
  try {
    const q = await ProtoNexAPI.reviewQuote(state.selected, patch);
    const i = state.quotes.findIndex(x => x.id === state.selected);
    if (i >= 0) state.quotes[i] = { ...state.quotes[i], ...q };
    renderList();
    await selectQuote(q.id);
    toast(`${q.quoteNumber} updated`);
  } catch (err) {
    toast(err.message || 'Could not save changes');
  }
}

$$('.admin-filter').forEach(b => b.onclick = () => {
  $$('.admin-filter').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  state.filter = b.dataset.filter;
  renderList();
});
$('#adminSearch').oninput = e => { state.search = e.target.value; renderList(); };
$('.menu')?.addEventListener('click', () => $('.site-nav')?.classList.toggle('open'));
$('#logoutBtn')?.addEventListener('click', async e => { e.preventDefault(); await ProtoNexAPI.logout().catch(() => {}); window.location.href = 'login.html'; });

(async () => {
  state.user = await protoNexRequireAuth(['ENGINEER', 'ADMIN']);
  if (!state.user) return;
  await loadQuotes();
})();
