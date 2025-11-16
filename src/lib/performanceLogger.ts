/**
 * Performance logging utility to track app reload and initialization times
 */

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

class PerformanceLogger {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private enabled: boolean = true;

  constructor() {
    // Log initial page load metrics
    if (typeof window !== 'undefined' && window.performance) {
      window.addEventListener('load', () => {
        this.logPageLoadMetrics();
      });
    }
  }

  /**
   * Start tracking a performance metric
   */
  start(name: string): void {
    if (!this.enabled) return;
    
    this.metrics.set(name, {
      name,
      startTime: performance.now(),
    });
    console.log(`⏱️ [Performance] Started: ${name}`);
  }

  /**
   * End tracking a performance metric
   */
  end(name: string): number | undefined {
    if (!this.enabled) return;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`⚠️ [Performance] No start time found for: ${name}`);
      return;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    console.log(`✅ [Performance] Completed: ${name} - ${metric.duration.toFixed(2)}ms`);
    
    return metric.duration;
  }

  /**
   * Log a metric with a specific duration
   */
  log(name: string, duration: number): void {
    if (!this.enabled) return;
    console.log(`📊 [Performance] ${name}: ${duration.toFixed(2)}ms`);
  }

  /**
   * Log page load metrics from Navigation Timing API
   */
  private logPageLoadMetrics(): void {
    if (!window.performance || !window.performance.timing) return;

    const timing = window.performance.timing;
    const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    console.group('📈 [Performance] Page Load Metrics');
    
    // DNS lookup
    const dnsTime = timing.domainLookupEnd - timing.domainLookupStart;
    console.log(`DNS Lookup: ${dnsTime}ms`);

    // TCP connection
    const tcpTime = timing.connectEnd - timing.connectStart;
    console.log(`TCP Connection: ${tcpTime}ms`);

    // Request + Response
    const requestTime = timing.responseEnd - timing.requestStart;
    console.log(`Request + Response: ${requestTime}ms`);

    // DOM Processing
    const domProcessing = timing.domComplete - timing.domLoading;
    console.log(`DOM Processing: ${domProcessing}ms`);

    // Total page load
    const totalLoad = timing.loadEventEnd - timing.navigationStart;
    console.log(`Total Page Load: ${totalLoad}ms`);

    // DOM Content Loaded
    const domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
    console.log(`DOM Content Loaded: ${domContentLoaded}ms`);

    if (navigation) {
      console.log(`Transfer Size: ${(navigation.transferSize / 1024).toFixed(2)} KB`);
      console.log(`Encoded Body Size: ${(navigation.encodedBodySize / 1024).toFixed(2)} KB`);
      console.log(`Decoded Body Size: ${(navigation.decodedBodySize / 1024).toFixed(2)} KB`);
    }

    console.groupEnd();
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get a summary of all metrics
   */
  getSummary(): void {
    console.group('📊 [Performance] Summary');
    
    const metrics = this.getMetrics().filter(m => m.duration !== undefined);
    
    if (metrics.length === 0) {
      console.log('No metrics recorded');
      console.groupEnd();
      return;
    }

    metrics.forEach(metric => {
      console.log(`${metric.name}: ${metric.duration!.toFixed(2)}ms`);
    });

    const total = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    console.log(`\nTotal: ${total.toFixed(2)}ms`);
    
    console.groupEnd();
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Export singleton instance
export const perfLogger = new PerformanceLogger();

// Helper function to measure async operations
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  perfLogger.start(name);
  try {
    const result = await fn();
    perfLogger.end(name);
    return result;
  } catch (error) {
    perfLogger.end(name);
    throw error;
  }
}

// Helper function to measure sync operations
export function measureSync<T>(name: string, fn: () => T): T {
  perfLogger.start(name);
  try {
    const result = fn();
    perfLogger.end(name);
    return result;
  } catch (error) {
    perfLogger.end(name);
    throw error;
  }
}
