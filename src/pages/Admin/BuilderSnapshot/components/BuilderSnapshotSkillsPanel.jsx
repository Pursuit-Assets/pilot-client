import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';
// Dreyfus 0-5 stage names — shared so this panel can't drift from the Coach tabs
// (N/A is the administrative "not assessed" state).
import { DREYFUS_LABELS } from '../../coachDreyfus';
// Sequential grey → indigo ramp so proficiency progression reads at a glance.
const LEVEL_RAMP = ['#b9bcc9', '#a3a6e0', '#8186ee', '#5b5fe8', '#3f3fd0', '#2a2a9e'];
const EMPTY_PIP = '#ECECF3';

// One accent per category (header dots + leaderboard tints).
const CATEGORY_COLORS = {
  technical: '#4242EA',
  product_strategy: '#FB923C',
  communication_collaboration: '#FF33FF',
  foundational: '#2a2a9e',
};
const FALLBACK_COLOR = '#1E1E1E';
const colorFor = (cat) => CATEGORY_COLORS[cat] || FALLBACK_COLOR;

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

/**
 * SegmentMeter — six discrete pips on the grey→indigo ramp, filled up to the
 * Dreyfus level. N/A renders all-empty + muted. Low-confidence / seeded levels
 * render dimmed.
 */
const SegmentMeter = ({ level, dim }) => {
  const fill = Number.isInteger(level) ? level : 0; // pips 0..(level-1) filled
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true" style={{ opacity: dim ? 0.45 : 1 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-2.5 w-4 rounded-[2px]"
          style={{ backgroundColor: i < fill ? LEVEL_RAMP[i] : EMPTY_PIP }}
        />
      ))}
    </span>
  );
};

/**
 * SkillRow — one skill's name + bar meter + level label, with a confidence-aware
 * dim/marker and a tooltip carrying confidence + observation count.
 */
const SkillRow = ({ skill }) => {
  const { name, level, label, dim, seeded, confidence, observations } = skill;
  const tip =
    level === null
      ? 'Not assessed yet'
      : label +
        (confidence != null ? ` · conf ${confidence.toFixed(2)}` : '') +
        ` · ${observations} obs` +
        (seeded ? ' (seeded prior — not yet confirmed by a graded task)' : '');
  return (
    <li className="flex items-center gap-3 py-1.5" title={tip}>
      <span className={`flex-1 min-w-0 truncate text-sm ${level === null ? 'text-[#999]' : 'text-[#1E1E1E]'}`}>
        {name}
      </span>
      <SegmentMeter level={level} dim={dim} />
      <span
        className={`w-32 shrink-0 text-right text-xs tabular-nums ${level === null ? 'text-[#BBB] italic' : 'font-proxima-bold text-[#1E1E1E]'}`}
      >
        {level === null ? 'N/A' : label}
        {seeded && level !== null ? <span className="ml-1 text-[10px] font-normal text-[#999]">·seed</span> : null}
      </span>
    </li>
  );
};

/**
 * BuilderSnapshotSkillsPanel
 *
 * Bar-meter skills view: skills grouped into collapsible category sections, each
 * skill rendered as a 6-step Dreyfus meter (0-5, or muted N/A). An assessed/all
 * toggle hides unassessed skills by default. Two leaderboards (Top Strengths,
 * Growth Areas) rank the assessed skills globally.
 *
 * Props:
 *   - skillTaxonomy:    { categories, skills } from /v2-coach-engine
 *   - skillProficiency: { [slug]: { level 0-5, confidence, observations } } (operative)
 *   - skillLevels:      { [slug]: 0..100 } legacy fallback when proficiency is absent
 */
