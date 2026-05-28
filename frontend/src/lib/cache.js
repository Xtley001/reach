/**
 * REACH — Client-Side SWR Cache
 *
 * P2-5.3: In-flight deduplication prevents race conditions on rapid navigation.
 * Serves cached data immediately, refreshes in background silently.
 * Callers must use the alive pattern to avoid setState on unmounted components:
 *
 *   useEffect(() => {
 *     let alive = true;
 *     cached('key', fn, ttl).then(d => { if (alive) setData(d); });
 *     return () => { alive = false; };
 *   }, []);
 */

const CACHE   = new Map(); // key → { data, ts }
const INFLIGHT = new Map(); // key → Promise — deduplicates concurrent requests

export function cached(key, fetchFn, ttlMs = 30_000) {
  const entry = CACHE.get(key);
  const now   = Date.now();

  if (entry && now - entry.ts < ttlMs) {
    // Cache hit — trigger background refresh if not already in flight
    if (!INFLIGHT.has(key)) {
      const p = fetchFn()
        .then(fresh => { CACHE.set(key, { data: fresh, ts: Date.now() }); })
        .catch(() => {})
        .finally(() => INFLIGHT.delete(key));
      INFLIGHT.set(key, p);
    }
    return Promise.resolve(entry.data);
  }

  // Cache miss — deduplicate concurrent callers
  if (INFLIGHT.has(key)) {
    return INFLIGHT.get(key);
  }

  const p = fetchFn()
    .then(data => {
      CACHE.set(key, { data, ts: Date.now() });
      INFLIGHT.delete(key);
      return data;
    })
    .catch(err => {
      INFLIGHT.delete(key);
      throw err;
    });

  INFLIGHT.set(key, p);
  return p;
}

export function invalidate(key) {
  CACHE.delete(key);
  INFLIGHT.delete(key);
}

export function invalidateAll(prefix) {
  for (const k of CACHE.keys()) {
    if (k.startsWith(prefix)) CACHE.delete(k);
  }
  for (const k of INFLIGHT.keys()) {
    if (k.startsWith(prefix)) INFLIGHT.delete(k);
  }
}

// TTL constants (ms)
export const TTL = {
  ME:           5 * 60 * 1000,
  HUB_DASH:     30 * 1000,
  VOLUNTEERS:   2 * 60 * 1000,
  CONTACTS:     20 * 1000,
  MIN_DASH:     60 * 1000,
  DEMOGRAPHICS: 5 * 60 * 1000,
  HUBS:         10 * 60 * 1000,
  ATT_STATUS:   15 * 1000,
};
