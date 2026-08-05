import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw,
  ExternalLink, Star, FileText, Filter, X, Search,
} from 'lucide-react';
import BuilderDrawer from '../components/BuilderDrawer';
import DemoRatingModal from '../components/DemoRatingModal';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';

const LEGACY_API = 'https://ai-pilot-admin-dashboard-866060457933.us-central1.run.app/api';
const API_URL = import.meta.env.VITE_API_URL;
const PAGE_SIZE = 15;

const GRADE_COLORS = {
  'A+': '#15803d', A: '#16a34a', 'A-': '#22c55e',
  'B+': '#4242EA', B: '#6366f1', 'B-': '#818cf8',
  'C+': '#f59e0b', C: '#d97706',
};

const SELECTION_CONFIG = {
  strong: { emoji: '✅', label: 'Strong' },
  maybe: { emoji: '❓', label: 'Maybe' },
  drop: { emoji: '❌', label: 'Drop' },
  pending: { emoji: '⚫', label: 'Pending' },
};

// ─── Shared components ───────────────────────────────────────────────────────

const GradeBar = ({ builder }) => {
  const grades = [
    { key: 'A+', count: builder.grade_aplus_count || 0 },
    { key: 'A', count: builder.grade_a_count || 0 },
    { key: 'A-', count: builder.grade_aminus_count || 0 },
    { key: 'B+', count: builder.grade_bplus_count || 0 },
    { key: 'B', count: builder.grade_b_count || 0 },
    { key: 'B-', count: builder.grade_bminus_count || 0 },
    { key: 'C+', count: builder.grade_cplus_count || 0 },
    { key: 'C', count: builder.grade_c_count || 0 },
  ];
  const total = grades.reduce((s, g) => s + g.count, 0);
  if (total === 0) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex items-center gap-1">
      <div className="flex h-3 flex-1 rounded-sm overflow-hidden">
        {grades.filter(g => g.count > 0).map(g => (
          <div
            key={g.key}
            style={{ width: `${(g.count / total) * 100}%`, background: GRADE_COLORS[g.key] || '#94a3b8' }}
            title={`${g.key}: ${g.count} (${Math.round((g.count / total) * 100)}%)`}
          />
        ))}
      </div>
      <span className="text-[10px] text-slate-400 w-6 text-right">{total}</span>
    </div>
  );
};

const SortHeader = ({ label, sortKey, sort, onSort, className = '', children }) => (
  <th
    className={`pb-2 font-medium cursor-pointer hover:text-[#4242EA] transition-colors select-none ${className}`}
    onClick={() => onSort(sortKey)}
  >
    <span className="inline-flex items-center gap-0.5">
      {label}
      {sort.key === sortKey ? (
        sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      ) : (
        <span className="text-slate-300 text-[10px]">⇅</span>
      )}
      {children}
    </span>
  </th>
);

