import { useGameStore } from './gameStore';
import type { GameState } from '../data/types';

const WS_URL = 'ws://127.0.0.1:9876';
const RECONNECT_DELAY = 2000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function startWsClient(): void {
  connect();
}

function connect(): void {
  const { setConnectionStatus, setGameState } = useGameStore.getState();

  setConnectionStatus('connecting');

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setConnectionStatus('connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const state = JSON.parse(event.data as string) as GameState;
      setGameState(state);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    setConnectionStatus('disconnected');
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY);
}
