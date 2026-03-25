import { WebSocketServer, type WebSocket } from 'ws';
import type { GameState } from './types';

const PORT = 9876;

export class WsServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private lastState: GameState | null = null;

  constructor() {
    this.wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      // Send current state immediately on connect
      if (this.lastState) {
        ws.send(JSON.stringify(this.lastState));
      }
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });

    this.wss.on('error', (err) => {
      console.error('[ws] Server error:', err.message);
    });

    console.log(`[ws] Listening on ws://127.0.0.1:${PORT}`);
  }

  broadcast(state: GameState): void {
    this.lastState = state;
    const msg = JSON.stringify(state);
    for (const client of this.clients) {
      if (client.readyState === 1 /* OPEN */) {
        client.send(msg);
      }
    }
  }
}
