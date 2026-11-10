// ProtoNex API client — shared by dashboard.js, admin.js, and script.js.
// Connects to local ProtoNex API endpoints.
const ProtoNexAPI = (() => {
  const BASE = '/api';

  async function request(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error?.message || `Request failed (${res.status})`);
      err.code = json?.error?.code;
      err.status = res.status;
      throw err;
    }
    return json.data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),

    me: () => request('GET', '/auth/me'),
    logout: () => request('POST', '/auth/logout'),

    listProjects: () => request('GET', '/projects'),
    createProject: (data) => request('POST', '/projects', data),

    getCadFile: (id) => request('GET', `/cad-files/${id}`),
    listCadFiles: () => request('GET', '/cad-files'),

    listQuotes: () => request('GET', '/quotes'),
    getQuote: (id) => request('GET', `/quotes/${id}`),
    createQuote: (data) => request('POST', '/quotes', data),
    reviewQuote: (id, data) => request('PATCH', `/quotes/${id}/review`, data),
    acceptQuote: (id) => request('POST', `/quotes/${id}/accept`),
    requestQuoteChanges: (id, message) => request('POST', `/quotes/${id}/request-changes`, { message }),
    getQuotePdf: (id) => request('GET', `/quotes/${id}/pdf`),

    listOrders: () => request('GET', '/orders'),
    getOrder: (id) => request('GET', `/orders/${id}`),

    pricingOptions: () => request('GET', '/pricing/options'),
    priceEstimate: (data) => request('POST', '/pricing/estimate', data),

    adminDashboard: () => request('GET', '/admin/dashboard'),

    /** Direct local multipart upload to /api/upload */
    async uploadCadFile(projectId, file, onProgress) {
      const fd = new FormData();
      fd.append('file', file);
      if (projectId) fd.append('projectId', projectId);

      if (onProgress) onProgress(0.5);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || 'Upload failed');
      }
      if (onProgress) onProgress(1.0);
      return json.data;
    },

    /** In local mode, CAD geometry analysis runs synchronously on upload */
    async pollGeometry(cadFileId) {
      return this.getCadFile(cadFileId);
    },
  };
})();

/**
 * Auth guard for dashboard. In College Edition, automatically falls back to demo account.
 */
async function protoNexRequireAuth(allowedRoles) {
  try {
    const user = await ProtoNexAPI.me();
    return user || { id: 'usr_demo_01', name: 'Prototype Lab', role: 'CUSTOMER', email: 'demo@protonex.local' };
  } catch {
    return { id: 'usr_demo_01', name: 'Prototype Lab', role: 'CUSTOMER', email: 'demo@protonex.local' };
  }
}
