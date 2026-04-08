import { useFilterStore } from '../../state/filterStore';

export function PlainGoldenToggle() {
  const { plainOrGolden, setGolden } = useFilterStore();

  return (
    <div className="plain-golden-toggle" role="group" aria-label="Filter by plain/golden">
      <button
        className={`plain-golden-toggle-btn ${plainOrGolden === 'plain' ? 'plain-golden-toggle-btn--active' : ''}`}
        onClick={() => setGolden(false)}
        aria-pressed={plainOrGolden === 'plain'}
        aria-label="Show plain cards"
        title="Show plain cards"
      >
        Plain
      </button>
      <button
        className={`plain-golden-toggle-btn ${plainOrGolden === 'golden' ? 'plain-golden-toggle-btn--active' : ''}`}
        onClick={() => setGolden(true)}
        aria-pressed={plainOrGolden === 'golden'}
        aria-label="Show golden cards"
        title="Show golden cards"
      >
        Golden
      </button>
    </div>
  );
}