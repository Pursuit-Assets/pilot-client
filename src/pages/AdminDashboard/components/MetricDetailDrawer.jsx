import React, { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { Badge } from '../../../components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronRight, Plus } from 'lucide-react';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { cachedAdminApi } from '../../../services/cachedAdminApi';
import TaskDetailPanel from './TaskDetailPanel';
import { GradeBar, letterGrade, ENROLLMENT_BADGE, ENROLLMENT_LABELS } from '../utils/sharedComponents';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7001';
const LEGACY_API = 'https://ai-pilot-admin-dashboard-866060457933.us-central1.run.app/api';

const MiniTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#E3E3E3] rounded-md shadow-sm px-2 py-1 text-[10px]">
      <p className="font-semibold text-[#1E1E1E]">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? Math.round(p.value) : p.value}{p.unit || ''}</p>
      ))}
    </div>
  );
};

const MetricDetailDrawer = ({ metric, cohortRow, nps, mode, cohortName, selectedCohortId, onClose }) => {
  const token = useAuthStore((s) => s.token);
  // Read-only accounts (interview candidates) can drill into a metric but not edit the
  // records behind it — the server refuses those writes.
  const { isReadOnly } = usePermissions();
  const [detailData, setDetailData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  // Attendance inline add
  const [addingAttendanceFor, setAddingAttendanceFor] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceStatus, setAttendanceStatus] = useState('present');
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [excuseReason, setExcuseReason] = useState('');
  const [excuseNote, setExcuseNote] = useState('');
  // Enrollment inline edit
  const [editingEnrollment, setEditingEnrollment] = useState(null);
  const [savingEnrollment, setSavingEnrollment] = useState(null);

  const startDate = cohortRow?.start_date
    ? new Date(cohortRow.start_date).toISOString().split('T')[0]
    : '2024-01-01';
  const endDate = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!metric || !token) return;
    setDetailData(null);
    setLoading(true);
    setExpandedTaskId(null);

    const fetchSummary = () =>
      fetch(`${API_BASE}/api/admin/dashboard/cohort-summary?cohortId=${selectedCohortId}&startDate=${startDate}&endDate=${endDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());

    const fetchDailyBreakdown = () =>
      cachedAdminApi.getCachedCohortDailyBreakdown(cohortName, token, { period: 'all-time' })
        .then(res => res.data?.dailyBreakdown || [])
        .catch(() => []);

    const fetchNpsWeekly = () => {
      const sixMonths = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return fetch(`${LEGACY_API}/surveys/nps/weekly-by-cohort?startDate=${sixMonths}&endDate=${endDate}&mode=program`)
        .then(r => r.json())
        .then(data => (Array.isArray(data) ? data : []).filter(d => d.cohort === cohortName))
        .catch(() => []);
    };

    const fetchNpsResponses = () => {
      const sixMonths = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return fetch(`${LEGACY_API}/surveys/responses?startDate=${sixMonths}&endDate=${endDate}`)
        .then(r => r.json())
        .then(data => (Array.isArray(data) ? data : [])
          .filter(r => r.cohort === cohortName)
          .sort((a, b) => new Date(b.task_date?.value || b.task_date || 0) - new Date(a.task_date?.value || a.task_date || 0)))
        .catch(() => []);
    };

    if (metric === 'attendance') {
      Promise.all([fetchSummary(), fetchDailyBreakdown()])
        .then(([summary, daily]) => {
          const builders = summary.success ? (summary.builders || []) : [];
          const atRisk = builders.filter(b => b.attendance_percentage < 80).sort((a, b) => a.attendance_percentage - b.attendance_percentage);
          const avg = builders.length > 0 ? Math.round(builders.reduce((s, b) => s + (b.attendance_percentage || 0), 0) / builders.length) : 0;
          // Build weekly trend from daily
          const weekMap = {};
          daily.forEach(d => {
            const wk = d.weekNumber || d.dayNumber ? Math.ceil((d.dayNumber || 1) / 5) : null;
            if (wk == null) return;
            const key = `W${wk}`;
            if (!weekMap[key]) weekMap[key] = { rates: [], week: wk };
            if (d.attendanceRate != null) weekMap[key].rates.push(d.attendanceRate);
          });
          const trend = Object.entries(weekMap)
            .map(([name, { rates, week }]) => ({ name, week, rate: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) }))
            .sort((a, b) => a.week - b.week);
          setDetailData({ type: 'attendance', builders, atRisk, avg, trend });
        })
        .catch(() => setDetailData(null))
        .finally(() => setLoading(false));
    } else if (metric === 'tasks' || metric === 'deliverables') {
      fetchSummary()
        .then(data => {
          if (!data.success) return;
          let tasks = data.taskDetails || [];
          if (metric === 'deliverables') {
            tasks = tasks.filter(t => ['document', 'video', 'link'].includes(t.deliverable_type));
          }
          // Sort by most recent first
          tasks.sort((a, b) => {
            const da = a.assigned_date?.value || a.assigned_date || '';
            const db2 = b.assigned_date?.value || b.assigned_date || '';
            return db2.localeCompare(da);
          });
          // Build weekly trend
          const weekMap = {};
          tasks.forEach(t => {
            const wk = t.day_number ? Math.ceil(t.day_number / 5) : null;
            if (wk == null) return;
            const key = `W${wk}`;
            if (!weekMap[key]) weekMap[key] = { rates: [], week: wk };
            if (t.submission_rate != null) weekMap[key].rates.push(t.submission_rate);
          });
          const trend = Object.entries(weekMap)
            .map(([name, { rates, week }]) => ({ name, week, rate: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) }))
            .sort((a, b) => a.week - b.week);
          setDetailData({ type: metric, tasks, trend });
        })
        .catch(() => setDetailData(null))
        .finally(() => setLoading(false));
    } else if (metric === 'nps') {
      Promise.all([fetchNpsWeekly(), fetchNpsResponses()])
        .then(([weekly, responses]) => {
          const scores = responses.map(r => r.referral_likelihood).filter(s => s != null);
          const trend = weekly
            .map(d => ({ name: `W${d.program_week}`, week: d.program_week, nps: Math.round(d.nps), n: d.total_responses }))
            .sort((a, b) => a.week - b.week);
          setDetailData({
            type: 'nps', responses, trend,
            promoters: scores.filter(s => s >= 9).length,
            detractors: scores.filter(s => s <= 6).length,
            passives: scores.length - scores.filter(s => s >= 9).length - scores.filter(s => s <= 6).length,
            total: scores.length,
          });
        })
        .catch(() => setDetailData(null))
        .finally(() => setLoading(false));
    } else if (metric === 'enrolled' || metric === 'active') {
      fetchSummary()
        .then(data => {
          if (!data.success) return;
          const builders = (data.builders || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setDetailData({ type: metric, builders });
        })
        .catch(() => setDetailData(null))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [metric, token, selectedCohortId, cohortName]);

  const handleAddAttendance = async (builder) => {
    if (attendanceStatus === 'excused' && !excuseReason) return;
    setSavingAttendance(true);
    try {
      if (attendanceStatus === 'excused') {
        await fetch(`${API_BASE}/api/admin/excuses/mark-excused`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            userId: builder.user_id,
            absenceDate: attendanceDate,
            excuseReason,
            excuseDetails: excuseNote || '',
            staffNotes: '',
          }),
        });
      } else {
        await fetch(`${API_BASE}/api/admin/attendance/manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            userId: builder.user_id,
            date: attendanceDate,
            status: attendanceStatus,
            cohort: cohortName,
          }),
        });
      }
      setAddingAttendanceFor(null);
      setExcuseReason('');
      setExcuseNote('');
    } catch (e) {
      console.error('Failed to add attendance:', e);
    }
    setSavingAttendance(false);
  };

  const handleEnrollmentSave = async (builder, newStatus) => {
    setSavingEnrollment(builder.user_id);
    setEditingEnrollment(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboard/builder-enrollment/${builder.enrollment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success && detailData?.builders) {
        const returnedDate = data.enrollment?.withdrawal_date || null;
        setDetailData(prev => ({
          ...prev,
          builders: prev.builders.map(b =>
            b.user_id === builder.user_id ? { ...b, enrollment_status: newStatus, withdrawal_date: returnedDate } : b
          ),
        }));
      }
    } catch (e) {
      console.error('Enrollment update failed:', e);
    }
    setSavingEnrollment(null);
  };

  const handleWithdrawalDateSave = async (builder, newDate) => {
    setSavingEnrollment(builder.user_id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboard/builder-enrollment/${builder.enrollment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: builder.enrollment_status, withdrawalDate: newDate }),
      });
      const data = await res.json();
      if (data.success && detailData?.builders) {
        const returnedDate = data.enrollment?.withdrawal_date || newDate;
        setDetailData(prev => ({
          ...prev,
          builders: prev.builders.map(b =>
            b.user_id === builder.user_id ? { ...b, withdrawal_date: returnedDate } : b
          ),
        }));
      }
    } catch (e) {
      console.error('Withdrawal date update failed:', e);
    }
    setSavingEnrollment(null);
  };

  const TITLES = {
    enrolled: 'Enrolled Builders',
    active: 'Active Builders',
    attendance: 'Attendance',
    tasks: 'Task Completion',
    deliverables: 'Deliverables',
    nps: 'NPS',
  };

  const TrendChart = ({ data, dataKey, color = '#4242EA', unit = '%' }) => {
    if (!data || data.length < 2) return null;
    return (
      <div className="mb-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Weekly Trend</p>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <Tooltip content={<MiniTooltip />} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 2 }} unit={unit} name={TITLES[metric] || dataKey} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <Sheet open={!!metric} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0 z-[70]">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-[#E3E3E3]">
          <SheetTitle className="text-[#1E1E1E] font-semibold">{TITLES[metric] || metric}</SheetTitle>
          <p className="text-xs text-slate-400 mt-0.5">{cohortName} — {mode === 'last_week' ? 'Last Week' : 'All Time'}</p>
        </SheetHeader>

        <div className="px-5 py-4 space-y-3">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-[#EFEFEF] rounded animate-pulse" />)}
            </div>
          )}

          {/* ── ATTENDANCE ── */}
          {!loading && detailData?.type === 'attendance' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-50 rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-green-600">{detailData.avg}%</p>
                  <p className="text-[10px] text-green-700">Cohort Average</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-red-500">{detailData.atRisk.length}</p>
                  <p className="text-[10px] text-red-600">Below 80%</p>
                </div>
              </div>
              <TrendChart data={detailData.trend} dataKey="rate" color="#10B981" />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">All Builders ({detailData.builders.length})</p>
              <div className="space-y-0 divide-y divide-[#EFEFEF] border border-[#E3E3E3] rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                {detailData.builders
                  .sort((a, b) => (a.attendance_percentage || 0) - (b.attendance_percentage || 0))
                  .map(b => (
                  <div key={b.user_id} className="flex items-center justify-between px-3 py-2 hover:bg-[#FAFAFA]">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1E1E1E] truncate">{b.name}</p>
                      <p className="text-[10px] text-slate-400">{b.days_attended}/{b.total_curriculum_days} days</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${
                        b.attendance_percentage >= 80 ? 'text-green-600' :
                        b.attendance_percentage >= 60 ? 'text-yellow-600' : 'text-red-500'
                      }`}>{b.attendance_percentage}%</span>
                      {!isReadOnly && (
                        <button
                          onClick={() => setAddingAttendanceFor(addingAttendanceFor === b.user_id ? null : b.user_id)}
                          className="p-0.5 rounded text-slate-400 hover:text-[#4242EA] hover:bg-[#EFEFEF]"
                          title="Add attendance record"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                    {addingAttendanceFor === b.user_id && (
                      <div className="w-full mt-1.5 pt-1.5 border-t border-[#EFEFEF] space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}
                            className="text-[10px] border border-[#E3E3E3] rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-[#4242EA] flex-1" />
                          <select value={attendanceStatus} onChange={e => { setAttendanceStatus(e.target.value); setExcuseReason(''); setExcuseNote(''); }}
                            className="text-[10px] border border-[#E3E3E3] rounded px-1 py-0.5 bg-white focus:outline-none">
                            <option value="present">Present</option>
                            <option value="late">Late</option>
                            <option value="excused">Excused</option>
                          </select>
                        </div>
                        {attendanceStatus === 'excused' && (
                          <div className="space-y-1.5">
                            <select value={excuseReason} onChange={e => setExcuseReason(e.target.value)}
                              className={`w-full text-[10px] px-1.5 py-0.5 border rounded bg-white focus:outline-none focus:border-[#4242EA] ${!excuseReason ? 'border-amber-300' : 'border-[#E3E3E3]'}`}>
                              <option value="">Select excuse type *</option>
                              {['Sick', 'Personal', 'Program Event', 'Technical Issue', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <input type="text" value={excuseNote} onChange={e => setExcuseNote(e.target.value)} placeholder="Optional note..."
                              className="w-full text-[10px] px-1.5 py-0.5 border border-[#E3E3E3] rounded bg-white focus:outline-none focus:border-[#4242EA]" />
                          </div>
                        )}
                        <div className="flex justify-end">
                          <button onClick={() => handleAddAttendance(b)} disabled={savingAttendance || (attendanceStatus === 'excused' && !excuseReason)}
                            className="text-[10px] px-2 py-0.5 bg-[#4242EA] text-white rounded hover:bg-[#3535c8] disabled:opacity-50">
                            {savingAttendance ? '...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── TASKS / DELIVERABLES ── */}
          {!loading && (detailData?.type === 'tasks' || detailData?.type === 'deliverables') && (
            <>
              <TrendChart data={detailData.trend} dataKey="rate" color="#4242EA" />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                {detailData.type === 'tasks' ? 'All Tasks' : 'All Deliverables'} ({detailData.tasks.length})
              </p>
              <div className="border border-[#E3E3E3] rounded-md overflow-hidden max-h-[450px] overflow-y-auto">
                <div className="divide-y divide-[#EFEFEF]">
                  {detailData.tasks.map(task => {
                    const date = task.assigned_date?.value || task.assigned_date || '';
                    const dateStr = date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                    const grade = task.avg_score ? letterGrade(task.avg_score) : null;
                    const isExpanded = expandedTaskId === task.task_id;
                    return (
                      <React.Fragment key={task.task_id}>
                        <button
                          type="button"
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.task_id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FAFAFA] ${isExpanded ? 'bg-[#FAFAFA]' : ''}`}
                        >
                          <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            <ChevronRight size={11} className="text-slate-400" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[#1E1E1E] truncate">{task.task_title}</p>
                            <p className="text-[10px] text-slate-400">{dateStr} · Day {task.day_number}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {grade && (
                              <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${
                                grade.startsWith('A') ? 'bg-green-100 text-green-700' :
                                grade.startsWith('B') ? 'bg-blue-100 text-blue-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>{grade}</span>
                            )}
                            <span className={`text-xs font-semibold ${
                              task.submission_rate >= 80 ? 'text-green-600' :
                              task.submission_rate >= 50 ? 'text-yellow-600' : 'text-red-500'
                            }`}>{task.submission_rate}%</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-[#E3E3E3]">
                            <TaskDetailPanel task={task} />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── NPS ── */}
          {!loading && detailData?.type === 'nps' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-green-600">{detailData.promoters}</p>
                  <p className="text-[10px] text-green-700">Promoters</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-yellow-600">{detailData.passives}</p>
                  <p className="text-[10px] text-yellow-700">Passives</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-red-500">{detailData.detractors}</p>
                  <p className="text-[10px] text-red-600">Detractors</p>
                </div>
              </div>
              <TrendChart data={detailData.trend} dataKey="nps" color="#4242EA" unit="" />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">All Responses ({detailData.responses.length})</p>
              <div className="border border-[#E3E3E3] rounded-md overflow-hidden max-h-[400px] overflow-y-auto divide-y divide-[#EFEFEF]">
                {detailData.responses.map((r, i) => {
                  const score = r.referral_likelihood;
                  const date = r.task_date?.value || r.task_date || '';
                  const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                  return (
                    <div key={r.id || i} className="px-3 py-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          score >= 9 ? 'bg-green-100 text-green-700' :
                          score <= 6 ? 'bg-red-100 text-red-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{score}</span>
                        <span className="text-xs font-medium text-[#1E1E1E]">{r.user_name}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{dateStr}</span>
                      </div>
                      {r.what_we_did_well && <p className="text-[11px] text-slate-600"><span className="text-green-600 font-medium">Well:</span> {r.what_we_did_well}</p>}
                      {r.what_to_improve && <p className="text-[11px] text-slate-600"><span className="text-red-500 font-medium">Improve:</span> {r.what_to_improve}</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── ENROLLED / ACTIVE ── */}
          {!loading && (detailData?.type === 'enrolled' || detailData?.type === 'active') && detailData.builders && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#FAFAFA] rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-[#1E1E1E]">{cohortRow?.original_enrolled ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">Original</p>
                </div>
                <div className="bg-[#FAFAFA] rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-[#4242EA]">{cohortRow?.enrolled ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">Active</p>
                </div>
                <div className="bg-[#FAFAFA] rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-[#1E1E1E]">
                    {cohortRow?.original_enrolled && cohortRow?.enrolled
                      ? `${Math.round((cohortRow.enrolled / cohortRow.original_enrolled) * 100)}%`
                      : '—'}
                  </p>
                  <p className="text-[10px] text-slate-500">Retention</p>
                </div>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">All Builders ({detailData.builders.length})</p>
              <div className="border border-[#E3E3E3] rounded-md overflow-hidden max-h-[450px] overflow-y-auto divide-y divide-[#EFEFEF]">
                {detailData.builders.map(b => (
                  <div key={b.user_id} className="flex items-center justify-between px-3 py-2 hover:bg-[#FAFAFA]">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1E1E1E] truncate">{b.name}</p>
                      {b.email && <p className="text-[10px] text-slate-400 truncate">{b.email}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${
                        b.attendance_percentage >= 80 ? 'text-green-600' :
                        b.attendance_percentage >= 60 ? 'text-yellow-600' : 'text-red-500'
                      }`}>{b.attendance_percentage}%</span>
                      {savingEnrollment === b.user_id ? (
                        <span className="text-[10px] text-slate-400">...</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {isReadOnly ? (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ENROLLMENT_BADGE[b.enrollment_status || 'in_progress']}`}>
                              {ENROLLMENT_LABELS[b.enrollment_status || 'in_progress']}
                            </span>
                          ) : (
                            <select
                              value={b.enrollment_status || 'in_progress'}
                              onChange={(e) => handleEnrollmentSave(b, e.target.value)}
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
                                value={b.withdrawal_date ? b.withdrawal_date.split('T')[0] : ''}
                                onChange={(e) => handleWithdrawalDateSave(b, e.target.value)}
                                readOnly={isReadOnly}
                                className={`text-[9px] text-red-500 bg-white border border-red-200 rounded px-1 py-0.5 focus:outline-none focus:border-red-400 w-28 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MetricDetailDrawer;
