import React, { useState, useEffect } from 'react';
import { X, Star, Save } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';

const StarRating = ({ value, onChange, disabled }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          onMouseEnter={() => !disabled && setHover(star)}
          onMouseLeave={() => setHover(0)}
          className={`p-0.5 transition-colors ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
        >
          <Star
            size={24}
            className={`transition-colors ${
              star <= (hover || value)
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-none text-slate-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
};

const DemoRatingModal = ({ open, onClose, builder, rating, onSave, existingFeedback }) => {
  const [score, setScore] = useState(0);
  const [technicalFeedback, setTechnicalFeedback] = useState('');
  const [businessFeedback, setBusinessFeedback] = useState('');
  const [professionalFeedback, setProfessionalFeedback] = useState('');
  const [overallNotes, setOverallNotes] = useState('');
  const [selectionStatus, setSelectionStatus] = useState('pending');
  const [saving, setSaving] = useState(false);
  // Read-only accounts (interview candidates) can READ an existing review — that's real
  // signal for their exercise — but every input is inert and Save is not offered, since
  // the server refuses the POST.
  const { isReadOnly } = usePermissions();

  // Populate from existing feedback or rating prop
  useEffect(() => {
    if (!open) return;
    const fb = existingFeedback?.[0];
    if (fb) {
      setScore(fb.score || rating || 0);
      setTechnicalFeedback(fb.technical_feedback || '');
      setBusinessFeedback(fb.business_feedback || '');
      setProfessionalFeedback(fb.professional_feedback || '');
      setOverallNotes(fb.overall_notes || '');
      setSelectionStatus(fb.selection_status || 'pending');
    } else {
      setScore(rating || 0);
      setTechnicalFeedback('');
      setBusinessFeedback('');
      setProfessionalFeedback('');
      setOverallNotes('');
      setSelectionStatus('pending');
    }
  }, [open, existingFeedback, rating]);

  if (!open || !builder) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        builder_id: builder.user_id,
        task_id: builder.latest_task_id || null,
        submission_id: builder.latest_submission_id || null,
        score,
        technical_feedback: technicalFeedback,
        business_feedback: businessFeedback,
        professional_feedback: professionalFeedback,
        overall_notes: overallNotes,
        selection_status: selectionStatus,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save review:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasVideo = builder.latest_loom_url?.includes('loom.com');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E3E3E3]">
          <div>
            <h3 className="text-base font-semibold text-[#1E1E1E]">Demo Review — {builder.name}</h3>
            {hasVideo && (
              <a
                href={builder.latest_loom_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#4242EA] hover:underline"
              >
                View Demo Video →
              </a>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#EFEFEF]">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Star Rating */}
          <div>
            <label className="text-xs text-slate-500 font-medium mb-1.5 block">Demo Rating</label>
            <StarRating value={score} onChange={setScore} disabled={!hasVideo || isReadOnly} />
            {!hasVideo && <p className="text-[10px] text-slate-400 mt-1">No demo video submitted</p>}
          </div>

          {/* Selection Status */}
          <div>
            <label className="text-xs text-slate-500 font-medium mb-1.5 block">Selection Status</label>
            <div className="flex gap-2">
              {[
                { key: 'strong', emoji: '✅', label: 'Strong' },
                { key: 'maybe', emoji: '❓', label: 'Maybe' },
                { key: 'drop', emoji: '❌', label: 'Drop' },
                { key: 'pending', emoji: '⚫', label: 'Pending' },
              ].map(s => (
                <button
                  key={s.key}
                  disabled={isReadOnly}
                  onClick={() => setSelectionStatus(s.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    selectionStatus === s.key
                      ? 'border-[#4242EA] bg-[#4242EA]/10 text-[#4242EA]'
                      : 'border-[#E3E3E3] text-slate-500 hover:border-slate-300'
                  } ${isReadOnly ? 'cursor-default opacity-70' : ''}`}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Fields */}
          {[
            { label: 'Technical Feedback', value: technicalFeedback, setter: setTechnicalFeedback, placeholder: 'Technical skills, code quality, architecture...' },
            { label: 'Business Feedback', value: businessFeedback, setter: setBusinessFeedback, placeholder: 'Problem understanding, market fit, value proposition...' },
            { label: 'Professional Feedback', value: professionalFeedback, setter: setProfessionalFeedback, placeholder: 'Communication, presentation, teamwork...' },
            { label: 'Overall Notes', value: overallNotes, setter: setOverallNotes, placeholder: 'General observations, recommendation...' },
          ].map(field => (
            <div key={field.label}>
              <label className="text-xs text-slate-500 font-medium mb-1 block">{field.label}</label>
              <textarea
                value={field.value}
                onChange={e => field.setter(e.target.value)}
                placeholder={isReadOnly ? '—' : field.placeholder}
                readOnly={isReadOnly}
                rows={2}
                className={`w-full px-3 py-2 text-sm border border-[#E3E3E3] rounded-md text-[#1E1E1E] focus:border-[#4242EA] focus:outline-none resize-none ${isReadOnly ? 'bg-[#FAFAFA]' : 'bg-white'}`}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-[#E3E3E3]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-500 border border-[#E3E3E3] rounded-md hover:bg-[#EFEFEF]"
          >
            {isReadOnly ? 'Close' : 'Cancel'}
          </button>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#4242EA] rounded-md hover:bg-[#3535c8] disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save Review'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DemoRatingModal;
