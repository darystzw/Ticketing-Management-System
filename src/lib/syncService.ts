/* eslint-disable @typescript-eslint/no-explicit-any */
// Real-time synchronization service using BroadcastChannel
// src/lib/realtimeSync.ts
import { supabase } from '@/integrations/supabase/client';
import { perfLogger } from './performanceLogger';

type SyncEventType = 'tickets_updated' | 'sales_updated' | 'scans_updated' | 'profiles_updated';

interface SyncMessage {
  type: SyncEventType;
  timestamp: string;
  userId?: string;
}

class RealtimeSyncService {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<SyncEventType, Set<() => void>> = new Map();
  private supabaseChannels: any[] = [];

  constructor() {
    // Initialize BroadcastChannel for cross-tab communication
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('ticket-sync');
      this.channel.onmessage = (event) => {
        const message: SyncMessage = event.data;
        this.notifyListeners(message.type);
      };
    }

    // Delay real-time setup to improve initial load performance
    setTimeout(() => {
      perfLogger.start('realtime-setup');
      this.setupSupabaseRealtime();
      perfLogger.end('realtime-setup');
    }, 2000);
  }

  private setupSupabaseRealtime() {
    perfLogger.start('realtime-subscribe-channels');
    // Single channel for all ticket changes
    const ticketsChannel = supabase
      .channel('all-tickets-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => {
          this.broadcast('tickets_updated');
        }
      )
      .subscribe();

    // Sales channel
    const salesChannel = supabase
      .channel('all-sales-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => {
          this.broadcast('sales_updated');
        }
      )
      .subscribe();

    // Profiles channel
    const profilesChannel = supabase
      .channel('all-profiles-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          this.broadcast('profiles_updated');
        }
      )
      .subscribe();

    this.supabaseChannels = [ticketsChannel, salesChannel, profilesChannel];
    perfLogger.end('realtime-subscribe-channels');
    perfLogger.log('realtime-channels-count', this.supabaseChannels.length);
  }

  // Subscribe to specific event type
  subscribe(eventType: SyncEventType, callback: () => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return cleanup function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  // Broadcast event to all tabs and notify local listeners
  broadcast(type: SyncEventType, userId?: string) {
    const message: SyncMessage = {
      type,
      timestamp: new Date().toISOString(),
      userId,
    };

    // Broadcast to other tabs
    if (this.channel) {
      this.channel.postMessage(message);
    }

    // Notify local listeners immediately
    this.notifyListeners(type);
  }

  private notifyListeners(type: SyncEventType) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error('Error in sync listener:', error);
        }
      });
    }
  }

  // Cleanup
  disconnect() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.supabaseChannels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    this.supabaseChannels = [];
    this.listeners.clear();
  }
}

// Export singleton instance
export const realtimeSync = new RealtimeSyncService();

// Hook for React components
import { useEffect } from 'react';

export function useRealtimeSync(eventType: SyncEventType, callback: () => void) {
  useEffect(() => {
    const unsubscribe = realtimeSync.subscribe(eventType, callback);
    return unsubscribe;
  }, [eventType, callback]);
}
