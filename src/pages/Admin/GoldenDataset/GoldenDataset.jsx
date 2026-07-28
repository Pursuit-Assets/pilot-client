/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  listArchetypes,
  listGoldenTasks,
  runArchetype,
} from '../../../services/goldenDatasetApi';

const BRAND = '#4242EA';

const TONES = {
  slate: 'bg-slate-100 text-slate-600 border-slate-300',
  green: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  amber: 'bg-amber-100 text-amber-700 border-amber-300',
  red: 'bg-rose-100 text-rose-700 border-rose-300',
  blue: 'bg-blue-100 text-blue-700 border-blue-300',
  violet: 'bg-violet-100 text-violet-700 border-violet-300',
  // extra hues so each teaching style gets its own distinct color
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300',
  orange: 'bg-orange-100 text-orange-700 border-orange-300',
  teal: 'bg-teal-100 text-teal-700 border-teal-300',
};

const Chip = ({ children, tone = 'slate' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${TONES[tone]}`}
  >
    {children}
  </span>
);

// Difficulty bands became the 6 Dreyfus levels on 2026-07-28 (keyed to the level
// the challenge TARGETS). The three legacy keys are kept because archetypes and
// stored runs from before then still carry them.
const DIFFICULTY_TONE = {
  // Dreyfus (current vocabulary)
  below_novice: 'slate',
  novice: 'slate',
  advanced_beginner: 'teal',
  competent: 'amber',
  proficient: 'green',
  expert: 'violet',
  // retired 3-band vocabulary
  beginner: 'slate',
  intermediate: 'amber',
  advanced: 'green',
};
const difficultyTone = (band) => DIFFICULTY_TONE[band] || 'slate';

// Slug → display text, so a column reads "Proficient" not "proficient".
const difficultyLabel = (band) =>
  band ? band.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—';

const METHOD_LABELS = {
  socratic: 'Socratic',
  direct: 'Direct',
  example_based: 'Example-based',
  demonstration: 'Demonstration',
  inquiry_based: 'Inquiry-based',
  problem_based: 'Problem-based',
  experiential: 'Experiential',
};
const methodLabel = (m) => METHOD_LABELS[m] || m || '—';

// Each teaching style gets its own distinct color so they're easy to tell apart
// at a glance (kept off green/amber/slate/red, which mean difficulty/status).
const METHOD_TONE = {
  socratic: 'violet',
  direct: 'blue',
  example_based: 'teal',
  demonstration: 'orange',
  inquiry_based: 'indigo',
  problem_based: 'fuchsia',
  experiential: 'cyan',
};
const methodTone = (m) => METHOD_TONE[m] || 'violet';

// A small horizontal bar for a 0..100 skill level.
const SkillBar = ({ tag, level }) => {
  const pct = Math.max(0, Math.min(100, Number(level) || 0));
  const color = pct >= 75 ? '#10b981' : pct >= 45 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="flex items-center gap-2">
      <code className="font-mono text-[11px] text-slate-600 w-44 shrink-0 truncate" title={tag}>
        {tag}
      </code>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] text-slate-500 w-8 text-right">{pct}</span>
    </div>
  );
};

const LP_FIELDS = ['pacing', 'depth_preference', 'feedback_style', 'autonomy', 'challenge_appetite'];

const SectionLabel = ({ children }) => (
  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
    {children}
  </div>
);

// Full-bleed section — a light, white panel spanning the full width of its
// container with padding only (no side margin). Stacked sections separate via a
// hairline top border, not a recessed grey well, for stronger text contrast.
const SunkenSection = ({ title, right, children, className = '' }) => (
  <section
    className={`bg-white border-t border-[#E3E3E3] px-4 py-3 ${className}`}
  >
    {title && (
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        {right}
      </div>
    )}
    {children}
  </section>
);

// Light, high-contrast card — a white panel with a hairline border (no recessed
// grey well). Used for the Background & Goals tab so the dark text reads clearly.
const LightCard = ({ title, children, className = '' }) => (
  <section className={`bg-white border border-[#E3E3E3] rounded-lg shadow-sm px-4 py-3.5 ${className}`}>
    {title && (
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</div>
    )}
    {children}
  </section>
);

// ---------------------------------------------------------------------------
// Map an archetype's authored inputs (GET / shape) into the getSnapshot
// `.profile` shape so StatsBody / LearningProfileBody can render the authored
// baseline with the same components used for the before/after snapshots.
// ---------------------------------------------------------------------------
const inputsToProfile = (inputs) => ({
  skill_levels: inputs?.skill_levels || {},
  prior_knowledge_by_skill: inputs?.prior_knowledge_by_skill || {},
  apply_accuracy_by_skill: inputs?.apply_accuracy_by_skill || {},
  competencies: { by_skill: {} },
  performance: { entries: [] },
  learning_profile: {
    fields: inputs?.learning_profile_fields || {},
    markdown: inputs?.learning_profile_markdown || '',
  },
});

// ---------------------------------------------------------------------------
// Before → After profile diff (what the run changed)
// ---------------------------------------------------------------------------
const Arrow = ({ delta }) => {
  if (delta > 0) return <span className="text-emerald-600 font-semibold">▲ +{delta}</span>;
  if (delta < 0) return <span className="text-rose-600 font-semibold">▼ {delta}</span>;
  return <span className="text-slate-400">—</span>;
};

const ProfileDiff = ({ before, after, variant = 'all' }) => {
  const bp = before?.profile || {};
  const ap = after?.profile || {};

  // Skill levels (EMA shift)
  const slKeys = [...new Set([...Object.keys(bp.skill_levels || {}), ...Object.keys(ap.skill_levels || {})])];
  const skillChanges = slKeys
    .map((k) => {
      const b = bp.skill_levels?.[k];
      const a = ap.skill_levels?.[k];
      return { tag: k, before: b, after: a, delta: (a ?? 0) - (b ?? 0) };
    })
    .filter((r) => r.delta !== 0 || r.before == null || r.after == null);

  // New performance entries
  const beforePerf = bp.performance?.entries || [];
  const afterPerf = ap.performance?.entries || [];
  const newPerf = afterPerf.slice(beforePerf.length);

  // New competency evidence per skill
  const beforeComp = bp.competencies?.by_skill || {};
  const afterComp = ap.competencies?.by_skill || {};
  const compChanges = [...new Set([...Object.keys(beforeComp), ...Object.keys(afterComp)])]
    .map((k) => {
      const b = (beforeComp[k] || []).length;
      const a = (afterComp[k] || []).length;
      return { tag: k, added: a - b };
    })
    .filter((r) => r.added > 0);

  // Apply accuracy changes
  const aaKeys = [...new Set([...Object.keys(bp.apply_accuracy_by_skill || {}), ...Object.keys(ap.apply_accuracy_by_skill || {})])];
  const aaChanges = aaKeys
    .map((k) => {
      const b = bp.apply_accuracy_by_skill?.[k] || {};
      const a = ap.apply_accuracy_by_skill?.[k] || {};
      return {
        tag: k,
        before: `${b.passed ?? 0}✓/${b.failed ?? 0}✗`,
        after: `${a.passed ?? 0}✓/${a.failed ?? 0}✗`,
        changed: (b.passed ?? 0) !== (a.passed ?? 0) || (b.failed ?? 0) !== (a.failed ?? 0),
      };
    })
    .filter((r) => r.changed);

  // Learning-profile field changes (reflect node may update these)
  const beforeLpf = bp.learning_profile?.fields || {};
  const afterLpf = ap.learning_profile?.fields || {};
  const lpChanges = [...new Set([...Object.keys(beforeLpf), ...Object.keys(afterLpf)])]
    .map((k) => ({ field: k, before: beforeLpf[k], after: afterLpf[k] }))
    .filter((r) => JSON.stringify(r.before) !== JSON.stringify(r.after));

  const showStats = variant === 'all' || variant === 'stats';
  const showLearning = variant === 'all' || variant === 'learning';
  const nothingChanged =
    (!showStats || (skillChanges.length === 0 && newPerf.length === 0 && compChanges.length === 0 && aaChanges.length === 0)) &&
    (!showLearning || lpChanges.length === 0);

  return (
    <div className="space-y-4">
      {nothingChanged && (
        <div className="text-xs text-slate-400">
          No changes recorded in this section.
        </div>
      )}

      {showStats && skillChanges.length > 0 && (
        <div>
          <SectionLabel>Skill levels (EMA shift)</SectionLabel>
          <div className="border border-[#EEE] rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[#F7F7F9] text-slate-600">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Skill</th>
                  <th className="text-left px-3 py-1.5 font-semibold w-20">Before</th>
                  <th className="text-left px-3 py-1.5 font-semibold w-20">After</th>
                  <th className="text-left px-3 py-1.5 font-semibold w-24">Δ</th>
                </tr>
              </thead>
              <tbody>
                {skillChanges.map((r) => (
                  <tr key={r.tag} className="border-t border-[#EEE]">
                    <td className="px-3 py-1.5 font-mono text-slate-800">{r.tag}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.before ?? '—'}</td>
                    <td className="px-3 py-1.5 text-slate-800 font-semibold">{r.after ?? '—'}</td>
                    <td className="px-3 py-1.5"><Arrow delta={r.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showStats && newPerf.length > 0 && (
        <div>
          <SectionLabel>New performance entry (from the reflect node)</SectionLabel>
          <div className="space-y-2">
            {newPerf.map((e, i) => (
              <div key={i} className="border border-[#EEE] rounded-md p-3 bg-white">
                <div className="flex items-center gap-2 mb-1">
                  {e.overall_score != null && (
                    <Chip tone={e.passed ? 'green' : 'red'}>score {e.overall_score}</Chip>
                  )}
                  <Chip tone={e.passed ? 'green' : 'red'}>{e.passed ? 'passed' : 'failed'}</Chip>
                </div>
                {e.summary && <div className="text-xs text-slate-700">{e.summary}</div>}
                {e.what_went_well && (
                  <div className="text-[11px] text-emerald-700 mt-1">+ {e.what_went_well}</div>
                )}
                {e.what_to_improve && (
                  <div className="text-[11px] text-amber-700 mt-0.5">→ {e.what_to_improve}</div>
                )}
                {e.trajectory_note && (
                  <div className="text-[11px] text-slate-500 italic mt-0.5">{e.trajectory_note}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showStats && compChanges.length > 0 && (
        <div>
          <SectionLabel>New competency evidence</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {compChanges.map((r) => (
              <Chip key={r.tag} tone="violet">{r.tag} +{r.added}</Chip>
            ))}
          </div>
        </div>
      )}

      {showStats && aaChanges.length > 0 && (
        <div>
          <SectionLabel>Apply accuracy</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {aaChanges.map((r) => (
              <Chip key={r.tag} tone="blue">{r.tag}: {r.before} → {r.after}</Chip>
            ))}
          </div>
        </div>
      )}

      {showLearning && lpChanges.length > 0 && (
        <div>
          <SectionLabel>Learning-profile updates</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {lpChanges.map((r) => (
              <Chip key={r.field} tone="amber">
                {r.field}: {String(r.before ?? '—')} → {String(r.after ?? '—')}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Conversation transcript — static, scrollable (no auto-player)
// ---------------------------------------------------------------------------
const PHASE_TONE = {
  init: 'slate', learn: 'blue', generateApply: 'violet', apply: 'violet',
  grade: 'amber', remediate: 'red', complete: 'green', reflect: 'slate',
};

const ConversationView = ({ transcript, steps, builderName }) => {
  const msgs = Array.isArray(transcript) ? transcript : [];

  // Distinct node/phase sequence (collapse consecutive dupes) for the rail.
  const phaseRail = useMemo(() => {
    const seq = (steps || []).map((s) => s.node).filter(Boolean);
    return seq.filter((n, i) => n !== seq[i - 1]);
  }, [steps]);

  if (msgs.length === 0) {
    return <div className="text-xs text-slate-400">No transcript captured for this run.</div>;
  }

  return (
    <div>
      {/* Phase rail — the pipeline this run went through */}
      {phaseRail.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          {phaseRail.map((n, i) => (
            <span key={i} className="flex items-center">
              <Chip tone={PHASE_TONE[n] || 'slate'}>{n}</Chip>
              {i < phaseRail.length - 1 && <span className="text-slate-300 mx-0.5">→</span>}
            </span>
          ))}
        </div>
      )}

      {/* Full transcript — scroll to read (sits in the sunken well) */}
      <div className="max-h-[74vh] overflow-y-auto space-y-3 pr-1">
        {msgs.map((m, i) => {
          const isCoach = m.role === 'assistant';
          return (
            <div key={i} className={`flex ${isCoach ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                isCoach ? 'bg-violet-50 border border-violet-200' : 'bg-white border border-slate-200'
              }`}>
                <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                  isCoach ? 'text-violet-600' : 'text-slate-500'
                }`}>
                  {isCoach ? 'Coach' : builderName || 'Builder'}
                </div>
                <div className="prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed">
                  <ReactMarkdown>{m.content || ''}</ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Snapshot profile body — renders a getSnapshot `.profile`. Used for BOTH the
// before + after columns so the side-by-side is a true apples-to-apples view.
// ---------------------------------------------------------------------------
const StatsBody = ({ profile }) => {
  const p = profile || {};
  const skillRows = Object.entries(p.skill_levels || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  const priorRows = Object.entries(p.prior_knowledge_by_skill || {});
  const accRows = Object.entries(p.apply_accuracy_by_skill || {});
  const compRows = Object.entries(p.competencies?.by_skill || {});
  const perfEntries = p.performance?.entries || [];
  const empty = skillRows.length === 0 && perfEntries.length === 0 && compRows.length === 0 && accRows.length === 0;

  return (
    <div className="space-y-3">
      {skillRows.length > 0 && (
        <div>
          <SectionLabel>Skill levels</SectionLabel>
          <div className="space-y-1.5">
            {skillRows.map(([tag, level]) => <SkillBar key={tag} tag={tag} level={level} />)}
          </div>
        </div>
      )}
      {priorRows.length > 0 && (
        <div>
          <SectionLabel>Prior knowledge</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {priorRows.map(([tag, lvl]) => (
              <Chip key={tag} tone={lvl === 'advanced' ? 'green' : lvl === 'intermediate' ? 'amber' : 'slate'}>
                {tag}: {lvl}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {accRows.length > 0 && (
        <div>
          <SectionLabel>Apply accuracy</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {accRows.map(([tag, info]) => (
              <Chip key={tag} tone={info?.rate >= 0.75 ? 'green' : info?.rate >= 0.5 ? 'amber' : 'red'}>
                {tag}: {info?.passed ?? 0}✓/{info?.failed ?? 0}✗
              </Chip>
            ))}
          </div>
        </div>
      )}
      {compRows.length > 0 && (
        <div>
          <SectionLabel>Competency evidence</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {compRows.map(([tag, ev]) => <Chip key={tag} tone="violet">{tag}: {(ev || []).length}</Chip>)}
          </div>
        </div>
      )}
      {perfEntries.length > 0 && (
        <div>
          <SectionLabel>Performance ({perfEntries.length})</SectionLabel>
          <div className="space-y-2">
            {perfEntries.slice(-3).reverse().map((e, i) => (
              <div key={i} className="border border-[#EEE] rounded-md p-2 bg-white">
                <div className="flex items-center gap-2 mb-0.5">
                  {e.overall_score != null && <Chip tone={e.passed ? 'green' : 'red'}>{e.overall_score}</Chip>}
                  <Chip tone={e.passed ? 'green' : 'red'}>{e.passed ? 'passed' : 'failed'}</Chip>
                </div>
                {e.summary && <div className="text-[11px] text-slate-600">{e.summary}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {empty && <div className="text-xs text-slate-400">No dynamic profile data yet.</div>}
    </div>
  );
};

// Learning-profile fields (chips) + markdown — the "how they learn" narrative.
const LearningProfileBody = ({ profile }) => {
  const lp = profile?.learning_profile?.fields || {};
  const md = profile?.learning_profile?.markdown || '';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {LP_FIELDS.map((f) => (
          <Chip key={f} tone="slate">
            {f.replace('_preference', '').replace('_appetite', '')}: {lp[f] ?? '—'}
          </Chip>
        ))}
      </div>
      {md && (
        <div className="prose prose-sm max-w-none text-slate-600 text-sm"><ReactMarkdown>{md}</ReactMarkdown></div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Detail panel (right side of master-detail)
// ---------------------------------------------------------------------------
const DetailPanel = ({ archetype, tasks, selectedTaskId, onSelectTask, selectedTask, onRun, running, runError, runResult }) => {
  const [tab, setTab] = useState('background');
  if (!archetype) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
        Select a builder on the left.
      </div>
    );
  }
  const derived = archetype.derived || {};
  const outcome = runResult?.after?.recent_apply_outcomes?.[0] || null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white">
      {/* Raised header: identity + derived decision (left) · task picker + run (right) */}
      <div className="bg-white border-b border-[#E3E3E3]">
        <div className="px-4 py-3 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-[#1E1E1E]">
              {archetype.firstName} {archetype.lastName}
            </div>
            <code className="font-mono text-[11px] text-slate-400">{archetype.key}</code>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Chip tone={methodTone(derived.teachingMethod)}>{methodLabel(derived.teachingMethod)}</Chip>
              <Chip tone={difficultyTone(derived.difficultyLevel)}>
                {Number.isInteger(derived.targetLevel)
                  ? `targets L${derived.targetLevel} ${difficultyLabel(derived.difficultyLevel)}`
                  : difficultyLabel(derived.difficultyLevel)}
              </Chip>
              {Number.isInteger(derived.currentLevel) && (
                <Chip tone="slate">now L{derived.currentLevel}</Chip>
              )}
              {derived.difficultyModifier === '+20%' && <Chip tone="red">+20% interview</Chip>}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              ↑ the coach&apos;s deterministic decision{selectedTask ? ` for “${selectedTask.task_title}”` : ' (vs this builder’s own skills)'} — computed with zero LLM calls
            </div>
          </div>

          {/* Task picker + run */}
          <div className="shrink-0 w-72">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Task</div>
            <select
              value={selectedTaskId ?? ''}
              onChange={(e) => onSelectTask(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-sm border border-[#E3E3E3] rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">Select a task…</option>
              {(tasks || []).map((t) => (
                <option key={t.id} value={t.id}>{t.task_title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onRun(archetype)}
              disabled={!selectedTask || running}
              className="mt-2 w-full text-sm font-medium text-white rounded-md px-3 py-2 disabled:opacity-40"
              style={{ backgroundColor: BRAND }}
              title={selectedTask ? 'Reset to fixture, drive a live coach run, capture before/after + transcript' : 'Select a task first'}
            >
              {running ? 'Running… (~1–2 min)' : selectedTask ? '▶ Run on this task' : 'Select a task to run'}
            </button>
            {runResult && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Chip tone="slate">{runResult.turns} turns</Chip>
                <Chip tone={runResult.finalPhase === 'complete' ? 'green' : 'amber'}>{runResult.finalPhase}</Chip>
                {outcome && (
                  <Chip tone={outcome.passed ? 'green' : 'red'}>score {outcome.overall_score} · {outcome.passed ? 'passed' : 'failed'}</Chip>
                )}
              </div>
            )}
          </div>
        </div>
        {runError && (
          <div className="px-4 pb-3">
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{runError}</div>
          </div>
        )}
      </div>

      {/* Tabs: Builder Profile | Conversation (raised, sticky) */}
      <div className="bg-white sticky top-0 z-10">
        <div className="px-4 flex items-center gap-1">
          {[['background', 'Background & Goals'], ['stats', 'Skills & Stats'], ['conversation', 'Conversation']].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={`text-sm font-medium px-4 py-2 -mb-px border-b-2 ${
                tab === v ? 'border-[#4242EA] text-[#4242EA]' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB: Background + learning profile (top), persona + goals (below) */}
        {tab === 'background' && (() => {
          const inputs = archetype.inputs || {};
          const background = inputs.background_markdown || '';
          const goals = inputs.goals_markdown || '';
          const persona = archetype.behavior_summary || '';
          const weaknesses = inputs.interview_themes?.recurring_weaknesses || [];
          return (
            <div className="bg-white px-4 py-4 space-y-4">
              {/* Row 1: Background · Learning profile */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LightCard title="Background">
                  {background ? (
                    <div className="prose prose-sm max-w-none text-slate-700 text-sm"><ReactMarkdown>{background}</ReactMarkdown></div>
                  ) : <div className="text-sm text-slate-400">—</div>}
                </LightCard>
                <LightCard title="Learning profile">
                  <LearningProfileBody profile={inputsToProfile(inputs)} />
                </LightCard>
              </div>

              {/* Row 2: Builder persona · Goals */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LightCard title="Builder persona (drives the simulated builder)">
                  {persona ? (
                    <div className="text-sm text-slate-600 italic">{persona}</div>
                  ) : <div className="text-sm text-slate-400">—</div>}
                </LightCard>
                <LightCard title="Goals">
                  {goals ? (
                    <div className="prose prose-sm max-w-none text-slate-700 text-sm"><ReactMarkdown>{goals}</ReactMarkdown></div>
                  ) : <div className="text-sm text-slate-400">—</div>}
                </LightCard>
              </div>

              {weaknesses.length > 0 && (
                <LightCard title="Mock-interview weak areas">
                  <div className="flex flex-wrap gap-1.5">{weaknesses.map((w) => <Chip key={w} tone="red">{w}</Chip>)}</div>
                </LightCard>
              )}
            </div>
          );
        })()}

        {/* TAB: before vs after stats (quantitative) */}
        {tab === 'stats' && (
          runResult ? (
            <>
              <SunkenSection title="What the run changed">
                <ProfileDiff before={runResult.before} after={runResult.after} variant="stats" />
              </SunkenSection>
              <SunkenSection title="Before vs after">
                <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-[#DCDCE2]">
                  <div className="lg:pr-4 pb-3 lg:pb-0">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Before <span className="text-slate-400 font-normal">(authored fixture)</span>
                    </div>
                    <StatsBody profile={runResult.before?.profile} />
                  </div>
                  <div className="lg:pl-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#DCDCE2]">
                    <div className="text-xs font-semibold text-emerald-700 mb-2">After run</div>
                    <StatsBody profile={runResult.after?.profile} />
                  </div>
                </div>
              </SunkenSection>
            </>
          ) : (
            <SunkenSection title="Authored stats (baseline)">
              <div className="text-[11px] text-slate-500 mb-3">
                The authored starting stats — each run resets to exactly this. Run on a task to see before vs after.
              </div>
              <StatsBody profile={inputsToProfile(archetype.inputs)} />
            </SunkenSection>
          )
        )}

        {/* TAB: conversation */}
        {tab === 'conversation' && (
          runResult ? (
            <SunkenSection className="py-2">
              <ConversationView
                key={runResult.threadId}
                transcript={runResult.transcript}
                steps={runResult.steps}
                builderName={archetype.firstName}
              />
            </SunkenSection>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-400">Run on a task to generate a conversation, then scroll through it here.</div>
          )
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------
const GoldenDataset = ({ embedded = false }) => {
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();

  const [archetypes, setArchetypes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedKey, setSelectedKey] = useState(null);

  const [runningKey, setRunningKey] = useState(null);
  const [runErrors, setRunErrors] = useState({});
  const [runResults, setRunResults] = useState({}); // key -> { threadId, before, after, transcript, steps, ... }

  const loadArchetypes = useCallback(
    async (taskId) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listArchetypes(token, taskId ?? undefined);
        setArchetypes(data.archetypes || []);
        setSelectedKey((prev) => prev || data.archetypes?.[0]?.key || null);
      } catch (e) {
        setError(e.message || 'Failed to load archetypes');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listGoldenTasks(token);
        if (!cancelled) setTasks(data.tasks || []);
      } catch {
        /* tasks optional */
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    loadArchetypes(selectedTaskId);
  }, [selectedTaskId, loadArchetypes]);

  const handleRun = async (archetype) => {
    if (!selectedTaskId) return;
    setRunningKey(archetype.key);
    setRunErrors((prev) => ({ ...prev, [archetype.key]: null }));
    try {
      const res = await runArchetype(token, { archetypeKey: archetype.key, taskId: selectedTaskId });
      setRunResults((prev) => ({ ...prev, [archetype.key]: res }));
    } catch (e) {
      setRunErrors((prev) => ({ ...prev, [archetype.key]: e.message || 'Run failed' }));
    } finally {
      setRunningKey(null);
    }
  };

  if (!canAccessPage('coach')) {
    return (
      <div className="min-h-screen bg-[#EFEFEF] p-8 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 px-6 py-8 rounded-lg border border-red-200 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;
  const selected = archetypes.find((a) => a.key === selectedKey) || null;

  return (
    <div className={`flex flex-col min-h-0 font-proxima ${embedded ? 'h-full' : 'h-screen bg-[#EFEFEF]'}`}>
      {!embedded && (
        <div className="shrink-0 bg-white border-b border-[#E3E3E3] px-8 py-4">
          <h1 className="text-2xl font-bold text-[#1E1E1E]">Golden Dataset</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Handcrafted builder archetypes spanning every coach personalization axis
          </p>
        </div>
      )}

      {error && (
        <div className="shrink-0 px-4 md:px-6 pt-3">
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {error}
          </div>
        </div>
      )}

      {/* Body — master-detail */}
      <div className="flex flex-1 min-h-0 bg-[#EFEFEF]">
        {/* Left rail */}
        <aside className="w-64 shrink-0 border-r border-[#E3E3E3] bg-white overflow-y-auto">
          {loading && archetypes.length === 0 ? (
            <div className="p-4 text-xs text-slate-400">Loading…</div>
          ) : (
            archetypes.map((a) => {
              const active = a.key === selectedKey;
              const d = a.derived || {};
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setSelectedKey(a.key)}
                  className={`w-full text-left px-4 py-2.5 border-b border-[#F0F0F0] hover:bg-[#F7F7F9] ${
                    active ? 'bg-[#F0F0FF] border-l-2 border-l-[#4242EA]' : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {a.firstName} {a.lastName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Chip tone={methodTone(d.teachingMethod)}>{methodLabel(d.teachingMethod)}</Chip>
                    <Chip tone={difficultyTone(d.difficultyLevel)}>{difficultyLabel(d.difficultyLevel)}</Chip>
                    {runResults[a.key] && <span className="text-[10px] text-slate-400">· ran</span>}
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* Detail */}
        <DetailPanel
          archetype={selected}
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          selectedTask={selectedTask}
          onRun={handleRun}
          running={runningKey === selected?.key}
          runError={runErrors[selected?.key]}
          runResult={runResults[selected?.key]}
        />
      </div>
    </div>
  );
};

export default GoldenDataset;
