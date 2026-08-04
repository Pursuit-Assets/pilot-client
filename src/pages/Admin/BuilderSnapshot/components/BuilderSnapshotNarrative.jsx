import React, { useState } from 'react';
import { Scale, ThumbsUp, ThumbsDown, Eye, RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';

/**
 * BuilderSnapshotNarrative
 *
 * The evidence-cited "case for / case against" panel — the readiness signals
 * restated in the grader's own words, which is the form a staff member can
 * actually take into a conversation.
 *
 * TWO PROPERTIES THIS UI MUST PRESERVE:
 *
 * 1. NO VERDICT. It never says whether to extend an offer. Pursuit's real L1
 *    bars are participation (>80% attendance, demo day), no skill-level exit bar
 *    has been validated, and a panel that concluded "recommend: no" would become
 *    that bar by default. Both cases are shown side by side, equally weighted —
 *    that is why they are two columns and not a ranked list.
 *
 * 2. EVERY CLAIM SHOWS ITS SOURCE. The task, the date and the grader's verbatim
 *    quote sit under each claim. The server has already DROPPED any claim whose
 *    citation didn't resolve (services/builderNarrativeService.js#resolveCitations),
 *    so anything rendered here is traceable — but it is only trustworthy if the
 *    source is actually visible, so the quote is not hidden behind a hover.
 *
 * Generation is never automatic: it costs an LLM call over the builder's whole
 * history. The panel shows a Generate button when absent, and a "stale" notice
 * when the builder has been graded since the summary was written.
 *
 * Props:
 *   - narrative:   { summary, stale, generated_at, model, sessions_considered } | null
 *   - onGenerate:  () => Promise<void>
 *   - generating:  boolean
 *   - error:       { message, code } | null
 */

// Same validated diverging pair the readiness Direction bar uses: teal (for) /
// orange (against). Emerald↔rose was rejected at ΔE 5.8 in deuteranopia. Both
// columns also carry an icon and a heading, so the split is never colour-alone.
const FOR = { accent: '#0d9488', tint: 'rgba(13,148,136,0.06)', ring: 'rgba(13,148,136,0.25)' };
const AGAINST = { accent: '#ea580c', tint: 'rgba(234,88,12,0.06)', ring: 'rgba(234,88,12,0.25)' };
const WATCH = { accent: '#4242EA', tint: 'rgba(66,66,234,0.05)', ring: 'rgba(66,66,234,0.2)' };

const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

/**
 * One claim + the evidence it rests on.
 *
 * The source (task, date, skill) is ALWAYS visible — that is what makes the
 * claim checkable at a glance. The grader's quote runs 300-800 characters in
 * practice, so it is clamped to three lines and expands on click: enough to see
 * the evidence is real and start reading it, without eight claims turning the
 * panel into a wall. It is never fully hidden behind a hover.
 */
const Claim = ({ item, tone }) => {
  const [open, setOpen] = useState(false);
  const long = (item.evidence || '').length > 220;
  return (
    <li className="rounded-lg p-3.5" style={{ backgroundColor: tone.tint, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
      <p className="text-sm leading-relaxed text-[#1E1E1E]">{item.claim}</p>
      <div className="mt-2.5 pl-3 border-l-2" style={{ borderColor: tone.ring }}>
        <div className="text-[10px] uppercase tracking-wider text-[#666] font-proxima-bold">
          {item.task_title || (item.task_id ? `Task ${item.task_id}` : 'Source')}
          {item.at && <span className="font-proxima text-[#999]"> · {fmtDate(item.at)}</span>}
          {item.skill && <span className="font-proxima text-[#999]"> · {item.skill}</span>}
        </div>
        <p className={`mt-1 text-xs italic leading-relaxed text-[#1E1E1E]/70 ${open || !long ? '' : 'line-clamp-3'}`}>
          “{item.evidence}”
        </p>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 text-[11px] font-proxima-bold hover:underline"
            style={{ color: tone.accent }}
            aria-expanded={open}
          >
            {open ? 'Show less' : 'Read the full note'}
          </button>
        )}
      </div>
    </li>
  );
};

const Column = ({ icon: Icon, title, items, tone, emptyNote }) => (
  <div>
    <h3 className="flex items-center gap-2 text-sm font-proxima-bold" style={{ color: tone.accent }}>
      <Icon className="w-4 h-4" />
      {title}
    </h3>
    {items.length === 0 ? (
      <p className="mt-3 text-sm italic text-[#999]">{emptyNote}</p>
    ) : (
      <ul className="mt-3 space-y-3">
        {items.map((item, i) => (
          <Claim key={i} item={item} tone={tone} />
        ))}
      </ul>
    )}
  </div>
);

const BuilderSnapshotNarrative = ({ narrative, onGenerate, generating, error }) => {
  const [expanded, setExpanded] = useState(false);
  const summary = narrative?.summary;
  const caseFor = summary?.case_for || [];
  const caseAgainst = summary?.case_against || [];
  const watch = summary?.watch_items || [];

  const GenerateButton = ({ label }) => (
    <button
      type="button"
      onClick={onGenerate}
      disabled={generating}
      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-proxima-bold text-white disabled:opacity-60"
      style={{ backgroundColor: '#4242EA' }}
    >
      {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
      {generating ? 'Reading their history…' : label}
    </button>
  );

  return (
    <section className="rounded-2xl ring-1 ring-[#E3E3E3] shadow-md bg-white p-6 md:p-8 font-proxima">
      <header className="mb-5 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-proxima-bold text-[#1E1E1E]">
            <Scale className="w-6 h-6 text-[#4242EA]" />
            The case both ways
          </h2>
          <p className="text-sm text-[#666] mt-1 max-w-3xl">
            Written from the grader's own notes across this builder's graded sessions. Every claim shows the task and
            the quote it rests on. It deliberately reaches <span className="font-proxima-bold">no conclusion</span> —
            weighing these against attendance and demo day is your call.
          </p>
        </div>
        {narrative && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[#E3E3E3] px-3 py-1.5 text-xs font-proxima text-[#666] hover:bg-[#F7F7F9] disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </header>

      {error && (
        <div className="mb-4 rounded-lg bg-amber-50 ring-1 ring-amber-200 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            {error.code === 'INSUFFICIENT_EVIDENCE'
              ? 'Not enough graded work yet to write a summary. It needs at least a few graded sessions.'
              : error.message || 'Could not generate the summary.'}
          </div>
        </div>
      )}

      {!narrative && !error && (
        <div className="py-10 text-center">
          <Scale className="w-10 h-10 text-[#E3E3E3] mx-auto mb-3" />
          <p className="text-sm text-[#666] mb-4">
            No summary yet. Generating one reads every graded session for this builder.
          </p>
          <GenerateButton label="Write the summary" />
        </div>
      )}

      {narrative && (
        <>
          {narrative.stale && (
            <div className="mb-4 rounded-lg bg-[#F1F1F3] ring-1 ring-[#E3E3E3] p-3 text-sm text-[#666]">
              This builder has been graded since the summary was written — regenerate to include the newer sessions.
            </div>
          )}

          {summary?.headline && (
            <p className="text-base md:text-lg leading-relaxed text-[#1E1E1E] mb-6">{summary.headline}</p>
          )}

          {/* Two equal columns — the layout itself refuses to rank one side over
              the other. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Column
              icon={ThumbsUp}
              title="Case for"
              items={caseFor}
              tone={FOR}
              emptyNote="No supporting evidence surfaced."
            />
            <Column
              icon={ThumbsDown}
              title="Case against"
              items={caseAgainst}
              tone={AGAINST}
              emptyNote="No countervailing evidence surfaced."
            />
          </div>

          {watch.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-2 text-sm font-proxima-bold"
                style={{ color: WATCH.accent }}
                aria-expanded={expanded}
              >
                <Eye className="w-4 h-4" />
                What to check next ({watch.length})
              </button>
              {expanded && (
                <ul className="mt-3 space-y-3">
                  {watch.map((item, i) => (
                    <Claim key={i} item={item} tone={WATCH} />
                  ))}
                </ul>
              )}
            </div>
          )}

          <footer className="mt-6 pt-4 border-t border-[#F0F0F0] text-[11px] text-[#999]">
            Generated {fmtDate(narrative.generated_at)}
            {narrative.sessions_considered != null && ` from ${narrative.sessions_considered} graded sessions`}
            {narrative.model && ` · ${narrative.model}`}. Claims whose citation could not be verified are discarded
            before display.
          </footer>
        </>
      )}
    </section>
  );
};

export default BuilderSnapshotNarrative;
