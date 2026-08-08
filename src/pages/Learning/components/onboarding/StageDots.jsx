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

// Chapter gate copy for RESUME rendering (live interstitial events carry the
// server's copy — utils/onboardingStages.js INTERSTITIALS is the source of
// truth; keep in sync).
export const CHAPTER_META = {
  learn: {
    part: 2,
    total: 3,
    title: 'How You Learn',
    description: "Next, I'll teach you one small thing four different ways — react to whichever actually lands. It changes how I coach you for the whole program.",
  },
  ahead: {
    part: 3,
    total: 3,
    title: 'Looking Ahead',
    description: "Last part: where you're headed, what your weeks actually look like, and what we'll take on together.",
  },
};

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
