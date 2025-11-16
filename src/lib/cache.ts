export const setCache = async (key: string, data: unknown, ttlMs?: number) => {
  try {
    // Use adaptive TTL if not specified - longer cache on slow networks
    let finalTtl = ttlMs ?? 1000 * 60 * 5; // 5min default

    // Import here to avoid circular deps
    try {
      const { getAdaptiveCacheTTL } = await import('./networkOptimizer');
      if (typeof getAdaptiveCacheTTL === 'function') {
        finalTtl = Math.min(ttlMs || 1000 * 60 * 60, getAdaptiveCacheTTL(finalTtl));
      }
    } catch (e) {
      // networkOptimizer not available yet, use default
    }

    const payload = { data, expiry: Date.now() + finalTtl };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.debug('setCache failed', err);
  }
};

export const getCache = <T = unknown>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiry && Date.now() > parsed.expiry) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data as T;
  } catch (err) {
    console.debug('getCache failed', err);
    return null;
  }
};

export const removeCache = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // Ignore errors when removing from localStorage
  }
};
