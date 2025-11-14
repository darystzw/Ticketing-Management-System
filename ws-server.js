// ws-server.js - Development WebSocket server for testing realtime features
import { WebSocketServer } from 'ws';

const PORT = process.env.WS_PORT || 3001;
const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 WebSocket server starting on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  
  console.log(`✅ Client connected${token ? ` with token: ${token}` : ''}`);

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString()
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Respond to ping with pong
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
      
      console.log('📨 Received:', message);
    } catch (error) {
      console.error('❌ Parse error:', error.message);
    }
  });

  // Simulate scan events every 10 seconds (for testing)
  const interval = setInterval(() => {
    if (ws.readyState === 1) { // WebSocket.OPEN = 1
      const mockScan = {
        type: 'scan',
        ticketNumber: Math.floor(Math.random() * 10000) + 1000,
        scannerId: 'scanner-' + Math.floor(Math.random() * 5),
        verdict: Math.random() > 0.2 ? 'accepted' : 'duplicate',
        timestamp: new Date().toISOString()
      };
      ws.send(JSON.stringify(mockScan));
      console.log('📤 Sent mock scan:', mockScan.ticketNumber, mockScan.verdict);
    }
  }, 10000);

  // Handle errors
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  // Handle disconnection
  ws.on('close', (code, reason) => {
    console.log(`❌ Client disconnected - Code: ${code}${reason ? `, Reason: ${reason}` : ''}`);
    clearInterval(interval);
  });
});

wss.on('error', (error) => {
  console.error('❌ WebSocket Server error:', error.message);
});

console.log(`✨ WebSocket server ready on ws://localhost:${PORT}`);
console.log('💡 Press Ctrl+C to stop');
