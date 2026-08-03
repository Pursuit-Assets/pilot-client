/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import useAuthStore from '../../../stores/authStore';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';
import { listLabPresets, classifyTeachingMethod, coachTurn, generateChallenge } from '../../../services/onboardingLabApi';

const BRAND = '#4242EA';

const TONES = {
  slate: 'bg-slate-100 text-slate-600 border-slate-300',
  green: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  amber: 'bg-amber-100 text-amber-700 border-amber-300',
  red: 'bg-rose-100 text-rose-700 border-rose-300',
  blue: 'bg-blue-100 text-blue-700 border-blue-300',
  violet: 'bg-violet-100 text-violet-700 border-violet-300',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300',
  orange: 'bg-orange-100 text-orange-700 border-orange-300',
  teal: 'bg-teal-100 text-teal-700 border-teal-300',
};

const Chip = ({ children, tone = 'slate' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${TONES[tone]}`}>
    {children}
  </span>
);

// Each teaching style gets its own distinct color (matches the Golden Dataset tab).
const METHOD_LABELS = {
  socratic: 'Socratic',
  direct: 'Direct',
  example_based: 'Example-based',
  demonstration: 'Demonstration',
  inquiry_based: 'Inquiry-based',
  problem_based: 'Problem-based',
  experiential: 'Experiential',
  balanced: 'Balanced (no preference)',
};
const METHOD_TONE = {
  socratic: 'violet',
  direct: 'blue',
  example_based: 'teal',
  demonstration: 'orange',
  inquiry_based: 'indigo',
  problem_based: 'fuchsia',
  experiential: 'cyan',
  balanced: 'slate',
};
const methodLabel = (m) => METHOD_LABELS[m] || m || '—';
const methodTone = (m) => METHOD_TONE[m] || 'slate';

// Selectable styles for the compare view (the 6-way enum; 'demonstration' was
// merged into 'example_based'). 'balanced' is a fallback, not a teaching choice.
const STYLE_OPTIONS = ['socratic', 'direct', 'example_based', 'inquiry_based', 'problem_based', 'experiential'];

// ---------------------------------------------------------------------------
// Skill-level axis (Dreyfus 0-5)
//
// The coach picks challenge difficulty from the builder's Dreyfus level on the
// task's skills, targeting one stage above it. These are the levels you can
// emulate; `null` is an unassessed (brand-new) builder.
// ---------------------------------------------------------------------------
const DREYFUS_LABELS = ['Below Novice', 'Novice', 'Advanced Beginner', 'Competent', 'Proficient', 'Expert'];
const DEFAULT_LEVEL_OPTIONS = [
  ...DREYFUS_LABELS.map((label, level) => ({ level, label })),
  { level: null, label: 'Unassessed (new builder)' },
];

// Darker = more advanced, so a row of columns reads as a ramp.
const LEVEL_TONE = ['slate', 'slate', 'teal', 'blue', 'indigo', 'violet'];
const levelTone = (lvl) => (Number.isInteger(lvl) ? LEVEL_TONE[lvl] : 'amber');
const levelLabel = (lvl) =>
  Number.isInteger(lvl) ? `L${lvl} ${DREYFUS_LABELS[lvl]}` : 'Unassessed';

// Object keys can't be null, so level columns are keyed by a stable string.
const levelKey = (lvl) => (Number.isInteger(lvl) ? `L${lvl}` : 'Lna');
const levelFromKey = (key) => (key === 'Lna' ? null : Number(key.slice(1)));

const LEVEL_DESCRIPTIONS = {
  0: 'Below Novice — no working grasp yet; can’t follow the rules even when given them.',
  1: 'Novice — follows explicit rules and recipes, but has no feel for context.',
  2: 'Advanced Beginner — recognizes recurring situations and can act on them with some guidance.',
  3: 'Competent — plans deliberately, handles the normal cases independently.',
  4: 'Proficient — reads the whole situation, adapts fluidly, sees what matters.',
  5: 'Expert — intuitive and fluent; can invent approaches and teach others.',
};

/**
 * The coach's real derived decision for a column — current level, the level the
 * challenge targets, and where the level came from. This is the engine's actual
 * output (deriveLearnStrategy), not a re-derivation.
 *
 * The current→target gap is the point of the whole surface: it's why the same
 * lesson yields a different challenge per column.
 */
const DecisionChips = ({ decision }) => {
  if (!decision) return null;
  const { currentLevel, currentLabel, targetLevel, targetLabel, levelSource } = decision;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip tone={levelTone(currentLevel)}>
        {Number.isInteger(currentLevel) ? `now L${currentLevel} ${currentLabel}` : 'now — unassessed'}
      </Chip>
      <span className="text-slate-400 text-xs">→</span>
      <Chip tone={levelTone(targetLevel)}>
        {Number.isInteger(targetLevel) ? `targets L${targetLevel} ${targetLabel}` : 'targets —'}
      </Chip>
      {levelSource === 'unassessed' && (
        <span
          className="text-[10px] text-slate-400"
          title="No proficiency or legacy score on this skill — the coach assumes Advanced Beginner, which is what a brand-new builder gets."
        >
          assumed
        </span>
      )}
    </div>
  );
};

// Plain-English explanation of how each style teaches (mirrors the server's
// TEACHING_STYLE_GUIDANCE intent) — shown as a hover tooltip so the difference
// in approach is readable before picking styles to compare.
const STYLE_DESCRIPTIONS = {
  socratic: 'Leads with probing questions and lets you reason to the answer yourself — deliberately withholds the conclusion.',
  direct: 'Explains the concept plainly up front and states the answer, then checks your understanding. No drawing-it-out.',
  example_based: 'Shows a concrete worked example first, then has you try a closely parallel one (“show, then do”). Theory comes after.',
  inquiry_based: 'Hands you an open question to investigate and offers hints rather than answers — you discover it through exploration.',
  problem_based: 'Drops you into a real, messy problem from the start and teaches each concept only when you need it to make progress.',
  experiential: 'Has you attempt it first, then debriefs what happened, names the underlying lesson, and has you try again (try → reflect → retry).',
};

// Tailwind renderers for coach markdown (the @tailwindcss/typography `prose`
// plugin isn't installed in this project, so `prose` classes are no-ops — we
// style each element explicitly instead).
const MD_COMPONENTS = {
  p: ({ ...p }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0" {...p} />,
  strong: ({ ...p }) => <strong className="font-semibold text-slate-900" {...p} />,
  em: ({ ...p }) => <em className="italic" {...p} />,
  ul: ({ ...p }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5" {...p} />,
  ol: ({ ...p }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5" {...p} />,
  li: ({ ...p }) => <li className="leading-relaxed" {...p} />,
  h1: ({ ...p }) => <h1 className="font-bold text-[15px] text-slate-900 mt-2 mb-1 first:mt-0" {...p} />,
  h2: ({ ...p }) => <h2 className="font-bold text-[14px] text-slate-900 mt-2 mb-1 first:mt-0" {...p} />,
  h3: ({ ...p }) => <h3 className="font-semibold text-[13px] text-slate-900 mt-2 mb-1 first:mt-0" {...p} />,
  blockquote: ({ ...p }) => <blockquote className="border-l-2 border-slate-300 pl-3 italic text-slate-600 my-1.5" {...p} />,
  a: ({ ...p }) => <a className="text-[#4242EA] underline" target="_blank" rel="noreferrer" {...p} />,
  hr: () => <hr className="my-2 border-slate-200" />,
  pre: ({ ...p }) => <pre className="bg-slate-100 rounded-md p-2.5 my-2 overflow-x-auto text-[12px] font-mono" {...p} />,
  code: ({ className, children, ...p }) =>
    /language-/.test(className || '') ? (
      <code className="font-mono text-[12px]" {...p}>{children}</code>
    ) : (
      <code className="bg-slate-100 rounded px-1 py-0.5 text-[12px] font-mono" {...p}>{children}</code>
    ),
};

// One chat turn. Coach (assistant) text renders as markdown; builder is plain.
const ChatBubble = ({ role, content }) => (
  <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
    <div
      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
        role === 'user'
          ? 'bg-slate-200 text-slate-800 rounded-br-sm whitespace-pre-wrap'
          : 'bg-[#4242EA]/[0.06] border border-[#4242EA]/20 text-slate-800 rounded-bl-sm'
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide mb-1 text-slate-400">
        {role === 'user' ? 'Builder' : 'Coach'}
      </div>
      {role === 'assistant' ? (
        <div className="text-sm text-slate-800">
          <ReactMarkdown components={MD_COMPONENTS}>{content || ''}</ReactMarkdown>
        </div>
      ) : (
        content
      )}
    </div>
  </div>
);

// A 0..1 confidence bar with the floor marker drawn at `floor`.
const ConfidenceBar = ({ confidence, floor = 0.7 }) => {
  const c = typeof confidence === 'number' ? confidence : 0;
  const pct = Math.max(0, Math.min(100, c * 100));
  const passes = c >= floor;
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: passes ? '#10b981' : '#f59e0b' }}
        />
        {/* floor marker */}
        <div
          className="absolute top-[-3px] bottom-[-3px] w-px bg-slate-500"
          style={{ left: `${floor * 100}%` }}
          title={`Confidence floor (${floor})`}
        />
      </div>
      <span className="text-xs font-mono text-slate-600 w-10 text-right">
        {typeof confidence === 'number' ? confidence.toFixed(2) : '—'}
      </span>
    </div>
  );
};

const SunkenSection = ({ title, hint, children }) => (
  <section className="bg-white border-t border-[#E3E3E3] first:border-t-0 px-6 py-5">
    {title && (
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
    )}
    {children}
  </section>
);

/** The result of one classification run. */
const ResultView = ({ result, answer, floor }) => {
  if (!result) return null;
  const { raw, wouldPersist, effectiveMethod, guidance } = result;
  const omitted = !raw || !raw.value;

  return (
    <div className="space-y-0">
      <SunkenSection title="Answer tested">
        <p className="text-sm text-slate-700 italic">“{answer}”</p>
      </SunkenSection>

      <SunkenSection title="Classifier output" hint="What the behavioral pass returned for anchor #9">
        {omitted ? (
          <div className="flex items-center gap-2">
            <Chip tone="amber">Omitted — no usable signal</Chip>
            <span className="text-xs text-slate-500">the classifier declined to pick a style</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={methodTone(raw.value)}>{methodLabel(raw.value)}</Chip>
              {raw.source && <Chip tone="slate">{raw.source}</Chip>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">Confidence vs floor ({floor})</span>
                <span className={`text-xs font-medium ${raw.confidence >= floor ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {raw.confidence >= floor ? 'clears floor' : 'below floor'}
                </span>
              </div>
              <ConfidenceBar confidence={raw.confidence} floor={floor} />
            </div>
            {raw.evidence && (
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Evidence: </span>
                {raw.evidence}
              </div>
            )}
          </div>
        )}
      </SunkenSection>

      <SunkenSection title="What the coach would do" hint="After the confidence floor + neutral fallback">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {wouldPersist ? (
              <Chip tone="green">Persisted as preference</Chip>
            ) : (
              <Chip tone="amber">Dropped → no stored preference</Chip>
            )}
            <span className="text-slate-400 text-xs">→</span>
            <span className="text-sm text-slate-600">Effective teaching method:</span>
            <Chip tone={methodTone(effectiveMethod)}>{methodLabel(effectiveMethod)}</Chip>
          </div>
          <div className="rounded-md border border-[#E3E3E3] bg-[#F7F7F9] px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Guidance injected into the learn prompt
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{guidance}</p>
          </div>
        </div>
      </SunkenSection>
    </div>
  );
};

