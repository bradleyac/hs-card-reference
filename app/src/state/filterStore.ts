import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CardTypeFilter, FilterState, PanelId } from '../data/types';

interface FilterStore extends FilterState {
  setSearchQuery: (q: string) => void;
  toggleRace: (race: string) => void;
  toggleTier: (tier: number) => void;
  setActivePanel: (panel: PanelId) => void;
  setCardTypeFilter: (f: CardTypeFilter) => void;
  clearFilters: () => void;
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      searchQuery: '',
      selectedRaces: [],
      selectedTiers: [],
      activePanel: 'TAVERN' as PanelId,
      cardTypeFilter: 'ALL' as CardTypeFilter,

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      toggleRace: (race) => {
        const { selectedRaces } = get();
        set({
          selectedRaces: selectedRaces.includes(race)
            ? selectedRaces.filter((r) => r !== race)
            : [...selectedRaces, race],
        });
      },

      toggleTier: (tier) => {
        const { selectedTiers } = get();
        set({
          selectedTiers: selectedTiers.includes(tier)
            ? selectedTiers.filter((t) => t !== tier)
            : [...selectedTiers, tier],
        });
      },

      setActivePanel: (activePanel) => set({ activePanel }),

      setCardTypeFilter: (cardTypeFilter) => set({ cardTypeFilter }),

      clearFilters: () => set({ searchQuery: '', selectedRaces: [], selectedTiers: [], cardTypeFilter: 'ALL' }),
    }),
    {
      name: 'hs-card-ref-filters',
      storage: createJSONStorage(() => sessionStorage),
      // Don't persist search query — start fresh each session
      partialize: (state) => ({
        activePanel: state.activePanel,
        selectedRaces: state.selectedRaces,
        selectedTiers: state.selectedTiers,
        cardTypeFilter: state.cardTypeFilter,
      }),
    }
  )
);
