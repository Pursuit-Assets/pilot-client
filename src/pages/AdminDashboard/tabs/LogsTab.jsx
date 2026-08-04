import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import {
  ChevronRight, ChevronDown, AlertTriangle, ArrowRight, Plus, MessageSquarePlus,
  Search, FileText, BookOpen, Flag, ThumbsUp, ThumbsDown, Minus, RefreshCw,
} from 'lucide-react';
import BuilderLogModal from '../components/BuilderLogModal';
import BuilderDrawer from '../components/BuilderDrawer';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';

const API_URL = import.meta.env.VITE_API_URL;

// Collapsible section header used by every category
const SectionHeader = ({ icon: Icon, iconColor, label, count, badgeClass, collapsed, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex items-center gap-1.5 mb-2 group"
  >
    <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>
      <ChevronRight size={11} className="text-slate-400" />
    </span>
    <Icon size={12} className={iconColor} />
    <span className="text-[10px] font-semibold text-slate-400 uppercase">{label}</span>
    <Badge className={`text-[10px] ${badgeClass}`}>{count}</Badge>
  </button>
);

const CHANGE_TYPE_COLORS = {
  added:   'bg-emerald-50 text-emerald-700',
  changed: 'bg-emerald-50 text-emerald-700',
  removed: 'bg-red-50 text-red-700',
  moved:   'bg-blue-50 text-blue-700',
};

const parseTaskChanges = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return null;
};

