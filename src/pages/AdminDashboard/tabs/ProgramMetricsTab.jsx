import React, { useState, useEffect, useCallback, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Button } from '../../../components/ui/button';
import { SlidersHorizontal, X, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

const STAGE_COLORS = {
  leads:          { bar: '#CBD5E1', text: '#334155' },
  applicants:     { bar: '#7DD3FC', text: '#0C4A6E' },
  submitted:      { bar: '#3B82F6', text: '#ffffff' },
  admitted:       { bar: '#4242EA', text: '#ffffff' },
  enrolled:       { bar: '#7C3AED', text: '#ffffff' },
  l1_completed:   { bar: '#6EE7B7', text: '#064E3B' },
  l2_completed:   { bar: '#10B981', text: '#ffffff' },
  l3_completed:   { bar: '#047857', text: '#ffffff' },
  any_employment: { bar: '#FCD34D', text: '#78350F' },
  ft_employed:    { bar: '#F59E0B', text: '#ffffff' },
  bond_eligible:  { bar: '#EF4444', text: '#ffffff' },
};

// Drill-down column definitions: { label, sortKey (null = not sortable) }
const DRILL_COLS = {
  leads:          [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Status', key: null }, { label: 'First Captured', key: 'created_at' }],
  applicants:     [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'NYCHA', key: null }, { label: 'Referral', key: null }, { label: 'Created', key: 'created_at' }],
  submitted:      [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Submitted', key: 'submitted_at' }],
  admitted:       [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Status', key: null }, { label: 'Stage Date', key: 'stage_date' }],
  enrolled:       [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Cohort', key: 'cohort' }, { label: 'Status', key: null }, { label: 'Enrolled', key: 'enrolled_date' }],
  l1_completed:   [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Cohort', key: null }, { label: 'Status', key: null }, { label: 'Enrolled', key: 'enrolled_date' }],
  l2_completed:   [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Cohort', key: null }, { label: 'Status', key: null }, { label: 'Enrolled', key: 'enrolled_date' }],
  l3_completed:   [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Cohort', key: null }, { label: 'Status', key: null }, { label: 'Enrolled', key: 'enrolled_date' }],
  any_employment: [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Role', key: null }, { label: 'Company', key: 'company_name' }, { label: 'Type', key: null }, { label: 'Start', key: 'start_date' }],
  ft_employed:    [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Role', key: null }, { label: 'Company', key: 'company_name' }, { label: 'Start', key: 'start_date' }],
  bond_eligible:  [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Role', key: null }, { label: 'Company', key: 'company_name' }, { label: 'Salary', key: null }, { label: 'Start', key: 'start_date' }],
};

const ENROLLMENT_STAGES = new Set(['enrolled', 'l1_completed', 'l2_completed', 'l3_completed']);
const ENROLLMENT_STATUSES = ['in_progress', 'completed', 'withdrawn', 'inactive'];
const ADMISSION_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'];
const DRILL_LIMIT = 50;

const fmt = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};

const ProgramMetricsTab = ({ programSlug = 'ai-native-builder' }) => {
  // Read-only accounts (interview candidates) can read the funnel and drill into it, but
  // the inline admission/enrollment status editors are withheld — the server refuses them.
  const { isReadOnly } = usePermissions();
  const token = useAuthStore((s) => s.token);

  // ---- Funnel state ----
  const [stages, setStages] = useState([]);
  const [avgSalary, setAvgSalary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---- Filters ----
  const [cohorts, setCohorts] = useState([]);
  const [referralChannels, setReferralChannels] = useState([]);
  const [referralSources, setReferralSources] = useState([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [l1Cohorts, setL1Cohorts] = useState([]);
  const [originalCohortIds, setOriginalCohortIds] = useState([]);
  const [filters, setFilters] = useState({ gender: '', nycha: '', channel: '', source: '', education: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ---- Centering (scale reference) ----
  // null = auto-set to first stage after load
  const [centeredStageId, setCenteredStageId] = useState(null);

  // ---- Drill-down state ----
  const [selectedStage, setSelectedStage] = useState(null);
  const [drillData, setDrillData] = useState([]);
  const [drillTotal, setDrillTotal] = useState(0);
  const [drillHasMore, setDrillHasMore] = useState(false);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillSearchInput, setDrillSearchInput] = useState('');
  const [drillSearch, setDrillSearch] = useState('');
  const [drillSortBy, setDrillSortBy] = useState(null);
  const [drillSortDir, setDrillSortDir] = useState('desc');

  const sentinelRef = useRef(null);
  const drillContainerRef = useRef(null);

  const drillLoadingRef = useRef(false); // shadow for observer closure
  const drillHasMoreRef = useRef(false);
  const drillDataLenRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { drillLoadingRef.current = drillLoading; }, [drillLoading]);
  useEffect(() => { drillHasMoreRef.current = drillHasMore; }, [drillHasMore]);
  useEffect(() => { drillDataLenRef.current = drillData.length; }, [drillData.length]);

  // ---- Cohorts + Referral Sources ----
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/permissions/cohorts?type=builder`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.success) setCohorts(d.data || d.cohorts || []); }).catch(() => {});
    fetch(`${API_URL}/api/admin/dashboard/program-cohorts?programSlug=${programSlug}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        if (d.success) setL1Cohorts((d.cohorts || []).filter(c => c.level === 'L1'));
      }).catch(() => {});
    fetch(`${API_URL}/api/admin/dashboard/referral-filters`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        if (d.success) { setReferralChannels(d.channels || []); setReferralSources(d.sources || []); }
      }).catch(() => {});
  }, [token]);

  // ---- Funnel fetch ----
  const fetchFunnel = useCallback(() => {
    if (!token) return;
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    params.set('programSlug', programSlug);
    if (selectedCohortId) params.set('cohortId', selectedCohortId);
    if (originalCohortIds.length > 0) params.set('originalCohortIds', originalCohortIds.join(','));
    if (filters.gender) params.set('gender', filters.gender);
    if (filters.education) params.set('education', filters.education);
    if (filters.nycha !== '') params.set('nycha', filters.nycha);
    if (filters.channel) params.set('channel', filters.channel);
    if (filters.source) params.set('source', filters.source);
    const qs = params.toString();
    fetch(`${API_URL}/api/admin/dashboard/program-funnel${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStages(data.stages || []);
          setAvgSalary(data.avgSalary ?? null);
        } else setError('Failed to load funnel data');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [token, selectedCohortId, originalCohortIds, filters, programSlug]);

  useEffect(() => { fetchFunnel(); }, [fetchFunnel]);

  // Default centered stage = first stage after load
  useEffect(() => {
    if (stages.length > 0 && !centeredStageId) setCenteredStageId(stages[0].id);
  }, [stages]);

  // ---- Drill-down fetch ----
  const fetchDrill = useCallback((stage, page, search, sortBy, sortDir, append = false) => {
    if (!token || !stage) return;
    setDrillLoading(true);
    const params = new URLSearchParams({ stage: stage.id, page, limit: DRILL_LIMIT });
    if (selectedCohortId && ENROLLMENT_STAGES.has(stage.id)) params.set('cohortId', selectedCohortId);
    if (search) params.set('search', search);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);
    fetch(`${API_URL}/api/admin/dashboard/stage-detail?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const newRows = data.data || [];
          setDrillData(prev => append ? [...prev, ...newRows] : newRows);
          setDrillTotal(data.total || 0);
          setDrillHasMore(newRows.length >= DRILL_LIMIT);
        }
      })
      .catch(() => {})
      .finally(() => setDrillLoading(false));
  }, [token, selectedCohortId]);

  // Reset + fetch when stage changes
  useEffect(() => {
    if (selectedStage) {
      setDrillData([]); setDrillTotal(0); setDrillHasMore(true);
      setDrillSearchInput(''); setDrillSearch(''); setDrillSortBy(null); setDrillSortDir('desc');
      if (drillContainerRef.current) drillContainerRef.current.scrollTop = 0;
      fetchDrill(selectedStage, 1, '', null, 'desc', false);
    } else {
      setDrillData([]); setDrillTotal(0); setDrillHasMore(false);
    }
  }, [selectedStage]);

  // Re-fetch when search/sort changes
  useEffect(() => {
    if (!selectedStage) return;
    setDrillData([]);
    setDrillHasMore(true);
    if (drillContainerRef.current) drillContainerRef.current.scrollTop = 0;
    fetchDrill(selectedStage, 1, drillSearch, drillSortBy, drillSortDir, false);
  }, [drillSearch, drillSortBy, drillSortDir]);

  // Debounce search input → drillSearch
  useEffect(() => {
    const t = setTimeout(() => setDrillSearch(drillSearchInput), 300);
    return () => clearTimeout(t);
  }, [drillSearchInput]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !selectedStage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !drillLoadingRef.current && drillHasMoreRef.current) {
        const nextPage = Math.ceil(drillDataLenRef.current / DRILL_LIMIT) + 1;
        fetchDrill(selectedStage, nextPage, drillSearch, drillSortBy, drillSortDir, true);
      }
    }, { threshold: 0.1, rootMargin: '40px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [selectedStage, drillSearch, drillSortBy, drillSortDir, fetchDrill]);

  // ---- Click handling: single = center, double = drill ----
  const handleBarClick = (stage) => {
    setCenteredStageId(stage.id);
    setSelectedStage(prev => prev?.id === stage.id ? null : { id: stage.id, label: stage.label });
  };

  // ---- Inline status edits ----
  const handleStatusChange = async (enrollmentId, newStatus, rowIdx) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/enrollment-status`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) setDrillData(prev => prev.map((r, i) => i === rowIdx ? { ...r, enrollment_status: newStatus } : r));
    } catch {}
  };

  const handleAdmissionStatusChange = async (stageId, newStatus, rowIdx) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/admission-status`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) setDrillData(prev => prev.map((r, i) => i === rowIdx ? { ...r, program_admission_status: newStatus } : r));
    } catch {}
  };

  // ---- Scale helpers (dynamic centering) ----
  const centeredIdx = stages.findIndex(s => s.id === (centeredStageId || stages[0]?.id));
  const centeredCount = (centeredIdx >= 0 ? stages[centeredIdx] : stages[0])?.count || 1;

  const getBarWidth = (idx) => {
    if (idx <= centeredIdx) return 100;
    return Math.max((stages[idx].count / centeredCount) * 100, 0.5);
  };

  const getMultiplierLabel = (stage, idx) => {
    if (idx >= centeredIdx) return null;
    const next = stages[idx + 1];
    if (!next || next.count === 0) return null;
    return `${(stage.count / next.count).toFixed(1)}× ${next.label}`;
  };

  const getConversionPct = (current, previous) => {
    if (!previous || previous.count === 0) return null;
    return Math.round((current.count / previous.count) * 100);
  };

  const getPctOfCentered = (stage) => {
    if (centeredCount === 0) return null;
    return Math.round((stage.count / centeredCount) * 100);
  };

  const centeredLabel = stages[centeredIdx]?.label || stages[0]?.label || 'Leads';

  const hasStartingCohort = originalCohortIds.length > 0;
  const PRE_ADMISSION_STAGES = new Set(['leads', 'applicants', 'submitted', 'admitted']);
  const activeFilterCount = [filters.gender, filters.nycha, filters.channel, filters.source, filters.education, hasStartingCohort ? 'yes' : ''].filter(Boolean).length;

  // ---- Sort toggle ----
  const handleSortClick = (key) => {
    if (!key) return;
    setDrillSortBy(prev => {
      if (prev === key) { setDrillSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
      setDrillSortDir('desc');
      return key;
    });
  };

  const SortIcon = ({ colKey }) => {
    if (!colKey) return null;
    if (drillSortBy !== colKey) return <ChevronsUpDown className="w-3 h-3 ml-1 inline text-slate-300" />;
    return drillSortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 inline text-[#4242EA]" />
      : <ChevronDown className="w-3 h-3 ml-1 inline text-[#4242EA]" />;
  };

  // ---- Drill table row renderer ----
  const statusSelect = (value, options, onChange) => (
    isReadOnly ? (
      <span className="text-xs text-slate-600">{value.replace(/_/g, ' ')}</span>
    ) : (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-36 border-[#E3E3E3]"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
    </Select>
    )
  );

  const renderDrillRow = (row, rowIdx) => {
    const id = selectedStage?.id;
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || '—';
    const email = row.email || '—';
    let cells = [];
    if (id === 'leads') {
      cells = [name, email, row.status || '—', fmt(row.created_at)];
    } else if (id === 'applicants') {
      cells = [name, email, row.nycha_resident ? 'Yes' : 'No', row.referral_source || '—', fmt(row.created_at)];
    } else if (id === 'submitted') {
      cells = [name, email, fmt(row.submitted_at)];
    } else if (id === 'admitted') {
      cells = [name, email, statusSelect(row.program_admission_status || 'pending', ADMISSION_STATUSES, val => handleAdmissionStatusChange(row.stage_id, val, rowIdx)), fmt(row.stage_date)];
    } else if (ENROLLMENT_STAGES.has(id)) {
      cells = [name, email, row.cohort_name || '—', statusSelect(row.enrollment_status || 'in_progress', ENROLLMENT_STATUSES, val => handleStatusChange(row.enrollment_id, val, rowIdx)), fmt(row.enrolled_date)];
    } else if (id === 'any_employment') {
      cells = [name, email, row.role_title || '—', row.company_name || '—', row.employment_type || '—', row.engagement_stage || '—'];
    } else if (id === 'ft_employed') {
      cells = [name, email, row.role_title || '—', row.company_name || '—', fmt(row.start_date)];
    } else if (id === 'bond_eligible') {
      cells = [name, email, row.role_title || '—', row.company_name || '—', row.salary ? `$${Number(row.salary).toLocaleString()}` : '—', fmt(row.start_date)];
    }
    return (
      <tr key={rowIdx} className="hover:bg-[#EFEFEF]/50 border-b border-[#EFEFEF]">
        {cells.map((cell, ci) => <td key={ci} className="py-2 px-3 text-xs text-[#1E1E1E] whitespace-nowrap">{cell}</td>)}
      </tr>
    );
  };

  // ---- North-star metrics ----
  const l3 = stages.find(s => s.id === 'l3_completed')?.count || 0;
  const anyEmp = stages.find(s => s.id === 'any_employment')?.count || 0;
  const ftEmp = stages.find(s => s.id === 'ft_employed')?.count || 0;
  const bondElig = stages.find(s => s.id === 'bond_eligible')?.count || 0;
  const anyPct = l3 > 0 ? Math.round((anyEmp / l3) * 100) : null;
  const ftPct = l3 > 0 ? Math.round((ftEmp / l3) * 100) : null;
  const bondPct = ftEmp > 0 ? Math.round((bondElig / ftEmp) * 100) : null;

  return (
    <div className="space-y-5">
      {/* Header + Filters */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[#1E1E1E] mb-0.5">Program Pipeline</h3>
          <p className="text-xs text-slate-500">All-time funnel from first contact through employment</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" size="sm" className="h-8 text-xs border-[#E3E3E3] gap-1.5" onClick={() => setFiltersOpen(o => !o)}>
              <SlidersHorizontal className="w-3 h-3" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-[#4242EA] text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">{activeFilterCount}</span>
              )}
            </Button>
            {filtersOpen && <>
              <div className="fixed inset-0 z-10" onMouseDown={(e) => { if (!e.target.closest('[data-radix-popper-content-wrapper]')) setFiltersOpen(false); }} />
              <div className="absolute right-0 top-9 z-20 bg-white border border-[#E3E3E3] rounded-lg shadow-lg p-4 w-72 space-y-3 max-h-[70vh] overflow-y-auto">
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5">Starting Cohort</p>
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {l1Cohorts.map(c => {
                      const checked = originalCohortIds.includes(c.cohort_id);
                      return (
                        <label key={c.cohort_id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#FAFAFA] cursor-pointer">
                          <input type="checkbox" checked={checked}
                            onChange={() => setOriginalCohortIds(prev => checked ? prev.filter(id => id !== c.cohort_id) : [...prev, c.cohort_id])}
                            className="w-3 h-3 rounded border-slate-300 text-[#4242EA] focus:ring-[#4242EA]" />
                          <span className="text-xs text-[#1E1E1E]">{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">Education</p>
                  <Select value={filters.education || '__none'} onValueChange={v => setFilters(f => ({ ...f, education: v === '__none' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs border-[#E3E3E3]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs">Any</SelectItem>
                      <SelectItem value="college" className="text-xs">College degree</SelectItem>
                      <SelectItem value="non-college" className="text-xs">No college degree</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">Gender</p>
                  <Select value={filters.gender || '__none'} onValueChange={v => setFilters(f => ({ ...f, gender: v === '__none' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs border-[#E3E3E3]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs">Any</SelectItem>
                      <SelectItem value="male" className="text-xs">Male</SelectItem>
                      <SelectItem value="female" className="text-xs">Female</SelectItem>
                      <SelectItem value="non-binary" className="text-xs">Non-binary</SelectItem>
                      <SelectItem value="other" className="text-xs">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">NYCHA Resident</p>
                  <Select value={filters.nycha || '__none'} onValueChange={v => setFilters(f => ({ ...f, nycha: v === '__none' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs border-[#E3E3E3]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs">Any</SelectItem>
                      <SelectItem value="true" className="text-xs">Yes</SelectItem>
                      <SelectItem value="false" className="text-xs">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">Channel</p>
                  <Select value={filters.channel || '__none'} onValueChange={v => setFilters(f => ({ ...f, channel: v === '__none' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs border-[#E3E3E3]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs">Any</SelectItem>
                      {referralChannels.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">Source</p>
                  <Select value={filters.source || '__none'} onValueChange={v => setFilters(f => ({ ...f, source: v === '__none' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs border-[#E3E3E3]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs">Any</SelectItem>
                      {referralSources.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-slate-500"
                    onClick={() => { setFilters({ gender: '', nycha: '', channel: '', source: '', education: '' }); setOriginalCohortIds([]); }}>Clear filters</Button>
                )}
              </div>
            </>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-10 bg-[#EFEFEF] rounded-lg animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-8">{error}</p>
      ) : (
        <>
          {/* North-star metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-[#E3E3E3] rounded-lg p-4">
              <p className="text-xs text-slate-500 font-medium">Builders Employed</p>
              <p className="text-2xl font-bold text-[#1E1E1E] mt-1">{anyEmp.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-0.5">{anyPct != null ? `${anyPct}% of L3 grads` : 'of L3 grads'}</p>
            </div>
            <div className="bg-white border border-[#E3E3E3] rounded-lg p-4">
              <p className="text-xs text-slate-500 font-medium">FT Employed</p>
              <p className="text-2xl font-bold text-[#1E1E1E] mt-1">{ftEmp.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-0.5">{ftPct != null ? `${ftPct}% of L3 grads` : 'of L3 grads'}</p>
            </div>
            <div className="bg-white border border-[#E3E3E3] rounded-lg p-4">
              <p className="text-xs text-slate-500 font-medium">Bond Eligible</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{bondElig.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-0.5">{bondPct != null ? `${bondPct}% of FT employed` : 'salary > $85k'}</p>
            </div>
            <div className="bg-white border border-[#E3E3E3] rounded-lg p-4">
              <p className="text-xs text-slate-500 font-medium">Avg Salary</p>
              <p className="text-2xl font-bold text-[#1E1E1E] mt-1">{avgSalary != null ? `$${Math.round(avgSalary).toLocaleString()}` : '—'}</p>
              <p className="text-xs text-slate-400 mt-0.5">{avgSalary != null ? 'full-time placements' : 'no salary data yet'}</p>
            </div>
          </div>

          {/* Funnel bars */}
          <Card className="bg-white border border-[#E3E3E3]">
            <CardHeader className="pb-3 border-b border-[#E3E3E3]">
              <CardTitle className="text-base font-semibold text-[#1E1E1E]">Stage Breakdown</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">Click a stage to recenter scale and view people</p>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Column headers */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-32 flex-shrink-0" />
                <div className="flex-1" />
                <div className="w-16 flex-shrink-0" />
                <div className="w-16 flex-shrink-0 text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">vs prev</span>
                </div>
                <div className="w-24 flex-shrink-0 text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">% of {centeredLabel}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {stages.map((stage, idx) => {
                  const colors = STAGE_COLORS[stage.id] || STAGE_COLORS.leads;
                  const barWidth = getBarWidth(idx);
                  const multiplierLabel = getMultiplierLabel(stage, idx);
                  const prev = idx > 0 ? stages[idx - 1] : null;
                  const convPct = getConversionPct(stage, prev);
                  const pctOfCentered = getPctOfCentered(stage);
                  const isCentered = stage.id === (centeredStageId || stages[0]?.id);
                  const isDrillOpen = selectedStage?.id === stage.id;
                  const isDisabled = hasStartingCohort && PRE_ADMISSION_STAGES.has(stage.id);

                  return (
                    <div key={stage.id} className={isDisabled ? 'opacity-30 pointer-events-none' : ''}>
                      <button
                        className={`w-full flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors cursor-pointer
                          ${isDrillOpen ? 'ring-1 ring-[#4242EA] bg-[#4242EA]/5' : 'hover:bg-[#EFEFEF]/60'}`}
                        onClick={() => handleBarClick(stage)}
                        disabled={isDisabled}
                      >
                        {/* Stage label */}
                        <div className="w-32 flex-shrink-0 text-right flex items-center justify-end gap-1">
                          {isCentered && <span className="text-[#4242EA] text-[10px]">●</span>}
                          <span className={`text-xs font-medium ${isCentered ? 'text-[#4242EA]' : 'text-slate-600'}`}>{stage.label}</span>
                        </div>
                        {/* Bar */}
                        <div className="flex-1 relative h-8 bg-[#EFEFEF] rounded overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                            style={{ width: `${barWidth}%`, backgroundColor: colors.bar }}
                          />
                          {multiplierLabel && (
                            <span className="absolute inset-y-0 right-2 flex items-center text-xs font-medium z-10" style={{ color: colors.text }}>
                              {multiplierLabel}
                            </span>
                          )}
                        </div>
                        {/* Count */}
                        <div className="w-16 flex-shrink-0 text-left">
                          <span className="text-xs font-bold text-[#1E1E1E]">{stage.count.toLocaleString()}</span>
                        </div>
                        {/* % from previous */}
                        <div className="w-16 flex-shrink-0 text-right">
                          {convPct !== null && (
                            <Badge className={`text-[10px] border-0 ${convPct >= 50 ? 'bg-green-100 text-green-700' : convPct >= 25 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                              {convPct}%
                            </Badge>
                          )}
                        </div>
                        {/* % of centered stage */}
                        <div className="w-24 flex-shrink-0 text-right">
                          <span className={`text-xs ${isCentered ? 'font-semibold text-[#4242EA]' : 'text-slate-500'}`}>
                            {pctOfCentered != null ? `${pctOfCentered}%` : '—'}
                          </span>
                        </div>
                      </button>
                      {idx < stages.length - 1 && (
                        <div className="flex items-center gap-2 h-2">
                          <div className="w-32 flex-shrink-0" />
                          <div className="flex-1 flex justify-start pl-3">
                            <div className="w-px h-2 bg-[#E3E3E3]" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Drill-down panel */}
          {selectedStage && (
            <Card className="bg-white border border-[#4242EA]/30">
              <CardHeader className="pb-3 border-b border-[#E3E3E3]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div>
                      <CardTitle className="text-base font-semibold text-[#1E1E1E]">{selectedStage.label}</CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">{drillTotal.toLocaleString()} {drillTotal === 1 ? 'person' : 'people'}</p>
                    </div>
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={drillSearchInput}
                        onChange={e => setDrillSearchInput(e.target.value)}
                        className="w-full h-8 pl-8 pr-3 text-xs border border-[#E3E3E3] rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#4242EA] focus:border-[#4242EA]"
                      />
                    </div>
                  </div>
                  <button className="p-1 rounded hover:bg-[#EFEFEF] text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                    onClick={() => setSelectedStage(null)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-0">
                {/* Fixed-height scrollable table */}
                <div ref={drillContainerRef} className="overflow-auto" style={{ height: '480px' }}>
                  <table className="w-full text-sm min-w-max">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-[#E3E3E3]">
                        {(DRILL_COLS[selectedStage.id] || [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }]).map(col => (
                          <th
                            key={col.label}
                            onClick={() => handleSortClick(col.key)}
                            className={`py-2.5 px-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap
                              ${col.key ? 'cursor-pointer hover:text-[#1E1E1E] select-none' : ''}`}
                          >
                            {col.label}<SortIcon colKey={col.key} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drillData.length === 0 && !drillLoading ? (
                        <tr><td colSpan={20} className="py-8 text-center text-sm text-slate-400">No records found</td></tr>
                      ) : (
                        drillData.map((row, i) => renderDrillRow(row, i))
                      )}
                    </tbody>
                  </table>
                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="h-8 flex items-center justify-center">
                    {drillLoading && (
                      <div className="flex gap-1">
                        {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </>
      )}
    </div>
  );
};

export default ProgramMetricsTab;
