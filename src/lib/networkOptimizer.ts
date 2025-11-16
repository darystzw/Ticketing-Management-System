/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Network Optimization Utilities for Low-Quality Networks
 * - Request batching
 * - Debouncing
 * - Adaptive cache TTL based on network speed
 * - Request timeout handling
 */

interface NetworkQuality {
  bandwidth: 'slow' | 'medium' | 'fast';
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  rtt: number; // Round trip time in ms
}

let networkQuality: NetworkQuality | null = null;

/**
 * Detect network quality using Navigation API
 */
export const detectNetworkQuality = (): NetworkQuality => {
  if (networkQuality) return networkQuality;

  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  const effectiveType = connection?.effectiveType || '4g';
  const rtt = connection?.rtt || 50;
  const downlink = connection?.downlink || 10;

  const bandwidth = downlink < 1 ? 'slow' : downlink < 5 ? 'medium' : 'fast';

  networkQuality = {
    bandwidth,
    effectiveType: effectiveType as '4g' | '3g' | '2g' | 'slow-2g',
    rtt,
  };

  // Listen for network changes
  connection?.addEventListener?.('change', () => {
    networkQuality = null; // Reset to recalculate
  });

  return networkQuality;
};

/**
 * Get adaptive timeout based on network quality
 * Slow networks get longer timeouts
 */
export const getAdaptiveTimeout = (baseTimeoutMs = 5000): number => {
  const quality = detectNetworkQuality();
  const multiplier = {
    'slow-2g': 4,
    '2g': 3,
    '3g': 2,
    '4g': 1,
  };
  return baseTimeoutMs * (multiplier[quality.effectiveType] || 2);
};

/**
 * Get adaptive cache TTL based on network quality
 * Slow networks should cache longer
 */
export const getAdaptiveCacheTTL = (baseTtlMs = 5 * 60 * 1000): number => {
  const quality = detectNetworkQuality();
  const multiplier = {
    'slow-2g': 3,
    '2g': 2.5,
    '3g': 1.5,
    '4g': 1,
  };
  return baseTtlMs * (multiplier[quality.effectiveType] || 1);
};

/**
 * Create a debounced function that batches multiple calls
 */
export const createBatchedDebounce = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delayMs = 300,
  maxBatchSize = 10
) => {
  let timeoutId: NodeJS.Timeout | null = null;
  let batch: any[] = [];
  let callbacks: Array<(result: any) => void> = [];

  return function (...args: Parameters<T>) {
    return new Promise((resolve) => {
      batch.push(args);
      callbacks.push(resolve);

      if (timeoutId) clearTimeout(timeoutId);

      // Execute early if batch is full
      if (batch.length >= maxBatchSize) {
        timeoutId = null;
        const currentBatch = batch;
        const currentCallbacks = callbacks;
        batch = [];
        callbacks = [];

        Promise.all(currentBatch.map((args) => fn(...args))).then((results) => {
          currentCallbacks.forEach((cb, i) => cb(results[i]));
        });
      } else {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          const currentBatch = batch;
          const currentCallbacks = callbacks;
          batch = [];
          callbacks = [];

          Promise.all(currentBatch.map((args) => fn(...args))).then((results) => {
            currentCallbacks.forEach((cb, i) => cb(results[i]));
          });
        }, delayMs);
      }
    });
  };
};

/**
 * Request deduplicator - prevents duplicate requests in flight
 */
export class RequestDeduplicator {
  private inFlight = new Map<string, Promise<any>>();

  deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key)!;
    }

    const promise = fn()
      .then((result) => {
        this.inFlight.delete(key);
        return result;
      })
      .catch((error) => {
        this.inFlight.delete(key);
        throw error;
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  clear() {
    this.inFlight.clear();
  }
}

/**
 * Throttle function - useful for scroll/resize events
 */
export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  delayMs = 300
) => {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastCall >= delayMs) {
      lastCall = now;
      fn(...args);
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, delayMs - (now - lastCall));
    }
  };
};

/**
 * Create a queue processor for slow networks
 * Processes items serially with backoff
 */
export class SlowNetworkQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private retries: Map<number, number> = new Map();
  private maxRetries = 3;

  add(fn: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const index = this.queue.length;
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          const attempts = this.retries.get(index) || 0;
          if (attempts < this.maxRetries) {
            this.retries.set(index, attempts + 1);
            const backoffMs = 1000 * Math.pow(2, attempts); // Exponential backoff
            await new Promise((r) => setTimeout(r, backoffMs));
            // Re-queue
            this.queue.push(this.queue[index]);
          }
          reject(error);
        }
      });

      if (!this.isProcessing) {
        this.process();
      }
    });
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) {
        try {
          await fn();
        } catch (error) {
          console.error('Queue item failed:', error);
        }
      }
    }

    this.isProcessing = false;
  }

  getQueueSize() {
    return this.queue.length;
  }
}

/**
 * Compression utility - reduce payload size
 */
export const shouldCompress = (): boolean => {
  const quality = detectNetworkQuality();
  return quality.bandwidth !== 'fast';
};

/**
 * Create a request with automatic retry and exponential backoff
 */
export const createRequestWithRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
};
