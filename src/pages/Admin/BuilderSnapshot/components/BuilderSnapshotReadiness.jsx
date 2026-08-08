import React from 'react';
import { Users, TrendingUp, LifeBuoy, Activity, ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';
// Shared so this panel can't drift from the other Coach tabs.
import { DREYFUS_LABELS } from '../../coachDreyfus';

/**
 * BuilderSnapshotReadiness
 *
 * Replaces the hero's "Avg Proficiency 1.6 / 5" tile with the four signals that
 * actually answer "is this builder going to keep doing well?" — position among
 * peers, direction of travel, how much scaffolding they need, and engagement.
 *
 * WHY NOT ONE NUMBER
 * ------------------
 * `/5` is not a reachable denominator in a first course: Dreyfus 4-5 maps to the
 * taxonomy's `adaptation` tier, whose definitions are team-scoped ("enforces a
 * branching strategy FOR A TEAM"). And a level alone actively misleads — measured
 * across 76 L1-July builders, 18 sit below the cohort median but are improving,
 * 9 sit above it but are declining, and 10 have stopped being graded (3 of those
 * above median). **49% would be misread from a level alone.**
 *
 * So the signals stay SEPARATE and each shows its own arithmetic. There is
 * deliberately no composite readiness score and no pass threshold: Pursuit's real
 * L1 bars are participation (>80% attendance, demo day), no skill-level exit bar
 * has been validated, and inventing one here would turn a made-up number into a
 * gate. Cohort Insights made the same call.
 *
 * Props:
 *   - readiness: the `readiness` block from GET /api/admin/builder-profiles/:id
 *                (queries/builderReadiness.js). Null for a builder with no active
 *                cohort — the panel then self-hides rather than inventing peers.
 *
 * The stage DISTRIBUTION and the course reachable-band note used to live here in
 * a wide first tile; both moved to BuilderSnapshotSkillsPanel (2026-08-07),
 * where the skills they describe actually are. That left four equal signals.
 */


// Diverging triple for skill movement: two hues + a NEUTRAL midpoint.
// Validated with the dataviz palette checker (light surface, all-pairs):
// CVD 13.8 protan / 20.3 tritan, normal-vision 19.2, contrast all ≥3:1.
// Teal↔orange was chosen over the app's usual emerald↔rose because emerald↔rose
// is ΔE 5.8 in deuteranopia — a red-green pair a colourblind reader cannot
// separate at all. The midpoint is deliberately near-zero chroma (a diverging
// midpoint must be neutral); it is separated from teal by LIGHTNESS, which is
// why it is neutral-600 and not slate-500 (slate's blue-green cast put it at
// normal-vision ΔE 11 against teal). Do not "fix" the midpoint's low chroma.
// Every segment also carries an arrow + count, so movement is never colour-alone.
const MOVE = {
  improved: { color: '#0d9488', label: 'improved', Icon: ArrowUp },
  held: { color: '#525252', label: 'held', Icon: ArrowRight },
  declined: { color: '#ea580c', label: 'declined', Icon: ArrowDown },
};

/** 1st / 2nd / 3rd / 4th … — 11-13 are the exceptions. */
const ordinalSuffix = (n) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
};

const DIRECTION_HEADLINE = {
  improving: 'Improving',
  holding: 'Holding steady',
  declining: 'Sliding back',
  no_movement_yet: 'Too early to tell',
};

// Pursuit's stat-card: white, 7px purple bar across the top. Same pattern the
// infographic system and the Coach Evals KPI row use, so the four signals read
// as one family with the rest of the admin surface.
const Tile = ({ icon: Icon, label, children }) => (
  <div className="rounded-xl bg-white ring-1 ring-[#E3E3E3] overflow-hidden flex flex-col shadow-[0_2px_4px_rgba(0,0,0,.05)]">
    <div className="h-[7px] bg-[#4242EA]" aria-hidden="true" />
    <div className="p-4 flex flex-col flex-1">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#666] font-proxima-bold">
        <Icon className="w-3.5 h-3.5 text-[#999]" />
        {label}
      </div>
      <div className="mt-2.5 flex-1">{children}</div>
    </div>
  </div>
);

const Headline = ({ children }) => (
  <div className="text-xl font-proxima-bold text-[#1E1E1E] leading-tight">{children}</div>
);
const Note = ({ children }) => (
  <div className="mt-2 text-xs text-[#666] leading-relaxed">{children}</div>
);

