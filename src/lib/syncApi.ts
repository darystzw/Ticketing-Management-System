// Real WebSocket connection for real-time updates
export class SyncWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners = new Set<(event: Record<string, unknown>) => void>();
  private reconnectTimeoutId: number | null = null;
  private pingIntervalId: number | null = null;
  private isIntentionallyClosed = false;

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token;
    this.connect();
  }

  private connect() {
    try {
      this.isIntentionallyClosed = false;
      
      // Construct WebSocket URL with token if provided
      const wsUrl = this.token ? `${this.url}?token=${this.token}` : this.url;
      
      console.log('🔌 Connecting to WebSocket:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);

      // Connection opened
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        this.reconnectAttempts = 0;
        
        // Notify listeners of successful connection
        this.notifyListeners({
          type: 'connected',
          timestamp: new Date().toISOString()
        });

        // Start heartbeat/ping
        this.startPing();
      };

      // Listen for messages
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', data);
          this.notifyListeners(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      // Handle errors
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.notifyListeners({
          type: 'error',
          error: 'WebSocket connection error',
          timestamp: new Date().toISOString()
        });
      };

      // Handle connection close
      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason || 'No reason'}`);
        
        this.stopPing();
        
        this.notifyListeners({
          type: 'disconnected',
          code: event.code,
          reason: event.reason,
          timestamp: new Date().toISOString()
        });

        // Attempt to reconnect if not intentionally closed
        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  private startPing() {
    // Send ping every 30 seconds to keep connection alive
    this.pingIntervalId = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private scheduleReconnect() {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts); // Exponential backoff
      
      console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimeoutId = window.setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else {
      console.error('⚠️ Max reconnection attempts reached. Please refresh the page.');
      this.notifyListeners({
        type: 'max_reconnect_failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  private notifyListeners(event: Record<string, unknown>) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in WebSocket listener:', error);
      }
    });
  }

  public send(data: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('Cannot send message: WebSocket is not open');
    }
  }

  public onMessage(listener: (event: Record<string, unknown>) => void) {
    this.listeners.add(listener);

    // Return cleanup function
    return () => {
      this.listeners.delete(listener);
    };
  }

  public close() {
    console.log('🔌 Closing WebSocket connection');
    
    this.isIntentionallyClosed = true;
    
    // Clear reconnect timeout
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Stop ping
    this.stopPing();
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'Client closing connection');
      this.ws = null;
    }
    
    this.listeners.clear();
  }

  public getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }
}

// Get WebSocket URL based on environment
const getWebSocketUrl = () => {
  // Check if we have a custom WebSocket URL in environment
  const envWsUrl = import.meta.env.VITE_WS_URL;
  if (envWsUrl) {
    return envWsUrl;
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  if (import.meta.env.PROD) {
    // Production: assume WebSocket is on same host at /ws
    return `${protocol}://${window.location.host}/ws`;
  }
  
  // Development: separate WebSocket server on port 3001
  // Run with: npm run ws
  return `ws://localhost:3001`;
};

// Get auth token (you can customize this)
const getAuthToken = () => {
  return import.meta.env.VITE_WS_TOKEN || 'dev-token';
};

// Create WebSocket instance (only if you need it)
// To use: import { syncWebSocket } from '@/lib/syncApi'
export const syncWebSocket = new SyncWebSocket(
  getWebSocketUrl(),
  getAuthToken()
);

// Example: Listen for events
/*
syncWebSocket.onMessage((event) => {
  switch (event.type) {
    case 'connected':
      console.log('Connected to sync server');
      break;
    case 'scan':
      console.log('New scan event:', event);
      break;
    case 'disconnected':
      console.log('Disconnected from sync server');
      break;
    case 'error':
      console.error('WebSocket error:', event);
      break;
  }
});

// Send a message
syncWebSocket.send({
  type: 'subscribe',
  eventId: 'event-123'
});
*/