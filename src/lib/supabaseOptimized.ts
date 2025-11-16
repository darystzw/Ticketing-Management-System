/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Optimized Supabase API wrapper for slow networks
 * - Request deduplication
 * - Automatic retries with exponential backoff
 * - Request timeout handling
 * - Pagination support
 */

import { supabase } from '@/integrations/supabase/client';
import {
  RequestDeduplicator,
  createRequestWithRetry,
  getAdaptiveTimeout,
} from './networkOptimizer';

const deduplicator = new RequestDeduplicator();

interface QueryOptions {
  timeout?: number;
  retries?: number;
  deduplicate?: boolean;
}

/**
 * Create a deduplicated query key
 */
const createQueryKey = (table: string, filters?: Record<string, any>): string => {
  return `query:${table}:${JSON.stringify(filters || {})}`;
};

/**
 * Optimized select query with deduplication and retries
 */
export const optimizedSelect = async <T extends Record<string, any>>(
  table: string,
  options?: QueryOptions & { select?: string; filters?: Record<string, any> }
) => {
  const { timeout = getAdaptiveTimeout(), retries = 3, deduplicate = true, select = '*', filters } = options || {};

  const deduplicationKey = deduplicate ? createQueryKey(table, filters) : '';

  const fn = async () => {
    try {
      let query = (supabase.from(table as any) as any).select(select ?? '*');

      // Apply filters if provided
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      const { data, error } = await Promise.race([
        query,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
        ),
      ]) as any;

      if (error) throw error;
      return data as T[];
    } catch (error) {
      console.error(`Query failed for ${table}:`, error);
      throw error;
    }
  };

  if (deduplicate) {
    return deduplicator.deduplicate(deduplicationKey, () => createRequestWithRetry(fn, retries));
  }

  return createRequestWithRetry(fn, retries);
};

/**
 * Optimized paginated query
 */
export const optimizedPaginatedSelect = async <T extends Record<string, any>>(
  table: string,
  options?: QueryOptions & {
    select?: string;
    filters?: Record<string, any>;
    pageSize?: number;
    page?: number;
  }
) => {
  const { select = '*', filters, pageSize = 50, page = 1, ...queryOptions } = options || {};

  const offset = (page - 1) * pageSize;

  const fn = async () => {
    let query = (supabase.from(table as any) as any)
      .select(select ?? '*', { count: 'exact' })
      .range(offset, offset + pageSize - 1);

    // Apply filters
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    const { data, error, count } = await Promise.race([
      query,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Pagination query timeout after ${queryOptions.timeout || getAdaptiveTimeout()}ms`)),
          queryOptions.timeout || getAdaptiveTimeout()
        )
      ),
    ]) as any;

    if (error) throw error;

    return {
      data: data as T[],
      count: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  };

  return createRequestWithRetry(fn, queryOptions.retries ?? 3);
};

/**
 * Optimized insert with retry
 */
export const optimizedInsert = async <T extends Record<string, any>>(
  table: string,
  data: T | T[],
  options?: QueryOptions
) => {
  const { timeout = getAdaptiveTimeout(), retries = 3 } = options || {};

  const fn = async () => {
    const { data: result, error } = await Promise.race([
      (supabase.from(table as any) as any).insert(data),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Insert timeout after ${timeout}ms`)), timeout)
      ),
    ]) as any;

    if (error) throw error;
    return result;
  };

  return createRequestWithRetry(fn, retries);
};

/**
 * Optimized update with retry
 */
export const optimizedUpdate = async <T extends Record<string, any>>(
  table: string,
  updates: Partial<T>,
  filters: Record<string, any>,
  options?: QueryOptions
) => {
  const { timeout = getAdaptiveTimeout(), retries = 3 } = options || {};

  const fn = async () => {
    let query = (supabase.from(table as any) as any).update(updates);

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      query = (query as any).eq(key, value);
    });

    const { data, error } = await Promise.race([
      query,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Update timeout after ${timeout}ms`)), timeout)
      ),
    ]) as any;

    if (error) throw error;
    return data;
  };

  return createRequestWithRetry(fn, retries);
};

/**
 * Batch multiple operations with request deduplication
 */
export const batchOperations = async <T>(
  operations: Array<() => Promise<T>>,
  options?: { concurrency?: number; timeout?: number }
) => {
  const { concurrency = 3, timeout = getAdaptiveTimeout() } = options || {};

  const results: T[] = [];
  const errors: Error[] = [];

  // Process in batches
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((op) =>
        Promise.race([
          op(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Batch operation timeout after ${timeout}ms`)), timeout)
          ),
        ])
      )
    );

    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value as T);
      } else {
        errors.push(result.reason as Error);
      }
    });
  }

  return { results, errors, successCount: results.length, failureCount: errors.length };
};

/**
 * Clear deduplication cache
 */
export const clearDeduplicationCache = () => {
  deduplicator.clear();
};