/**
 * Generate + render the APPLY-phase challenge for a column.
 *
 * This is the payoff of the skill-level axis: the challenge is built around the
 * per-skill Dreyfus definitions for the TARGET level, so the same lesson yields
 * a visibly different challenge at each level. Runs the real generateApply
 * prompt server-side.
 *
 * Shared by the Classify sheet and every compare column, so the two surfaces
 * can't drift.
 */
const ChallengePanel = ({ token, method, level, messages }) => {
  const [challenge, setChallenge] = useState(null);
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // The challenge follows the conversation, so a stale one would misrepresent
  // the pairing. Clear it whenever the axis or the transcript changes.
  useEffect(() => {
    setChallenge(null);
    setDecision(null);
    setError(null);
  }, [method, level, messages.length]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateChallenge(token, {
        teachingMethod: method,
        skillLevel: level,
        messages,
      });
      setChallenge(data.challenge);
      setDecision(data.decision || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-dashed border-[#D8D8E0] pt-3 mt-3">
      {challenge ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Apply challenge
            </span>
            <DecisionChips decision={decision} />
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-slate-800">
            <ReactMarkdown components={MD_COMPONENTS}>{challenge}</ReactMarkdown>
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="text-xs text-slate-500 hover:text-slate-800 underline disabled:opacity-50"
          >
            {loading ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={run}
            disabled={loading || messages.length === 0}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {loading ? 'Designing challenge…' : 'Generate challenge'}
          </button>
          <span className="text-[11px] text-slate-400">
            {messages.length === 0 ? 'Teach first, then generate.' : 'Runs the real apply-phase prompt'}
          </span>
        </div>
      )}
      {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
    </div>
  );
};

/**
 * Live demo (rendered inside the right-slide Sheet): actually run the coach's
 * learn phase in the classified method so staff see what it OUTPUTS, not just
 * the predicted directive. Auto-starts on mount (the Sheet opening IS the "see
 * coach in action" action); stateless multi-turn — type a builder reply to keep
 * going. Coach text renders as markdown. Remounts fresh per open via `key`.
 */
const CoachInAction = ({ token, method, level }) => {
  const [convo, setConvo] = useState([]);
  const [task, setTask] = useState(null);
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const startedRef = useRef(false);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await coachTurn(token, { teachingMethod: method, skillLevel: level, messages: [] });
      setTask(data.task || null);
      setDecision(data.decision || null);
      setConvo([
        { role: 'user', content: data.seededOpener || "Hi! I'm ready to get started — can you teach me this?" },
        { role: 'assistant', content: data.reply },
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, method, level]);

  // Auto-run the first coach turn when the sheet opens (once).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
  }, [start]);

  // Keep the latest turn in view.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo, loading]);

  // Auto-focus the reply field whenever it's the builder's turn (coach done
  // responding and at least one coach turn has landed).
  useEffect(() => {
    if (!loading && convo.length > 0 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading, convo.length]);

  const send = async () => {
    const text = reply.trim();
    if (!text || loading) return;
    const next = [...convo, { role: 'user', content: text }];
    setConvo(next);
    setReply('');
    setLoading(true);
    setError(null);
    try {
      const data = await coachTurn(token, { teachingMethod: method, skillLevel: level, messages: next });
      setConvo([...next, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* scrollable conversation */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        {task && (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 space-y-1.5">
            <div>
              <span className="font-semibold text-slate-700">Sample task:</span> {task.title}
              {task.learning_goal ? <div className="text-slate-400 mt-0.5">{task.learning_goal}</div> : null}
            </div>
            <DecisionChips decision={decision} />
          </div>
        )}
        {convo.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.content} />
        ))}
        {loading && <div className="text-xs text-slate-400 pl-1">Coach is responding…</div>}
        {error && <p className="text-sm text-rose-600 pl-1">{error}</p>}
        <ChallengePanel token={token} method={method} level={level} messages={convo} />
      </div>

      {/* pinned reply bar */}
      <div className="shrink-0 border-t border-[#E3E3E3] px-5 py-3 flex items-center gap-2 bg-white">
        <input
          ref={inputRef}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Reply as the builder to continue…"
          disabled={loading}
          className="flex-1 rounded-md border border-[#D8D8E0] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4242EA]/30 focus:border-[#4242EA] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={loading || !reply.trim()}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

// A style chip with a hover tooltip explaining how that style teaches. Used for
// the (non-interactive) column headers + "Comparing" bar in the compare view.
const StyleChip = ({ style }) => (
  <span className="relative group inline-block">
    <Chip tone={methodTone(style)}>{methodLabel(style)}</Chip>
    {STYLE_DESCRIPTIONS[style] && (
      <div className="pointer-events-none absolute left-0 top-full mt-2 w-64 rounded-md bg-slate-900 text-white text-xs leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg">
        {STYLE_DESCRIPTIONS[style]}
      </div>
    )}
  </span>
);

// A level chip with a hover tooltip describing that Dreyfus stage.
const LevelChip = ({ level }) => (
  <span className="relative group inline-block">
    <Chip tone={levelTone(level)}>{levelLabel(level)}</Chip>
    {LEVEL_DESCRIPTIONS[level] && (
      <div className="pointer-events-none absolute left-0 top-full mt-2 w-64 rounded-md bg-slate-900 text-white text-xs leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg">
        {LEVEL_DESCRIPTIONS[level]}
      </div>
    )}
  </span>
);

/**
 * Compare view: run the SAME conversation across 2–4 columns side by side, with
 * one shared "builder" input driving every column, so divergence is directly
 * visible. Stateless — each turn re-posts that column's full history.
 *
 * Two axes, one at a time (a style × level grid would be up to 24 columns):
 *  - axis 'style' — columns are teaching styles, skill level held fixed
 *  - axis 'level' — columns are Dreyfus levels, teaching style held fixed.
 *    This is the difficulty axis: each column's challenge is built around the
 *    per-skill definitions for ITS target level, so "Generate challenge" in each
 *    column shows the same lesson pitched harder or easier.
 *
 * Exactly one of style/level varies per axis, so any difference between columns
 * is attributable to that axis alone.
 */
const CompareView = ({ token, axis, levelOptions }) => {
  const isLevelAxis = axis === 'level';

  // Column identities per axis. Level columns are keyed by string (`levelKey`)
  // because `null` — an unassessed builder — can't be an object key.
  const allKeys = isLevelAxis
    ? levelOptions.map((o) => levelKey(o.level))
    : STYLE_OPTIONS;

  const [selected, setSelected] = useState(
    isLevelAxis ? ['L1', 'L3', 'L5'] : ['socratic', 'example_based']
  );
  // The held-fixed value on the other axis.
  const [fixedStyle, setFixedStyle] = useState('balanced');
  const [fixedLevel, setFixedLevel] = useState(3);
  const [started, setStarted] = useState(false);
  const [cols, setCols] = useState({}); // key -> { convo, loading, error, decision }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Per-column request params — the whole point of the axis abstraction.
  const paramsFor = (key) =>
    isLevelAxis
      ? { teachingMethod: fixedStyle, skillLevel: levelFromKey(key) }
      : { teachingMethod: key, skillLevel: fixedLevel };

  const toggle = (key) => {
    if (started) return;
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : prev.length < 4 ? [...prev, key] : prev
    );
  };

  const start = async () => {
    if (selected.length < 2 || busy) return;
    setBusy(true);
    setStarted(true);
    setCols(Object.fromEntries(selected.map((k) => [k, { convo: [], loading: true }])));
    await Promise.all(
      selected.map(async (k) => {
        try {
          const data = await coachTurn(token, { ...paramsFor(k), messages: [] });
          setCols((prev) => ({
            ...prev,
            [k]: {
              convo: [
                { role: 'user', content: data.seededOpener || "Hi! I'm ready to get started — can you teach me this?" },
                { role: 'assistant', content: data.reply },
              ],
              decision: data.decision || null,
              loading: false,
            },
          }));
        } catch (e) {
          setCols((prev) => ({ ...prev, [k]: { convo: [], loading: false, error: e.message } }));
        }
      })
    );
    setBusy(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    // Build each column's next history (incl. the shared builder message) up front.
    const nextConvos = Object.fromEntries(
      selected.map((k) => [k, [...(cols[k]?.convo || []), { role: 'user', content: text }]])
    );
    setCols((prev) => {
      const next = { ...prev };
      selected.forEach((k) => { next[k] = { ...next[k], convo: nextConvos[k], loading: true }; });
      return next;
    });
    await Promise.all(
      selected.map(async (k) => {
        try {
          const data = await coachTurn(token, { ...paramsFor(k), messages: nextConvos[k] });
          setCols((prev) => ({
            ...prev,
            [k]: {
              ...prev[k],
              convo: [...nextConvos[k], { role: 'assistant', content: data.reply }],
              decision: data.decision || prev[k]?.decision || null,
              loading: false,
            },
          }));
        } catch (e) {
          setCols((prev) => ({ ...prev, [k]: { ...prev[k], loading: false, error: e.message } }));
        }
      })
    );
    setBusy(false);
  };

  const reset = () => {
    setStarted(false);
    setCols({});
    setInput('');
  };

  // Focus the shared input when it's the builder's turn (all columns done).
  useEffect(() => {
    if (started && !busy && inputRef.current) inputRef.current.focus();
  }, [busy, started]);

  const ColumnChip = ({ columnKey }) =>
    isLevelAxis ? <LevelChip level={levelFromKey(columnKey)} /> : <StyleChip style={columnKey} />;

  const columnLabel = (key) => (isLevelAxis ? levelLabel(levelFromKey(key)) : methodLabel(key));
  const columnTone = (key) => (isLevelAxis ? levelTone(levelFromKey(key)) : methodTone(key));
  const columnDescription = (key) =>
    isLevelAxis ? LEVEL_DESCRIPTIONS[levelFromKey(key)] : STYLE_DESCRIPTIONS[key];

  if (!started) {
    return (
      <div className="px-6 py-6 max-w-2xl">
        <h2 className="text-sm font-bold text-[#1E1E1E] mb-1">
          {isLevelAxis ? 'Compare skill levels' : 'Compare teaching styles'}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          {isLevelAxis ? (
            <>
              Pick 2–4 skill levels to emulate builders at different proficiencies. Each column
              teaches the same lesson to a builder at that level — then generate the challenge in
              each to see the same lesson pitched at different difficulties.
            </>
          ) : (
            <>
              Pick 2–4 styles. They&apos;ll teach the same sample task side by side, driven by one
              shared builder input, so you can watch how each one diverges.
            </>
          )}
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {allKeys.map((k) => {
            const on = selected.includes(k);
            return (
              <div key={k} className="relative group">
                <button
                  onClick={() => toggle(k)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    on ? `${TONES[columnTone(k)]} font-medium` : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {columnLabel(k)}
                </button>
                {columnDescription(k) && (
                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-md bg-slate-900 text-white text-xs leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg">
                    {columnDescription(k)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* The held-fixed value on the other axis — stated explicitly so it's
            clear what is NOT varying between columns. */}
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">
            {isLevelAxis ? 'Teaching style (same in every column):' : 'Skill level (same in every column):'}
          </span>
          {isLevelAxis ? (
            <select
              value={fixedStyle}
              onChange={(e) => setFixedStyle(e.target.value)}
              className="rounded-md border border-[#D8D8E0] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4242EA]/30"
            >
              <option value="balanced">{methodLabel('balanced')}</option>
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{methodLabel(s)}</option>
              ))}
            </select>
          ) : (
            <select
              value={levelKey(fixedLevel)}
              onChange={(e) => setFixedLevel(levelFromKey(e.target.value))}
              className="rounded-md border border-[#D8D8E0] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4242EA]/30"
            >
              {levelOptions.map((o) => (
                <option key={levelKey(o.level)} value={levelKey(o.level)}>{o.label}</option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={start}
          disabled={selected.length < 2}
          className="px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Compare {selected.length} {isLevelAxis ? 'levels' : selected.length === 1 ? 'style' : 'styles'}
        </button>
        {selected.length < 2 && <span className="ml-3 text-xs text-slate-400">Pick at least 2.</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-5 py-2.5 border-b border-[#E3E3E3] flex items-center gap-3 flex-wrap bg-white">
        <span className="text-sm font-semibold text-slate-700">Comparing</span>
        {selected.map((k) => <ColumnChip key={k} columnKey={k} />)}
        <span className="text-xs text-slate-400">
          · {isLevelAxis ? `all as ${methodLabel(fixedStyle)}` : `all at ${levelLabel(fixedLevel)}`}
        </span>
        <button onClick={reset} className="ml-auto text-xs text-slate-500 hover:text-slate-800 underline">
          Change selection
        </button>
      </div>

      {/* columns */}
      <div className="flex-1 min-h-0 flex overflow-x-auto divide-x divide-[#E3E3E3]">
        {selected.map((k) => {
          const col = cols[k] || { convo: [], loading: false };
          const { teachingMethod, skillLevel } = paramsFor(k);
          return (
            <div key={k} className="flex flex-col min-w-[340px] flex-1 min-h-0">
              <div className="shrink-0 px-4 py-2 border-b border-[#E3E3E3] bg-slate-50 space-y-1.5">
                <ColumnChip columnKey={k} />
                <DecisionChips decision={col.decision} />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
                {col.convo.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} />)}
                {col.loading && <div className="text-xs text-slate-400 pl-1">Coach is responding…</div>}
                {col.error && <p className="text-sm text-rose-600 pl-1">{col.error}</p>}
                <ChallengePanel
                  token={token}
                  method={teachingMethod}
                  level={skillLevel}
                  messages={col.convo}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* shared builder input */}
      <div className="shrink-0 border-t border-[#E3E3E3] px-5 py-3 flex items-center gap-2 bg-white">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Reply as the builder — sent to every column…"
          disabled={busy}
          className="flex-1 rounded-md border border-[#D8D8E0] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4242EA]/30 focus:border-[#4242EA] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Send to all
        </button>
      </div>
    </div>
  );
};

const TeachingLab = () => {
  const token = useAuthStore((s) => s.token);
  const [presets, setPresets] = useState([]);
  const [question, setQuestion] = useState('');
  const [floor, setFloor] = useState(0.7);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastAnswer, setLastAnswer] = useState('');
  const [coachOpen, setCoachOpen] = useState(false);
  // 'classify' | 'compare-style' | 'compare-level'
  const [mode, setMode] = useState('classify');
  const [levelOptions, setLevelOptions] = useState(DEFAULT_LEVEL_OPTIONS);
  const [sampleTask, setSampleTask] = useState(null);
  // The skill level the Classify tab's "Coach in Action" demo runs at.
  const [demoLevel, setDemoLevel] = useState(3);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listLabPresets(token);
        if (!alive) return;
        setPresets(data.presets || []);
        setQuestion(data.question || '');
        if (typeof data.floor === 'number') setFloor(data.floor);
        if (Array.isArray(data.levelOptions) && data.levelOptions.length) {
          setLevelOptions(data.levelOptions);
        }
        if (data.task) setSampleTask(data.task);
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const run = useCallback(
    async (text) => {
      const a = (text ?? answer).trim();
      if (!a) return;
      setLoading(true);
      setError(null);
      setCoachOpen(false); // close any open demo from a prior classification
      setLastAnswer(a);
      try {
        const data = await classifyTeachingMethod(token, { answer: a });
        setResult(data);
      } catch (e) {
        setError(e.message);
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [answer, token]
  );

  const loadPreset = (p) => {
    setMode('classify');
    setAnswer(p.answer);
    run(p.answer);
  };

  // Group presets for the gallery.
  const groups = presets.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="flex h-full min-h-0 bg-[#EFEFEF] font-proxima">
      {/* Left rail — preset gallery */}
      <aside className="w-72 shrink-0 bg-white border-r border-[#E3E3E3] overflow-y-auto">
        <div className="px-4 py-3 border-b border-[#E3E3E3]">
          <h2 className="text-sm font-bold text-[#1E1E1E]">Example answers</h2>
          <p className="text-xs text-slate-400 mt-0.5">Click one to classify it</p>
        </div>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="px-3 py-3 border-b border-[#EEE]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1 mb-1.5">
              {group}
            </div>
            <div className="space-y-1">
              {items.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p)}
                  disabled={loading}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-sm text-slate-700 hover:bg-[#F2F2FB] disabled:opacity-50 transition-colors"
                  title={p.answer}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      {/* Right pane — tester + result */}
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 bg-white border-b border-[#E3E3E3] px-6 py-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-[#1E1E1E]">Personalized Learning</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {mode === 'compare-style' &&
                'Run the same task across multiple teaching styles side by side to see how the coach diverges.'}
              {mode === 'compare-level' &&
                'Emulate builders at different proficiencies and generate each one’s challenge — the same lesson pitched at different difficulties.'}
              {mode === 'classify' &&
                `Mock-test how onboarding classifies a builder's learning-style answer — predicted style, confidence vs the ${floor} floor, and the teaching method the coach would actually use. Read-only.`}
            </p>
            {sampleTask && mode !== 'classify' && (
              <p className="text-xs text-slate-400 mt-1">
                Lesson: <span className="text-slate-500">{sampleTask.title}</span>
                {sampleTask.skill ? ` · skill: ${sampleTask.skill}` : ''}
              </p>
            )}
          </div>
          <div className="shrink-0 inline-flex bg-slate-100 border border-[#E3E3E3] rounded-lg p-0.5">
            {[
              ['classify', 'Classify'],
              ['compare-style', 'Compare styles'],
              ['compare-level', 'Compare skill levels'],
            ].map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  mode === m ? 'bg-[#4242EA] text-white font-medium' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {mode !== 'classify' ? (
            // Keyed by axis so switching resets the column selection + transcripts
            // instead of carrying over keys that don't exist on the other axis.
            <CompareView
              key={mode}
              token={token}
              axis={mode === 'compare-level' ? 'level' : 'style'}
              levelOptions={levelOptions}
            />
          ) : (
            <div className="h-full overflow-y-auto">
        <SunkenSection
          title="Mock anchor-#9 answer"
          hint={question ? `Coach asks: “${question}”` : undefined}
        >
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type how a builder might describe the way they like to learn…"
            rows={4}
            className="w-full rounded-md border border-[#D8D8E0] px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#4242EA]/30 focus:border-[#4242EA] resize-y"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => run()}
              disabled={loading || !answer.trim()}
              className="px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: BRAND }}
            >
              {loading ? 'Classifying…' : 'Classify'}
            </button>
            {error && <span className="text-sm text-rose-600">{error}</span>}
          </div>
        </SunkenSection>

        {result && <ResultView result={result} answer={lastAnswer} floor={floor} />}

        {result && (
          <SunkenSection title="See the coach in action" hint="Run the real coach learn phase in this method — not a prediction">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-500">Emulate a builder at:</span>
                <select
                  value={levelKey(demoLevel)}
                  onChange={(e) => setDemoLevel(levelFromKey(e.target.value))}
                  className="rounded-md border border-[#D8D8E0] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4242EA]/30"
                >
                  {levelOptions.map((o) => (
                    <option key={levelKey(o.level)} value={levelKey(o.level)}>{o.label}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">
                  drives the challenge difficulty — use Compare skill levels to see them side by side
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setCoachOpen(true)}
                  className="px-4 py-1.5 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: BRAND }}
                >
                  See Coach in Action
                </button>
                <span className="text-sm text-slate-500">
                  Opens a live conversation where the coach teaches as{' '}
                  <Chip tone={methodTone(result.effectiveMethod)}>{methodLabel(result.effectiveMethod)}</Chip>
                </span>
              </div>
            </div>
          </SunkenSection>
        )}

        {!result && !loading && (
          <div className="px-6 py-16 text-center text-slate-400 text-sm">
            Type an answer or pick an example to see how the coach classifies it.
          </div>
        )}
            </div>
          )}
        </div>
      </main>

      {/* Right-slide sheet: the real coach learn phase, live */}
      <Sheet open={coachOpen} onOpenChange={setCoachOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col gap-0 font-proxima"
        >
          <SheetHeader className="shrink-0 px-5 py-4 border-b border-[#E3E3E3] text-left space-y-1">
            <SheetTitle className="flex items-center gap-2 flex-wrap text-base">
              Coach in action
              {result && <Chip tone={methodTone(result.effectiveMethod)}>{methodLabel(result.effectiveMethod)}</Chip>}
              <LevelChip level={demoLevel} />
            </SheetTitle>
            <SheetDescription className="text-xs">
              The real coach learn phase, run live in this teaching method for a builder at this
              skill level. Reply as the builder to continue, or generate the challenge.
            </SheetDescription>
          </SheetHeader>
          {coachOpen && result && (
            <CoachInAction
              key={`${lastAnswer}::${result.effectiveMethod}::${levelKey(demoLevel)}`}
              token={token}
              method={result.effectiveMethod}
              level={demoLevel}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default TeachingLab;
