import { useState, useEffect, useCallback } from 'react';
import { Pencil, Check, X, Loader2, BookOpen } from 'lucide-react';
import useAuthStore from '../../../../stores/authStore';
import { getCoachCard, correctCoachCard } from '../../../../services/onboardingApi';

// ----------------------------------------------------------------------------
// CoachCard — the builder-visible "my coach's read on me", the durable half of
// the onboarding payoff. Read + correct only: every saved correction writes
// intake_confirmed provenance server-side (builders QA our data voluntarily).
// Rendered in-chat at wrap (OnboardingInterface) and as a slim Dashboard card.
// ----------------------------------------------------------------------------

const TEACHING_METHOD_OPTIONS = [
  { value: 'direct', label: 'Clear explanations first' },
  { value: 'example_based', label: 'Worked examples first' },
  { value: 'socratic', label: 'Guided questions — figure it out together' },
  { value: 'inquiry_based', label: 'Open questions with hints' },
  { value: 'problem_based', label: 'Start from a real problem' },
  { value: 'experiential', label: 'Try it, then reflect' },
];

const humanizeKey = (key) =>
  key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const asDisplayValue = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(asDisplayValue).join(', ');
  return JSON.stringify(v);
};

// One correctable field row: value + pencil → inline textarea → save/cancel.
function FieldRow({ section, field, value, onCorrect }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(asDisplayValue(value));
    setEditing(true);
  };
  const save = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await onCorrect({ section, field, value: draft.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-1.5 group">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-proxima font-semibold text-gray-500">{humanizeKey(field)}: </span>
          {editing ? (
            <div className="mt-1 flex items-start gap-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                rows={2}
                className="flex-1 text-sm font-proxima border border-stardust rounded-lg px-2 py-1.5 focus:outline-none focus:border-pursuit-purple resize-none"
              />
              <button type="button" onClick={save} disabled={saving} className="p-1.5 text-pursuit-purple hover:bg-pursuit-purple/10 rounded" aria-label="Save correction">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-sm font-proxima text-carbon-black">{asDisplayValue(value)}</span>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-pursuit-purple transition-opacity"
            aria-label={`Correct ${humanizeKey(field)}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, section, fields, onCorrect }) {
  const entries = Object.entries(fields || {});
  if (!entries.length) return null;
  return (
    <div className="mb-3">
      <h4 className="text-xs font-proxima-bold uppercase tracking-wide text-pursuit-purple mb-1">{title}</h4>
      {entries.slice(0, 8).map(([field, value]) => (
        <FieldRow key={field} section={section} field={field} value={value} onCorrect={onCorrect} />
      ))}
    </div>
  );
}

/**
 * @param {{ compact?: boolean }} props - compact renders the Dashboard variant
 *   (headline + teaching method + goal only, links nowhere yet).
 */
function CoachCard({ compact = false }) {
  const token = useAuthStore((s) => s.token);
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [methodEditing, setMethodEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { card: data } = await getCoachCard(token);
      setCard(data);
    } catch (err) {
      console.error('Coach card load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCorrect = useCallback(async (correction) => {
    await correctCoachCard(token, correction);
    await load();
  }, [token, load]);

  if (loading) {
    // The Dashboard slot loads silently — a spinner for a card most users
    // don't have yet is noise. The in-chat wrap render shows progress.
    if (compact) return null;
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm font-proxima py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your coach&apos;s notes…
      </div>
    );
  }
  if (!card) return null;

  const method = card.teachingMethod;
  const hasAnyContent =
    !!method ||
    Object.keys(card.background?.fields || {}).length > 0 ||
    Object.keys(card.goals?.fields || {}).length > 0 ||
    Object.keys(card.learningProfile?.fields || {}).length > 0;
  // A builder who never onboarded has nothing to show — render nothing
  // rather than an empty shell (matters for the Dashboard slot).
  if (!hasAnyContent) return null;

  return (
    <div className="rounded-xl border border-stardust bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-pursuit-purple" />
        <h3 className="font-proxima-bold text-carbon-black text-sm">
          Your coach&apos;s read on you
        </h3>
      </div>

      {/* Teaching method — the field the coach engine actually consumes. */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-proxima font-semibold text-gray-500">How I&apos;ll coach you:</span>
        {methodEditing ? (
          <select
            className="text-sm font-proxima border border-stardust rounded-lg px-2 py-1 focus:outline-none focus:border-pursuit-purple"
            defaultValue={method?.value || ''}
            onChange={async (e) => {
              if (!e.target.value) return;
              await handleCorrect({ section: 'teaching_method', value: e.target.value });
              setMethodEditing(false);
            }}
          >
            <option value="" disabled>Pick a style…</option>
            {TEACHING_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <>
            <span className="inline-flex items-center rounded-full bg-pursuit-purple/10 text-pursuit-purple px-2.5 py-0.5 text-sm font-proxima font-semibold">
              {method?.label || 'Adapting turn by turn'}
            </span>
            <button
              type="button"
              onClick={() => setMethodEditing(true)}
              className="text-xs font-proxima text-gray-400 hover:text-pursuit-purple underline"
            >
              change anytime
            </button>
          </>
        )}
      </div>

      {!compact && (
        <>
          <Section title="Where you're coming from" section="background" fields={card.background?.fields} onCorrect={handleCorrect} />
          <Section title="Where you're headed" section="goals" fields={card.goals?.fields} onCorrect={handleCorrect} />
          <Section title="How you learn" section="learning_profile" fields={card.learningProfile?.fields} onCorrect={handleCorrect} />
          <p className="text-xs font-proxima text-gray-400 mt-2">
            Spot something off? Hover a line and hit the pencil — corrections go straight to your coach.
          </p>
        </>
      )}
    </div>
  );
}

export default CoachCard;
