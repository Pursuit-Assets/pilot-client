import ReactMarkdown from 'react-markdown';
import StyleChoiceCards from './StyleChoiceCards';

// ----------------------------------------------------------------------------
// TastePanel — the taste test as a focused takeover surface (2026-08-07
// mockup-approved design), NOT chat bubbles. One way at a time at reading
// size, a 1·2·3·4 step strip whose seen steps stay tappable (flip back to
// compare), reaction chips in the moment, the clicked-followup, and the
// final-pick cards for multi-click resolution. Collapses to a one-line pick
// summary (rendered by the parent) once the pick resolves.
//
// Beat CONTENT is authored markdown from the concept catalog — prompt
// comparisons and lead-ins arrive as separate paragraphs / bold blocks and
// must render that way (the single-paragraph wall was the design failure
// this panel replaces).
// ----------------------------------------------------------------------------

const MD = {
  p: (props) => <p className="mb-3 last:mb-0" {...props} />,
  strong: (props) => <strong className="font-semibold text-carbon-black" {...props} />,
  em: (props) => <em className="italic text-[#555]" {...props} />,
};

function TastePanel({
  ways,            // [{ index, family, label, description, content }] in arrival order
  currentIdx,      // index into `ways` currently displayed
  clickedFamilies, // families that got "that clicked"
  followup,        // null | { clickedLabel }
  finalOptions,    // null | { prompt?, options: [...] } — multi-click / zero-click resolution
  disabled,
  total = 4,
  onSelectWay,     // (idx into ways)
  onClicked,
  onNext,
  onFollowup,      // ('rest' | 'move_on')
  onFinalPick,     // (option)
}) {
  if (!ways.length) return null;
  const way = ways[Math.min(currentIdx, ways.length - 1)];
  const isLastPossible = way.index >= total;

  return (
    <div className="mb-6 rounded-2xl border border-stardust bg-white px-5 py-5 sm:px-7 sm:py-6">
      {/* Step strip + counter */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1.5" role="tablist" aria-label="Ways">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const wayAt = ways.find((w) => w.index === n);
            const seen = !!wayAt;
            const on = wayAt === way;
            const clicked = wayAt && clickedFamilies.includes(wayAt.family);
            return (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`Way ${n}`}
                disabled={!seen || on}
                onClick={() => seen && onSelectWay?.(ways.indexOf(wayAt))}
                className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-proxima-bold border transition-all ${
                  on
                    ? 'bg-pursuit-purple border-pursuit-purple text-white'
                    : seen
                      ? 'bg-white border-pursuit-purple text-pursuit-purple cursor-pointer hover:bg-pursuit-purple/5'
                      : 'bg-white border-stardust text-gray-300'
                } ${clicked ? 'ring-2 ring-pursuit-purple/25' : ''}`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] font-proxima-bold uppercase tracking-widest text-gray-400">
          Way {way.index} of {total}
        </span>
      </div>

      {/* The way itself — heading, plain-language tagline, structured body */}
      <h3 className="text-xl sm:text-2xl font-proxima-bold text-carbon-black mb-0.5">{way.label}</h3>
      {way.description && (
        <p className="text-sm font-proxima font-semibold text-pursuit-purple mb-4">{way.description}</p>
      )}
      <div className="text-[15.5px] leading-relaxed text-carbon-black font-proxima max-w-prose">
        <ReactMarkdown components={MD}>{way.content}</ReactMarkdown>
      </div>

      {/* Final pick (multi-click / zero-click resolution) takes precedence */}
      {finalOptions ? (
        <div className="mt-5 pt-4 border-t border-stardust">
          <StyleChoiceCards
            options={finalOptions.options}
            disabled={disabled}
            onPick={onFinalPick}
          />
        </div>
      ) : followup ? (
        <div className="mt-5 pt-4 border-t border-stardust">
          <p className="text-sm font-proxima font-semibold text-carbon-black mb-3">
            Noted — <span className="text-pursuit-purple">{followup.clickedLabel}</span> landed.
            Want to see the other ways, or keep moving?
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onFollowup?.('rest')}
              className="rounded-full border border-stardust text-[#555] bg-white font-proxima font-semibold text-sm px-4 py-1.5 hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              Show me the rest
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onFollowup?.('move_on')}
              className="rounded-full border border-pursuit-purple text-pursuit-purple bg-white font-proxima font-semibold text-sm px-4 py-1.5 hover:bg-pursuit-purple/5 transition-colors disabled:opacity-50"
            >
              Keep moving →
            </button>
          </div>
        </div>
      ) : (
        currentIdx === ways.length - 1 && (
          <div className="flex gap-2 mt-5 pt-4 border-t border-stardust flex-wrap">
            <button
              type="button"
              disabled={disabled}
              onClick={onClicked}
              className="rounded-full border border-pursuit-purple text-pursuit-purple bg-white font-proxima font-semibold text-sm px-4 py-1.5 hover:bg-pursuit-purple/5 transition-colors disabled:opacity-50"
            >
              💡 That clicked
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onNext}
              className="rounded-full border border-stardust text-[#555] bg-white font-proxima font-semibold text-sm px-4 py-1.5 hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              {isLastPossible ? 'None of these quite fit' : 'Next way →'}
            </button>
          </div>
        )
      )}
    </div>
  );
}

export default TastePanel;