const InlineStars = ({ value, onClick, disabled }) => (
  <div className="flex gap-0.5 justify-center">
    {[1, 2, 3, 4, 5].map(s => (
      <button
        key={s}
        onClick={e => { e.stopPropagation(); if (!disabled) onClick(s); }}
        disabled={disabled}
        className={disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}
      >
        <Star size={14} className={s <= value ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-slate-300'} />
      </button>
    ))}
  </div>
);

// ─── Filter dropdown ─────────────────────────────────────────────────────────

const FilterDropdown = ({ options, selected, onChange, searchable, label }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = searchable
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const allSelected = filtered.length > 0 && filtered.every(o => selected.includes(o.value));

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className="ml-1 p-0.5 rounded hover:bg-[#EFEFEF]"
        title={`Filter by ${label}`}
      >
        <Filter size={11} className={selected.length > 0 ? 'text-[#4242EA]' : 'text-slate-300'} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 bg-white border border-[#E3E3E3] rounded-lg shadow-lg z-50 min-w-[220px]"
          onClick={e => e.stopPropagation()}
        >
          {searchable && (
            <div className="p-2 border-b border-[#E3E3E3]">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-7 pr-2 py-1 text-xs border border-[#E3E3E3] rounded focus:border-[#4242EA] focus:outline-none"
                />
              </div>
            </div>
          )}
          <div className="p-1 border-b border-[#E3E3E3]">
            <label className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-[#EFEFEF] rounded">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) onChange([]);
                  else onChange(filtered.map(o => o.value));
                }}
                className="accent-[#4242EA]"
              />
              Select All
            </label>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.map(o => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-[#EFEFEF] rounded">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => {
                    if (selected.includes(o.value)) onChange(selected.filter(v => v !== o.value));
                    else onChange([...selected, o.value]);
                  }}
                  className="accent-[#4242EA]"
                />
                {o.label}
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 px-2 py-2 italic">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Selection status dropdown ───────────────────────────────────────────────

// `readOnly` renders the current selection as a static emoji — the L2 offer decision is
// staff-only, but a read-only viewer still needs to see where each builder stands.
const SelectionDropdown = ({ value, onChange, readOnly }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const config = SELECTION_CONFIG[value] || SELECTION_CONFIG.pending;

  if (readOnly) {
    return <span className="text-lg" title={config.label}>{config.emoji}</span>;
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className="text-lg cursor-pointer hover:scale-110 transition-transform"
        title={config.label}
      >
        {config.emoji}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-[#E3E3E3] rounded-lg shadow-lg z-50 p-1">
          {Object.entries(SELECTION_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded hover:bg-[#EFEFEF] ${value === key ? 'bg-[#EFEFEF]' : ''}`}
            >
              <span className="text-base">{cfg.emoji}</span> {cfg.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

const L2SelectionsTab = ({ selectedCohortId, cohorts }) => {
  const token = useAuthStore((s) => s.token);
  // Read-only accounts (interview candidates) can read the L2 signal but not record a
  // decision — the server refuses the POST, so the controls aren't offered.
  const { isReadOnly } = usePermissions();
  const [builders, setBuilders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState({ key: 'attendance_percentage', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [selectedBuilder, setSelectedBuilder] = useState(null);
  const startDate = '2025-03-01';
  const endDate = new Date().toISOString().split('T')[0];

  const [cohortStartDate, setCohortStartDate] = useState(null);

  const [videoRatings, setVideoRatings] = useState({});
  const [selectionStatuses, setSelectionStatuses] = useState({});
  const [existingFeedback, setExistingFeedback] = useState({});

  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoModalBuilder, setDemoModalBuilder] = useState(null);
  const [demoModalRating, setDemoModalRating] = useState(0);

  const [nameFilter, setNameFilter] = useState([]);
  const [selectionFilter, setSelectionFilter] = useState([]);
  const [demoFilter, setDemoFilter] = useState([]);

  // Demographics for "strong" selected builders
  const [demographics, setDemographics] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);

  const hasFilters = nameFilter.length > 0 || selectionFilter.length > 0 || demoFilter.length > 0;

  const selectedCohort = useMemo(
    () => cohorts.find(c => c.cohort_id === selectedCohortId),
    [cohorts, selectedCohortId]
  );
  const selectedLevel = selectedCohort?.legacyName || '';

  const isL1Cohort = useMemo(
    () => selectedCohort?.name?.includes('L1') ?? false,
    [selectedCohort]
  );

  // ── Fetch builders + final demos ──
  const fetchBuilders = () => {
    const cohortId = selectedCohort?.cohort_id;
    if (!cohortId) return;
    setLoading(true);
    setPage(0);

    const buildersPromise = cohortId && token
      ? fetch(`${API_URL}/api/admin/dashboard/cohort-summary?cohortId=${cohortId}&startDate=${startDate}&endDate=${endDate}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(d => d.builders || [])
          .catch(() => [])
      : Promise.resolve([]);

    // Fetch final demo submissions from our native endpoint (uses cohort_id)
    const demosPromise = cohortId && token
      ? fetch(`${API_URL}/api/admin/dashboard/final-demos?cohortId=${cohortId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).then(d => d.data || []).catch(() => [])
      : Promise.resolve([]);

    // Fetch native attendance using curriculum_days as denominator (full program)
    const attendancePromise = cohortId && token
      ? fetch(`${API_URL}/api/admin/dashboard/builder-attendance?cohortId=${cohortId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).catch(() => ({ success: false, data: {} }))
      : Promise.resolve({ success: false, data: {} });

    Promise.all([buildersPromise, demosPromise, attendancePromise]).then(([data, demos, attendanceRes]) => {
      const builderList = Array.isArray(data) ? data : [];
      // Index demos by user_id
      const demoByUser = {};
      for (const d of demos) {
        if (!demoByUser[d.user_id]) demoByUser[d.user_id] = d;
      }
      // Native attendance indexed by user_id
      const nativeAtt = attendanceRes.success ? (attendanceRes.data || {}) : {};
      if (attendanceRes.cohortStartDate) {
        setCohortStartDate(attendanceRes.cohortStartDate);
      }
      // Merge demo + native attendance data into builders
      const merged = builderList.map(b => {
        const demo = demoByUser[b.user_id];
        const att = nativeAtt[b.user_id];
        return {
          ...b,
          latest_loom_url: b.latest_loom_url || demo?.loom_url || null,
          latest_task_id: b.latest_task_id || demo?.task_id || null,
          latest_submission_id: b.latest_submission_id || demo?.submission_id || null,
          // Override legacy API attendance with native curriculum_days-based data
          ...(att && {
            days_attended: att.days_attended,
            total_curriculum_days: att.total_curriculum_days,
            attendance_percentage: att.attendance_percentage,
          }),
        };
      });
      setBuilders(merged);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchBuilders(); }, [selectedCohort?.cohort_id, token]);

  // ── Fetch human reviews when builders load ──
  useEffect(() => {
    if (builders.length === 0 || !token) return;
    const ids = builders.map(b => b.user_id).join(',');
    fetch(`${API_URL}/api/admin/dashboard/human-reviews?builderIds=${ids}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const feedbackMap = {};
        const ratings = {};
        const statuses = {};
        for (const review of (data.data || [])) {
          const bid = review.builder_id;
          if (!feedbackMap[bid]) feedbackMap[bid] = [];
          feedbackMap[bid].push(review);
          if (!ratings[bid] && review.score) ratings[bid] = review.score;
          if (!statuses[bid] && review.selection_status) statuses[bid] = review.selection_status;
        }
        setExistingFeedback(feedbackMap);
        setVideoRatings(ratings);
        setSelectionStatuses(statuses);
      })
      .catch(console.error);
  }, [builders, token]);

  // ── Save human review ──
  const saveHumanReview = async (reviewData) => {
    const res = await fetch(`${API_URL}/api/admin/dashboard/human-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(reviewData),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    // Refetch fresh data for this builder so the table reflects what was actually saved
    try {
      const refreshRes = await fetch(
        `${API_URL}/api/admin/dashboard/human-reviews?builderIds=${reviewData.builder_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const freshData = await refreshRes.json();
      if (freshData.success) {
        const reviews = freshData.data || [];
        const bid = reviewData.builder_id;
        // Use loose string comparison — server returns integer builder_id, bid may be string
        const newFeedback = reviews.filter(r => String(r.builder_id) === String(bid));
        const latestScore = newFeedback.find(r => r.score)?.score;
        const latestStatus = newFeedback.find(r => r.selection_status)?.selection_status;
        setExistingFeedback(prev => ({ ...prev, [bid]: newFeedback }));
        if (latestScore != null) setVideoRatings(prev => ({ ...prev, [bid]: latestScore }));
        if (latestStatus) setSelectionStatuses(prev => ({ ...prev, [bid]: latestStatus }));
      }
    } catch (err) {
      console.error('Failed to refresh review data after save:', err);
    }
    return result;
  };

  // ── Selection status change (quick, no modal) ──
  const handleSelectionChange = async (userId, status) => {
    setSelectionStatuses(prev => ({ ...prev, [userId]: status }));
    const builder = builders.find(b => b.user_id === userId);
    const existing = existingFeedback[userId]?.[0] || {};
    try {
      await saveHumanReview({
        builder_id: userId,
        task_id: builder?.latest_task_id || existing.task_id || null,
        submission_id: builder?.latest_submission_id || existing.submission_id || null,
        score: videoRatings[userId] || existing.score || 0,
        technical_feedback: existing.technical_feedback || '',
        business_feedback: existing.business_feedback || '',
        professional_feedback: existing.professional_feedback || '',
        overall_notes: existing.overall_notes || '',
        selection_status: status,
      });
    } catch (err) {
      console.error('Failed to save selection status:', err);
      setSelectionStatuses(prev => ({ ...prev, [userId]: prev[userId] || 'pending' }));
    }
  };

  // ── Fetch demographics for "strong" builders ──
  const strongUserIds = useMemo(
    () => Object.entries(selectionStatuses)
      .filter(([, status]) => status === 'strong')
      .map(([uid]) => uid),
    [selectionStatuses]
  );

  useEffect(() => {
    if (!token || strongUserIds.length === 0) {
      setDemographics(null);
      return;
    }
    setDemoLoading(true);
    fetch(`${API_URL}/api/admin/dashboard/builder-demographics?userIds=${strongUserIds.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { if (data.success) setDemographics(data.data); })
      .catch(() => setDemographics(null))
      .finally(() => setDemoLoading(false));
  }, [token, strongUserIds.join(',')]);

  // ── Open demo modal ──
  const openDemoModal = (builder, rating) => {
    setDemoModalBuilder(builder);
    setDemoModalRating(rating || videoRatings[builder.user_id] || 0);
    setDemoModalOpen(true);
  };

  // ── Sort, filter, paginate ──
  const sorted = useMemo(() => {
    return [...builders].sort((a, b) => {
      let av, bv;
      if (sort.key === 'demo_rating') {
        av = videoRatings[a.user_id] || 0;
        bv = videoRatings[b.user_id] || 0;
      } else {
        av = a[sort.key] ?? 0;
        bv = b[sort.key] ?? 0;
      }
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [builders, sort, videoRatings]);

  const filtered = useMemo(() => {
    return sorted.filter(b => {
      if (nameFilter.length > 0 && !nameFilter.includes(b.name)) return false;
      const status = selectionStatuses[b.user_id] || 'pending';
      if (selectionFilter.length > 0 && !selectionFilter.includes(status)) return false;
      if (demoFilter.length > 0) {
        const hasDemo = b.latest_loom_url?.includes('loom.com');
        const demoStatus = hasDemo ? 'submitted' : 'not_submitted';
        if (!demoFilter.includes(demoStatus)) return false;
      }
      return true;
    });
  }, [sorted, nameFilter, selectionFilter, demoFilter, selectionStatuses]);

  const toggleSort = (key) => {
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
    setPage(0);
  };

  // ── Filter options ──
  const nameOptions = useMemo(() =>
    [...new Set(builders.map(b => b.name))].sort().map(n => ({ value: n, label: n })),
    [builders]
  );
  const selectionOptions = Object.entries(SELECTION_CONFIG).map(([key, cfg]) => ({
    value: key, label: `${cfg.emoji} ${cfg.label}`,
  }));
  const demoOptions = [
    { value: 'submitted', label: '✅ Submitted' },
    { value: 'not_submitted', label: '❌ Not Submitted' },
  ];

  // ── Export CSV ──
  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Attendance %', 'Tasks %', 'Peer Feedback', 'Negative Feedback',
      'Avg Task Score', 'Videos', 'Avg Video Score', 'Demo Rating', 'Notes', 'Selection'];
    const rows = filtered.map(b => {
      const status = selectionStatuses[b.user_id] || 'pending';
      const fb = existingFeedback[b.user_id]?.[0] || {};
      const notes = [fb.technical_feedback, fb.business_feedback, fb.professional_feedback, fb.overall_notes]
        .filter(Boolean).join(' | ');
      return [
        b.name, b.email, b.attendance_percentage, b.tasks_completed_percentage,
        b.total_peer_feedback_count, b.negative_feedback_count || 0, '',
        b.video_tasks_completed, b.avg_video_score || '',
        videoRatings[b.user_id] || 0, notes,
        SELECTION_CONFIG[status]?.label || 'Pending',
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `l2-selections-${selectedLevel.replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isL1Cohort) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Not available</p>
        <h3 className="text-lg font-semibold text-[#1E1E1E]">L2 selections are for L1 cohorts</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Select an L1 cohort from the dropdown above to manage L2 builder selections.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Badge className="bg-[#EFEFEF] text-slate-600 text-xs h-fit">
          {hasFilters
            ? `${filtered.length} of ${builders.length} builders`
            : `${builders.length} builders`}
        </Badge>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setNameFilter([]); setSelectionFilter([]); setDemoFilter([]); }}
              className="text-xs gap-1 text-slate-500 border-[#E3E3E3]"
            >
              <X size={12} /> Clear Filters
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBuilders}
            className="text-xs gap-1 border-[#E3E3E3] text-slate-600"
          >
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="border-[#4242EA] text-[#4242EA] hover:bg-[#4242EA] hover:text-white text-xs gap-1.5"
          >
            <Download size={13} /> Export CSV
          </Button>
        </div>
      </div>

      {/* Selected Builders Demographics */}
      {strongUserIds.length > 0 && (
        <Card className="bg-white border border-[#E3E3E3]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-[#1E1E1E]">Selected for L2</span>
              <Badge className="bg-green-100 text-green-700 text-xs">{strongUserIds.length} builders</Badge>
              {demoLoading && <span className="text-[10px] text-slate-400">Loading demographics...</span>}
            </div>
            {demographics && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Gender split */}
                <div className="bg-[#FAFAFA] rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Gender</p>
                  <div className="space-y-1">
                    {Object.entries(demographics.gender || {}).sort((a, b) => b[1] - a[1]).map(([g, count]) => (
                      <div key={g} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{g}</span>
                        <span className="font-semibold text-[#1E1E1E]">{count} <span className="text-slate-400 font-normal">({Math.round(count / demographics.total * 100)}%)</span></span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* College split */}
                <div className="bg-[#FAFAFA] rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">College Degree</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">College degree</span>
                      <span className="font-semibold text-[#1E1E1E]">{demographics.collegeCount} <span className="text-slate-400 font-normal">({Math.round(demographics.collegeCount / demographics.total * 100)}%)</span></span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">No college degree</span>
                      <span className="font-semibold text-[#1E1E1E]">{demographics.nonCollegeCount} <span className="text-slate-400 font-normal">({Math.round(demographics.nonCollegeCount / demographics.total * 100)}%)</span></span>
                    </div>
                  </div>
                </div>

                {/* Higher degrees */}
                <div className="bg-[#FAFAFA] rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Higher Degrees</p>
                  <p className="text-2xl font-bold text-[#1E1E1E]">{demographics.higherDegreeCount}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Master's or Doctorate</p>
                </div>

                {/* Avg income */}
                <div className="bg-[#FAFAFA] rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Avg Incoming Income</p>
                  <p className="text-2xl font-bold text-[#1E1E1E]">
                    {demographics.avgIncome != null ? `$${demographics.avgIncome.toLocaleString()}` : '—'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {demographics.incomeRespondents} of {demographics.total} reported
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-white border border-[#E3E3E3]">
        <CardHeader className="pb-3 border-b border-[#E3E3E3]">
          <CardTitle className="text-base font-semibold text-[#1E1E1E]">L2 Builder Performance Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-[#EFEFEF] rounded animate-pulse" />)}</div>
          ) : builders.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No builders for this cohort.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 text-xs uppercase tracking-wide border-b border-[#E3E3E3]">
                      <th className="pb-2 pr-3 font-medium">
                        <span className="inline-flex items-center gap-0.5 cursor-pointer hover:text-[#4242EA]" onClick={() => toggleSort('name')}>
                          Builder {sort.key === 'name' ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="text-slate-300 text-[10px]">⇅</span>}
                        </span>
                        <FilterDropdown options={nameOptions} selected={nameFilter} onChange={setNameFilter} searchable label="builder name" />
                      </th>
                      <th
                        className="pb-2 px-2 font-medium cursor-pointer hover:text-[#4242EA] transition-colors select-none text-center"
                        onClick={() => toggleSort('attendance_percentage')}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          Attendance
                          {sort.key === 'attendance_percentage' ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="text-slate-300 text-[10px]">⇅</span>}
                        </span>
                        <div className="text-[9px] text-slate-400 font-normal normal-case tracking-normal">
                          {cohortStartDate
                            ? `Since ${new Date(cohortStartDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : 'Full program'}
                        </div>
                      </th>
                      <SortHeader label="Tasks" sortKey="tasks_completed_percentage" sort={sort} onSort={toggleSort} className="px-2 text-center" />
                      <SortHeader label="Feedback" sortKey="total_peer_feedback_count" sort={sort} onSort={toggleSort} className="px-2 text-center" />
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide">Grade Dist.</th>
                      <SortHeader label="Videos" sortKey="video_tasks_completed" sort={sort} onSort={toggleSort} className="px-2 text-center" />
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide">
                        <span className="inline-flex items-center gap-0.5 cursor-pointer hover:text-[#4242EA]" onClick={() => toggleSort('final_demo_status')}>
                          Final Demo {sort.key === 'final_demo_status' ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="text-slate-300 text-[10px]">⇅</span>}
                        </span>
                        <FilterDropdown options={demoOptions} selected={demoFilter} onChange={setDemoFilter} label="demo status" />
                      </th>
                      <SortHeader label="Rating" sortKey="demo_rating" sort={sort} onSort={toggleSort} className="px-2 text-center" />
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide text-center">Notes</th>
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide text-center">Status</th>
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide">
                        <span className="inline-flex items-center">
                          Selection
                          <FilterDropdown options={selectionOptions} selected={selectionFilter} onChange={setSelectionFilter} label="selection status" />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF]">
                    {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(b => {
                      const hasDemo = b.latest_loom_url?.includes('loom.com');
                      const rating = videoRatings[b.user_id] || 0;
                      const status = selectionStatuses[b.user_id] || 'pending';
                      const fbCount = existingFeedback[b.user_id]?.length || 0;

                      return (
                        <tr key={b.user_id} className="hover:bg-[#EFEFEF]/50 transition-colors">
                          {/* Builder name */}
                          <td className="py-2 pr-3">
                            <button onClick={() => setSelectedBuilder(b)} className="font-medium text-[#4242EA] text-xs hover:underline text-left">
                              {b.name}
                            </button>
                          </td>
                          {/* Attendance */}
                          <td className="py-2 px-2 text-center">
                            <span className={`text-xs font-semibold ${
                              b.attendance_percentage >= 80 ? 'text-green-600' :
                              b.attendance_percentage >= 60 ? 'text-yellow-600' : 'text-red-500'
                            }`}>{b.attendance_percentage}%</span>
                            <p className="text-[10px] text-slate-400">{b.days_attended}/{b.total_curriculum_days}</p>
                          </td>
                          {/* Tasks */}
                          <td className="py-2 px-2 text-center text-xs text-slate-600">{b.tasks_completed_percentage}%</td>
                          {/* Feedback */}
                          <td className="py-2 px-2 text-center text-xs text-slate-600">{b.total_peer_feedback_count}</td>
                          {/* Grade Dist */}
                          <td className="py-2 px-2 w-28"><GradeBar builder={b} /></td>
                          {/* Videos */}
                          <td className="py-2 px-2 text-center">
                            {b.video_tasks_completed > 0 ? (
                              <button onClick={() => setSelectedBuilder(b)} className="text-xs text-[#4242EA] hover:underline font-medium">
                                {b.video_tasks_completed}
                              </button>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          {/* Final Demo */}
                          <td className="py-2 px-2 text-center">
                            {hasDemo ? (
                              <a href={b.latest_loom_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-[#4242EA] hover:underline inline-flex items-center gap-0.5">
                                <ExternalLink size={10} /> View
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-400">No demo</span>
                            )}
                          </td>
                          {/* Demo Rating */}
                          <td className="py-2 px-2">
                            <InlineStars
                              value={rating}
                              onClick={r => openDemoModal(b, r)}
                              disabled={!hasDemo || isReadOnly}
                            />
                          </td>
                          {/* Notes — a read-only viewer can open existing review notes to
                              read them, but the "+" (add) affordance is not offered. */}
                          <td className="py-2 px-2 text-center">
                            {isReadOnly && fbCount === 0 ? (
                              <span className="text-xs text-slate-300">—</span>
                            ) : (
                              <button
                                onClick={() => openDemoModal(b, rating)}
                                className={`text-xs hover:underline ${fbCount > 0 ? 'text-[#4242EA]' : 'text-slate-400'}`}
                              >
                                <FileText size={13} className="inline" /> {fbCount > 0 ? fbCount : '+'}
                              </button>
                            )}
                          </td>
                          {/* Enrollment Status */}
                          <td className="py-2 px-2 text-center">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              b.enrollment_status === 'completed' ? 'bg-green-100 text-green-700' :
                              b.enrollment_status === 'withdrawn' ? 'bg-red-100 text-red-600' :
                              b.enrollment_status === 'deferred' ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {(b.enrollment_status || 'in_progress').replace(/_/g, ' ')}
                            </span>
                          </td>
                          {/* Selection */}
                          <td className="py-2 px-2 text-center">
                            <SelectionDropdown
                              value={status}
                              onChange={s => handleSelectionChange(b.user_id, s)}
                              readOnly={isReadOnly}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {Math.ceil(filtered.length / PAGE_SIZE) > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-[#E3E3E3]">
                  <span className="text-xs text-slate-400">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  <div className="flex gap-1">
                    <button disabled={page === 0} onClick={() => setPage(page - 1)} className="p-1 rounded disabled:opacity-30 hover:bg-[#EFEFEF]"><ChevronLeft size={14} /></button>
                    <button disabled={page >= Math.ceil(filtered.length / PAGE_SIZE) - 1} onClick={() => setPage(page + 1)} className="p-1 rounded disabled:opacity-30 hover:bg-[#EFEFEF]"><ChevronRight size={14} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Builder detail drawer */}
      {selectedBuilder && (
        <BuilderDrawer
          builder={selectedBuilder}
          startDate={startDate}
          endDate={endDate}
          selectedLevel={selectedLevel}
          cohortId={selectedCohort?.cohort_id}
          onClose={() => setSelectedBuilder(null)}
        />
      )}

      {/* Demo rating modal */}
      <DemoRatingModal
        open={demoModalOpen}
        onClose={() => { setDemoModalOpen(false); setDemoModalBuilder(null); }}
        builder={demoModalBuilder}
        rating={demoModalRating}
        onSave={saveHumanReview}
        existingFeedback={demoModalBuilder ? existingFeedback[demoModalBuilder.user_id] : []}
      />
    </div>
  );
};

export default L2SelectionsTab;