const TaskChangeList = ({ raw }) => {
  const items = parseTaskChanges(raw);
  if (!items || !items.length) return null;
  return (
    <div className="space-y-2 mt-1">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded capitalize ${CHANGE_TYPE_COLORS[item.change_type] || 'bg-[#4242EA]/10 text-[#4242EA]'}`}>
              {item.change_type}
            </span>
            <span className="text-xs text-slate-700">{item.task_title}</span>
          </div>
          {item.notes && (
            <p className="text-xs text-slate-500 ml-0 pl-0 leading-snug">{item.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
};

// Legacy rows stored a thumbs_* enum before the 1-5 scale; map them so their badge still renders.
const LEGACY_STATUS_SCORE = { thumbs_up: 5, thumbs_sideways: 3, thumbs_down: 1 };

const getScoreMeta = (val) => {
  if (val == null || val === '') return null;
  const n = LEGACY_STATUS_SCORE[val] ?? Number(val);
  if (isNaN(n)) return null;
  const icon = n === 5 ? ThumbsUp : n === 1 ? ThumbsDown : n === 3 ? Minus : null;
  const cls = n >= 4 ? 'bg-emerald-50 text-emerald-700' : n === 3 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600';
  return { icon, cls, label: String(n) };
};

// Module-level so it isn't recreated on every LogsTab render (which remounted the whole
// subtree on unrelated state changes). Expand state is threaded through as props.
const CohortLogRow = ({ log, itemKey, expandedItemId, setExpandedItemId, borderHover = 'hover:bg-[#FAFAFA]', expandedBg = 'bg-[#FAFAFA]' }) => {
  const isExpanded = expandedItemId === itemKey;
  const createdAt = log.created_at ? new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  const statusMeta = getScoreMeta(log.curriculum_status);
  const hasUpdatedCurriculum = log.curriculum_changes_today || log.curriculum_changes_next;

  return (
    <div key={log.log_id}>
      <button type="button" onClick={() => setExpandedItemId(isExpanded ? null : itemKey)}
        className={`w-full flex items-center gap-4 px-4 py-3 text-left ${borderHover} transition-colors`}>
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          <ChevronRight size={12} className="text-slate-400" />
        </span>
        {statusMeta && (
          <Badge className={`text-[10px] px-1.5 py-0 flex-shrink-0 flex items-center gap-0.5 ${statusMeta.cls}`}>
            {statusMeta.icon && <statusMeta.icon size={10} />}
            <span>{statusMeta.label}</span>
          </Badge>
        )}
        {log.action_required && (
          <Badge className="text-[10px] px-1.5 py-0 flex-shrink-0 bg-red-50 text-red-600">Action Required</Badge>
        )}
        {hasUpdatedCurriculum && (
          <Badge className="text-[10px] px-1.5 py-0 flex-shrink-0 bg-indigo-50 text-indigo-600">Updated Curriculum</Badge>
        )}
        <span className="text-[10px] text-slate-500 flex-1 min-w-0 truncate">
          {log.flags || log.curriculum_status_notes || log.curriculum_changes_today || log.curriculum_changes_next || '—'}
        </span>
        <span className="text-[10px] text-slate-400 flex-shrink-0">{createdAt}</span>
      </button>
      {isExpanded && (
        <div className={`px-8 pb-3 space-y-2 ${expandedBg}`}>
          {log.log_date && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Date</p>
              <p className="text-xs text-slate-600">
                {new Date(log.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}
          {(log.curriculum_status || log.cohort_reception_status || log.overall_curriculum_status) && (
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Facilitator', val: log.curriculum_status },
                { label: 'Cohort Reception', val: log.cohort_reception_status },
                { label: 'Overall', val: log.overall_curriculum_status },
              ].filter(r => r.val).map(({ label, val }) => {
                const m = getScoreMeta(val);
                return m ? (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">{label}</span>
                    <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.cls}`}>
                      {m.icon && <m.icon size={10} />}
                      <span>{m.label}</span>
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          )}
          {log.curriculum_status_notes && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Curriculum Status Notes</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.curriculum_status_notes}</p>
            </div>
          )}
          {log.curriculum_changes_today && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Today's Changes</p>
              <TaskChangeList raw={log.curriculum_changes_today} />
            </div>
          )}
          {log.curriculum_changes_next && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Next Day's Changes</p>
              <TaskChangeList raw={log.curriculum_changes_next} />
            </div>
          )}
          {log.flags && (
            <div>
              <p className="text-[10px] font-semibold text-amber-600 uppercase mb-0.5">Flag Details</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.flags}</p>
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <span>Created {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>·</span>
            <span>by {log.created_by_name}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const LogsTab = ({ selectedCohortId, cohorts }) => {
  const token = useAuthStore((s) => s.token);
  // Read-only accounts (interview candidates) can see the logs but not write to them —
  // the server refuses the write, so don't offer the control.
  const { isReadOnly } = usePermissions();
  const [supportTickets, setSupportTickets] = useState([]);
  const [nextStepLogs, setNextStepLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [supportFilter, setSupportFilter] = useState('active');
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [ticketNoteInputs, setTicketNoteInputs] = useState({});
  const [ticketNoteSaving, setTicketNoteSaving] = useState({});
  const [cohortLogs, setCohortLogs] = useState([]);
  const [cohortTagFilter, setCohortTagFilter] = useState('all');
  const [showLogModal, setShowLogModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [builderFilter, setBuilderFilter] = useState('');
  const [selectedBuilder, setSelectedBuilder] = useState(null);

  // All section collapse state — false = expanded (default open)
  const [collapsed, setCollapsed] = useState({
    nextSteps: false,
    supportTickets: false,
    otherLogs: false,
    actionRequired: false,
    cohortFlags: false,
    updatedCurriculum: false,
    cohortLogs: false,
    builderCard: false,
    cohortCard: false,
  });

  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const fetchLogs = async () => {
    if (!selectedCohortId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/support-tickets?cohortId=${selectedCohortId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSupportTickets(data.data.tickets || []);
        setNextStepLogs(data.data.nextStepLogs || []);
        setAllLogs(data.data.allLogs || []);
      }
    } catch (err) {
      console.error('Logs fetch failed:', err);
    }
    try {
      const cohortRes = await fetch(`${API_URL}/api/admin/dashboard/cohort-logs?cohortId=${selectedCohortId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Check .ok BEFORE reading the body. The global fetch interceptor already
      // dispatches `authError` on 401/403, but treating the response as data
      // anyway hides hard failures (5xx, network errors with non-JSON bodies)
      // from logs and from this catch — matches the .ok guard the other
      // fetches in this file use.
      if (!cohortRes.ok) {
        throw new Error(`cohort-logs fetch failed: ${cohortRes.status}`);
      }
      const cohortData = await cohortRes.json();
      if (cohortData.success) setCohortLogs(cohortData.data.logs || []);
    } catch (err) {
      console.error('Cohort logs fetch failed:', err);
      // Cohort sections simply won't render — non-critical for the page.
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedCohortId, token, refreshKey]);

  const filteredTickets = useMemo(() => {
    let list = supportTickets;
    if (supportFilter !== 'all') list = list.filter(t => ['open', 'in_progress', 'follow_up'].includes(t.current_status));
    if (builderFilter) list = list.filter(t => t.builder_name?.toLowerCase().includes(builderFilter.toLowerCase()));
    return list;
  }, [supportTickets, supportFilter, builderFilter]);

  const filteredNextSteps = useMemo(() => {
    let list = nextStepLogs;
    if (supportFilter !== 'all') list = list.filter(l => l.status !== 'closed');
    if (builderFilter) list = list.filter(l => l.builder_name?.toLowerCase().includes(builderFilter.toLowerCase()));
    return list;
  }, [nextStepLogs, supportFilter, builderFilter]);

  const filteredAllLogs = useMemo(() => {
    if (!builderFilter) return allLogs;
    return allLogs.filter(l => l.builder_name?.toLowerCase().includes(builderFilter.toLowerCase()));
  }, [allLogs, builderFilter]);

  // Priority-based sections for "All" view (mutually exclusive)
  const actionRequiredLogs    = cohortLogs.filter(l => l.action_required);
  const cohortFlagsLogs       = cohortLogs.filter(l => l.flags && !l.action_required);
  const updatedCurriculumLogs = cohortLogs.filter(l =>
    !l.flags && !l.action_required &&
    (l.curriculum_changes_today || l.curriculum_changes_next)
  );
  const regularCohortLogs     = cohortLogs.filter(l =>
    !l.action_required && !l.flags &&
    !l.curriculum_changes_today && !l.curriculum_changes_next
  );

  // Tag-based lists for filtered view — a log can match multiple tags
  const tagFilteredLogs = {
    action_required:    cohortLogs.filter(l => l.action_required),
    flagged:            cohortLogs.filter(l => l.flags),
    updated_curriculum: cohortLogs.filter(l => l.curriculum_changes_today || l.curriculum_changes_next),
  };

  const totalLogs = filteredTickets.length + filteredNextSteps.length + filteredAllLogs.length + cohortLogs.length;

  const handleTicketStatusChange = async (supportId, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/support-tickets/${supportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchLogs();
    } catch { /* ignore */ }
  };

  const handleNextStepStatusChange = async (logId, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/builder-logs/${logId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchLogs();
    } catch { /* ignore */ }
  };

  const handleTicketAddNote = async (supportId) => {
    const note = ticketNoteInputs[supportId]?.trim();
    if (!note) return;
    setTicketNoteSaving(prev => ({ ...prev, [supportId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/support-tickets/${supportId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: note }),
      });
      if (res.ok) {
        setTicketNoteInputs(prev => ({ ...prev, [supportId]: '' }));
        fetchLogs();
      }
    } catch { /* ignore */ }
    setTicketNoteSaving(prev => ({ ...prev, [supportId]: false }));
  };

  const statusColors = {
    open: 'text-blue-600 bg-blue-50',
    in_progress: 'text-yellow-600 bg-yellow-50',
    follow_up: 'text-purple-600 bg-purple-50',
    accepted: 'text-green-600 bg-green-50',
    denied: 'text-red-600 bg-red-50',
    closed: 'text-slate-500 bg-slate-50',
  };

  const categoryLabels = {
    '599_extension': '599 Extension',
    'hra_training': 'HRA Training',
    'laptop_hardware': 'Laptop/Hardware',
    'time_off_personal': 'Time Off/Personal',
    'other': 'Other',
  };

  const builderLogCount = filteredNextSteps.length + filteredTickets.length + filteredAllLogs.length;
  const cohortLogCount  = cohortLogs.length;

  return (
    <div className="space-y-4">

      {/* Shared top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-[#1E1E1E]">Facilitator Logs</h2>
          <Badge className="bg-[#EFEFEF] text-slate-600 text-xs">{totalLogs}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <button
              onClick={() => setShowLogModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#4242EA] text-white hover:bg-[#3535c8] transition-colors"
            >
              <Plus size={12} />
              Add Log
            </button>
          )}
          <div className="flex gap-1">
            {['active', 'all'].map(f => (
              <button key={f} onClick={() => setSupportFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  supportFilter === f
                    ? 'bg-[#4242EA] text-white'
                    : 'bg-white border border-[#E3E3E3] text-slate-500 hover:border-[#4242EA] hover:text-[#4242EA]'
                }`}>
                {f === 'active' ? 'Active' : 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Builder Logs card ───────────────────────────── */}
      <Card className="bg-white border border-[#E3E3E3]">
        <CardHeader className="pb-3 border-b border-[#E3E3E3] cursor-pointer select-none"
          onClick={() => toggleSection('builderCard')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronRight size={14} className={`text-slate-400 transition-transform ${collapsed.builderCard ? '' : 'rotate-90'}`} />
              <CardTitle className="text-sm font-semibold text-[#1E1E1E]">Builder Logs</CardTitle>
              <Badge className="bg-[#EFEFEF] text-slate-600 text-xs">{builderLogCount}</Badge>
            </div>
            {/* builder filter — stop propagation so clicking it doesn't toggle card */}
            {!collapsed.builderCard && (
              <div className="relative" onClick={e => e.stopPropagation()}>
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={builderFilter} onChange={e => setBuilderFilter(e.target.value)}
                  placeholder="Filter by builder..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-[#E3E3E3] rounded-md bg-white focus:border-[#4242EA] focus:outline-none w-44" />
              </div>
            )}
          </div>
        </CardHeader>
        {!collapsed.builderCard && (
        <CardContent className="pt-3">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-[#EFEFEF] rounded animate-pulse" />)}</div>
          ) : builderLogCount === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              {supportFilter === 'active' ? 'No active builder logs.' : 'No builder logs yet.'}
            </p>
          ) : (
            <div className="space-y-4">

              {/* Next Steps */}
              {filteredNextSteps.length > 0 && (
                <div>
                  <SectionHeader
                    icon={ArrowRight} iconColor="text-[#4242EA]"
                    label="Next Steps" count={filteredNextSteps.length}
                    badgeClass="bg-blue-50 text-blue-600"
                    collapsed={collapsed.nextSteps}
                    onToggle={() => toggleSection('nextSteps')}
                  />
                  {!collapsed.nextSteps && (
                    <div className="space-y-0 divide-y divide-[#EFEFEF] border border-[#E3E3E3] rounded-md overflow-hidden">
                      {filteredNextSteps.map(log => {
                        const itemKey = `nextstep-${log.log_id}`;
                        const isExpanded = expandedItemId === itemKey;
                        const nextStepStatusColors = {
                          open: 'text-blue-600 bg-blue-50',
                          in_progress: 'text-yellow-600 bg-yellow-50',
                          closed: 'text-slate-500 bg-slate-50',
                        };
                        const updatedAt = log.updated_at ? new Date(log.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                        return (
                          <div key={log.log_id}>
                            <button
                              type="button"
                              onClick={() => setExpandedItemId(isExpanded ? null : itemKey)}
                              className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[#FAFAFA] transition-colors"
                            >
                              <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                <ChevronRight size={12} className="text-slate-400" />
                              </span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedBuilder({ user_id: log.builder_id, name: log.builder_name }); }}
                                className="text-xs font-medium text-[#4242EA] hover:underline flex-shrink-0">{log.builder_name}</button>
                              <Badge className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${
                                log.log_type === 'behavioral' ? 'bg-amber-100 text-amber-700'
                                : log.log_type === 'interview' ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700'
                              }`}>{log.log_type}</Badge>
                              <span className="text-[10px] text-slate-500 flex-1 min-w-0 truncate">{log.next_steps}</span>
                              {/* Disabled rather than hidden for read-only accounts: the
                                  current status is information they need, they just can't
                                  change it. */}
                              <select
                                value={log.status}
                                disabled={isReadOnly}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => { e.stopPropagation(); handleNextStepStatusChange(log.log_id, e.target.value); }}
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold focus:outline-none flex-shrink-0 ${isReadOnly ? 'appearance-none cursor-default' : 'cursor-pointer'} ${nextStepStatusColors[log.status] || 'text-slate-500 bg-slate-50'}`}
                              >
                                {['open', 'in_progress', 'closed'].map(s => (
                                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                ))}
                              </select>
                              <span className="text-[10px] text-slate-400 flex-shrink-0">{updatedAt}</span>
                            </button>
                            {isExpanded && (
                              <div className="px-8 pb-3 space-y-2 bg-[#FAFAFA]">
                                <div>
                                  <p className="text-[10px] font-semibold text-[#4242EA] uppercase mb-0.5">Next Steps</p>
                                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.next_steps}</p>
                                </div>
                                {log.notes && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Notes</p>
                                    <p className="text-xs text-slate-600 line-clamp-3">{log.notes}</p>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <span>Created {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                  <span>·</span>
                                  <span>by {log.created_by_name}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Support Tickets */}
              {filteredTickets.length > 0 && (
                <div>
                  <SectionHeader
                    icon={AlertTriangle} iconColor="text-amber-500"
                    label="Support Tickets" count={filteredTickets.length}
                    badgeClass="bg-amber-50 text-amber-600"
                    collapsed={collapsed.supportTickets}
                    onToggle={() => toggleSection('supportTickets')}
                  />
                  {!collapsed.supportTickets && (
                    <div className="space-y-0 divide-y divide-[#EFEFEF] border border-[#E3E3E3] rounded-md overflow-hidden">
                      {filteredTickets.map(ticket => {
                        const itemKey = `ticket-${ticket.support_id}`;
                        const isExpanded = expandedItemId === itemKey;
                        const updatedAt = ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                        return (
                          <div key={ticket.support_id}>
                            <button
                              type="button"
                              onClick={() => setExpandedItemId(isExpanded ? null : itemKey)}
                              className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[#FAFAFA] transition-colors"
                            >
                              <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                <ChevronRight size={12} className="text-slate-400" />
                              </span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedBuilder({ user_id: ticket.builder_id, name: ticket.builder_name }); }}
                                className="text-xs font-medium text-[#4242EA] hover:underline flex-shrink-0">{ticket.builder_name}</button>
                              <Badge className="bg-[#EFEFEF] text-slate-600 text-[10px] flex-shrink-0">
                                {categoryLabels[ticket.support_category] || ticket.support_category}
                              </Badge>
                              <span className="text-[10px] text-slate-500 flex-1 min-w-0 truncate">{ticket.log_notes}</span>
                              <select
                                value={ticket.current_status}
                                disabled={isReadOnly}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => { e.stopPropagation(); handleTicketStatusChange(ticket.support_id, e.target.value); }}
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold focus:outline-none flex-shrink-0 ${isReadOnly ? 'appearance-none cursor-default' : 'cursor-pointer'} ${statusColors[ticket.current_status] || 'text-slate-500 bg-slate-50'}`}
                              >
                                {['open', 'in_progress', 'follow_up', 'accepted', 'denied', 'closed'].map(s => (
                                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                ))}
                              </select>
                              <span className="text-[10px] text-slate-400 ml-auto flex-shrink-0">{updatedAt}</span>
                            </button>
                            {isExpanded && (
                              <div className="px-8 pb-3 space-y-2 bg-[#FAFAFA]">
                                <p className="text-xs text-slate-600 line-clamp-3">{ticket.log_notes}</p>
                                {ticket.support_disclosure && (
                                  <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                                    <p className="text-[10px] font-semibold text-amber-600 uppercase mb-0.5">Sensitive Details</p>
                                    <p className="text-xs text-slate-600">{ticket.support_disclosure}</p>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <span>Created {new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                  <span>·</span>
                                  <span>by {ticket.created_by_name}</span>
                                </div>
                                {!isReadOnly && (
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      value={ticketNoteInputs[ticket.support_id] || ''}
                                      onChange={(e) => setTicketNoteInputs(prev => ({ ...prev, [ticket.support_id]: e.target.value }))}
                                      placeholder="Add a note or update..."
                                      className="flex-1 px-2 py-1 text-xs border border-[#E3E3E3] rounded bg-white focus:border-[#4242EA] focus:outline-none"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.key === 'Enter' && handleTicketAddNote(ticket.support_id)}
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleTicketAddNote(ticket.support_id); }}
                                      disabled={ticketNoteSaving[ticket.support_id] || !ticketNoteInputs[ticket.support_id]?.trim()}
                                      className="px-2 py-1 text-xs bg-[#4242EA] text-white rounded hover:bg-[#3535c8] disabled:opacity-50 flex items-center gap-1"
                                    >
                                      <MessageSquarePlus size={11} />
                                      {ticketNoteSaving[ticket.support_id] ? '...' : 'Add'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Other Logs */}
              {filteredAllLogs.length > 0 && (
                <div>
                  <SectionHeader
                    icon={FileText} iconColor="text-slate-400"
                    label="Other Logs" count={filteredAllLogs.length}
                    badgeClass="bg-slate-50 text-slate-500"
                    collapsed={collapsed.otherLogs}
                    onToggle={() => toggleSection('otherLogs')}
                  />
                  {!collapsed.otherLogs && (
                    <div className="space-y-0 divide-y divide-[#EFEFEF] border border-[#E3E3E3] rounded-md overflow-hidden">
                      {filteredAllLogs.map(log => {
                        const itemKey = `log-${log.log_id}`;
                        const isExpanded = expandedItemId === itemKey;
                        const updatedAt = log.updated_at ? new Date(log.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                        return (
                          <div key={log.log_id}>
                            <button type="button" onClick={() => setExpandedItemId(isExpanded ? null : itemKey)}
                              className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[#FAFAFA] transition-colors">
                              <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                <ChevronRight size={12} className="text-slate-400" />
                              </span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedBuilder({ user_id: log.builder_id, name: log.builder_name }); }}
                                className="text-xs font-medium text-[#4242EA] hover:underline flex-shrink-0">{log.builder_name}</button>
                              <Badge className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${
                                log.log_type === 'behavioral' ? 'bg-amber-100 text-amber-700'
                                : log.log_type === 'interview' ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700'
                              }`}>{log.log_type}</Badge>
                              <span className="text-[10px] text-slate-500 flex-1 min-w-0 truncate">{log.notes}</span>
                              <span className="text-[10px] text-slate-400 flex-shrink-0">{updatedAt}</span>
                            </button>
                            {isExpanded && (
                              <div className="px-8 pb-3 space-y-2 bg-[#FAFAFA]">
                                {log.notes && <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.notes}</p>}
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <span>Created {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                  <span>·</span>
                                  <span>by {log.created_by_name}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* ── Cohort Logs card ────────────────────────────── */}
      <Card className="bg-white border border-[#E3E3E3]">
        <CardHeader className="pb-3 border-b border-[#E3E3E3]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('cohortCard')}>
              <ChevronRight size={14} className={`text-slate-400 transition-transform ${collapsed.cohortCard ? '' : 'rotate-90'}`} />
              <CardTitle className="text-sm font-semibold text-[#1E1E1E]">Cohort Logs</CardTitle>
              <Badge className="bg-[#EFEFEF] text-slate-600 text-xs">{cohortLogCount}</Badge>
            </div>
            {!collapsed.cohortCard && cohortLogCount > 0 && (
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                {[
                  { value: 'all',                label: 'All' },
                  { value: 'action_required',    label: 'Action Required',    active: 'bg-red-50 border-red-300 text-red-600' },
                  { value: 'flagged',            label: 'Flagged',            active: 'bg-amber-50 border-amber-300 text-amber-600' },
                  { value: 'updated_curriculum', label: 'Updated Curriculum', active: 'bg-indigo-50 border-indigo-300 text-indigo-600' },
                ].map(({ value, label, active }) => (
                  <button key={value} type="button"
                    onClick={() => setCohortTagFilter(value)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                      cohortTagFilter === value
                        ? (active || 'bg-[#4242EA] text-white border-[#4242EA]')
                        : 'bg-white border-[#E3E3E3] text-slate-500 hover:border-slate-300'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        {!collapsed.cohortCard && (
        <CardContent className="pt-3">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-[#EFEFEF] rounded animate-pulse" />)}</div>
          ) : cohortLogCount === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No cohort logs yet — add the first one.</p>
          ) : cohortTagFilter !== 'all' ? (
            /* ── Tag-filtered flat list ── */
            (() => {
              const filtered = tagFilteredLogs[cohortTagFilter] || [];
              return filtered.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No logs with this tag.</p>
              ) : (
                <div className="space-y-0 divide-y divide-[#EFEFEF] border border-[#E3E3E3] rounded-md overflow-hidden">
                  {filtered.map(log => (
                    <CohortLogRow key={log.log_id} log={log} itemKey={`filtered-${cohortTagFilter}-${log.log_id}`} expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} />
                  ))}
                </div>
              );
            })()
          ) : (
            /* ── All — priority section view ── */
            <div className="space-y-4">

              {/* Action Required */}
              {actionRequiredLogs.length > 0 && (
                <div>
                  <SectionHeader
                    icon={AlertTriangle} iconColor="text-red-500"
                    label="Action Required" count={actionRequiredLogs.length}
                    badgeClass="bg-red-50 text-red-600"
                    collapsed={collapsed.actionRequired}
                    onToggle={() => toggleSection('actionRequired')}
                  />
                  {!collapsed.actionRequired && (
                    <div className="space-y-0 divide-y divide-red-100 border border-red-100 rounded-md overflow-hidden">
                      {actionRequiredLogs.map(log => (
                        <CohortLogRow key={log.log_id} log={log} itemKey={`action-${log.log_id}`}
                          expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId}
                          borderHover="hover:bg-red-50/30" expandedBg="bg-red-50/20" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cohort Flags */}
              {cohortFlagsLogs.length > 0 && (
                <div>
                  <SectionHeader
                    icon={Flag} iconColor="text-amber-500"
                    label="Cohort Flags" count={cohortFlagsLogs.length}
                    badgeClass="bg-amber-50 text-amber-600"
                    collapsed={collapsed.cohortFlags}
                    onToggle={() => toggleSection('cohortFlags')}
                  />
                  {!collapsed.cohortFlags && (
                    <div className="space-y-0 divide-y divide-amber-100 border border-amber-100 rounded-md overflow-hidden">
                      {cohortFlagsLogs.map(log => (
                        <CohortLogRow key={log.log_id} log={log} itemKey={`cohortflag-${log.log_id}`}
                          expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId}
                          borderHover="hover:bg-amber-50/40" expandedBg="bg-amber-50/30" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Updated Curriculum */}
              {updatedCurriculumLogs.length > 0 && (
                <div>
                  <SectionHeader
                    icon={RefreshCw} iconColor="text-indigo-500"
                    label="Updated Curriculum" count={updatedCurriculumLogs.length}
                    badgeClass="bg-indigo-50 text-indigo-600"
                    collapsed={collapsed.updatedCurriculum}
                    onToggle={() => toggleSection('updatedCurriculum')}
                  />
                  {!collapsed.updatedCurriculum && (
                    <div className="space-y-0 divide-y divide-indigo-100 border border-indigo-100 rounded-md overflow-hidden">
                      {updatedCurriculumLogs.map(log => (
                        <CohortLogRow key={log.log_id} log={log} itemKey={`currupdate-${log.log_id}`}
                          expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId}
                          borderHover="hover:bg-indigo-50/30" expandedBg="bg-indigo-50/20" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cohort Logs (regular — no flags, no action required, no curriculum changes) */}
              {regularCohortLogs.length > 0 && (
                <div>
                  <SectionHeader
                    icon={BookOpen} iconColor="text-violet-500"
                    label="Cohort Logs" count={regularCohortLogs.length}
                    badgeClass="bg-violet-50 text-violet-600"
                    collapsed={collapsed.cohortLogs}
                    onToggle={() => toggleSection('cohortLogs')}
                  />
                  {!collapsed.cohortLogs && (
                    <div className="space-y-0 divide-y divide-[#EFEFEF] border border-[#E3E3E3] rounded-md overflow-hidden">
                      {regularCohortLogs.map(log => (
                        <CohortLogRow key={log.log_id} log={log} itemKey={`cohortlog-${log.log_id}`} expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} />
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </CardContent>
        )}
      </Card>

      {showLogModal && (
        <BuilderLogModal
          open={true}
          onOpenChange={(open) => { if (!open) setShowLogModal(false); }}
          builder={null}
          cohortId={selectedCohortId}
          cohorts={cohorts}
          onSaved={() => { setRefreshKey(k => k + 1); }}
        />
      )}

      {selectedBuilder && (
        <BuilderDrawer
          builder={selectedBuilder}
          startDate="2024-01-01"
          endDate={new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}
          selectedLevel=""
          cohortId={selectedCohortId}
          onClose={() => setSelectedBuilder(null)}
          onLogSaved={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}

export default LogsTab;
