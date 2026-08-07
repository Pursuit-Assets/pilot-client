import ReactMarkdown from 'react-markdown';

// One taste-test sample ("Way 2 of 4 — Show me") with in-the-moment reaction
// chips. Beats arrive ONE at a time (2026-08-06: the four-beats-at-once dump
// was unreadable); the builder reacts to each while experiencing it — no
// end-of-lecture memory comparison. Chips render only while this beat is the
// one awaiting a reaction.
function BeatCard({ index, total, label, content, active, disabled, onClicked, onNext }) {
  return (
    <div className="my-4">
      <div className="rounded-xl border border-stardust bg-white px-4 py-3">
        <div className="text-[10px] font-proxima-bold uppercase tracking-widest text-pursuit-purple mb-1.5">
          Way {index} of {total} · {label}
        </div>
        <div className="text-carbon-black leading-relaxed text-[15px] font-proxima">
          <ReactMarkdown
            components={{
              p: (props) => <p className="mb-2 last:mb-0" {...props} />,
              strong: (props) => <strong className="font-semibold" {...props} />,
              em: (props) => <em className="italic" {...props} />,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
      {active && (
        <div className="flex gap-2 mt-2 justify-end">
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
            {index < total ? 'Next way →' : "None of these quite fit"}
          </button>
        </div>
      )}
    </div>
  );
}

export default BeatCard;
