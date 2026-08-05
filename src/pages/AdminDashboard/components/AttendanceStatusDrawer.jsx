import React, { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { Badge } from '../../../components/ui/badge';
import { Plus, Send } from 'lucide-react';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';

const API_URL = import.meta.env.VITE_API_URL;

const STATUS_OPTIONS = ['present', 'late', 'absent', 'excused'];
const STATUS_COLORS = {
  present: 'bg-emerald-100 text-emerald-700',
  late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-600',
  excused: 'bg-blue-100 text-blue-700',
  pending: 'bg-slate-100 text-slate-500',
};
const EXCUSE_REASONS = ['Sick', 'Personal', 'Program Event', 'Technical Issue', 'Other'];

const FILTER_LABELS = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
  no_class: 'No Class',
};

const AttendanceStatusDrawer = ({ open, onClose, statusFilter, builders, selectedDate, cohortName, onRefresh }) => {
  // Read-only accounts (interview candidates) open this drawer to see WHO was present,
  // absent or excused — real signal for their exercise — but cannot change a record.
  const { isReadOnly } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [savingId, setSavingId] = useState(null);
  const [addingFor, setAddingFor] = useState(null);
  const [addStatus, setAddStatus] = useState('present');
  const [savingAdd, setSavingAdd] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);
  const [excusePending, setExcusePending] = useState(null);
  const [excuseReason, setExcuseReason] = useState('');
  const [excuseNote, setExcuseNote] = useState('');
  const [excuseError, setExcuseError] = useState('');
  const [saveError, setSaveError] = useState('');

  const filtered = useMemo(() => {
    if (!statusFilter || !builders) return builders || [];
    return builders.filter(b => statusFilter.includes(b.status));
  }, [builders, statusFilter]);

  const label = statusFilter?.map(s => FILTER_LABELS[s] || s).join(' + ') || 'All';
  const isAbsent = statusFilter?.includes('absent') && !statusFilter?.includes('present');

  const handleStatusChange = async (builder, newStatus) => {
    if (newStatus === 'excused') {
      // Guard: if another builder's excuse form is already open, make staff
      // resolve (submit or cancel) it first so they can't silently drop an
      // in-progress excuse by clicking "Excused" on a different row.
      if (excusePending && excusePending.userId !== builder.userId) {
        setSaveError('Finish the pending excuse form before starting another.');
        return;
      }
      setExcusePending({ userId: builder.userId, prevStatus: builder.status, attendanceId: builder.attendanceId });
      setExcuseReason('');
      setExcuseNote('');
      setExcuseError('');
      return;
    }
    setSavingId(builder.userId);
    setSaveError('');
    try {
      const res = builder.attendanceId
        ? await fetch(`${API_URL}/api/admin/attendance/manage/record/${builder.attendanceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: newStatus }),
          })
        : await fetch(`${API_URL}/api/admin/attendance/manage/record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ userId: builder.userId, attendanceDate: selectedDate, status: newStatus }),
          });
      if (!res.ok) throw new Error(`Attendance update failed (${res.status})`);
      await onRefresh?.();
    } catch (e) {
      console.error('Attendance update failed:', e);
      setSaveError(e.message || 'Failed to update attendance');
    }
    setSavingId(null);
  };

  const handleExcuseSubmit = async () => {
    if (!excuseReason) { setExcuseError('Excuse type is required'); return; }
    const { userId } = excusePending;
    setSavingId(userId);
    setExcuseError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/excuses/mark-excused`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, absenceDate: selectedDate, excuseReason, excuseDetails: excuseNote || '', staffNotes: '' }),
      });
      if (!res.ok) throw new Error(`Excuse save failed (${res.status})`);
      setExcusePending(null);
      setExcuseError('');
      await onRefresh?.();
    } catch (e) {
      console.error('Excuse failed:', e);
      setExcuseError(e.message || 'Failed to save excuse');
    }
    setSavingId(null);
  };

  const handleExcuseCancel = () => { setExcusePending(null); setExcuseReason(''); setExcuseNote(''); setExcuseError(''); };

  const handleAddRecord = async (builder) => {
    setSavingAdd(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/manage/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: builder.userId, attendanceDate: selectedDate, status: addStatus }),
      });
      if (!res.ok) throw new Error(`Add attendance failed (${res.status})`);
      setAddingFor(null);
      await onRefresh?.();
    } catch (e) {
      console.error('Add attendance failed:', e);
      setSaveError(e.message || 'Failed to add attendance record');
    }
    setSavingAdd(false);
  };

  const handleNotify = async (channel) => {
    setNotifying(true);
    setNotifyResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/notify-builders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          channel,
          builderIds: filtered.map(b => b.userId),
          message: notifyMessage || `Hi! You were marked absent for ${cohortName} on ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Please reach out if you need to be excused.`,
          messageType: 'absence_notice',
        }),
      });
      // A 502/504 upstream error often returns HTML — parse defensively so
      // we surface the HTTP status instead of a JSON-parse stack trace.
      if (!res.ok) throw new Error(`Notify failed (${res.status})`);
      const data = await res.json().catch(() => ({ success: false, error: 'Invalid response' }));
      if (data.success) {
        setNotifyResult({ sent: data.sent, failed: data.failed });
      } else {
        setNotifyResult({ error: data.error || 'Failed to send' });
      }
    } catch (e) {
      setNotifyResult({ error: e.message });
    }
    setNotifying(false);
  };

  const dateStr = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-[#E3E3E3]">
          <SheetTitle className="text-[#1E1E1E] font-semibold flex items-center gap-2">
            {label} Builders
            <Badge className="bg-[#EFEFEF] text-slate-600 text-xs">{filtered.length}</Badge>
          </SheetTitle>
          <p className="text-xs text-slate-400 mt-0.5">{cohortName} — {dateStr}</p>
        </SheetHeader>

        {saveError && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center justify-between">
            <span>{saveError}</span>
            <button onClick={() => setSaveError('')} className="text-red-500 hover:text-red-700 ml-2">Dismiss</button>
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          {/* Absent: Notify action bar */}
          {isAbsent && filtered.length > 0 && !isReadOnly && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 opacity-60">
              <p className="text-xs font-medium text-slate-500">Notify {filtered.length} absent builder{filtered.length !== 1 ? 's' : ''} <span className="text-[10px] text-slate-400">(coming soon)</span></p>
              <div className="flex gap-2">
                <button disabled className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-300 text-white cursor-not-allowed">
                  <Send size={11} /> Slack DM
                </button>
                <button disabled className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-400 cursor-not-allowed">
                  <Send size={11} /> Email
                </button>
              </div>
              {notifyResult && (
                <p className={`text-[10px] ${notifyResult.error ? 'text-red-500' : 'text-green-600'}`}>
                  {notifyResult.error || `Sent to ${notifyResult.sent} builder${notifyResult.sent !== 1 ? 's' : ''}${notifyResult.failed > 0 ? `, ${notifyResult.failed} failed` : ''}`}
                </p>
              )}
            </div>
          )}

          {/* Builder list */}
          <div className="border border-[#E3E3E3] rounded-md overflow-hidden divide-y divide-[#EFEFEF] max-h-[500px] overflow-y-auto">
            {filtered.map(b => {
              const isExcusePending = excusePending?.userId === b.userId;
              return (
                <div key={b.userId} className={`px-3 py-2.5 ${isExcusePending ? 'bg-blue-50/50' : 'hover:bg-[#FAFAFA]'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1E1E1E]">{b.firstName} {b.lastName}</p>
                      <p className="text-[10px] text-slate-400">{b.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {savingId === b.userId ? (
                        <span className="text-[10px] text-slate-400">Saving...</span>
                      ) : isReadOnly ? (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[b.status] || STATUS_COLORS.pending}`}>
                          {(b.status || 'pending').charAt(0).toUpperCase() + (b.status || 'pending').slice(1)}
                        </span>
                      ) : (
                        <select
                          value={isExcusePending ? 'excused' : b.status}
                          onChange={e => handleStatusChange(b, e.target.value)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none ${STATUS_COLORS[isExcusePending ? 'excused' : b.status] || STATUS_COLORS.pending}`}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  {isExcusePending && (
                    <div className="mt-2 pt-2 border-t border-blue-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-medium text-slate-500 w-12 flex-shrink-0">Type *</label>
                        <select value={excuseReason} onChange={e => { setExcuseReason(e.target.value); setExcuseError(''); }}
                          className={`flex-1 text-[10px] px-2 py-1 border rounded bg-white focus:outline-none focus:border-[#4242EA] ${excuseError && !excuseReason ? 'border-red-300' : 'border-[#E3E3E3]'}`}>
                          <option value="">Select reason...</option>
                          {EXCUSE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div className="flex items-start gap-2">
                        <label className="text-[10px] font-medium text-slate-500 w-12 flex-shrink-0 pt-1">Note</label>
                        <input type="text" value={excuseNote} onChange={e => setExcuseNote(e.target.value)} placeholder="Optional details..."
                          className="flex-1 text-[10px] px-2 py-1 border border-[#E3E3E3] rounded bg-white focus:outline-none focus:border-[#4242EA]" />
                      </div>
                      {excuseError && <p className="text-[10px] text-red-500">{excuseError}</p>}
                      <div className="flex justify-end gap-1.5">
                        <button onClick={handleExcuseCancel} disabled={savingId === excusePending?.userId} className="text-[10px] px-2.5 py-1 rounded border border-[#E3E3E3] text-slate-500 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                        <button onClick={handleExcuseSubmit} disabled={savingId === excusePending?.userId} className="text-[10px] px-2.5 py-1 rounded bg-[#4242EA] text-white hover:bg-[#3535c8] disabled:opacity-50">{savingId === excusePending?.userId ? 'Saving...' : 'Save Excuse'}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AttendanceStatusDrawer;
