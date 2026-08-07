// Chapter gate / header. Two lives:
//  - pending: the full-width transition card the conversation STOPS at —
//    the next chapter's coach turn starts only when the builder taps
//    "Let's go" (which sends the chapter_continue meta turn).
//  - passed: the same item collapses into the chapter HEADER, permanently
//    marking the boundary in the transcript.
function InterstitialCard({ part, total, title, description, pending, disabled, onContinue }) {
  if (!pending) {
    return (
      <div className="my-8" role="separator">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-stardust" />
          <div className="text-center">
            <div className="text-[10px] font-proxima-bold uppercase tracking-widest text-gray-400">
              Part {part} of {total}
            </div>
            <div className="text-sm font-proxima-bold text-pursuit-purple">{title}</div>
          </div>
          <div className="flex-1 h-px bg-stardust" />
        </div>
      </div>
    );
  }
  return (
    <div className="my-8 rounded-2xl border border-pursuit-purple/20 bg-pursuit-purple/5 px-6 py-7 text-center">
      <div className="text-[11px] font-proxima-bold uppercase tracking-widest text-pursuit-purple/70 mb-1">
        Part {part} of {total}
      </div>
      <h3 className="text-xl font-proxima-bold text-carbon-black mb-2">{title}</h3>
      <p className="text-sm font-proxima text-[#555] max-w-md mx-auto mb-5">{description}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onContinue}
        className="rounded-lg bg-pursuit-purple text-white font-proxima font-semibold text-sm px-6 py-2.5 hover:bg-pursuit-purple/90 transition-colors disabled:opacity-50"
      >
        Let&apos;s go →
      </button>
    </div>
  );
}

export default InterstitialCard;
