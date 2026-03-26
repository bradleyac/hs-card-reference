import { useEffect, useRef } from 'react';
import { useFilterStore } from '../../state/filterStore';

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useFilterStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: / or Ctrl+K focuses search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.key === '/' || (e.ctrlKey && e.key === 'k')) &&
        document.activeElement !== inputRef.current
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setSearchQuery('');
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchQuery]);

  return (
    <div className="search-bar">
      <span className="search-bar__icon" aria-hidden="true">🔍</span>
      <input
        ref={inputRef}
        type="text"
        className="search-bar__input"
        placeholder="Search cards… (/ or Ctrl+K)"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search cards"
      />
      <button
        className="search-bar__clear"
        style={{ visibility: searchQuery ? 'visible' : 'hidden' }}
        onClick={() => setSearchQuery('')}
        aria-label="Clear search"
        tabIndex={searchQuery ? 0 : -1}
      >
        ✕
      </button>
    </div>
  );
}
