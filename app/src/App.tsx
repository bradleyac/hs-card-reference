import { useEffect, useState } from 'react';
import { AppShell } from './components/App/AppShell';
import { startWsClient } from './state/wsClient';
import { syncCards, type SyncStatus } from './data/cardSync';
import { buildSearchIndex } from './data/search';

export default function App() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    type: 'loading',
    message: 'Initializing…',
  });

  useEffect(() => {
    // Start WebSocket connection to watcher
    startWsClient();

    // Load / sync card data
    syncCards((status) => setSyncStatus(status))
      .then((cardMap) => {
        buildSearchIndex(Array.from(cardMap.values()));
      })
      .catch(() => {
        // Error state is already set via onStatus callback
      });
  }, []);

  return <AppShell syncStatus={syncStatus} />;
}
