/**
 * REACH — Offline / IndexedDB helpers
 * Local storage for contacts and sync queue.
 */

const DB_NAME    = 'reach-offline';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

export async function cacheContacts(contacts) {
  const db = await openDB();
  const tx = db.transaction('contacts', 'readwrite');
  contacts.forEach(c => tx.objectStore('contacts').put(c));
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

export async function getCachedContacts() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction('contacts', 'readonly').objectStore('contacts').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export async function queueSync(action) {
  const db = await openDB();
  const local_id = action.local_id || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((res, rej) => {
    const req = db.transaction('sync_queue', 'readwrite')
      .objectStore('sync_queue')
      .add({ ...action, local_id, ts: Date.now() });
    req.onsuccess = () => res({ id: req.result, local_id });
    req.onerror   = () => rej(req.error);
  });
}

export async function getPendingSync() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction('sync_queue', 'readonly').objectStore('sync_queue').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export async function clearSynced(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction('sync_queue', 'readwrite').objectStore('sync_queue').delete(id);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

// Aliases used by useOfflineSync.js
export async function getPendingContacts() {
  return getPendingSync();
}

export async function removePendingContact(idOrLocalId) {
  const db = await openDB();
  const queue = await getPendingSync();
  const item = queue.find(q => q.id === idOrLocalId || q.local_id === idOrLocalId);
  if (item) {
    return clearSynced(item.id);
  }
}

export async function pendingCount() {
  const queue = await getPendingSync();
  return queue.length;
}

// Full sync helper used by VolunteerLayout handleSync
export async function syncPendingItems() {
  const { api } = await import('./api');
  const queue = await getPendingSync();
  if (!queue || queue.length === 0) return { synced: 0, failed: 0 };
  const res = await api.syncContacts(queue);
  const results = res?.results || [];
  let synced = 0;
  for (const r of results) {
    if (r.status === 'synced' || r.status === 'duplicate') {
      const match = queue.find(q => q.local_id === r.local_id || q.id === r.local_id);
      if (match) await clearSynced(match.id);
      synced++;
    }
  }
  return { synced, results };
}
