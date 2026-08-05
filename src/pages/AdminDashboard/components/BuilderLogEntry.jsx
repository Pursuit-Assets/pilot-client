import React, { useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { ChevronDown, ChevronUp, AlertTriangle, ShieldAlert, Users, MessageSquarePlus, Pencil, Check, X } from 'lucide-react';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';

const API_URL = import.meta.env.VITE_API_URL;

const TAG_COLORS = {
  curriculum: 'bg-blue-100 text-blue-700',
  financial: 'bg-amber-100 text-amber-700',
  attendance: 'bg-indigo-100 text-indigo-700',
  conflict: 'bg-red-100 text-red-700',
  housing: 'bg-purple-100 text-purple-700',
  isa_trust: 'bg-orange-100 text-orange-700',
  health: 'bg-green-100 text-green-700',
  family: 'bg-pink-100 text-pink-700',
  employment: 'bg-teal-100 text-teal-700',
  technical: 'bg-slate-100 text-slate-600',
  behavioral: 'bg-amber-100 text-amber-700',
  academic: 'bg-blue-100 text-blue-700',
  interview: 'bg-emerald-100 text-emerald-700',
};

const TAG_LABELS = {
  isa_trust: 'ISA/Trust',
};

const STATUS_OPTIONS = ['open', 'in_progress', 'closed'];

const SUPPORT_STATUS_OPTIONS = ['open', 'in_progress', 'accepted', 'denied', 'follow_up', 'closed'];

const SUPPORT_CATEGORY_LABELS = {
  '599_extension': '599 Extension',
  hra_training_form: 'HRA Training Form',
  laptop_hardware: 'Laptop/Hardware',
  time_off_personal: 'Time Off/Personal',
};

const SUPPORT_STATUS_COLORS = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
  follow_up: 'bg-purple-100 text-purple-700',
  closed: 'bg-slate-100 text-slate-600',
};

