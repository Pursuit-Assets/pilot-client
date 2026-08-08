import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
// Dreyfus 0-5 stage names — shared so this panel can't drift from the Coach tabs
// (N/A is the administrative "not assessed" state).
import { DREYFUS_LABELS } from '../../coachDreyfus';

/**
 * BuilderSnapshotSkillsPanel — the builder's assessed skills, GROUPED BY STAGE.
 *
 * WHY BY STAGE, NOT BY CATEGORY (redesigned 2026-08-07)
 * -----------------------------------------------------
 * It used to be collapsible taxonomy-category sections, each skill carrying its
 * own 6-pip Dreyfus meter, with separate Top Strengths / Growth Areas
 * leaderboards underneath. Two problems:
 *
 *   1. Category grouping doesn't answer the question staff bring to this page —
 *      "what is this builder good at, and what are they weak at?" Stage grouping
 *      answers it in one glance, and makes the two leaderboards redundant, so
 *      they were retired rather than left as a third way to say the same thing.
 *   2. Inside a stage group every skill shares the same level, so a per-row
 *      meter repeated the group header N times. Nine identical meters is noise.
 *      The stage header carries the ladder ONCE; each row now shows only what
 *      actually varies — how consistently the grader agrees, and how many graded
 *      observations back it. That is what distinguishes a solid Level 2 (four
 *      observations, full agreement) from a shaky one (one observation), and the
 *      old design hid it completely.
 *
 * The distribution bar moved here from the readiness panel: it IS the skill
 * distribution, so it belongs beside the skills rather than in a KPI tile.
 *
 * Props:
 *   - skillTaxonomy:    { categories, skills } from /v2-coach-engine
 *   - skillProficiency: { [slug]: { level 0-5, confidence, observations } } (operative)
 *   - skillLevels:      { [slug]: 0..100 } legacy fallback when proficiency is absent
 *   - courseBands:      skill_proficiency_scale.courseBands — the REACHABLE band
 *                       per course. Not a target (see the server note); it exists
 *                       to say that 4-5 is out of scope for a first course.
 *   - courseLevel:      the builder's course ('L1'), for the band note + scope chips
 */

// Sequential grey → indigo ramp so proficiency progression reads at a glance.
const LEVEL_RAMP = ['#b9bcc9', '#a3a6e0', '#8186ee', '#5b5fe8', '#3f3fd0', '#2a2a9e'];
const EMPTY_PIP = '#ECECF3';

// One-line behavioral gloss per stage, lifted from skill_proficiency_scale so a
// reader doesn't have to know the Dreyfus model to read the group header.
const STAGE_GLOSS = [
  'exposed, but cannot execute even with instructions',
  'executes with explicit step-by-step guidance',
  'recognises patterns, still analytical',
  'works independently, without prompting',
  'reads situations intuitively, decides deliberately',
  'perception and action are one; no deliberation needed',
];

// Map a legacy 0-100 skill_level to a Dreyfus level (only used as a fallback for
// builders with no skill_proficiency yet — same thresholds as the backfill).
const legacyToLevel = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 45) return 1;
  if (n < 60) return 2;
  if (n < 75) return 3;
  if (n < 85) return 4;
  return 5;
};

/** Six pips filled to `level` — the stage ladder, rendered once per group. */
const StagePips = ({ level }) => (
  <span className="inline-flex gap-0.5" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <span
        key={i}
        className="h-[7px] w-[13px] rounded-[2px]"
        style={{ backgroundColor: i < level ? LEVEL_RAMP[i] : EMPTY_PIP }}
      />
    ))}
  </span>
);

/**
 * Four ticks showing what share of the trailing window agrees with the recorded
 * level. This is the per-skill signal the old repeated meters crowded out — a
 * level backed by one observation reads very differently from the same level
 * backed by four in agreement.
 */
const ConfidenceTicks = ({ confidence, level }) => {
  const filled = confidence == null ? 0 : Math.max(1, Math.round(confidence * 4));
  const color = LEVEL_RAMP[Math.min(5, Math.max(0, level))];
  return (
    <span className="inline-flex gap-0.5 shrink-0" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-3 w-[5px] rounded-[1px]"
          style={{ backgroundColor: i < filled ? color : '#E8E8EE' }}
        />
      ))}
    </span>
  );
};

