// The taste-test pick — four tap cards, one per style family. Lives INLINE in
// the transcript as a message item at its chronological position; tapping one
// REPLACES the cards with a normal user bubble (the pick behaves exactly like
// a sent message). Server option payload wins when present; DEFAULT_OPTIONS is
// the resume fallback (stable product copy mirroring
// utils/onboardingStages.js STYLE_FAMILIES).
export const DEFAULT_OPTIONS = [
  { family: 'tell_me', label: 'Tell me', description: 'Explain it to me plainly, then check I got it' },
  { family: 'show_me', label: 'Show me', description: 'Walk me through a worked example first' },
  { family: 'ask_me', label: 'Ask me', description: 'Ask me questions and let me figure it out' },
  { family: 'let_me_try', label: 'Let me try', description: 'Drop me into a real problem and let me work it' },
];

function StyleChoiceCards({ options, disabled, onPick }) {
  const list = Array.isArray(options) && options.length ? options : DEFAULT_OPTIONS;
  return (
    <div className="my-4">
      <p className="text-center text-xs font-proxima text-gray-500 mb-2">
        Which one landed for you? Tap one (or just tell your coach in words).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {list.map((o) => (
          <button
            key={o.family}
            type="button"
            disabled={disabled}
            onClick={() => onPick?.(o)}
            className="text-left rounded-xl border border-stardust bg-white px-4 py-3 hover:border-pursuit-purple hover:bg-pursuit-purple/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="block font-proxima-bold text-sm text-carbon-black">{o.label}</span>
            <span className="block text-xs font-proxima text-gray-500 mt-0.5">{o.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default StyleChoiceCards;
