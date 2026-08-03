import React, { useMemo, useState } from 'react';
import { TrendingUp, Calendar, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * BuilderSnapshotTimeline
 *
 * Expandable vertical timeline of the most recent N performance entries.
 * Each row collapses to date + task title + score chip; clicking expands
 * to reveal what_went_well, what_to_improve, and a deep-link to the task
 * page in the learning surface. Designed for staff to drill in fast.
 *
 * Props:
 *   - performance: { entries: [{ date, summary, task_id?, overall_score?,
 *                                passed?, what_went_well?, what_to_improve?,
 *                                trajectory_note? }] }
 *   - max: number — how many entries to show (default 8)
 */
const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

/**
 * OutcomeChip — pass/not-passed, NEVER a 0-100 number.
 *
 * `overall_score` is a DERIVED value (mean Dreyfus level / 5 × 100), not a
 * grade, and there is no 0-100 pass bar anywhere in the engine — pass/fail is
 * window-relative (held-or-improved vs the builder's own prior level). This
 * chip used to render the raw score and colour it amber below 70, so every one
 * of Dennys Antunish's 21 tasks — all `passed: true`, scoring 20-60 — displayed
 * as a near-failure. CoachRuns went Dreyfus-first for exactly this reason
 * (2026-07-07); the snapshot had never followed.
 */
const OutcomeChip = ({ passed }) => {
  if (passed == null) return null;
  const tone = passed
    ? { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', label: '✓ Passed' }
    : { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', label: '✗ Not passed' };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ring-1 ${tone.bg} ${tone.text} ${tone.ring} px-2.5 py-0.5 text-[11px] font-proxima-bold`}
      title="Pass is window-relative: the builder held or improved on a majority of the skills this task assessed."
    >
      {tone.label}
    </span>
  );
};

const ExpandedDetail = ({ entry }) => {
  const summary = (entry.summary || '').trim();
  const wentWell = (entry.what_went_well || '').trim();
  const toImprove = (entry.what_to_improve || '').trim();
  const trajectory = (entry.trajectory_note || '').trim();

  return (
    <div className="mt-3 pl-0 sm:pl-36 space-y-3">
      {/* The collapsed row truncates the summary to one line. Repeat it in full
          here — previously the expanded view showed only went-well / to-improve,
          so the summary sentence could never be finished no matter what you
          clicked. */}
      {summary && (
        <p className="text-sm leading-relaxed text-[#1E1E1E]/90">{summary}</p>
      )}
      {wentWell && (
        <div className="rounded-lg bg-emerald-50/60 ring-1 ring-emerald-100 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-proxima-bold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            What went well
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1E1E1E]/90">{wentWell}</p>
        </div>
      )}
      {toImprove && (
        <div className="rounded-lg bg-amber-50/60 ring-1 ring-amber-100 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-proxima-bold text-amber-700">
            <AlertCircle className="w-3.5 h-3.5" />
            Areas to improve
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1E1E1E]/90">{toImprove}</p>
        </div>
      )}
      {/* The grader's cross-session read — the one field that connects this task
          to the builder's pattern over time ("the same pattern seen in the
          market scan task reappears here"). It was captured on every entry and
          rendered nowhere. */}
      {trajectory && (
        <div className="rounded-lg bg-[#4242EA]/[0.04] ring-1 ring-[#4242EA]/15 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-proxima-bold text-[#4242EA]">
            <TrendingUp className="w-3.5 h-3.5" />
            Pattern over time
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1E1E1E]/90">{trajectory}</p>
        </div>
      )}
      {!summary && !wentWell && !toImprove && !trajectory && (
        <p className="text-xs italic text-[#999]">
          No detailed feedback captured for this entry.
        </p>
      )}
    </div>
  );
};