const Flag = ({ tone, children, title }) => {
  const tones = {
    ahead: 'bg-[#0d9488]/10 text-[#0f766e]',
    muted: 'bg-[#F3F3F5] text-[#8a8a8a]',
  };
  return (
    <span
      title={title}
      className={`shrink-0 rounded-full px-[7px] py-[2px] text-[9.5px] uppercase tracking-wider font-proxima-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

/**
 * Why a skill's evidence deserves a caveat, or null when it doesn't. Kept
 * separate from rendering so the thresholds are visible in one place.
 * Exported for tests.
 */
export const evidenceCaveat = ({ observations, confidence }) => {
  if (observations <= 1) return { tone: 'muted', label: 'Thin evidence', title: `Only ${observations} graded observation` };
  if (confidence != null && confidence < 0.5) {
    return {
      tone: 'muted',
      label: 'Mixed evidence',
      title: `Only ${Math.round(confidence * 100)}% of the trailing window sits at this level`,
    };
  }
  return null;
};

const SkillRow = ({ skill }) => {
  const caveat = evidenceCaveat(skill);
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="flex-1 min-w-0 truncate text-sm text-[#1E1E1E]">{skill.name}</span>
      {skill.scope === 'notYetTaught' && (
        <Flag tone="ahead" title={`Taught in ${(skill.learnedIn || []).join('/')} — assessed before the curriculum covers it`}>
          Ahead · {(skill.learnedIn || []).join('/')}
        </Flag>
      )}
      {caveat && <Flag tone={caveat.tone} title={caveat.title}>{caveat.label}</Flag>}
      <ConfidenceTicks confidence={skill.confidence} level={skill.level} />
      <span className="w-[52px] shrink-0 text-right text-[11px] text-[#AAA] tabular-nums">
        {skill.observations} obs
      </span>
    </li>
  );
};

const BuilderSnapshotSkillsPanel = ({
  skillTaxonomy,
  skillProficiency,
  skillLevels,
  courseBands,
  courseLevel,
}) => {
  const [showAll, setShowAll] = useState(false);

  const { stages, assessed, total, histogram } = useMemo(() => {
    const taxSkills = skillTaxonomy?.skills || {};
    const prof = skillProficiency || {};
    const legacy = skillLevels || {};

    const rows = [];
    for (const [slug, sk] of Object.entries(taxSkills)) {
      if (!sk) continue;
      const p = prof[slug];
      let level = null;
      let confidence = null;
      let observations = 0;
      if (p && Number.isInteger(p.level)) {
        level = p.level;
        confidence = typeof p.confidence === 'number' ? p.confidence : null;
        observations = Number.isInteger(p.observations) ? p.observations : 0;
      } else {
        // Legacy 0-100 fallback — an approximate prior, so it carries no
        // observation count and reads as thin evidence.
        level = legacyToLevel(legacy[slug]);
      }

      // Where the skill sits relative to the builder's course. Mirrors the
      // server's buildDistribution: unknown scope counts as in-course rather
      // than guessing a builder is off-syllabus.
      const learnedIn = Array.isArray(sk.learnedIn) ? sk.learnedIn : null;
      const scope =
        !courseLevel || !learnedIn || learnedIn.length === 0 || learnedIn.includes(courseLevel)
          ? 'inCourse'
          : 'notYetTaught';

      rows.push({ slug, name: sk.name || slug, level, confidence, observations, learnedIn, scope });
    }

    const hist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows) if (Number.isInteger(r.level)) hist[r.level] += 1;

    // Highest stage first — the answer to "what are they good at" leads.
    const byStage = [5, 4, 3, 2, 1, 0]
      .map((lvl) => ({
        level: lvl,
        rows: rows
          .filter((r) => r.level === lvl)
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.rows.length > 0);

    return {
      stages: byStage,
      assessed: rows.filter((r) => Number.isInteger(r.level)).length,
      total: rows.length,
      histogram: hist,
    };
  }, [skillTaxonomy, skillProficiency, skillLevels, courseLevel]);

  const notAssessed = total - assessed;
  const band = (courseBands || []).find((b) => b.course === courseLevel) || null;

  return (
    <section className="rounded-2xl ring-1 ring-[#E3E3E3] shadow-md bg-white p-6 md:p-8 font-proxima">
      <header className="mb-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-proxima-bold text-[#1E1E1E]">Skill profile</h2>
          <p className="text-sm text-[#666] mt-1 max-w-3xl">
            Grouped by stage, strongest first.
            {band && (
              <>
                {' '}In {band.course} the reachable band is{' '}
                <span className="font-proxima-bold text-[#1E1E1E]">
                  {DREYFUS_LABELS[band.reachable[0]]}–{DREYFUS_LABELS[band.reachable[band.reachable.length - 1]]}
                </span>{' '}
                — {band.note}
              </>
            )}
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-[#E3E3E3] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className={`px-2.5 py-1 rounded-md font-proxima ${!showAll ? 'bg-[#4242EA] text-white' : 'text-[#666] hover:bg-[#F5F5F5]'}`}
          >
            Assessed
          </button>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={`px-2.5 py-1 rounded-md font-proxima ${showAll ? 'bg-[#4242EA] text-white' : 'text-[#666] hover:bg-[#F5F5F5]'}`}
          >
            All {total}
          </button>
        </div>
      </header>

      {total === 0 ? (
        <div className="py-16 text-center text-[#999] italic">No skills available yet.</div>
      ) : (
        <>
          {/* Distribution — moved here from the readiness panel, where it sat in
              a KPI tile. It is the skill distribution; it belongs with the skills. */}
          <div className="flex gap-0.5 h-[26px] rounded-lg overflow-hidden">
            {[5, 4, 3, 2, 1, 0]
              .filter((lvl) => histogram[lvl] > 0)
              .map((lvl) => (
                <div
                  key={lvl}
                  className="flex items-center justify-center text-[11.5px] font-proxima-bold text-white"
                  style={{ flex: histogram[lvl], backgroundColor: LEVEL_RAMP[lvl], minWidth: 22 }}
                  title={`${histogram[lvl]} skill${histogram[lvl] === 1 ? '' : 's'} at ${DREYFUS_LABELS[lvl]}`}
                >
                  {histogram[lvl]}
                </div>
              ))}
            {notAssessed > 0 && (
              <div
                className="flex items-center justify-center text-[11.5px] text-[#9a9a9a]"
                style={{ flex: notAssessed, backgroundColor: '#F1F1F3' }}
                title={`${notAssessed} skills the curriculum hasn't reached yet`}
              >
                {notAssessed} not assessed
              </div>
            )}
          </div>

          {/* Legend — the ticks are meaningless without it. */}
          <div className="flex items-center gap-4 mt-2 text-[11px] text-[#AAA]">
            <span>Bar width = share of assessed skills at that stage.</span>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <ConfidenceTicks confidence={0.5} level={2} />
              how consistently the grader agrees ·{' '}
              <span className="font-proxima-bold text-[#666]">obs</span> = graded observations
            </span>
          </div>

          {stages.map((g) => (
            <div key={g.level} className="mt-5">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#EDEDED] mb-2.5">
                <StagePips level={g.level} />
                <span className="text-[13px] font-proxima-bold text-[#1E1E1E]">{DREYFUS_LABELS[g.level]}</span>
                <span className="text-[11.5px] text-[#AAA] truncate">— {STAGE_GLOSS[g.level]}</span>
                <span className="ml-auto shrink-0 text-[11px] text-[#AAA] font-proxima-bold tracking-wider">
                  {g.rows.length} SKILL{g.rows.length === 1 ? '' : 'S'}
                </span>
              </div>
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                {g.rows.map((r) => <SkillRow key={r.slug} skill={r} />)}
              </ul>
            </div>
          ))}

          {notAssessed > 0 && (
            <div className="mt-5">
              {showAll ? (
                <div className="rounded-xl border border-[#EFEFF2] bg-[#FAFAFB] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[#AAA] font-proxima-bold mb-2">
                    Not assessed — {notAssessed}
                  </div>
                  <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                    {Object.entries(skillTaxonomy?.skills || {})
                      .filter(([slug]) => !Number.isInteger(skillProficiency?.[slug]?.level)
                        && legacyToLevel(skillLevels?.[slug]) == null)
                      .sort((a, b) => (a[1]?.name || a[0]).localeCompare(b[1]?.name || b[0]))
                      .map(([slug, sk]) => (
                        <li key={slug} className="py-1.5 text-sm text-[#999] truncate">{sk?.name || slug}</li>
                      ))}
                  </ul>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="w-full flex items-center gap-2.5 rounded-xl border border-[#EFEFF2] bg-[#FAFAFB] px-3.5 py-3 text-left hover:bg-[#F5F5F7] transition-colors"
                >
                  <Info className="w-[15px] h-[15px] text-[#9a9a9a] shrink-0" />
                  <span className="text-[12.5px] text-[#666]">
                    <span className="font-proxima-bold text-[#1E1E1E]">
                      {notAssessed} of {total} skills not assessed yet.
                    </span>{' '}
                    Coverage, not weakness — the curriculum hasn't reached them.
                  </span>
                  <span className="ml-auto shrink-0 text-xs font-proxima-bold text-[#4242EA]">Show all ⌄</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default BuilderSnapshotSkillsPanel;
