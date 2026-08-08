import { STAGES, normalizeStage } from './StageDots';

// Full-screen-chapter navigation: numbered nodes with labels and progress
// connectors. Visited chapters are TAPPABLE — the builder can slide back and
// reread a finished chapter (read-only; the input always talks to the
// current chapter). Server-stamped stage drives progress; this never derives
// chapter state client-side.
function ChapterNav({ currentStage, viewStage, completed, onNavigate }) {
  const currentIdx = completed
    ? STAGES.length - 1
    : STAGES.findIndex((s) => s.slug === normalizeStage(currentStage));
  const viewIdx = STAGES.findIndex((s) => s.slug === normalizeStage(viewStage));

  return (
    <nav className="flex items-center justify-center py-3 px-4" aria-label="Chapters">
      {STAGES.map((s, i) => {
        const reached = i <= currentIdx;
        const viewing = i === viewIdx;
        const navigable = reached && !viewing;
        return (
          <div key={s.slug} className="flex items-center">
            {i > 0 && (
              <span
                className={`w-8 sm:w-11 h-0.5 rounded mx-1 ${i <= currentIdx ? 'bg-pursuit-purple' : 'bg-stardust'}`}
              />
            )}
            <button
              type="button"
              disabled={!reached}
              onClick={() => navigable && onNavigate?.(s.slug)}
              className={`flex items-center gap-2 px-1.5 py-1 rounded-lg transition-colors ${
                navigable ? 'hover:bg-pursuit-purple/10 cursor-pointer' : 'cursor-default'
              }`}
              aria-current={viewing ? 'step' : undefined}
            >
              <span
                className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-proxima-bold flex-shrink-0 transition-colors ${
                  reached ? 'bg-pursuit-purple text-white' : 'bg-stardust text-gray-400'
                } ${viewing ? 'ring-2 ring-pursuit-purple/30' : ''}`}
              >
                {completed && i < STAGES.length ? '✓' : i + 1}
              </span>
              <span
                className={`text-xs font-proxima whitespace-nowrap ${
                  viewing ? 'text-carbon-black font-semibold' : reached ? 'text-[#555]' : 'text-gray-400'
                } ${viewing ? '' : 'hidden sm:block'}`}
              >
                {s.label}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export default ChapterNav;
