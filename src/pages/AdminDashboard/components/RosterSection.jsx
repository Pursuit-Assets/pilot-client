import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import {
  ChevronUp, ChevronDown, FileText, CalendarDays, Search, ShieldCheck,
} from 'lucide-react';
import BuilderDrawer from './BuilderDrawer';
import BuilderLogModal from './BuilderLogModal';
import AttendanceManagement from '../../../components/AttendanceManagement/AttendanceManagement';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  GradeBar, SortHeader, ENROLLMENT_BADGE, ENROLLMENT_LABELS,
} from '../utils/sharedComponents';

const API_URL = import.meta.env.VITE_API_URL;
const LEGACY_API = 'https://ai-pilot-admin-dashboard-866060457933.us-central1.run.app/api';
const BATCH = 20;

const verifyKey = (cohortId) => `enrollment_verified_${cohortId}`;

const RosterSection = ({ selectedCohortId, cohorts }) => {
  const token = useAuthStore((s) => s.token);
  // Read-only accounts (interview candidates) see the roster and its statuses, but every
  // control that would change one is withheld — the server refuses those writes.
  const { isReadOnly } = usePermissions();
  const endDate = new Date().toISOString().split('T')[0];
  // Use cohort start_date if available, otherwise fall back to a generous default
  const cohortObj = cohorts.find(c => c.cohort_id === selectedCohortId);
  const startDate = cohortObj?.start_date
    ? new Date(cohortObj.start_date).toISOString().split('T')[0]
    : '2024-01-01';
  const [loading, setLoading] = useState(true);
  const [builders, setBuilders] = useState([]);
  const [builderSort, setBuilderSort] = useState({ key: 'attendance_percentage', dir: 'desc' });
  const [selectedBuilder, setSelectedBuilder] = useState(null);
  const [logModalBuilder, setLogModalBuilder] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [attendanceBuilder, setAttendanceBuilder] = useState(null);
  const [savingEnrollmentId, setSavingEnrollmentId] = useState(null);
  const [editingEnrollmentId, setEditingEnrollmentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [enrollmentFilter, setEnrollmentFilter] = useState('active');
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const sentinelRef = useRef(null);
  const [verifyDrawerOpen, setVerifyDrawerOpen] = useState(false);

  // NPS data per builder
  const [npsResponses, setNpsResponses] = useState([]);

  const [lastVerified, setLastVerified] = useState(() => {
    if (typeof window === 'undefined') return null;
    const v = localStorage.getItem(verifyKey(selectedCohortId));
    return v ? new Date(v) : null;
  });

  useEffect(() => {
    const v = localStorage.getItem(verifyKey(selectedCohortId));
    setLastVerified(v ? new Date(v) : null);
  }, [selectedCohortId]);

  const daysSinceVerified = lastVerified
    ? Math.floor((Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const needsVerification = daysSinceVerified === null || daysSinceVerified >= 7;

  const handleVerify = () => {
    const now = new Date();
    localStorage.setItem(verifyKey(selectedCohortId), now.toISOString());
    setLastVerified(now);
    setVerifyDrawerOpen(false);
  };

  const selectedCohort = useMemo(
    () => cohorts.find(c => c.cohort_id === selectedCohortId),
    [cohorts, selectedCohortId]
  );

  // Fetch builders
  useEffect(() => {
    if (!selectedCohortId || !token) return;
    setLoading(true);
    setVisibleCount(BATCH);
    fetch(`${API_URL}/api/admin/dashboard/cohort-summary?cohortId=${selectedCohortId}&startDate=${startDate}&endDate=${endDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setBuilders(data.success ? (data.builders || []) : []))
      .catch(() => setBuilders([]))
      .finally(() => setLoading(false));
  }, [selectedCohortId, startDate, endDate, token, refreshKey]);

  // Fetch NPS responses for emoji column
  useEffect(() => {
    if (!selectedCohort?.name) return;
    const today = new Date().toISOString().split('T')[0];
    const sixMonths = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    fetch(`${LEGACY_API}/surveys/responses?startDate=${sixMonths}&endDate=${today}`)
      .then(r => r.json())
      .then(data => setNpsResponses(Array.isArray(data) ? data.filter(r => r.cohort === selectedCohort.name) : []))
      .catch(() => setNpsResponses([]));
  }, [selectedCohort?.name]);

  // Build NPS map: builder name → latest score
  const npsMap = useMemo(() => {
    const map = {};
    npsResponses
      .sort((a, b) => new Date(b.task_date?.value || b.task_date || 0) - new Date(a.task_date?.value || a.task_date || 0))
      .forEach(r => {
        const name = r.user_name;
        if (name && !map[name] && r.referral_likelihood != null) {
          map[name] = r.referral_likelihood;
        }
      });
    return map;
  }, [npsResponses]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(c => c + BATCH);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading]);

  useEffect(() => { setVisibleCount(BATCH); }, [searchQuery]);

  const sortedBuilders = useMemo(() => {
    return [...builders].sort((a, b) => {
      let av, bv;
      if (builderSort.key === 'nps') {
        av = npsMap[a.name] ?? -999;
        bv = npsMap[b.name] ?? -999;
      } else {
        av = a[builderSort.key] ?? 0;
        bv = b[builderSort.key] ?? 0;
      }
      if (typeof av === 'string') return builderSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return builderSort.dir === 'asc' ? (av - bv) : (bv - av);
    });
  }, [builders, builderSort, npsMap]);

  const filteredBuilders = useMemo(() => {
    let list = sortedBuilders;
    if (enrollmentFilter === 'active') {
      list = list.filter(b => b.enrollment_status === 'in_progress' || b.enrollment_status === 'completed');
    } else if (enrollmentFilter === 'withdrawn') {
      list = list.filter(b => b.enrollment_status === 'withdrawn' || b.enrollment_status === 'dismissed');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => b.name?.toLowerCase().includes(q) || b.email?.toLowerCase().includes(q));
    }
    return list;
  }, [sortedBuilders, searchQuery, enrollmentFilter]);

  const visibleBuilders = filteredBuilders.slice(0, visibleCount);

  const toggleSort = (key) => {
    setBuilderSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const handleQuickEnrollmentSave = async (builder, newStatus) => {
    setSavingEnrollmentId(builder.user_id);
    setEditingEnrollmentId(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/builder-enrollment/${builder.enrollment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setBuilders(prev => prev.map(b =>
          b.user_id === builder.user_id ? { ...b, enrollment_status: newStatus, withdrawal_date: data.data?.withdrawal_date || b.withdrawal_date } : b
        ));
      }
    } catch (e) {
      console.error('Enrollment update failed:', e);
    } finally {
      setSavingEnrollmentId(null);
    }
  };

  const handleWithdrawalDateSave = async (builder, newDate) => {
    try {
      await fetch(`${API_URL}/api/admin/dashboard/builder-enrollment/${builder.enrollment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'withdrawn', withdrawalDate: newDate }),
      });
      setBuilders(prev => prev.map(b =>
        b.user_id === builder.user_id ? { ...b, withdrawal_date: newDate } : b
      ));
    } catch (e) {
      console.error('Withdrawal date update failed:', e);
    }
  };

  // NPS indicator: green circle ≥9 (promoter), yellow 7-8 (passive), red ≤6 (detractor)
  const getNpsIndicator = (builderName) => {
    const score = npsMap[builderName];
    if (score == null) return null;
    const color = score >= 9 ? 'bg-green-500' : score >= 7 ? 'bg-yellow-400' : 'bg-red-500';
    return (
      <span title={`NPS: ${score}`} className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
    );
  };

  return (
    <div className="space-y-4">
      {/* Enrollment verification banner */}
      {needsVerification ? (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              {daysSinceVerified === null
                ? 'Enrollment has not been verified yet this week.'
                : `Enrollment not verified — last verified ${daysSinceVerified} day${daysSinceVerified !== 1 ? 's' : ''} ago.`}
            </p>
          </div>
          {!isReadOnly && (
            <button
              onClick={() => setVerifyDrawerOpen(true)}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors"
            >
              Verify Enrollment
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <ShieldCheck size={14} />
          <span>Enrollment verified {daysSinceVerified === 0 ? 'today' : `${daysSinceVerified} day${daysSinceVerified !== 1 ? 's' : ''} ago`}</span>
        </div>
      )}

      <Card className="bg-white border border-[#E3E3E3]">
        <CardHeader className="pb-3 border-b border-[#E3E3E3]">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold text-[#1E1E1E] flex-shrink-0">Builder Roster</CardTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex rounded-md border border-[#E3E3E3] overflow-hidden text-[10px] font-medium flex-shrink-0">
                {[{ key: 'active', label: 'Active' }, { key: 'all', label: 'All' }, { key: 'withdrawn', label: 'Withdrawn' }].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setEnrollmentFilter(f.key)}
                    className={`px-2.5 py-1 transition-colors ${enrollmentFilter === f.key ? 'bg-[#4242EA] text-white' : 'bg-white text-slate-500 hover:bg-[#FAFAFA]'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-shrink-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search builders..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-[#E3E3E3] rounded-md bg-white focus:border-[#4242EA] focus:outline-none w-48"
                />
              </div>
              <Badge className="bg-[#EFEFEF] text-slate-600 text-xs w-[110px] text-center flex-shrink-0 justify-center">
                {filteredBuilders.length} of {builders.length}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-[#EFEFEF] rounded animate-pulse" />)}</div>
          ) : builders.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No builder data.</p>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="text-left text-slate-400 text-xs uppercase tracking-wide border-b border-[#E3E3E3]">
                      <SortHeader label="Builder" sortKey="name" sort={builderSort} onSort={toggleSort} className="pr-3" />
                      <SortHeader label="NPS" sortKey="nps" sort={builderSort} onSort={toggleSort} className="px-1 text-center w-8" />
                      <SortHeader label="Attendance" sortKey="attendance_percentage" sort={builderSort} onSort={toggleSort} className="px-2 text-center" />
                      <SortHeader label="Tasks" sortKey="tasks_completed_percentage" sort={builderSort} onSort={toggleSort} className="px-2 text-center" />
                      <SortHeader label="Feedback" sortKey="total_peer_feedback_count" sort={builderSort} onSort={toggleSort} className="px-2 text-center" />
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide">Grade Dist.</th>
                      <SortHeader label="Videos" sortKey="video_tasks_completed" sort={builderSort} onSort={toggleSort} className="px-2 text-center" />
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide text-left">Enrollment</th>
                      <th className="pb-2 px-2 font-medium text-slate-400 text-xs uppercase tracking-wide text-center">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF]">
                    {visibleBuilders.map(b => (
                      <tr key={b.user_id} className="hover:bg-[#EFEFEF]/50 transition-colors">
                        <td className="py-2 pr-3">
                          <button
                            onClick={() => setSelectedBuilder(b)}
                            className="font-medium text-[#4242EA] text-xs hover:underline text-left"
                          >
                            {b.name}
                          </button>
                          {b.email && <p className="text-[10px] text-slate-400">{b.email}</p>}
                        </td>
                        <td className="py-2 px-1 text-center">{getNpsIndicator(b.name)}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-xs font-semibold ${
                            b.attendance_percentage >= 80 ? 'text-green-600' :
                            b.attendance_percentage >= 60 ? 'text-yellow-600' : 'text-red-500'
                          }`}>{b.attendance_percentage}%</span>
                          <p className="text-[10px] text-slate-400">{b.days_attended}/{b.total_curriculum_days}</p>
                        </td>
                        <td className="py-2 px-2 text-center text-xs text-slate-600">{b.tasks_completed_percentage}%</td>
                        <td className="py-2 px-2 text-center text-xs text-slate-600">{b.total_peer_feedback_count}</td>
                        <td className="py-2 px-2 w-28">
                          <GradeBar task={{
                            grade_aplus_count: b.grade_aplus_count, grade_a_count: b.grade_a_count,
                            grade_aminus_count: b.grade_aminus_count, grade_bplus_count: b.grade_bplus_count,
                            grade_b_count: b.grade_b_count, grade_bminus_count: b.grade_bminus_count,
                            grade_cplus_count: b.grade_cplus_count, grade_c_count: b.grade_c_count,
                          }} />
                        </td>
                        <td className="py-2 px-2 text-center">
                          {b.video_tasks_completed > 0 ? (
                            <button onClick={() => setSelectedBuilder(b)} className="text-xs text-[#4242EA] hover:underline font-medium">
                              {b.video_tasks_completed}{b.avg_video_score ? ` (${Math.round(b.avg_video_score)}%)` : ''}
                            </button>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            {savingEnrollmentId === b.user_id ? (
                              <span className="text-[10px] text-slate-400">Saving...</span>
                            ) : isReadOnly ? (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ENROLLMENT_BADGE[b.enrollment_status || 'in_progress']}`}>
                                {ENROLLMENT_LABELS[b.enrollment_status || 'in_progress']}
                              </span>
                            ) : (
                              <select
                                value={b.enrollment_status || 'in_progress'}
                                onChange={(e) => handleQuickEnrollmentSave(b, e.target.value)}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer focus:outline-none appearance-none ${ENROLLMENT_BADGE[b.enrollment_status || 'in_progress']}`}
                              >
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="withdrawn">Withdrawn</option>
                                <option value="deferred">Deferred</option>
                              </select>
                            )}
                            {b.enrollment_status === 'withdrawn' && (
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-red-400">On:</span>
                                <input
                                  type="date"
                                  value={b.withdrawal_date ? (typeof b.withdrawal_date === 'string' ? b.withdrawal_date.split('T')[0] : new Date(b.withdrawal_date).toISOString().split('T')[0]) : ''}
                                  onChange={(e) => handleWithdrawalDateSave(b, e.target.value)}
                                  readOnly={isReadOnly}
                                  className={`text-[9px] text-red-500 bg-white border border-red-200 rounded px-1 py-0.5 focus:outline-none focus:border-red-400 w-28 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                                  title="Withdrawal date"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          {/* Both actions open write-only surfaces (attendance editing, new
                              builder log), so they're withheld from read-only accounts. */}
                          <div className="flex items-center gap-1 justify-center">
                            {!isReadOnly && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAttendanceBuilder(b); }}
                                  className="p-1 rounded text-slate-400 hover:text-[#4242EA] hover:bg-[#EFEFEF] transition-colors"
                                  title="Manage attendance"
                                >
                                  <CalendarDays size={13} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setLogModalBuilder(b); }}
                                  className="p-1 rounded text-slate-400 hover:text-[#4242EA] hover:bg-[#EFEFEF] transition-colors"
                                  title="Add log"
                                >
                                  <FileText size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {visibleCount < filteredBuilders.length && (
                <div ref={sentinelRef} className="flex justify-center py-4">
                  <div className="text-xs text-slate-400">
                    Showing {visibleCount} of {filteredBuilders.length} builders
                  </div>
                </div>
              )}

              {filteredBuilders.length === 0 && searchQuery && (
                <p className="text-sm text-slate-400 text-center py-6">No builders match "{searchQuery}"</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBuilder && (
        <BuilderDrawer
          builder={selectedBuilder}
          startDate={startDate}
          endDate={endDate}
          selectedLevel={selectedCohort?.legacyName || ''}
          cohortId={selectedCohortId}
          onClose={() => setSelectedBuilder(null)}
          onLogSaved={() => setRefreshKey(k => k + 1)}
        />
      )}

      <BuilderLogModal
        open={!!logModalBuilder}
        onOpenChange={(open) => { if (!open) setLogModalBuilder(null); }}
        builder={logModalBuilder}
        cohortId={selectedCohortId}
        cohorts={cohorts}
        onSaved={() => setRefreshKey(k => k + 1)}
      />

      {/* Enrollment Verification Drawer */}
      <Sheet open={verifyDrawerOpen} onOpenChange={setVerifyDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-[#E3E3E3]">
            <SheetTitle className="text-[#1E1E1E] font-semibold">
              Verify Enrollment — {selectedCohort?.name}
            </SheetTitle>
            <p className="text-xs text-slate-500 mt-1">
              Review and confirm each builder's enrollment status, then click Confirm Verification.
            </p>
          </SheetHeader>
          <div className="flex flex-col h-[calc(100vh-130px)]">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-[#EFEFEF] rounded animate-pulse" />)}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 text-xs uppercase tracking-wide border-b border-[#E3E3E3]">
                      <th className="pb-2 pr-4 font-medium">Builder</th>
                      <th className="pb-2 px-2 font-medium">Attendance</th>
                      <th className="pb-2 pl-2 font-medium text-left">Enrollment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF]">
                    {sortedBuilders.map(b => (
                      <tr key={b.user_id} className="hover:bg-[#EFEFEF]/50 transition-colors">
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-[#1E1E1E] text-xs">{b.name}</p>
                          {b.email && <p className="text-[10px] text-slate-400">{b.email}</p>}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`text-xs font-semibold ${
                            b.attendance_percentage >= 80 ? 'text-green-600' :
                            b.attendance_percentage >= 60 ? 'text-yellow-600' : 'text-red-500'
                          }`}>{b.attendance_percentage}%</span>
                        </td>
                        <td className="py-2.5 pl-2">
                          <div className="flex items-center gap-1.5">
                            {savingEnrollmentId === b.user_id ? (
                              <span className="text-[10px] text-slate-400">Saving...</span>
                            ) : editingEnrollmentId === b.user_id ? (
                              <select
                                autoFocus
                                defaultValue={b.enrollment_status || 'in_progress'}
                                onChange={(e) => handleQuickEnrollmentSave(b, e.target.value)}
                                onBlur={() => setEditingEnrollmentId(null)}
                                className="text-[10px] border border-[#4242EA] rounded px-1.5 py-0.5 bg-white text-[#1E1E1E] cursor-pointer focus:outline-none"
                              >
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="withdrawn">Withdrawn</option>
                                <option value="deferred">Deferred</option>
                              </select>
                            ) : (
                              <button
                                onClick={() => setEditingEnrollmentId(b.user_id)}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${ENROLLMENT_BADGE[b.enrollment_status || 'in_progress']}`}
                                title="Click to edit"
                              >
                                {ENROLLMENT_LABELS[b.enrollment_status || 'in_progress']}
                              </button>
                            )}
                            {b.enrollment_status === 'withdrawn' && (
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-red-400">On:</span>
                                <input
                                  type="date"
                                  value={b.withdrawal_date ? (typeof b.withdrawal_date === 'string' ? b.withdrawal_date.split('T')[0] : new Date(b.withdrawal_date).toISOString().split('T')[0]) : ''}
                                  onChange={(e) => handleWithdrawalDateSave(b, e.target.value)}
                                  className="text-[9px] text-red-500 bg-white border border-red-200 rounded px-1 py-0.5 focus:outline-none focus:border-red-400 w-28 cursor-pointer"
                                  title="Withdrawal date"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t border-[#E3E3E3] px-6 py-4 bg-white flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{builders.length} builders in {selectedCohort?.name}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setVerifyDrawerOpen(false)}
                  className="px-4 py-2 text-sm border border-[#E3E3E3] rounded-md text-slate-600 hover:border-slate-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerify}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#4242EA] text-white rounded-md hover:bg-[#3535c8] transition-colors"
                >
                  <ShieldCheck size={14} />
                  Confirm Verification
                </button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!attendanceBuilder} onOpenChange={(open) => { if (!open) setAttendanceBuilder(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-[#E3E3E3]">
            <SheetTitle className="text-[#1E1E1E] font-semibold">
              Attendance — {attendanceBuilder?.name}
            </SheetTitle>
          </SheetHeader>
          <div className="px-6 py-4">
            <AttendanceManagement
              compact
              cohortName={selectedCohort?.name || ''}
              initialBuilder={attendanceBuilder ? {
                id: attendanceBuilder.user_id,
                firstName: attendanceBuilder.name?.split(' ')[0] || '',
                lastName: attendanceBuilder.name?.split(' ').slice(1).join(' ') || '',
                cohort: selectedCohort?.name || '',
                email: attendanceBuilder.email,
              } : null}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default RosterSection;
