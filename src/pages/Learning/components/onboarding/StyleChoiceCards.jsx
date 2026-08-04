import { Check } from 'lucide-react';

// The taste-test pick — four tap cards, one per style family. Rendered when
// the server emits `style_choices` (or on resume when beats are out but no
// pick exists). Server option payload wins when present; DEFAULT_OPTIONS is
// the resume fallback (stable product copy mirroring
// utils/onboardingStages.js STYLE_FAMILIES).
export const DEFAULT_OPTIONS = [
  { family: 'tell_me', label: 'Tell me', description: 'Explain it to me plainly, then check I got it' },
  { family: 'show_me', label: 'Show me', description: 'Walk me through a worked example first' },
  { family: 'ask_me', label: 'Ask me', description: 'Ask me questions and let me figure it out' },
  { family: 'let_me_try', label: 'Let me try', description: 'Drop me into a real problem and let me work it' },
];

function StyleChoiceCards({ options, pickedFamily, disabled, onPick }) {
  const list = Array.isArray(options) && options.length ? options : DEFAULT_OPTIONS;

  // Collapsed state: the pick is made — show a single confirmation chip.
  if (pickedFamily) {
    const picked = list.find((o) => o.family === pickedFamily);
    return (
      <div className="mb-6 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pursuit-purple/10 text-pursuit-purple px-3 py-1.5 text-sm font-proxima font-semibold">
          <Check className="w-4 h-4" />
          {picked ? `${picked.label} — ${picked.description}` : 'Style picked'}
        </span>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <p className="text-center text-xs font-proxima text-gray-500 mb-2">
        Which one landed for you? Tap one (or just tell your coach in words).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {list.map((o) => (
          <button
            key={o.family}
            type="button"
            disabled={disabled}
            onClick={() => onPick?.(o.family)}
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
