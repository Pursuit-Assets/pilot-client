import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { searchUsers, generateNarrative } from '../../../services/builderProfileInspectorApi';
import BuilderSnapshotHero from './components/BuilderSnapshotHero';
import BuilderSnapshotSkillsPanel from './components/BuilderSnapshotSkillsPanel';
import BuilderSnapshotStoryGrid from './components/BuilderSnapshotStoryGrid';
import BuilderSnapshotAchievements from './components/BuilderSnapshotAchievements';
import BuilderSnapshotTimeline from './components/BuilderSnapshotTimeline';
import BuilderSnapshotReadiness from './components/BuilderSnapshotReadiness';
import BuilderSnapshotNarrative from './components/BuilderSnapshotNarrative';

const BRAND = '#4242EA';

// ---------------------------------------------------------------------------
// composeSummary — picks the best already-written prose for the hero band.
// The earlier version stitched first-sentence-of-background + lowercased
// first-sentence-of-goals + comma-listed top-3 skills, which produced
// garbled output like "Currently focused on this builder is early in their
// technical journey..." and "strengths in Build and deploy web applications"
// (the taxonomy stores skills as verb-first imperatives, not noun phrases).
//
// Both background.markdown and goals.markdown are already 2-4 well-formed,
// builder-framed sentences from the extraction service. The hero uses
// background prose as-is when present; goals prose has its own card on the
// page below the hero, and the radar/leaderboard surface skills visually.
// Truncates to the first ~2 sentences for visual breathing room.
// ---------------------------------------------------------------------------
const stripMarkdown = (md) =>
  String(md || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/[*_`~>]/g, '')                 // emphasis / code / blockquote
    .replace(/^#{1,6}\s*/gm, '')             // headings
    .replace(/\s+/g, ' ')
    .trim();

// Take the first N sentences (default 2) of a paragraph, joined cleanly.
// Bails to the full text if it's shorter than N sentences.
const firstSentences = (md, n = 2) => {
  const text = stripMarkdown(md);
  if (!text) return '';
  const matches = text.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!matches || matches.length <= n) return text;
  return matches.slice(0, n).join('').trim();
};

export const composeSummary = (snapshot /* taxonomy unused — kept for prop-sig stability */) => {
  if (!snapshot) return '';
  const profile = snapshot.profile || {};
  // Prefer background prose (which already covers history + motivation).
  // Goals prose stands alone in its own card; the radar shows skills. So
  // the hero stays narrative + uncluttered.
  const bg = firstSentences(profile.background?.markdown, 2);
  if (bg) return bg;
  const goals = firstSentences(profile.goals?.markdown, 2);
  if (goals) return goals;
  return 'No summary captured yet.';
};

// ---------------------------------------------------------------------------
// UserPickerInline — mirrors the CoachProfiles UserPicker pattern, debounced
// search, name/email/cohort rows, click-to-select.
// ---------------------------------------------------------------------------
const UserPickerInline = ({ token, onSelect }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 1) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const data = await searchUsers(token, q.trim());
        setResults(data.results || []);
      } catch (e) {
        setError(e.message || 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q, token]);

  return (
    <div className="mx-auto max-w-2xl bg-white border border-[#E3E3E3] rounded-2xl shadow-sm p-6 font-proxima">
      <h2 className="text-xl font-proxima-bold text-[#1E1E1E]">Find a builder</h2>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        Search by name or email to load their snapshot.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search builders by name or email…"
        aria-label="Search builders"
        className="w-full text-sm px-3 py-2 border border-[#E3E3E3] rounded-md focus:outline-none focus:ring-2"
        style={{ '--tw-ring-color': BRAND }}
      />
      <div className="mt-3">
        {searching && <div className="px-2 py-2 text-xs text-slate-400">Searching…</div>}
        {error && <div className="px-2 py-2 text-xs text-rose-600">{error}</div>}
        {!searching && q && results.length === 0 && (
          <div className="px-2 py-2 text-xs text-slate-400">No matches.</div>
        )}
        {results.map((u) => (
          <button
            key={u.user_id}
            onClick={() => onSelect(u)}
            className="w-full text-left px-3 py-2 border-b border-[#F0F0F0] hover:bg-[#F7F7F9] last:border-b-0"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {u.first_name} {u.last_name}
              </div>
              {u.onboarding_completed === false && (
                // The picker endpoint flags a builder as "backfill-only" when
                // none of background / goals / learning_profile has a
                // non-backfill provenance entry. Surfaces honestly that the
                // snapshot data was inferred from application + assessment +
                // submission history rather than directly confirmed.
                <span
                  title="No onboarding chat yet — profile data was inferred from this builder's application, assessments, and past submissions."
                  className="shrink-0 inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium"
                >
                  Synthesized from history
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {u.email} · {u.cohort || '—'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BuilderSnapshot — top-level container.
// Props:
//   embedded {boolean} — when true, suppresses the page header (used by Coach
//     tab host); when false, renders standalone with its own header.
// ---------------------------------------------------------------------------
const BuilderSnapshot = ({ embedded = false }) => {
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  // Strictly all-digits → integer. parseInt('42abc') silently returns 42,
  // which would fetch user 42 from a malformed URL. Reject anything that
  // isn't a clean positive integer (also rejects '42.5', '-3', '0').
  const parseStrictUserId = (raw) => {
    if (!raw || typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const userIdParam = searchParams.get('userId');
  const initialUserId = parseStrictUserId(userIdParam);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);

  const [snapshot, setSnapshot] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  // skill_proficiency_scale — carries `tiers` (awareness/application/adaptation →
  // Dreyfus levels) and `courseBands` (which levels are REACHABLE per course).
  // Comes free on the same /v2-coach-engine bundle the taxonomy arrives on.
  const [proficiencyScale, setProficiencyScale] = useState(null);
  // Narrative state is held here rather than in the panel so a regeneration
  // survives the panel re-rendering, and so it resets cleanly per builder.
  const [narrative, setNarrative] = useState(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeError, setNarrativeError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null); // last HTTP status

  // Keep selectedUserId in sync with the URL (e.g., browser back/forward).
  useEffect(() => {
    const next = parseStrictUserId(searchParams.get('userId'));
    if (next !== selectedUserId) setSelectedUserId(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const apiBase = import.meta.env.VITE_API_URL;

  const loadSnapshot = useCallback(
    async (userId) => {
      if (!userId || !token) return;
      setLoading(true);
      setError(null);
      setStatus(null);
      try {
        const res = await fetch(`${apiBase}/api/admin/builder-profiles/${userId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        setStatus(res.status);
        if (!res.ok) {
          if (res.status === 404) {
            setSnapshot(null);
            setError('Builder not found');
            return;
          }
          let detail = '';
          try {
            const body = await res.json();
            detail = body?.error || body?.message || '';
          } catch (_) {
            /* ignore */
          }
          throw new Error(detail || `Request failed (${res.status})`);
        }
        const data = await res.json();
        setSnapshot(data);
        // The cached narrative rides along on the snapshot; a page load never
        // generates one. Reset any prior builder's generate-error with it.
        setNarrative(data.narrative || null);
        setNarrativeError(null);
      } catch (e) {
        setError(e.message || 'Failed to load snapshot');
        setSnapshot(null);
        setNarrative(null);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, token],
  );

  // Fire-and-forget taxonomy load so the radar can show real skill names.
  // The server exposes the taxonomy via the v2-coach-engine bundle endpoint
  // (NOT /skill-taxonomy — that route is PUT-only). Response shape:
  //   { skillTaxonomy: { name, description, categories, skills, ... }, ... }
  useEffect(() => {
    if (!token || !canAccessPage('coach')) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/admin/prompts/v2-coach-engine`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!aborted) {
          setTaxonomy(data?.skillTaxonomy || null);
          setProficiencyScale(data?.skillProficiency?.scale || null);
        }
      } catch (_) {
        // Taxonomy is best-effort; UI degrades gracefully without it.
      }
    })();
    return () => {
      aborted = true;
    };
  }, [apiBase, token, canAccessPage]);

  useEffect(() => {
    if (selectedUserId) {
      loadSnapshot(selectedUserId);
    } else {
      setSnapshot(null);
      setError(null);
    }
  }, [selectedUserId, loadSnapshot]);

  const handleSelectUser = useCallback(
    (u) => {
      if (!u?.user_id) return;
      setSelectedUserId(u.user_id);
      const next = new URLSearchParams(searchParams);
      next.set('userId', String(u.user_id));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleGenerateNarrative = useCallback(async () => {
    if (!selectedUserId || narrativeBusy) return;
    setNarrativeBusy(true);
    setNarrativeError(null);
    try {
      const result = await generateNarrative(token, selectedUserId);
      setNarrative(result);
    } catch (e) {
      // fetchWithAuth surfaces the server's message; the code distinguishes
      // "not enough evidence yet" (expected) from a real generation failure.
      setNarrativeError({ message: e.message || 'Could not generate the summary.', code: e.code || e.body?.code });
    } finally {
      setNarrativeBusy(false);
    }
  }, [selectedUserId, token, narrativeBusy]);

  const handleClearUser = useCallback(() => {
    setSelectedUserId(null);
    const next = new URLSearchParams(searchParams);
    next.delete('userId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const summary = useMemo(
    () => composeSummary(snapshot, taxonomy),
    [snapshot, taxonomy],
  );

  // NOTE: the hero no longer carries a KPI strip. It used to headline
  // "Avg Proficiency 1.6 / 5" plus raw counts of competency signals and
  // performance entries. All three were replaced by BuilderSnapshotReadiness,
  // which answers the same question properly — a mean over ordinal Dreyfus
  // stages, on a /5 scale whose top two levels are out of scope for a first
  // course, read as a failing percentage for builders who were on track. Keeping
  // both would also put two different "levels" on one page (the profile's
  // hysteresis-smoothed average and the mean of graded observations).

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

  // Server contract: full_name / cohort_name / headshot_url are TOP-LEVEL
  // keys on the snapshot response (added by services/builderProfileSnapshot.js
  // via LEFT JOINs on cohort + lookbook_profiles). Fall back to identity.*
  // for the name in case the server fields are absent.
  const identity = snapshot?.identity || {};
  const fullName =
    snapshot?.full_name ||
    [identity.first_name, identity.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
  const cohortName = snapshot?.cohort_name || identity.cohort || null;
  // lookbook_profiles.photo_url comes in THREE shapes across the user base:
  //   1. `/uploads/...`  — legacy on-disk path served by the lookbook backend
  //      (lookbook-api.onrender.com), NOT by test-pilot-server. Verified
  //      against Pete Molski / Ariel Chen / Ethan Davey — all 200 OK.
  //   2. `gs://bucket/p` — Google Cloud Storage URI; rewrite to a public
  //      storage.googleapis.com URL (mirrors AttendanceManagement.jsx).
  //   3. `https://...` / `data:image/...` — already absolute, pass through.
  const LOOKBOOK_PHOTO_HOST =
    import.meta.env.VITE_LOOKBOOK_API_URL || 'https://lookbook-api.onrender.com';
  const rawHeadshotUrl = snapshot?.headshot_url || null;
  const headshotUrl = (() => {
    const raw = rawHeadshotUrl;
    if (!raw || typeof raw !== 'string') return null;
    if (raw.startsWith('gs://')) {
      const noScheme = raw.slice('gs://'.length);
      const slash = noScheme.indexOf('/');
      if (slash === -1) return null;
      return `https://storage.googleapis.com/${noScheme.slice(0, slash)}/${noScheme.slice(slash + 1)}`;
    }
    if (raw.startsWith('/uploads/')) return `${LOOKBOOK_PHOTO_HOST}${raw}`;
    if (raw.startsWith('/')) return `${apiBase}${raw}`; // other on-disk paths
    // Absolute URLs that reach this branch are allowlisted to http(s) only.
    // Rejects javascript:, data:, file:, blob:, etc. — even if the server
    // is ever compromised and sends a hostile scheme, the silhouette
    // fallback fires instead of trusting the value.
    if (/^https?:\/\//i.test(raw)) return raw;
    return null;
  })();

  return (
    <div
      className={`flex flex-col font-proxima ${
        embedded ? 'h-full overflow-y-auto' : 'min-h-screen bg-[#EFEFEF]'
      }`}
    >
      {!embedded && (
        <div className="shrink-0 bg-white border-b border-[#E3E3E3] px-8 py-4">
          <h1 className="text-2xl font-bold text-[#1E1E1E]">Builder Snapshot</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            A read-only view of a builder's identity, skills, and profile envelopes.
          </p>
        </div>
      )}

      <div className="flex-1 p-6 md:p-8 animate-in fade-in duration-500">
        {/* Picker is only visible when no builder is selected; once a builder
            IS selected, the Back-to-search affordance lives inside the hero
            so the hero sits flush at the top of the page. */}
        {!selectedUserId && (
          <div className="mb-6">
            <UserPickerInline token={token} onSelect={handleSelectUser} />
          </div>
        )}

        {/* Loading */}
        {selectedUserId && loading && (
          <div className="space-y-6">
            <div className="rounded-2xl ring-1 ring-[#E3E3E3] bg-white shadow-sm p-8 animate-pulse h-40" />
            <div className="rounded-2xl ring-1 ring-[#E3E3E3] bg-white shadow-sm p-8 animate-pulse h-96" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl ring-1 ring-[#E3E3E3] bg-white shadow-sm p-6 animate-pulse h-64"
                />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {selectedUserId && !loading && error && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <h2 className="text-lg font-semibold mb-1">
              {status === 404 ? 'Builder not found' : 'Something went wrong'}
            </h2>
            <p className="text-sm mb-4">{error}</p>
            <div className="flex gap-2">
              {status !== 404 && (
                <button
                  type="button"
                  onClick={() => loadSnapshot(selectedUserId)}
                  className="text-sm font-medium text-white rounded-md px-4 py-2"
                  style={{ backgroundColor: BRAND }}
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={handleClearUser}
                className="text-sm font-medium rounded-md px-4 py-2 border border-rose-200 bg-white text-rose-700"
              >
                Back to search
              </button>
            </div>
          </div>
        )}

        {/* Loaded snapshot */}
        {selectedUserId && !loading && !error && snapshot && (
          <div className="space-y-6">
            <BuilderSnapshotHero
              fullName={fullName}
              cohortName={cohortName}
              headshotUrl={headshotUrl}
              summary={summary}
              onBack={handleClearUser}
            />

            <BuilderSnapshotReadiness
              readiness={snapshot.readiness}
              courseBands={proficiencyScale?.courseBands}
            />

            <BuilderSnapshotNarrative
              narrative={narrative}
              onGenerate={handleGenerateNarrative}
              generating={narrativeBusy}
              error={narrativeError}
            />

            <BuilderSnapshotSkillsPanel
              skillTaxonomy={taxonomy || { categories: {}, skills: {} }}
              skillProficiency={snapshot.profile?.skill_proficiency || {}}
              skillLevels={snapshot.profile?.skill_levels || {}}
            />

            <BuilderSnapshotStoryGrid profile={snapshot.profile} />

            <BuilderSnapshotAchievements
              competencies={snapshot.profile?.competencies}
              skillTaxonomy={taxonomy}
              skillProficiency={snapshot.profile?.skill_proficiency}
            />

            <BuilderSnapshotTimeline
              performance={snapshot.profile?.performance}
              applyOutcomes={snapshot.recent_apply_outcomes}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default BuilderSnapshot;
