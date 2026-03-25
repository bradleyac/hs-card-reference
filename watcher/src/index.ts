import { ensureLogConfig, startWatching } from './logWatcher';
import { GameStateManager } from './gameStateManager';
import { WsServer } from './wsServer';

console.log('hs-card-reference watcher starting…');

ensureLogConfig();

const wsServer = new WsServer();

const manager = new GameStateManager((state) => {
  if (state.mode !== 'OTHER') {
    wsServer.broadcast(state);
  }
});

startWatching((event) => {
  manager.handleEvent(event);
});

console.log('Watcher ready. Open the app in your browser and start a Battlegrounds game.');
