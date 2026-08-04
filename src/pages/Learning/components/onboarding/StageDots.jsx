// Labeled 3-chapter progress header for the redesigned onboarding session.
// Stage values are SERVER-stamped (SSE `stage` events / session row) — the
// client only renders. Order mirrors utils/onboardingStages.js STAGES.
export const STAGES = [
  { slug: 'story', label: 'Getting to Know You' },
  { slug: 'learn', label: 'How You Learn' },
  { slug: 'ahead', label: 'Looking Ahead' },
];

// Pre-refinement sessions may still report the retired meet/build slugs.
export const normalizeStage = (stage) =>
  (stage === 'meet' || stage === 'build') ? 'story' : stage;

export const stageLabel = (stage) =>
  STAGES.find((s) => s.slug === normalizeStage(stage))?.label || '';

function StageDots({ stage, completed = false }) {
  const activeIndex = completed
    ? STAGES.length
    : STAGES.findIndex((s) => s.slug === normalizeStage(stage));
  return (
    <div className="flex items-center justify-center gap-5 py-3" aria-label="Conversation progress">
      {STAGES.map((s, i) => {
        const reached = i <= activeIndex;
        const current = i === activeIndex && !completed;
        return (
          <div key={s.slug} className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full transition-colors ${
                reached ? 'bg-pursuit-purple' : 'bg-stardust'
              } ${current ? 'ring-2 ring-pursuit-purple/30' : ''}`}
            />
            <span
              className={`text-xs font-proxima ${
                reached ? 'text-carbon-black font-semibold' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default StageDots;
