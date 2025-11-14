// Real-time sync using custom events for cross-tab communication
type SyncEventType = 'ticket_updated' | 'sale_created' | 'ticket_scanned';

interface SyncMessage {
  type: SyncEventType;
  eventId: string;
  data: any;
  timestamp: string;
}

class TicketSyncService {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('ticket-sync');
      this.channel.onmessage = (event) => {
        const message: SyncMessage = event.data;
        this.notifyListeners(message.type, message);
      };
    }
  }

  subscribe(eventType: SyncEventType, callback: (data: any) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  broadcast(type: SyncEventType, eventId: string, data: any) {
    const message: SyncMessage = {
      type,
      eventId,
      data,
      timestamp: new Date().toISOString(),
    };

    if (this.channel) {
      this.channel.postMessage(message);
    }

    // Also notify local listeners
    this.notifyListeners(type, message);
  }

  private notifyListeners(type: SyncEventType, message: SyncMessage) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((callback) => callback(message));
    }
  }

  disconnect() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

export const syncService = new TicketSyncService();
