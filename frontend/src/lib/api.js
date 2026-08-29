/**
 * REACH — API Client
 */

// P1-5.1: All API requests go to /v1 — versioned prefix
export const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/v1'
  : '/v1';

// ─── Token Storage ────────────────────────────────────────────────────────────
// G-80: in-memory only — no sessionStorage. This is deliberate, not an
// oversight: once the access token only lives in memory, a page reload
// ALWAYS starts with token=null, which forces every reload through the
// refresh-cookie recovery path in useAuth's loadUser() below. That's a more
// consistent, more secure model than half-persisting the access token in
// sessionStorage and half-relying on the httpOnly refresh cookie.
export const tokenStore = {
  token: null,
  set(t) { this.token = t; },
  get() { return this.token; },
  clear() { this.token = null; },
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

// ─── Shared refresh helper ─────────────────────────────────────────────────────
// G-83: ONE source of truth for "how do we get a new access token." Used by:
//   1. useAuth's mount-time session recovery (G-79)
//   2. this file's own 401 retry interceptor (G-82)
//   3. useAuth's proactive tab-focus/visibility top-up (unchanged, still useful)
// so all three paths can never drift out of sync with each other.
//
// Concurrency note: if several requests 401 at once, they'll each call this,
// which is safe (the backend rotates the refresh cookie per call and old ones
// are simply superseded) but wasteful. We de-dupe with a single in-flight
// promise so bursts of parallel 401s only trigger one network round-trip.
let _refreshInFlight = null;

export function refreshAccessToken() {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || 'Session refresh failed');
      }
      return r.json();
    })
    .then((d) => {
      if (d.access_token) tokenStore.set(d.access_token);
      return d;
    })
    .finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
}

// ─── Request Helper ───────────────────────────────────────────────────────────
// P2-5.4: Track first request to show cold-start message if it takes >2.5s
let _firstRequestDone = false;

async function _rawRequest(method, path, body, signal, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers, credentials: 'include' };
  if (body)   options.body   = JSON.stringify(body);
  if (signal) options.signal = signal;
  const res  = await fetch(`${BASE}${path}`, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function request(method, path, body = null, signal = null) {
  let slowTimer = null;
  if (!_firstRequestDone) {
    slowTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('reach:slow-start'));
    }, 2500);
  }
  try {
    let { res, data } = await _rawRequest(method, path, body, signal, tokenStore.get());

    // G-82: on a 401 from an *authenticated* request (we had a token — this
    // is not the login/OTP flow), silently try to refresh once and replay
    // the original request. The user never sees an interruption. This is
    // what "logs out too fast" actually was: the old code cleared the token
    // and fired reach:logout the instant ANY request hit an expired access
    // token, even though a valid refresh cookie was sitting right there.
    if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/verify-otp'
        && path !== '/auth/send-otp' && path !== '/auth/claim-invite') {
      try {
        await refreshAccessToken();
        ({ res, data } = await _rawRequest(method, path, body, signal, tokenStore.get()));
      } catch {
        // refresh itself failed (cookie expired/revoked) — fall through to
        // the normal error handler below, which clears state and logs out.
      }
    }

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
  // G-83: thin wrapper around the shared refreshAccessToken() helper so
  // callers (useAuth) keep using api.refresh() as before.
  refresh() {
    return refreshAccessToken();
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
  addContactsBulk(b)    { return request('POST', '/contacts/bulk', Array.isArray(b) ? { contacts: b } : b); },
  listContacts(filter)  { return request('GET', `/contacts${filter ? `?filter=${filter}` : ''}`); },
  getContact(id)        { return request('GET', `/contacts/${id}`); },
  // P1-3.4: Backend StatusUpdate schema uses status_code — match exactly
  updateStatus(id, code){ return request('PATCH', `/contacts/${id}/status`, { status_code: code }); },
  deleteContact(id)     { return request('DELETE', `/contacts/${id}`); },
  getCallQueue()        { return request('GET', '/contacts/queue/to-call'); },
  syncContacts(b)       { return request('POST', '/contacts/sync', Array.isArray(b) ? { contacts: b } : b); },
  logMessageSend(cid, tid) { return request('POST', '/message-sends', { contact_id: cid, template_id: tid }); },

  // B: contact outcome tags
  listTagDefinitions()      { return request('GET', '/tag-definitions'); },
  getContactTags(id)        { return request('GET', `/contacts/${id}/tags`); },
  toggleContactTag(id, tagCode, note) { return request('POST', `/contacts/${id}/tags`, { tag_code: tagCode, note }); },

  // C: mass upload / paste-to-import
  bulkPasteImport(rows)     { return request('POST', '/contacts/bulk-paste', { rows }); },

  // F: call logging (receptivity + availability)
  logCall(contactId, body)  { return request('POST', `/contacts/${contactId}/calls`, body); },
  getCallTimeline(contactId){ return request('GET', `/contacts/${contactId}/calls`); },
  getMyReminders()          { return request('GET', '/calls/reminders'); },

  // Dashboard
  getVolunteerDashboard() { return request('GET', '/dashboard/volunteer'); },
  getHubDashboard()       { return request('GET', '/dashboard/hub'); },
  getMinisterDashboard()  { return request('GET', '/dashboard/minister'); },

  // Hub management
  getHubVolunteers()          { return request('GET', '/hub/volunteers'); },
  approveVolunteer(id)        { return request('POST', `/hub/volunteers/${id}/approve`); },
  rejectVolunteer(id, reason) { return request('POST', `/hub/volunteers/${id}/reject`, { reason }); },
  suspendVolunteer(id, reason){ return request('POST', `/hub/volunteers/${id}/suspend`, { reason }); },
  unsuspendVolunteer(id)      { return request('POST', `/hub/volunteers/${id}/unsuspend`); },
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
  createHub(b)                { return request('POST', '/minister/hubs', b); },
  updateHub(id, b)            { return request('PATCH', `/minister/hubs/${id}`, b); },

  // Templates
  getActiveTemplates() { return request('GET', '/templates/active'); },
  createTemplate(b)        { return request('POST', '/templates', b); },
  updateTemplate(id, b)    { return request('PATCH', `/templates/${id}`, b); },
  deleteTemplate(id)       { return request('DELETE', `/templates/${id}`); },

  // Minister
  getMinisterVolunteers()  { return request('GET', '/minister/volunteers'); },
  getDemographics()        { return request('GET', '/minister/demographics'); },
  listCampaigns()          { return request('GET', '/campaigns'); },
  createCampaign(b)        { return request('POST', '/campaigns', b); },
  archiveCampaign(id)      { return request('POST', `/campaigns/${id}/archive`); },
  updateCampaign(id, b)    { return request('PATCH', `/campaigns/${id}`, b); },
  reactivateCampaign(id)   { return request('POST', `/campaigns/${id}/reactivate`); },

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

  // Avatar upload — sends multipart/form-data to dedicated endpoint
  async uploadAvatar(file) {
    const fd = new FormData();
    fd.append('avatar', file);
    const r = await fetch(`${BASE}/users/me/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenStore.get()}` },
      credentials: 'include',
      body: fd,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Upload failed'); }
    return r.json();
  },
};
