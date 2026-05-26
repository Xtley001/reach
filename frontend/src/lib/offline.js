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
  return new Promise((res, rej) => {
    const req = db.transaction('sync_queue', 'readwrite')
      .objectStore('sync_queue')
      .add({ ...action, ts: Date.now() });
    req.onsuccess = () => res(req.result);
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
