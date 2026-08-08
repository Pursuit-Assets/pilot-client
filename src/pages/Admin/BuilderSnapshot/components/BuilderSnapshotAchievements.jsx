import React, { useMemo } from 'react';
import { Trophy, Award } from 'lucide-react';
// Shared so this panel can't drift from the other Coach tabs. `levelLabel`
// renders the bare stage name — the L-number was deliberately dropped because
// a leading digit implies a score the Dreyfus scale doesn't carry.
import { levelLabel } from '../../coachDreyfus';

/**
 * BuilderSnapshotAchievements
 *
 * The builder's strongest demonstrated skills, ranked by assessed Dreyfus level.
 *
 * Two bugs fixed here 2026-07-28:
 *  1. RANKING. This panel used to rank by EVIDENCE COUNT and award tiers up to
 *     "Mastery" on that basis. Count measures how often a skill was TAGGED, not
 *     how well it was done — so Dennys Antunish's #1 "Mastery" was
 *     use-ai-coding-tools with 8 signals, his single WEAKEST skill, and several
 *     of those signals read "No direct AI coding tool usage was observed."
 *     Ranking is now level → confidence → evidence count, and the crest shows
 *     the Dreyfus stage rather than an invented tier.
 *  2. THE DEAD FIELD. The "Most recent" block read `latest.summary`. Evidence
 *     objects have no `summary` key — the field is `evidence` — so the block had
 *     never rendered for any builder, silently dropping the richest writing in
 *     the system.
 *
 * Onboarding priors (evidence rows with `task_id: null`, e.g. "Onboarding
 * conversation (unverified prior)") are excluded from the count: the panel is
 * explicitly about evidence collected during reflection + apply tasks, and those
 * rows are keyed to a retired taxonomy.
 *
 * Props:
 *   - competencies:     { by_skill: { [slug]: [{ at, evidence, task_id, confidence }] } }
 *   - skillTaxonomy:    { skills: { [slug]: { name } } } — resolves slug → name
 *   - skillProficiency: { [slug]: { level, confidence } } — the ranking key
 */
// Crest styling by Dreyfus level. Deliberately NOT a "how impressive" ramp —
// Level 1 at week 4 of L1 is on track, so the low end reads neutral, not poor.
const LEVEL_CREST = [
  { bg: 'from-[#E3E3E3] to-[#F0F0F0]', text: 'text-[#1E1E1E]' }, // 0 Below Novice
  { bg: 'from-[#8186ee] to-[#8186ee]/80', text: 'text-white' },   // 1 Novice
  { bg: 'from-[#5b5fe8] to-[#5b5fe8]/80', text: 'text-white' },   // 2 Advanced Beginner
  { bg: 'from-[#4242EA] to-[#4242EA]/80', text: 'text-white' },   // 3 Competent
  { bg: 'from-[#4242EA] to-[#FF33FF]', text: 'text-white' },      // 4 Proficient
  { bg: 'from-[#FF33FF] to-[#4242EA]', text: 'text-white' },      // 5 Expert
];
const UNRANKED_CREST = { bg: 'from-[#E3E3E3] to-[#F0F0F0]', text: 'text-[#1E1E1E]' };

const crestFor = (level) =>
  Number.isInteger(level) ? LEVEL_CREST[level] || UNRANKED_CREST : UNRANKED_CREST;

// Format a slug into a readable name when taxonomy doesn't resolve it.
const slugToName = (slug) =>
  String(slug || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');

const BuilderSnapshotAchievements = ({ competencies, skillTaxonomy, skillProficiency }) => {
  const items = useMemo(() => {
    const bySkill = competencies?.by_skill || {};
    const prof = skillProficiency || {};
    return Object.entries(bySkill)
      .map(([slug, data]) => {
        // by_skill values are the evidence ARRAY itself; tolerate the
        // { evidence: [...] } wrapper too so either shape resolves.
        const raw = Array.isArray(data) ? data : (Array.isArray(data?.evidence) ? data.evidence : []);
        const observed = raw.filter((e) => e && e.task_id != null); // drop onboarding priors
        const p = prof[slug];
        return {
          slug,
          name: skillTaxonomy?.skills?.[slug]?.name || slugToName(slug),
          level: p && Number.isInteger(p.level) ? p.level : null,
          confidence: typeof p?.confidence === 'number' ? p.confidence : null,
          count: observed.length,
          latest: observed.at(-1) || null,
        };
      })
      .filter((x) => x.count > 0)
      .sort(
        (a, b) =>
          (b.level ?? -1) - (a.level ?? -1) ||
          (b.confidence ?? 0) - (a.confidence ?? 0) ||
          b.count - a.count,
      )
      .slice(0, 6);
  }, [competencies, skillTaxonomy, skillProficiency]);

  return (
    <section className="rounded-2xl ring-1 ring-[#E3E3E3] shadow-md bg-white p-6 md:p-8 font-proxima">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-proxima-bold text-[#1E1E1E]">
            <Trophy className="w-6 h-6 text-[#FF33FF]" />
            Strongest Skills
          </h2>
          <p className="text-sm text-[#666] mt-1">
            Ranked by assessed Dreyfus level, with the grader's most recent evidence.
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="py-12 text-center">
          <Award className="w-10 h-10 text-[#E3E3E3] mx-auto mb-3" />
          <p className="text-sm italic text-[#999]">
            No competency evidence yet. Signals accumulate as the coach runs.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, idx) => {
            const crest = crestFor(item.level);
            const stage = Number.isInteger(item.level)
              ? levelLabel(item.level)
              : 'Not yet levelled';
            return (
              <li
                key={item.slug}
                className="
                  group relative overflow-hidden
                  rounded-xl ring-1 ring-[#E3E3E3]
                  bg-white
                  transition-all duration-200
                  hover:shadow-lg hover:-translate-y-0.5
                "
              >
                <div
                  className={`
                    bg-gradient-to-br ${crest.bg} ${crest.text}
                    p-4
                  `}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-widest font-proxima-bold opacity-90">
                      #{idx + 1} · {stage}
                    </span>
                    <span
                      className="text-xs font-proxima-bold opacity-90 tabular-nums"
                      title="How many graded tasks assessed this skill — exposure, not strength."
                    >
                      {item.count} observation{item.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-proxima-bold leading-tight">
                    {item.name}
                  </h3>
                </div>
                {item.latest?.evidence && (
                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#999] mb-1.5">
                      Most recent evidence
                    </div>
                    <p className="text-xs text-[#1E1E1E]/85 line-clamp-4 leading-relaxed">
                      {item.latest.evidence}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default BuilderSnapshotAchievements;
