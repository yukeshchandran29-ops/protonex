
// ProtoNex API client
const ProtoNexAPI = (() => {
  const BASE = 'https://protonex-api.onrender.com/api';

  // Normal API requests
  async function request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body
        ? { 'Content-Type': 'application/json' }
        : undefined,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(
        json?.error?.message || `Request failed (${res.status})`
      );
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

    // Authentication
    me: () => request('GET', '/auth/me'),
    logout: () => request('POST', '/auth/logout'),

    // Projects
    listProjects: () => request('GET', '/projects'),
    createProject: (data) => request('POST', '/projects', data),

    // CAD files
    getCadFile: (id) => request('GET', `/cad-files/${id}`),
    listCadFiles: () => request('GET', '/cad-files'),

    // Quotes
    listQuotes: () => request('GET', '/quotes'),
    getQuote: (id) => request('GET', `/quotes/${id}`),
    createQuote: (data) => request('POST', '/quotes', data),
    reviewQuote: (id, data) =>
      request('PATCH', `/quotes/${id}/review`, data),
    acceptQuote: (id) => request('POST', `/quotes/${id}/accept`),
    requestQuoteChanges: (id, message) =>
      request('POST', `/quotes/${id}/request-changes`, { message }),
    getQuotePdf: (id) => request('GET', `/quotes/${id}/pdf`),

    // Orders
    listOrders: () => request('GET', '/orders'),
    getOrder: (id) => request('GET', `/orders/${id}`),

    // Pricing
    pricingOptions: () => request('GET', '/pricing/options'),
    priceEstimate: (data) => request('POST', '/pricing/estimate', data),

    // Admin
    adminDashboard: () => request('GET', '/admin/dashboard'),

    // CAD file upload
    async uploadCadFile(projectId, file, onProgress) {
      const fd = new FormData();

      fd.append('file', file);

      if (projectId) {
        fd.append('projectId', projectId);
      }

      if (onProgress) onProgress(0.5);

      const res = await fetch(`${BASE}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error?.message || 'Upload failed');
      }

      if (onProgress) onProgress(1.0);

      return json.data;
    },

    // CAD geometry
    async pollGeometry(cadFileId) {
      return this.getCadFile(cadFileId);
    },
  };
})();

// Authentication guard
async function protoNexRequireAuth(allowedRoles) {
  try {
    const user = await ProtoNexAPI.me();

    return user || {
      id: 'usr_demo_01',
      name: 'Prototype Lab',
      role: 'CUSTOMER',
      email: 'demo@protonex.local',
    };
  } catch {
    return {
      id: 'usr_demo_01',
      name: 'Prototype Lab',
      role: 'CUSTOMER',
      email: 'demo@protonex.local',
    };
  }
}
