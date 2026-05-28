/**
 * REACH — Offline Sync Hook 
 * BUG-02: api.syncContacts() now exists — this hook actually works.
 */
import { useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { getPendingContacts, removePendingContact, pendingCount } from '../lib/offline';

export function useOfflineSync({ onSyncComplete } = {}) {
  const syncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const queue = await getPendingContacts();
      if (!queue || queue.length === 0) { syncingRef.current = false; return; }
      // BUG-02: api.syncContacts now defined in api.js
      const response = await api.syncContacts(queue);
      const results  = response?.results || [];
      let synced = 0, failed = 0;
      for (const r of results) {
        if (r.status === 'synced' || r.status === 'duplicate') {
          await removePendingContact(r.local_id);
          synced++;
        } else { failed++; }
      }
      const remaining = await pendingCount();
      window.dispatchEvent(new CustomEvent('reach:sync-complete', {
        detail: { synced, failed, remaining },
      }));
      if (onSyncComplete) onSyncComplete({ synced, failed, remaining });
    } catch (err) {
      console.warn('[REACH] Sync failed, will retry:', err?.message);
    } finally { syncingRef.current = false; }
  }, [onSyncComplete]);

  useEffect(() => {
    if (navigator.onLine) sync();
    const up   = () => sync();
    const down = () => { syncingRef.current = false; };
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online',  up);
      window.removeEventListener('offline', down);
    };
  }, [sync]);

  return { sync };
}