const BuilderSnapshotSkillsPanel = ({ skillTaxonomy, skillProficiency, skillLevels }) => {
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const { groups, topStrengths, growthAreas, stats } = useMemo(() => {
    const taxSkills = skillTaxonomy?.skills || {};
    const taxCategories = skillTaxonomy?.categories || {};
    const prof = skillProficiency || {};
    const legacy = skillLevels || {};

    const derive = (slug) => {
      const p = prof[slug];
      if (p && Number.isInteger(p.level)) {
        const observations = Number.isInteger(p.observations) ? p.observations : 0;
        const confidence = typeof p.confidence === 'number' ? p.confidence : null;
        const seeded = observations === 0 || (confidence != null && confidence < 0.5);
        return { level: p.level, confidence, observations, seeded, dim: seeded };
      }
      // Fallback: map legacy 0-100 (marked as a seeded/approximate prior).
      const mapped = legacyToLevel(legacy[slug]);
      if (mapped != null) return { level: mapped, confidence: null, observations: 0, seeded: true, dim: true };
      return { level: null, confidence: null, observations: 0, seeded: false, dim: true };
    };

    const catKeys = Object.keys(taxCategories);
    const byCat = new Map(catKeys.map((k) => [k, []]));
    for (const slug of Object.keys(taxSkills)) {
      const sk = taxSkills[slug];
      if (!sk) continue;
      if (!byCat.has(sk.category)) byCat.set(sk.category, []);
      const d = derive(slug);
      byCat.get(sk.category).push({
        slug,
        name: sk.name || slug,
        category: sk.category,
        ...d,
        label: d.level === null ? 'N/A' : DREYFUS_LABELS[d.level],
      });
    }

    const allRows = [];
    const grp = Array.from(byCat.entries())
      .filter(([, rows]) => rows.length > 0)
      .map(([key, rows]) => {
        rows.sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name));
        rows.forEach((r) => allRows.push(r));
        const assessed = rows.filter((r) => r.level !== null);
        const avg = assessed.length
          ? Math.round((assessed.reduce((s, r) => s + r.level, 0) / assessed.length) * 10) / 10
          : null;
        return {
          key,
          name: taxCategories[key]?.name || key,
          color: colorFor(key),
          rows,
          assessedCount: assessed.length,
          total: rows.length,
          avg,
        };
      });

    const assessed = allRows.filter((r) => r.level !== null);
    const strengths = [...assessed]
      .sort((a, b) => b.level - a.level || (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 5);
    const growth = [...assessed].sort((a, b) => a.level - b.level).slice(0, 5);
    const overallAvg = assessed.length
      ? Math.round((assessed.reduce((s, r) => s + r.level, 0) / assessed.length) * 10) / 10
      : null;

    return {
      groups: grp,
      topStrengths: strengths,
      growthAreas: growth,
      stats: { total: allRows.length, assessed: assessed.length, avg: overallAvg },
    };
  }, [skillTaxonomy, skillProficiency, skillLevels]);

  const toggle = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <section className="rounded-2xl ring-1 ring-[#E3E3E3] shadow-md bg-white p-6 md:p-8 font-proxima">
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-proxima-bold text-[#1E1E1E]">Skill Profile</h2>
          <p className="text-sm text-[#666] mt-1">
            Proficiency on the Dreyfus scale (0 Below Novice → 5 Expert) across the skill taxonomy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats.total > 0 && (
            <div className="flex items-center gap-3 text-xs text-[#666]">
              <span>
                <span className="text-[#1E1E1E] font-proxima-bold">{stats.assessed}</span>
                {' / '}<span>{stats.total}</span>{' assessed'}
              </span>
              {stats.avg != null && (
                <>
                  <span aria-hidden="true" className="text-[#C8C8C8]">·</span>
                  <span>Avg <span className="text-[#1E1E1E] font-proxima-bold">{stats.avg}</span>{' / 5'}</span>
                </>
              )}
            </div>
          )}
          {/* assessed / all toggle */}
          <div className="inline-flex rounded-lg border border-[#E3E3E3] p-0.5 text-xs">
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
              All
            </button>
          </div>
        </div>
      </header>

      {stats.total === 0 ? (
        <div className="py-16 text-center text-[#999] italic">No skills available yet.</div>
      ) : (
        <>
          {/* Collapsible category groups of bar meters */}
          <div className="space-y-3">
            {groups.map((g) => {
              const rows = showAll ? g.rows : g.rows.filter((r) => r.level !== null);
              if (rows.length === 0) return null; // hide empty categories in "assessed" view
              const isOpen = !collapsed.has(g.key);
              return (
                <div key={g.key} className="rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(g.key)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[#F5F5F5] transition-colors"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4 text-[#999]" /> : <ChevronRight className="w-4 h-4 text-[#999]" />}
                    <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="text-sm font-proxima-bold text-[#1E1E1E]">{g.name}</span>
                    <span className="text-xs text-[#999]">({g.assessedCount}/{g.total})</span>
                    {g.avg != null && (
                      <span className="ml-auto text-xs text-[#666]">Avg <span className="font-proxima-bold text-[#1E1E1E]">{g.avg}</span></span>
                    )}
                  </button>
                  {isOpen && (
                    <ul className="px-4 pb-3 divide-y divide-[#F0F0F0]">
                      {rows.map((r) => <SkillRow key={r.slug} skill={r} />)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* Leaderboards */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <Leaderboard
              icon={<TrendingUp className="w-4 h-4 text-[#4242EA]" />}
              title="Top Strengths"
              empty="No assessed skills yet."
              items={topStrengths}
            />
            <Leaderboard
              icon={<TrendingDown className="w-4 h-4 text-[#FB923C]" />}
              title="Growth Areas"
              empty="No assessed skills yet."
              items={growthAreas}
              variant="growth"
            />
          </div>
        </>
      )}
    </section>
  );
};

/** Leaderboard — ranked list with a 6-step meter per skill. */
const Leaderboard = ({ icon, title, items, empty, variant = 'strength' }) => (
  <div>
    <h3 className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#666] font-proxima-bold">
      {icon}
      {title}
    </h3>
    {items.length === 0 ? (
      <p className="mt-3 text-sm text-[#999] italic">{empty}</p>
    ) : (
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item.slug} className="flex items-center gap-3" title={item.label}>
            <span className="flex-1 min-w-0 truncate text-sm text-[#1E1E1E]">{item.name}</span>
            <SegmentMeter level={item.level} dim={item.dim} />
            <span className="w-28 shrink-0 text-right text-xs font-proxima-bold tabular-nums text-[#1E1E1E]">
              {item.level} {item.label}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default BuilderSnapshotSkillsPanel;