const BuilderLogEntry = ({ log, onStatusChange, onSupportStatusChange, onLogUpdated }) => {
  const token = useAuthStore((s) => s.token);
  // Read-only accounts (interview candidates) read the log and its support case; editing
  // the note, the status, or adding an update is withheld — the server refuses those.
  const { isReadOnly } = usePermissions();
  const [expanded, setExpanded] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [supportStatusNote, setSupportStatusNote] = useState('');
  const [showSupportNoteInput, setShowSupportNoteInput] = useState(false);
  const [pendingSupportStatus, setPendingSupportStatus] = useState(null);
  const [supportHistory, setSupportHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState(log.notes || '');
  const [editNextSteps, setEditNextSteps] = useState(log.next_steps || '');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const tags = Array.isArray(log.tags) ? log.tags : [];
  const involvedBuilders = Array.isArray(log.involved_builders) ? log.involved_builders : [];
  const support = log.support_ticket;

  const displayDate = log.interaction_date || log.created_at;
  const dateStr = displayDate
    ? new Date(displayDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const timeStr = log.created_at
    ? new Date(log.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const isBackdated = log.interaction_date && log.created_at
    && new Date(log.interaction_date).toDateString() !== new Date(log.created_at).toDateString();

  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/builder-logs/${log.log_id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) onStatusChange?.(log.log_id, newStatus);
    } catch { /* ignore */ }
    setUpdatingStatus(false);
  };

  const handleSupportStatusChange = async (newStatus) => {
    if (!supportStatusNote.trim() && newStatus !== support.current_status) {
      setPendingSupportStatus(newStatus);
      setShowSupportNoteInput(true);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/support-tickets/${support.support_id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, notes: supportStatusNote.trim() || null }),
      });
      if (res.ok) {
        onSupportStatusChange?.(support.support_id, newStatus);
        setSupportStatusNote('');
        setShowSupportNoteInput(false);
        setPendingSupportStatus(null);
        fetchSupportHistory(true);
      }
    } catch { /* ignore */ }
  };

  const confirmSupportStatus = () => {
    if (pendingSupportStatus) handleSupportStatusChange(pendingSupportStatus);
  };

  const handleAddUpdate = async () => {
    if (!updateNote.trim() || !support) return;
    setSavingNote(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/support-tickets/${support.support_id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: updateNote.trim() }),
      });
      if (res.ok) {
        setUpdateNote('');
        setShowAddUpdate(false);
        fetchSupportHistory(true);
      }
    } catch { /* ignore */ }
    setSavingNote(false);
  };

  const handleSaveEdit = async () => {
    if (!editNotes.trim()) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/builder-logs/${log.log_id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: editNotes.trim(), next_steps: editNextSteps.trim() || null }),
      });
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Edit endpoint not available' : `Save failed (${res.status})`);
      }
      setEditing(false);
      onLogUpdated?.();
    } catch (e) {
      setEditError(e.message || 'Failed to save edit');
    }
    setSavingEdit(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError('');
    setEditNotes(log.notes || '');
    setEditNextSteps(log.next_steps || '');
  };

  const fetchSupportHistory = async (force = false) => {
    if ((!force && supportHistory) || !support) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/support-tickets/${support.support_id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSupportHistory(data.data);
    } catch { /* ignore */ }
    setLoadingHistory(false);
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && support) fetchSupportHistory();
  };

  return (
    <div className="border border-[#E3E3E3] rounded-lg bg-white overflow-hidden">
      {/* Header row -- always visible */}
      <button
        type="button"
        onClick={handleExpand}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[#FAFAFA] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className={`text-[10px] px-1.5 py-0 ${
              log.log_type === 'behavioral' ? 'bg-amber-100 text-amber-700'
              : log.log_type === 'interview' ? 'bg-emerald-100 text-emerald-700'
              : 'bg-blue-100 text-blue-700'
            }`}>
              {log.log_type}
            </Badge>
            {log.violates_code_of_conduct && (
              <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 flex items-center gap-0.5">
                <ShieldAlert size={9} /> CoC
              </Badge>
            )}
            {tags.map(tag => (
              <Badge key={tag} className={`text-[9px] px-1.5 py-0 ${TAG_COLORS[tag] || 'bg-slate-100 text-slate-600'}`}>
                {TAG_LABELS[tag] || tag}
              </Badge>
            ))}
            {support && (
              <Badge className={`text-[9px] px-1.5 py-0 ${SUPPORT_STATUS_COLORS[support.current_status] || ''}`}>
                Support: {support.current_status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{log.notes}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-slate-400">{dateStr} {timeStr}</span>
            {isBackdated && <span className="text-[10px] text-amber-500 italic">backdated</span>}
            <span className="text-[10px] text-slate-400">by {log.created_by_name}</span>
            {involvedBuilders.length > 0 && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Users size={9} /> +{involvedBuilders.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          <select
            value={log.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); handleStatusChange(e.target.value); }}
            disabled={updatingStatus || isReadOnly}
            className={`text-[10px] px-1.5 py-0.5 rounded border border-[#E3E3E3] bg-white ${isReadOnly ? 'appearance-none cursor-default' : 'cursor-pointer'} ${
              log.status === 'open' ? 'text-blue-600' : log.status === 'in_progress' ? 'text-yellow-600' : 'text-slate-500'
            }`}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          {expanded ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#E3E3E3] px-3 py-3 space-y-3 bg-[#FAFAFA]">
          {/* Full notes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Notes</p>
              {!editing && !isReadOnly && (
                <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-[10px] text-[#4242EA] hover:text-[#3535c8] font-medium">
                  <Pencil size={10} /> Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  className="w-full px-2 py-1.5 text-xs border border-[#E3E3E3] rounded bg-white focus:border-[#4242EA] focus:outline-none resize-y"
                  autoFocus
                />
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Next Steps</p>
                  <textarea
                    value={editNextSteps}
                    onChange={(e) => setEditNextSteps(e.target.value)}
                    rows={2}
                    placeholder="Next steps..."
                    className="w-full px-2 py-1.5 text-xs border border-[#E3E3E3] rounded bg-white focus:border-[#4242EA] focus:outline-none resize-y"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={handleSaveEdit} disabled={savingEdit || !editNotes.trim()} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#4242EA] text-white rounded hover:bg-[#3535c8] disabled:opacity-50">
                    <Check size={11} /> {savingEdit ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={cancelEdit} className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700">
                    <X size={11} /> Cancel
                  </button>
                  {editError && <span className="text-[10px] text-red-600 ml-1">{editError}</span>}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.notes}</p>
            )}
          </div>

          {log.bond_blocks && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Bond Blocks</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.bond_blocks}</p>
            </div>
          )}

          {!editing && log.next_steps && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Next Steps</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{log.next_steps}</p>
            </div>
          )}

          {log.community_rating && (
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Community Rating</p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <span
                    key={n}
                    className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                      n <= log.community_rating ? 'bg-[#4242EA] text-white' : 'bg-[#EFEFEF] text-slate-400'
                    }`}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {involvedBuilders.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Also Involved</p>
              <div className="flex flex-wrap gap-1">
                {involvedBuilders.map(b => (
                  <Badge key={b.user_id} className="bg-slate-100 text-slate-600 text-[10px]">
                    {b.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Support ticket section */}
          {support && (
            <div className="border border-[#E3E3E3] rounded-md p-2.5 bg-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" />
                  <span className="text-xs font-semibold text-[#1E1E1E]">Support Case</span>
                  <Badge className="bg-[#EFEFEF] text-slate-600 text-[10px]">
                    {SUPPORT_CATEGORY_LABELS[support.support_category] || support.support_category}
                  </Badge>
                </div>
                <select
                  value={support.current_status}
                  onChange={(e) => handleSupportStatusChange(e.target.value)}
                  disabled={isReadOnly}
                  className={`text-[10px] px-1.5 py-0.5 rounded border border-[#E3E3E3] bg-white ${isReadOnly ? 'appearance-none cursor-default' : 'cursor-pointer'} ${
                    SUPPORT_STATUS_COLORS[support.current_status]?.split(' ')[1] || ''
                  }`}
                >
                  {SUPPORT_STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {support.support_disclosure && (
                <p className="text-xs text-slate-600 mb-2">{support.support_disclosure}</p>
              )}

              {support.mitigation_available && (
                <Badge className="bg-green-50 text-green-600 text-[10px] mb-2">Mitigation available</Badge>
              )}

              {showSupportNoteInput && (
                <div className="flex gap-1.5 mt-2">
                  <input
                    type="text"
                    value={supportStatusNote}
                    onChange={(e) => setSupportStatusNote(e.target.value)}
                    placeholder="Add a note for this status change..."
                    className="flex-1 px-2 py-1 text-xs border border-[#E3E3E3] rounded bg-white focus:border-[#4242EA] focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && confirmSupportStatus()}
                  />
                  <button
                    type="button"
                    onClick={confirmSupportStatus}
                    className="px-2 py-1 text-xs bg-[#4242EA] text-white rounded hover:bg-[#3535c8]"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSupportNoteInput(false); setPendingSupportStatus(null); setSupportStatusNote(''); }}
                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Add Update button */}
              {!showAddUpdate && !showSupportNoteInput && !isReadOnly && (
                <button
                  type="button"
                  onClick={() => setShowAddUpdate(true)}
                  className="flex items-center gap-1 mt-2 text-[10px] text-[#4242EA] hover:text-[#3535c8] font-medium"
                >
                  <MessageSquarePlus size={11} /> Add Update
                </button>
              )}
              {showAddUpdate && (
                <div className="flex gap-1.5 mt-2">
                  <input
                    type="text"
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e.target.value)}
                    placeholder="Add a note or update..."
                    className="flex-1 px-2 py-1 text-xs border border-[#E3E3E3] rounded bg-white focus:border-[#4242EA] focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUpdate()}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddUpdate}
                    disabled={savingNote || !updateNote.trim()}
                    className="px-2 py-1 text-xs bg-[#4242EA] text-white rounded hover:bg-[#3535c8] disabled:opacity-50"
                  >
                    {savingNote ? '...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddUpdate(false); setUpdateNote(''); }}
                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Status history timeline */}
              {supportHistory && supportHistory.length > 0 && (
                <div className="mt-2 border-t border-[#EFEFEF] pt-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5">Status History</p>
                  <div className="space-y-1.5">
                    {supportHistory.map((h, i) => (
                      <div key={h.id || i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#4242EA] mt-1 flex-shrink-0" />
                        <div>
                          <span className="text-[10px] font-medium text-slate-600">
                            {h.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1.5">
                            {new Date(h.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {h.changed_by_name}
                          </span>
                          {h.notes && (
                            <p className="text-[10px] text-slate-500 mt-0.5">{h.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {loadingHistory && (
                <p className="text-[10px] text-slate-400 mt-1.5">Loading history...</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BuilderLogEntry;
