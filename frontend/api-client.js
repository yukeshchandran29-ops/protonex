// ProtoNex API client — thin fetch wrapper shared by dashboard.js and admin.js.
// Talks to the real backend; every call sends the HttpOnly session cookie.
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

    requestUpload: (data) => request('POST', '/cad-files/request-upload', data),
    confirmUpload: (data) => request('POST', '/cad-files/confirm-upload', data),
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

    pricingOptions: () => request('GET', '/pricing/options'),
    priceEstimate: (data) => request('POST', '/pricing/estimate', data),

    adminDashboard: () => request('GET', '/admin/dashboard'),

    /** Uploads a file directly to object storage via a presigned URL — never through our API. */
    async uploadCadFile(projectId, file, onProgress) {
      const { cadFileId, uploadUrl } = await this.requestUpload({
        projectId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || 'application/octet-stream',
      });

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => onProgress && e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(file);
      });

      const checksum = await sha256Hex(file);
      return this.confirmUpload({ cadFileId, checksum });
    },

    /** Polls a CAD file until geometry analysis finishes (or fails), used right after upload. */
    async pollGeometry(cadFileId, { intervalMs = 1500, timeoutMs = 60000 } = {}) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const file = await this.getCadFile(cadFileId);
        if (file.geometryStatus === 'COMPLETE' || file.geometryStatus === 'FAILED') return file;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return this.getCadFile(cadFileId);
    },
  };

  async function sha256Hex(file) {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
})();

/**
 * Auth guard for protected pages. Call at the top of dashboard.js / admin.js.
 * `allowedRoles` omitted = any authenticated user; pass e.g. ['ENGINEER','ADMIN'] for staff-only pages.
 */
async function protoNexRequireAuth(allowedRoles) {
  try {
    const user = await ProtoNexAPI.me();
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      window.location.href = 'dashboard.html';
      return null;
    }
    return user;
  } catch {
    window.location.href = 'login.html';
    return null;
  }
}
