import { useEffect, useRef, useState } from 'react';
import { StatusBar } from '../Common/StatusBar';
import { PanelNav } from '../Common/PanelNav';
import { SearchBar } from '../Filters/SearchBar';
import { TribeFilter } from '../Filters/TribeFilter';
import { TierFilter } from '../Filters/TierFilter';
import { CardTypeToggle } from '../Filters/CardTypeToggle';
import { CardList } from '../CardList/CardList';
import { useFilteredCards } from '../../hooks/useFilteredCards';
import { useFilterStore } from '../../state/filterStore';
import type { SyncStatus } from '../../data/cardSync';

interface AppShellProps {
  syncStatus: SyncStatus;
}

export function AppShell({ syncStatus }: AppShellProps) {
  const { activePanel } = useFilterStore();
  const cards = useFilteredCards(syncStatus.type === 'ready');
  const contentRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  // Measure available height for the virtualized list
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // Subtract heights of sticky elements inside content area
      const searchBar = el.querySelector<HTMLElement>('.search-bar');
      const filterRow = el.querySelector<HTMLElement>('.filter-row');
      const searchH = searchBar?.offsetHeight ?? 32;
      const filterH = filterRow?.offsetHeight ?? 32;
      setListHeight(el.clientHeight - searchH - filterH - 4);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activePanel]);

  const showFilters = activePanel === 'TAVERN' || activePanel === 'TIMEWARPED' || activePanel === 'BUDDIES';
  const showCardTypeToggle = activePanel === 'TAVERN' || activePanel === 'TIMEWARPED';

  return (
    <div className="app-shell">
      <StatusBar />

      <div className="panel-content" ref={contentRef}>
        <SearchBar />

        {showFilters && (
          <div className="filter-row">
            {showCardTypeToggle && <CardTypeToggle />}
            <TribeFilter />
            <TierFilter tiers={activePanel === 'TIMEWARPED' ? [3, 5] : undefined} />
          </div>
        )}

        {syncStatus.type === 'loading' ? (
          <div className="sync-status">
            <div className="spinner" />
            <span>{syncStatus.message}</span>
          </div>
        ) : syncStatus.type === 'error' ? (
          <div className="sync-status sync-status--error">
            <span>⚠ {syncStatus.message}</span>
          </div>
        ) : (
          <CardList cards={cards} height={listHeight} panel={activePanel} />
        )}
      </div>

      <PanelNav />
    </div>
  );
}
