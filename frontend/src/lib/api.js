/**
 * REACH — API Client
 */

// P1-5.1: All API requests go to /v1 — versioned prefix
export const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/v1'
  : '/v1';

// ─── Token Storage ────────────────────────────────────────────────────────────
export const tokenStore = {
  token: null,
  set(t) { this.token = t; try { sessionStorage.setItem('reach_at', t); } catch {} },
  get() { return this.token || sessionStorage.getItem('reach_at') || null; },
  clear() { this.token = null; try { sessionStorage.removeItem('reach_at'); } catch {} },
};

// ─── Error Handler ────────────────────────────────────────────────────────────
function handleError(status, data) {
  if (status === 401 || status === 403) {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent('reach:logout', {
      detail: { reason: status === 401 ? 'unauthorized' : 'forbidden' },
    }));
  }
  const detail = typeof data === 'object' ? data?.detail || JSON.stringify(data) : data;
  throw new Error(detail || `HTTP ${status}`);
}

// ─── Request Helper ───────────────────────────────────────────────────────────
// P2-5.4: Track first request to show cold-start message if it takes >2.5s
let _firstRequestDone = false;

async function request(method, path, body = null, signal = null) {
  let slowTimer = null;
  if (!_firstRequestDone) {
    slowTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('reach:slow-start'));
    }, 2500);
  }
  try {
  const headers = { 'Content-Type': 'application/json' };
  const token   = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers, credentials: 'include' };
  if (body)   options.body   = JSON.stringify(body);
  if (signal) options.signal = signal;
  const res  = await fetch(`${BASE}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (slowTimer) { clearTimeout(slowTimer); _firstRequestDone = true; }
  if (!res.ok) handleError(res.status, data);
  return data;
  } catch (err) {
    if (slowTimer) { clearTimeout(slowTimer); _firstRequestDone = true; }
    throw err;
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────
export const api = {
  // Auth
  getMe()            { return request('GET', '/auth/me'); },
  sendOtp(ch, id) {
    const b = ch === 'sms' ? { channel: ch, phone: id } : { channel: ch, email: id };
    return request('POST', '/auth/send-otp', b);
  },
  verifyOtp(ch, id, otp, name, hubId) {
    const b = ch === 'sms' ? { channel: ch, phone: id, otp } : { channel: ch, email: id, otp };
    if (name)  b.name   = name;
    if (hubId) b.hub_id = hubId;
    return request('POST', '/auth/verify-otp', b).then(d => {
      if (d.access_token) tokenStore.set(d.access_token);
      return d;
    });
  },
  logout()              { return request('POST', '/auth/logout').finally(() => tokenStore.clear()); },
  // P1-3.2: Refresh access token using httponly refresh cookie
  refresh() {
    return fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.access_token) tokenStore.set(d.access_token); return d; });
  },
  getSessions()         { return request('GET',    '/auth/sessions'); },
  revokeSession(id)     { return request('DELETE', `/auth/sessions/${id}`); },
  revokeAll()           { return request('POST',   '/auth/revoke-all'); },

  // Invites
  previewInvite(token)  { return request('GET', `/auth/invite/preview?token=${encodeURIComponent(token)}`); },
  sendInviteOtp(token, phone) { return request('POST', '/auth/invite/send-otp', { token, phone }); },
  claimInvite(b)        { return request('POST', '/auth/claim-invite', b).then(d => { if (d.access_token) tokenStore.set(d.access_token); return d; }); },
  createInvite(b)       { return request('POST', '/auth/invite', b); },
  getEventTeam()        { return request('GET', '/admin/event-team'); },

  // Hubs
  listHubs()            { return request('GET', '/onboarding/hubs'); },

  // Contacts
  addContact(b)         { return request('POST', '/contacts', b); },
  addContactsBulk(b)    { return request('POST', '/contacts/bulk', b); },
  listContacts(filter)  { return request('GET', `/contacts${filter ? `?filter=${filter}` : ''}`); },
  getContact(id)        { return request('GET', `/contacts/${id}`); },
  // P1-3.4: Backend StatusUpdate schema uses status_code — match exactly
  updateStatus(id, code){ return request('PATCH', `/contacts/${id}/status`, { status_code: code }); },
  deleteContact(id)     { return request('DELETE', `/contacts/${id}`); },
  getCallQueue()        { return request('GET', '/contacts/queue/to-call'); },
  syncContacts(b)       { return request('POST', '/contacts/sync', b); },
  logMessageSend(cid, tid) { return request('POST', '/message-sends', { contact_id: cid, template_id: tid }); },

  // Dashboard
  getVolunteerDashboard() { return request('GET', '/dashboard/volunteer'); },
  getHubDashboard()       { return request('GET', '/dashboard/hub'); },
  getMinisterDashboard()  { return request('GET', '/dashboard/minister'); },

  // Hub management
  getHubVolunteers()          { return request('GET', '/hub/volunteers'); },
  approveVolunteer(id)        { return request('POST', `/hub/volunteers/${id}/approve`); },
  rejectVolunteer(id, reason) { return request('POST', `/hub/volunteers/${id}/reject`, { reason }); },
  getHubContacts()            { return request('GET', '/hub/contacts'); },
  getLogistics()              { return request('GET', '/hub/logistics'); },
  updateLogistics(id, b)      { return request('PATCH', `/hub/logistics/${id}`, b); },

  // FIX-003: Previously missing — VolunteerDetail and MinisterVolunteerDetail were crashing
  getVolunteerDetail(id)          { return request('GET', `/hub/volunteers/${id}/detail`); },
  getMinisterVolunteerDetail(id)  { return request('GET', `/minister/volunteers/${id}/detail`); },
  forceLogout(id)                 { return request('POST', `/hub/volunteers/${id}/force-logout`); },

  // FIX-004 + FIX-007: Download helper and minister hubs endpoint
  async downloadExport(path) {
    const response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${tokenStore.get()}` },
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  getMinisterHubs()           { return request('GET', '/minister/hubs'); },

  // Templates
  getActiveTemplates() { return request('GET', '/templates/active'); },

  // Minister
  getMinisterVolunteers()  { return request('GET', '/minister/volunteers'); },
  getDemographics()        { return request('GET', '/minister/demographics'); },
  listCampaigns()          { return request('GET', '/campaigns'); },
  createCampaign(b)        { return request('POST', '/campaigns', b); },
  archiveCampaign(id)      { return request('POST', `/campaigns/${id}/archive`); },

  // Attendance
  attendanceCheckIn(contactId)   { return request('POST', '/attendance/check-in', { contact_id: contactId }); },
  attendanceWalkIn(b)            { return request('POST', '/attendance/walk-in', b); },
  attendanceStatus()             { return request('GET', '/attendance/status'); },
  attendanceContacts()           { return request('GET', '/attendance/contacts'); },
  attendanceBulk(records)        { return request('POST', '/attendance/bulk', { records }); },
  setAttendanceMode(id, open)    { return request('PATCH', `/campaigns/${id}/attendance`, { open }); },
  attendanceUndoCheckIn(contactId){ return request('POST', '/attendance/undo-check-in', { contact_id: contactId }); },

  // Decisions
  createDecision(b)              { return request('POST', '/decisions', b); },
  createDecisionsBulk(records)   { return request('POST', '/decisions/bulk', { records }); },
  listDecisions()                { return request('GET', '/decisions'); },
  getDecision(id)                { return request('GET', `/decisions/${id}`); },
  exportDecisions()              { return `${BASE}/decisions/export/csv`; },

  // Profile
  updateProfile(b) { return request('PATCH', '/users/me/profile', b); },
  getHubLeader()   { return request('GET', '/users/me/hub-leader'); },

  // Avatar upload — sends multipart/form-data
  async uploadAvatar(file, extraFields = {}) {
    const fd = new FormData();
    fd.append('avatar', file);
    Object.entries(extraFields).forEach(([k, v]) => { if (v != null) fd.append(k, v); });
    const r = await fetch(`${BASE}/users/me/profile`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenStore.get()}` },
      credentials: 'include',
      body: fd,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Upload failed'); }
    return r.json();
  },
};
