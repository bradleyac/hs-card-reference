import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { FilterState, PanelId } from '../data/types';

interface FilterStore extends FilterState {
  setSearchQuery: (q: string) => void;
  toggleRace: (race: string) => void;
  toggleTier: (tier: number) => void;
  setActivePanel: (panel: PanelId) => void;
  clearFilters: () => void;
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      searchQuery: '',
      selectedRaces: [],
      selectedTiers: [],
      activePanel: 'TAVERN' as PanelId,

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

      clearFilters: () => set({ searchQuery: '', selectedRaces: [], selectedTiers: [] }),
    }),
    {
      name: 'hs-card-ref-filters',
      storage: createJSONStorage(() => sessionStorage),
      // Don't persist search query — start fresh each session
      partialize: (state) => ({
        activePanel: state.activePanel,
        selectedRaces: state.selectedRaces,
        selectedTiers: state.selectedTiers,
      }),
    }
  )
);