const BuilderSnapshotTimeline = ({ performance, applyOutcomes, max = 8 }) => {
  // Performance entries carry only a task_id. The snapshot endpoint ALSO returns
  // recent_apply_outcomes with a resolved task_title (LEFT JOIN tasks) — the
  // client had simply never read it, so every row showed a bare date. Index the
  // titles by task_id and attach them.
  const titleByTaskId = useMemo(() => {
    const map = new Map();
    for (const o of Array.isArray(applyOutcomes) ? applyOutcomes : []) {
      if (o?.task_id != null && o.task_title) map.set(o.task_id, o.task_title);
    }
    return map;
  }, [applyOutcomes]);

  const items = useMemo(() => {
    const entries = Array.isArray(performance?.entries) ? performance.entries : [];
    return [...entries]
      .sort((a, b) => {
        const da = new Date(a?.date || a?.at || 0).getTime();
        const db = new Date(b?.date || b?.at || 0).getTime();
        return db - da;
      })
      .slice(0, max)
      .map((e) => ({ ...e, task_title: titleByTaskId.get(e?.task_id) || null }));
  }, [performance, max, titleByTaskId]);

  // Track which rows are expanded by index. Multiple can be open at once so
  // staff can compare adjacent entries.
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (idx) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // The summary is truncated in the collapsed row, so an entry with ONLY a
  // summary is still worth expanding — the expanded view repeats it in full.
  const hasAnyDetail = (entry) =>
    !!(entry.summary?.trim() || entry.what_went_well?.trim() ||
       entry.what_to_improve?.trim() || entry.trajectory_note?.trim());

  return (
    <section className="rounded-2xl ring-1 ring-[#E3E3E3] shadow-md bg-white p-6 md:p-8 font-proxima">
      <header className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-proxima-bold text-[#1E1E1E]">
          <TrendingUp className="w-6 h-6 text-[#4242EA]" />
          Recent Performance
        </h2>
        <p className="text-sm text-[#666] mt-1">
          The latest signals from completed tasks, newest first. Click any row
          for the strengths / growth notes captured during grading.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="py-12 text-center">
          <Calendar className="w-10 h-10 text-[#E3E3E3] mx-auto mb-3" />
          <p className="text-sm italic text-[#999]">No performance entries yet.</p>
        </div>
      ) : (
        <ol className="relative space-y-3 pl-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-[#E3E3E3]">
          {items.map((entry, idx) => {
            const isOpen = expanded.has(idx);
            const expandable = hasAnyDetail(entry);
            return (
              <li key={`${entry.date}-${idx}`} className="relative">
                {/* Rail dot */}
                <span
                  aria-hidden="true"
                  className="
                    absolute -left-[1.4rem] top-2
                    w-3 h-3 rounded-full
                    bg-white ring-2 ring-[#4242EA]
                    shadow-sm
                  "
                />
                <button
                  type="button"
                  onClick={() => expandable && toggle(idx)}
                  disabled={!expandable}
                  aria-expanded={isOpen}
                  className={`
                    w-full text-left
                    rounded-lg
                    transition-colors
                    ${expandable ? 'cursor-pointer hover:bg-[#F7F7F9]' : 'cursor-default'}
                    -mx-2 px-2 py-1.5
                  `}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                    <time
                      className="
                        inline-flex items-center
                        text-[11px] uppercase tracking-wider text-[#666] font-proxima-bold
                        tabular-nums shrink-0 sm:w-32
                      "
                    >
                      {fmtDate(entry.date || entry.at) || '—'}
                    </time>
                    <div className="mt-1 sm:mt-0 flex-1 flex items-center justify-between gap-3 min-w-0">
                      <div className="min-w-0">
                        {entry.task_title && (
                          <p className="text-sm font-proxima-bold leading-snug text-[#1E1E1E] truncate">
                            {entry.task_title}
                          </p>
                        )}
                        <p className={`text-sm leading-snug text-[#1E1E1E]/70 truncate ${entry.task_title ? 'mt-0.5' : ''}`}>
                          {entry.summary || <span className="italic text-[#999]">No summary</span>}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <OutcomeChip passed={entry.passed} />
                        {expandable && (
                          isOpen ? (
                            <ChevronUp className="w-4 h-4 text-[#999]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[#999]" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                {isOpen && expandable && <ExpandedDetail entry={entry} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default BuilderSnapshotTimeline;