/** MoveBar — diverging stacked bar of improved / held / declined. */
const MoveBar = ({ direction }) => {
  const { improved = 0, held = 0, declined = 0, movable = 0 } = direction || {};
  if (!movable) {
    return <div className="text-sm italic text-[#999]">No skill has a prior level to move against yet.</div>;
  }
  const parts = [
    ['improved', improved],
    ['held', held],
    ['declined', declined],
  ].filter(([, n]) => n > 0);

  return (
    <div>
      <div className="flex gap-[2px] h-7 rounded-md overflow-hidden">
        {parts.map(([key, n]) => {
          const { color, label } = MOVE[key];
          const pct = (n / movable) * 100;
          return (
            <div
              key={key}
              className="flex items-center justify-center first:rounded-l-md last:rounded-r-md"
              style={{ width: `${pct}%`, backgroundColor: color, minWidth: 4 }}
              title={`${n} of ${movable} skill assessments ${label} versus the builder's own prior level`}
            >
              {pct >= 14 && <span className="text-[11px] font-proxima-bold tabular-nums text-white">{n}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {['improved', 'held', 'declined'].map((key) => {
          const { color, label, Icon } = MOVE[key];
          const n = { improved, held, declined }[key];
          return (
            <span key={key} className="inline-flex items-center gap-1 text-[11px] text-[#666]">
              <Icon className="w-3 h-3" style={{ color }} aria-hidden="true" />
              <span className="tabular-nums font-proxima-bold text-[#1E1E1E]">{n}</span> {label}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/**
 * BulletBar — one rate against a peer-median reference tick. Single measure,
 * single axis (0-100%); the tick is the comparison, not a second scale.
 */
const BulletBar = ({ value, reference, referenceLabel }) => {
  if (value == null) return <div className="text-sm italic text-[#999]">Not enough sessions yet.</div>;
  return (
    <div className="relative h-7 rounded-md bg-[#F1F1F3] overflow-hidden" title={`${value}% — ${referenceLabel}`}>
      <div
        className="absolute inset-y-0 left-0 rounded-md"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: '#8186ee' }}
      />
      {reference != null && (
        <div
          className="absolute inset-y-0 w-[2px] bg-[#1E1E1E]"
          style={{ left: `${Math.min(100, Math.max(0, reference))}%` }}
          title={referenceLabel}
          aria-hidden="true"
        />
      )}
      <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-proxima-bold tabular-nums text-[#1E1E1E]">
        {value}%
      </span>
    </div>
  );
};

const BuilderSnapshotReadiness = ({ readiness }) => {
  // No active cohort → no honest peer comparison. Self-hide rather than invent one.
  if (!readiness) return null;

  const { cohort, distribution, direction, independence, engagement, position } = readiness;
  const modal = Number.isInteger(distribution?.modalLevel) ? distribution.modalLevel : null;

  // Scaffolding read: compare to the cohort, not to an invented target.
  const capDelta =
    independence?.pct_cap != null && independence?.peer_median_pct_cap != null
      ? independence.pct_cap - independence.peer_median_pct_cap
      : null;
  const scaffoldHeadline =
    capDelta == null ? '—' : capDelta >= 15 ? 'More than most' : capDelta <= -15 ? 'Less than most' : 'About typical';

  const daysIdle = engagement?.days_since_graded;
  const engagementHeadline =
    daysIdle == null ? 'Never graded' : daysIdle === 0 ? 'Active today' : daysIdle <= 3 ? `Active ${daysIdle}d ago` : `Quiet ${daysIdle}d`;

  return (
    <section aria-label="Readiness signals" className="rounded-2xl ring-1 ring-[#E3E3E3] shadow-md bg-white p-6 md:p-8 font-proxima">
      <header className="mb-5">
        <h2 className="text-2xl font-proxima-bold text-[#1E1E1E]">Where this builder stands</h2>
        <p className="text-sm text-[#666] mt-1">
          Four independent signals, compared against the {cohort?.peers_with_data ?? 0} peers in{' '}
          <span className="font-proxima-bold text-[#1E1E1E]">{cohort?.name || 'their cohort'}</span>. No composite
          score — the signals disagree with each other often, and that disagreement is the useful part.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={Users} label="Peer position">
          <Headline>
            {position?.percentile != null ? (
              <>
                {position.percentile}
                <span className="text-[15px] font-proxima-bold align-baseline">
                  {ordinalSuffix(position.percentile)}
                </span>
              </>
            ) : '—'}
          </Headline>
          <Note>
            percentile of {cohort?.peers_with_data ?? 0} peers
            {modal != null && (
              <span className="block mt-1 text-[#AAA]">
                cohort median stage · {DREYFUS_LABELS[modal]}
              </span>
            )}
          </Note>
        </Tile>

        <Tile icon={TrendingUp} label="Direction">
          <Headline>{DIRECTION_HEADLINE[direction?.label] || '—'}</Headline>
          <div className="mt-3">
            <MoveBar direction={direction} />
          </div>
          <Note>
            Measured against the builder's <em>own</em> prior level on each skill, not against the cohort.
            {direction?.movable > 0 && ` ${direction.improvedPct}% of ${direction.movable} movable assessments went up.`}
          </Note>
        </Tile>

        <Tile icon={LifeBuoy} label="Coaching needed">
          <Headline>{scaffoldHeadline}</Headline>
          <div className="mt-3">
            <BulletBar
              value={independence?.pct_cap}
              reference={independence?.peer_median_pct_cap}
              referenceLabel={`cohort median ${independence?.peer_median_pct_cap}%`}
            />
          </div>
          <Note>
            Share of sessions that hit the {independence?.max_learn_turns}-turn teaching cap before the builder was
            ready to apply — the marker is the cohort median.
            {independence?.pct_remediation != null && ` Needed remediation on ${independence.pct_remediation}%.`}
          </Note>
        </Tile>

        <Tile icon={Activity} label="Engagement">
          <Headline>{engagementHeadline}</Headline>
          <Note>
            <span className="font-proxima-bold text-[#1E1E1E] tabular-nums">{engagement?.sessions ?? 0}</span> sessions
            {engagement?.peer_median_sessions != null && ` (cohort median ${engagement.peer_median_sessions})`},{' '}
            <span className="tabular-nums">{engagement?.completed ?? 0}</span> completed the full loop.
            {daysIdle != null && daysIdle > 3 && (
              <span className="block mt-1 text-[#9a3412] font-proxima-bold">
                No graded work in {daysIdle} days.
              </span>
            )}
          </Note>
        </Tile>
      </div>
    </section>
  );
};

export default BuilderSnapshotReadiness;
