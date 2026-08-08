import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { X, BookOpen, MessageSquare, Send, Video, ChevronDown, ChevronUp, ExternalLink, FileText, FileSignature, CheckCircle, Clock, Plus, Sparkles, RefreshCw, AlertTriangle, TrendingUp, Target, Lightbulb, Loader2, ClipboardList, Award, User } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { getUserProfilePhoto } from '../../../utils/userPhotoService';
import BuilderLogEntry from './BuilderLogEntry';

const LEGACY_API = 'https://ai-pilot-admin-dashboard-866060457933.us-central1.run.app/api';
const API_URL = import.meta.env.VITE_API_URL;

const GRADE_COLORS = {
  'A+': 'bg-green-100 text-green-700', A: 'bg-green-100 text-green-700', 'A-': 'bg-green-50 text-green-600',
  'B+': 'bg-blue-100 text-blue-700', B: 'bg-blue-100 text-blue-600', 'B-': 'bg-blue-50 text-blue-500',
  'C+': 'bg-yellow-100 text-yellow-700', C: 'bg-yellow-100 text-yellow-700',
};

const letterGrade = (score) => {
  if (score >= 93) return 'A+';
  if (score >= 87) return 'A';
  if (score >= 83) return 'A-';
  if (score >= 77) return 'B+';
  if (score >= 73) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 67) return 'C+';
  return 'C';
};

const sentimentColor = (s) => {
  if (!s) return 'bg-slate-100 text-slate-600';
  const l = s.toLowerCase();
  if (l.includes('very positive')) return 'bg-green-100 text-green-700';
  if (l.includes('positive')) return 'bg-green-50 text-green-600';
  if (l.includes('negative')) return 'bg-red-100 text-red-600';
  return 'bg-slate-100 text-slate-600';
};

// Keys are lowercase to match the AI prompt output in
// test-pilot-server/routes/adminDashboard.js (builder-insights-summary),
// which returns "positive | neutral | mixed | negative".
const SENTIMENT_STYLES = {
  'very positive': { bg: 'bg-green-100', text: 'text-green-700 border-green-200', dot: 'bg-green-500' },
  positive:        { bg: 'bg-green-50',  text: 'text-green-600 border-green-200', dot: 'bg-green-400' },
  neutral:         { bg: 'bg-slate-100', text: 'text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  mixed:           { bg: 'bg-amber-50',  text: 'text-amber-600 border-amber-200', dot: 'bg-amber-400' },
  negative:        { bg: 'bg-red-50',    text: 'text-red-600 border-red-200',     dot: 'bg-red-400' },
  'very negative': { bg: 'bg-red-100',   text: 'text-red-700 border-red-200',     dot: 'bg-red-500' },
};

const Section = ({ icon: Icon, title, count, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#E3E3E3] rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#FAFAFA] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-[#4242EA]" />
          <span className="text-sm font-semibold text-[#1E1E1E]">{title}</span>
          {count !== undefined && (
            <Badge className="bg-[#EFEFEF] text-slate-500 text-[10px]">{count}</Badge>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className="border-t border-[#E3E3E3]">{children}</div>}
    </div>
  );
};

const resolveDate = (d) => {
  if (!d) return '—';
  const raw = typeof d === 'object' && d.value ? d.value : String(d);
  try {
    return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return raw; }
};

const resolveStr = (v) => {
  if (!v) return '';
  if (typeof v === 'object' && v.value) return v.value;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Parse the analysis JSON from legacy API and extract grade + feedback */
function parseWorkProductItem(item, submissionContent) {
  let grade = resolveStr(item.grade || item.letterGrade);
  let feedback = resolveStr(item.feedback);
  let score = null;

  if (item.analysis && !grade) {
    try {
      const a = typeof item.analysis === 'string' ? JSON.parse(item.analysis) : item.analysis;
      score = a.completion_score ?? null;
      if (score != null) grade = letterGrade(score);
      feedback = feedback || a.feedback || a.submission_summary || '';
    } catch { /* ignore */ }
  }

  const rawVal = item.date || item.curriculum_date;
  const rawStr = !rawVal ? null : (typeof rawVal === 'object' && rawVal.value ? rawVal.value : String(rawVal));
  let formattedDate = '—';
  if (rawStr) {
    try {
      const d = new Date(rawStr.length === 10 ? rawStr + 'T12:00:00' : rawStr);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    } catch { /* keep dash */ }
  }

  // Only accept http(s) submission URLs — a javascript:/data: URL from the
  // API would execute when rendered into <a href>. Use the URL() parser
  // (not a regex) so edge cases like uppercase schemes, whitespace, and
  // embedded nulls are normalized consistently.
  const safeUrl = (raw) => {
    if (typeof raw !== 'string') return null;
    try {
      const u = new URL(raw.trim());
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
    } catch { return null; }
  };

  let submissionUrl = null;
  if (submissionContent) {
    try {
      const parsed = JSON.parse(submissionContent);
      if (parsed.type === 'image' && parsed.gcsPath) {
        submissionUrl = null;
      }
    } catch {
      submissionUrl = safeUrl(submissionContent);
    }
  }

  return {
    taskTitle: resolveStr(item.taskTitle || item.task_title),
    date: formattedDate,
    rawDate: rawStr || '—',
    grade,
    score,
    feedback,
    submissionUrl,
  };
}

const TaskRow = ({ item, submissionContent }) => {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseWorkProductItem(item, submissionContent);
  const gradeClass = parsed.grade ? (GRADE_COLORS[parsed.grade] || 'bg-slate-100 text-slate-600') : '';

  return (
    <>
      <tr
        className="hover:bg-[#FAFAFA] transition-colors cursor-pointer border-b border-[#EFEFEF]"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-2 px-3 text-xs font-medium text-[#1E1E1E] max-w-[200px]">
          <div className="flex items-center gap-1">
            <span className="line-clamp-1">{parsed.taskTitle}</span>
            {parsed.submissionUrl && (
              <a
                href={parsed.submissionUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 text-[#4242EA] hover:text-[#3232CC]"
                title={parsed.submissionUrl}
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">{parsed.date}</td>
        {parsed.grade ? (
          <td className="py-2 px-3">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${gradeClass}`}>{parsed.grade}</span>
            {parsed.score != null && (
              <span className="text-[9px] text-slate-400 ml-1">{parsed.score}%</span>
            )}
          </td>
        ) : <td className="py-2 px-3 text-xs text-slate-400">—</td>}
        <td className="py-2 px-3 text-xs text-slate-400">
          <span className="line-clamp-1">{parsed.feedback ? parsed.feedback.substring(0, 80) + '...' : '—'}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="bg-[#FAFAFA] px-4 py-3 border-b border-[#E3E3E3]">
            {parsed.feedback && <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{parsed.feedback}</p>}
            {parsed.submissionUrl && (
              <a
                href={parsed.submissionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-[#4242EA] hover:underline"
              >
                <ExternalLink size={11} />
                {parsed.submissionUrl.length > 60 ? parsed.submissionUrl.substring(0, 60) + '...' : parsed.submissionUrl}
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

const VideoItem = ({ v }) => {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = (s) => s >= 4 ? 'text-green-600' : s >= 3 ? 'text-yellow-600' : 'text-red-500';
  const rawDate = typeof v.submission_date === 'object' && v.submission_date?.value ? v.submission_date.value : v.submission_date;
  const formattedDate = rawDate ? (() => { try { const d = new Date(String(rawDate).length <= 10 ? rawDate + 'T12:00:00' : rawDate); return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return '—'; } })() : '—';
  const hasScores = v.average_score != null;
  const hasRationale = v.technical_rationale || v.business_rationale || v.professional_rationale;

  const getRationaleText = (rationale) => {
    if (!rationale) return null;
    if (typeof rationale === 'string') return rationale;
    return rationale.overall_explanation || rationale.explanation || JSON.stringify(rationale);
  };

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-[#1E1E1E]">{resolveStr(v.task_title)}</p>
          <p className="text-[10px] text-slate-400">{formattedDate}{v.cohort_name ? ` · ${v.cohort_name}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasScores && (
            <span className={`text-sm font-bold ${scoreColor(v.average_score)}`}>
              {v.average_score}/5
            </span>
          )}
          {v.loom_url && (
            <a
              href={v.loom_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-[#4242EA] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />
              Watch
            </a>
          )}
        </div>
      </div>
      {hasScores && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Technical', score: v.technical_score, rationale: v.technical_rationale },
            { label: 'Business', score: v.business_score, rationale: v.business_rationale },
            { label: 'Professional', score: v.professional_skills_score, rationale: v.professional_rationale },
          ].map(({ label, score, rationale }) => (
            <div
              key={label}
              className={`bg-[#FAFAFA] rounded p-1.5 text-center ${hasRationale ? 'cursor-pointer hover:bg-[#F0F0F0]' : ''}`}
              onClick={() => hasRationale && setExpanded(!expanded)}
            >
              <p className={`text-sm font-bold ${scoreColor(score)}`}>{score}/5</p>
              <p className="text-[9px] text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      )}
      {expanded && hasRationale && (
        <div className="bg-[#FAFAFA] rounded-md p-3 space-y-2">
          {[
            { label: 'Technical', rationale: v.technical_rationale },
            { label: 'Business', rationale: v.business_rationale },
            { label: 'Professional', rationale: v.professional_rationale },
          ].map(({ label, rationale }) => {
            const text = getRationaleText(rationale);
            if (!text) return null;
            return (
              <div key={label}>
                <p className="text-[10px] font-semibold text-[#4242EA] mb-0.5">{label}</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">{text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const InsightRow = ({ icon: Icon, label, content }) => {
  if (!content) return null;
  return (
    <div className="flex gap-2">
      <Icon size={13} className="text-[#4242EA] mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-xs text-[#1E1E1E] leading-relaxed">{content}</p>
      </div>
    </div>
  );
};

const RawConversationItem = ({ conversation: c }) => {
  const [expanded, setExpanded] = useState(false);
  const dateStr = c.task_date || c.created_at || '';
  const formattedDate = dateStr
    ? (() => { try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return '—'; } })()
    : '—';

  return (
    <div className="bg-[#FAFAFA] rounded-md px-3 py-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-slate-400 flex-shrink-0">{formattedDate}</span>
          <span className="text-xs font-medium text-[#1E1E1E] truncate">{c.task_title || 'Conversation'}</span>
        </div>
        {expanded ? <ChevronUp size={10} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={10} className="text-slate-400 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-[#E3E3E3]">
          {c.summary && <p className="text-[11px] text-slate-600 leading-relaxed mb-1">{c.summary}</p>}
          {c.raw_text && <p className="text-[10px] text-slate-400 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">{c.raw_text}</p>}
          {!c.summary && !c.raw_text && <p className="text-[10px] text-slate-400">No content available.</p>}
        </div>
      )}
    </div>
  );
};

const BuilderDrawer = ({ builder, startDate, endDate, selectedLevel, cohortId, onClose, onLogSaved }) => {
  const token = useAuthStore((s) => s.token);
  const [workProduct, setWorkProduct] = useState(null);
  const [submissions, setSubmissions] = useState({});
  const [peerFeedback, setPeerFeedback] = useState(null);
  const [prompts, setPrompts] = useState(null);
  const [videos, setVideos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [builderLogs, setBuilderLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // Read-only accounts (interview candidates) read the full builder picture — grades,
  // attendance, peer feedback, notes — but cannot change enrollment or add a log.
  const { isReadOnly } = usePermissions();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showInlineLogForm, setShowInlineLogForm] = useState(false);
  const [inlineLogType, setInlineLogType] = useState('behavioral');
  const [inlineLogNotes, setInlineLogNotes] = useState('');
  const [inlineLogNextSteps, setInlineLogNextSteps] = useState('');
  const [inlineLogDate, setInlineLogDate] = useState('');
  const [inlineLogSaving, setInlineLogSaving] = useState(false);
  const [insightsSummary, setInsightsSummary] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showRawConversations, setShowRawConversations] = useState(false);
  const [rawConversations, setRawConversations] = useState([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [enrollmentStatus, setEnrollmentStatus] = useState(builder?.enrollment_status || 'in_progress');
  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [assessmentScores, setAssessmentScores] = useState(null);

  // Weekly Surveys state
  const [surveyResponses, setSurveyResponses] = useState([]);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [docusignStatus, setDocusignStatus] = useState(undefined); // undefined = loading, null = not found
  const [builderPhoto, setBuilderPhoto] = useState(null);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    if (!builder?.user_id) return;
    setBuilderPhoto(null);
    setPhotoError(false);
    getUserProfilePhoto(builder.user_id, token)
      .then(setBuilderPhoto)
      .catch(() => setPhotoError(true));
  }, [builder?.user_id, token]);

  useEffect(() => {
    if (!builder?.user_id) return;
    setDocusignStatus(undefined);
    fetch(`${API_URL}/api/docusign/status/${builder.user_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setDocusignStatus(data?.docusign ?? null))
      .catch(() => setDocusignStatus(null));
  }, [builder?.user_id, token]);

  useEffect(() => {
    if (!builder?.user_id) return;
    setLoading(true);

    // Use caller-supplied date range to bound the per-builder fetch. Callers
    // that want cross-cohort history pass an early startDate (e.g. TodayTab
    // uses cohort start_date || '2024-01-01'), which keeps the window scoped
    // instead of hammering the API with every record since 2020.
    const rangeStart = startDate;
    const rangeEnd = endDate;

    const fetchType = (type) =>
      fetch(`${LEGACY_API}/builders/${builder.user_id}/details?type=${type}&startDate=${rangeStart}&endDate=${rangeEnd}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);

    const fetchVideos = async () => {
      try {
        const legacyRes = await fetch(`${LEGACY_API}/video-analyses?level=${encodeURIComponent(selectedLevel || builder.level || '')}&startDate=${rangeStart}&endDate=${rangeEnd}`);
        if (legacyRes.ok) {
          const all = await legacyRes.json();
          const userVids = Array.isArray(all) ? all.filter(v => String(v.user_id) === String(builder.user_id)) : [];
          if (userVids.length > 0) return userVids;
        }
      } catch { /* fall through */ }

      if (cohortId && token) {
        try {
          const res = await fetch(`${API_URL}/api/admin/dashboard/builder-videos?userId=${builder.user_id}&cohortId=${cohortId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            return (data.data || []).map(v => ({
              video_id: v.submission_id,
              task_title: v.task_title,
              loom_url: v.loom_url,
              submission_date: v.day_date || v.submission_date,
              cohort_name: v.cohort_name,
              average_score: v.average_score ?? null,
              technical_score: v.technical_score ?? null,
              business_score: v.business_score ?? null,
              professional_skills_score: v.professional_skills_score ?? null,
              technical_rationale: v.technical_rationale,
              business_rationale: v.business_rationale,
              professional_rationale: v.professional_rationale,
            }));
          }
        } catch { /* ignore */ }
      }
      return [];
    };

    const fetchPeerFeedback = () =>
      cohortId && token
        ? fetch(`${API_URL}/api/admin/dashboard/builder-peer-feedback?userId=${builder.user_id}&cohortId=${cohortId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.ok ? r.json() : null).then(d => d?.success ? d.data : null).catch(() => null)
        : fetchType('peer_feedback');

    const fetchSubmissions = () =>
      token
        ? fetch(`${API_URL}/api/admin/dashboard/builder-submissions?userId=${builder.user_id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.ok ? r.json() : null).then(d => {
            if (d?.success && Array.isArray(d.data)) {
              const map = {};
              d.data.forEach(s => { map[s.task_id] = s.content; });
              return map;
            }
            return {};
          }).catch(() => ({}))
        : Promise.resolve({});

    Promise.all([
      fetchType('workProduct'),
      fetchPeerFeedback(),
      fetchType('prompts'),
      fetchVideos(),
      fetchSubmissions(),
    ]).then(([wp, pf, pr, vids, subs]) => {
      setWorkProduct(wp);
      setPeerFeedback(pf);
      setPrompts(pr);
      setVideos(vids);
      setSubmissions(subs || {});
    }).finally(() => setLoading(false));
  }, [builder?.user_id, startDate, endDate, cohortId, token]);

  const fetchInsights = (refresh = false) => {
    if (!builder?.user_id || !cohortId || !token) return;
    setInsightsLoading(true);
    setInsightsSummary(null);
    if (!refresh) {
      setShowRawConversations(false);
      setRawConversations([]);
    }

    const wpArr = workProduct?.details || workProduct || [];
    const pfArr = peerFeedback?.details || peerFeedback || [];
    const vidArr = Array.isArray(videos) ? videos : [];

    const wpFormatted = (Array.isArray(wpArr) ? wpArr : []).slice(0, 10).map(item => {
      let grade = item.grade || item.letterGrade || '';
      let feedback = item.feedback || '';
      if (item.analysis && !grade) {
        try {
          const a = typeof item.analysis === 'string' ? JSON.parse(item.analysis) : item.analysis;
          const score = a.completion_score ?? null;
          if (score != null) grade = letterGrade(score);
          feedback = feedback || a.feedback || a.submission_summary || '';
        } catch { /* ignore */ }
      }
      return {
        taskTitle: item.taskTitle || item.task_title || '',
        date: item.date || item.curriculum_date || '',
        grade,
        feedback: (feedback || '').slice(0, 200),
      };
    });

    fetch(`${API_URL}/api/admin/dashboard/builder-insights-summary`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: builder.user_id,
        cohortId,
        refresh: refresh || undefined,
        context: {
          attendance: builder.attendance_percentage,
          tasksCompleted: builder.tasks_completed_percentage,
          gradedTasks: builder.total_graded_tasks,
          videoCount: builder.video_tasks_completed,
          workProduct: wpFormatted,
          peerFeedback: (Array.isArray(pfArr) ? pfArr : []).slice(0, 8).map(pf => ({
            reviewer_name: pf.reviewer_name || pf.reviewerName,
            sentiment: pf.sentiment_category || pf.sentiment,
            feedback_text: (pf.feedback_text || pf.feedback || pf.summary || '').slice(0, 250),
          })),
          videos: vidArr.slice(0, 5).map(v => ({
            task_title: v.task_title,
            submission_date: v.submission_date,
            average_score: v.average_score,
          })),
          logs: builderLogs.slice(0, 5).map(l => ({
            log_type: l.log_type,
            notes: (l.notes || '').slice(0, 200),
            created_date: l.created_date,
          })),
        },
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.success) setInsightsSummary(data.data); })
      .catch(() => {})
      .finally(() => setInsightsLoading(false));
  };

  useEffect(() => {
    if (!loading && builder?.user_id && cohortId && token) {
      fetchInsights();
    }
  }, [loading, builder?.user_id, cohortId, token]);

  const loadRawConversations = () => {
    if (rawConversations.length > 0 || !builder?.user_id || !cohortId || !token) {
      setShowRawConversations(!showRawConversations);
      return;
    }
    setRawLoading(true);
    setShowRawConversations(true);
    fetch(`${API_URL}/api/admin/dashboard/builder-conversation-insights?userId=${builder.user_id}&cohortId=${cohortId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { if (data.success) setRawConversations(data.data || []); })
      .catch(() => {})
      .finally(() => setRawLoading(false));
  };

  const refreshInsights = () => fetchInsights(true);

  const fetchLogs = async () => {
    if (!builder?.user_id || !token) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/builder-logs?builderId=${builder.user_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setBuilderLogs(data.data || []);
    } catch { /* ignore */ }
    setLogsLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [builder?.user_id, token]);

  // Fetch weekly survey responses for this builder
  useEffect(() => {
    if (!builder?.name) return;
    setSurveyLoading(true);
    fetch(`${LEGACY_API}/surveys/responses?startDate=${startDate}&endDate=${endDate}`)
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : [];
        const builderName = builder.name.toLowerCase();
        const matched = all.filter(r =>
          r.user_name && r.user_name.toLowerCase() === builderName
        ).sort((a, b) => new Date(b.task_date?.value || b.task_date || 0) - new Date(a.task_date?.value || a.task_date || 0));
        setSurveyResponses(matched);
      })
      .catch(() => setSurveyResponses([]))
      .finally(() => setSurveyLoading(false));
  }, [builder?.name, startDate, endDate]);

  const handleLogStatusChange = (logId, newStatus) => {
    setBuilderLogs(prev => prev.map(l => l.log_id === logId ? { ...l, status: newStatus } : l));
  };

  const handleSupportStatusChange = (supportId, newStatus) => {
    setBuilderLogs(prev => prev.map(l => {
      if (l.support_ticket?.support_id === supportId) {
        return { ...l, support_ticket: { ...l.support_ticket, current_status: newStatus } };
      }
      return l;
    }));
  };

  const handleLogSaved = () => {
    fetchLogs();
    onLogSaved?.();
  };

  // Fetch assessment scores for radar chart
  useEffect(() => {
    if (!builder?.user_id || !token) return;
    fetch(`${API_URL}/api/admin/assessment-grades/comprehensive-analysis/${builder.user_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.analysis?.length > 0) {
          const typeMap = {
            self: 'Self', knowledge_assessment: 'Self',
            technical: 'Technical', project: 'Technical',
            business: 'Business', problem_solution: 'Business',
            professional: 'Professional', video: 'Professional',
          };
          const scores = {};
          data.analysis.forEach(a => {
            const type = (a.assessment_type || '').toLowerCase();
            const mapped = typeMap[type];
            if (mapped && a.overall_score != null) {
              scores[mapped] = Math.round(a.overall_score * 100);
            }
          });
          setAssessmentScores(scores);
        }
      })
      .catch(() => {});
  }, [builder?.user_id, token]);

  const radarData = assessmentScores ? ['Self', 'Technical', 'Business', 'Professional'].map(cat => ({
    category: cat, score: assessmentScores[cat] ?? null,
  })) : null;
  const hasRadar = radarData?.some(d => d.score != null);

  const handleInlineLogSave = async () => {
    if (!inlineLogNotes.trim() || !builder?.user_id) return;
    setInlineLogSaving(true);
    try {
      await fetch(`${API_URL}/api/admin/dashboard/builder-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          builderId: builder.user_id,
          cohortId: cohortId,
          logType: inlineLogType,
          notes: inlineLogNotes,
          nextSteps: inlineLogNextSteps || undefined,
          interaction_date: inlineLogDate || undefined,
        }),
      });
      setInlineLogNotes('');
      setInlineLogNextSteps('');
      setInlineLogDate('');
      setShowInlineLogForm(false);
      fetchLogs();
      onLogSaved?.();
    } catch (e) { console.error('Save log failed:', e); }
    setInlineLogSaving(false);
  };

  const handleEnrollmentChange = async (newStatus) => {
    if (!builder.enrollment_id || !token) return;
    setSavingEnrollment(true);
    try {
      await fetch(`${API_URL}/api/admin/dashboard/builder-enrollment/${builder.enrollment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      setEnrollmentStatus(newStatus);
    } catch (e) { console.error('Enrollment update failed:', e); }
    setSavingEnrollment(false);
  };

  if (!builder) return null;

  const wpItems = workProduct?.details || workProduct || [];
  const pfItems = peerFeedback?.details || peerFeedback || [];
  const promptItems = prompts?.details || prompts || [];
  const videoItems = Array.isArray(videos) ? videos : [];

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-[100]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 bottom-0 right-0 w-full max-w-[640px] bg-white shadow-2xl z-[101] flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#E3E3E3] bg-white flex-shrink-0">
          <div className="flex items-start gap-4">
            {/* Builder headshot */}
            <div className="w-14 h-14 rounded-full overflow-hidden bg-[#EFEFEF] flex-shrink-0 flex items-center justify-center border border-[#E3E3E3]">
              {builderPhoto && !photoError ? (
                <img
                  src={builderPhoto}
                  alt={builder.name}
                  className="w-full h-full object-cover"
                  onError={() => setPhotoError(true)}
                />
              ) : (
                <svg
                  className="w-full h-full"
                  viewBox="0 0 100 100"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="100" height="100" fill="#EFEFEF" />
                  <circle cx="50" cy="38" r="18" fill="#C8C8C8" />
                  <path d="M 10 95 Q 12 62 50 62 Q 88 62 90 95 Z" fill="#C8C8C8" />
                </svg>
              )}
            </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#1E1E1E]">{builder.name}</h2>
              {savingEnrollment ? (
                <span className="text-[10px] text-slate-400">Saving...</span>
              ) : isReadOnly ? (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  enrollmentStatus === 'completed' ? 'bg-green-100 text-green-700' :
                  enrollmentStatus === 'withdrawn' ? 'bg-red-100 text-red-600' :
                  enrollmentStatus === 'deferred' ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {(enrollmentStatus || 'in_progress').replace(/_/g, ' ')}
                </span>
              ) : (
                <select
                  value={enrollmentStatus}
                  onChange={e => handleEnrollmentChange(e.target.value)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer focus:outline-none appearance-none ${
                    enrollmentStatus === 'completed' ? 'bg-green-100 text-green-700' :
                    enrollmentStatus === 'withdrawn' ? 'bg-red-100 text-red-600' :
                    enrollmentStatus === 'deferred' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}
                >
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="deferred">Deferred</option>
                </select>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{builder.email ?? builder.level}</p>
            <div className="flex gap-3 mt-2">
              <div className="text-center">
                <p className={`text-sm font-bold ${builder.attendance_percentage >= 80 ? 'text-green-600' : builder.attendance_percentage >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                  {builder.attendance_percentage}%
                </p>
                <p className="text-[9px] text-slate-400 uppercase">Attendance</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-[#1E1E1E]">{builder.tasks_completed_percentage}%</p>
                <p className="text-[9px] text-slate-400 uppercase">Tasks</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-[#1E1E1E]">{builder.total_peer_feedback_count}</p>
                <p className="text-[9px] text-slate-400 uppercase">Feedback</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-[#1E1E1E]">{builder.total_graded_tasks}</p>
                <p className="text-[9px] text-slate-400 uppercase">Graded</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-[#1E1E1E]">{builder.video_tasks_completed}</p>
                <p className="text-[9px] text-slate-400 uppercase">Videos</p>
              </div>
            </div>
          </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[#EFEFEF] transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-[#EFEFEF] rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Conversation Insights (AI Summary) — top of drawer */}
              <Section icon={Sparkles} title="Conversation Insights">
                {insightsLoading ? (
                  <div className="px-4 py-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 size={12} className="animate-spin" />
                      Analyzing conversations...
                    </div>
                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[#EFEFEF] rounded animate-pulse" />)}
                  </div>
                ) : insightsSummary ? (
                  <div className="px-4 py-4 space-y-4">
                    {/* Sentiment + date range header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const s = SENTIMENT_STYLES[(insightsSummary.sentiment || '').toLowerCase()] || SENTIMENT_STYLES.neutral;
                          return (
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                              {insightsSummary.sentiment}
                            </span>
                          );
                        })()}
                        {insightsSummary.date_range?.from && (
                          <span className="text-[10px] text-slate-400">
                            {insightsSummary.conversation_count} conversations &middot;{' '}
                            {(() => { try { return new Date(insightsSummary.date_range.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } })()}
                            {' – '}
                            {(() => { try { return new Date(insightsSummary.date_range.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } })()}
                          </span>
                        )}
                      </div>
                      <button onClick={refreshInsights} className="p-1 rounded hover:bg-[#EFEFEF] transition-colors" title="Refresh insights">
                        <RefreshCw size={12} className="text-slate-400" />
                      </button>
                    </div>

                    {/* Insight rows */}
                    <div className="space-y-3">
                      <InsightRow icon={Target} label="Current Focus" content={insightsSummary.current_focus} />
                      <InsightRow icon={TrendingUp} label="Wins & Strengths" content={insightsSummary.wins} />
                      <InsightRow icon={AlertTriangle} label="Blockers & Struggles" content={insightsSummary.blockers} />
                      <InsightRow icon={Lightbulb} label="Facilitator Tip" content={insightsSummary.facilitator_tips} />
                    </div>

                    {/* Tags */}
                    {insightsSummary.flags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {insightsSummary.flags.map((flag, i) => {
                          const f = flag.toLowerCase();
                          const isPositive = ['strong attendance', 'high performer', 'grades improving', 'strong presenter', 'peer leader', 'strong collaborator', 'thriving', 'highly motivated'].includes(f);
                          const isNegative = ['low attendance', 'attendance declining', 'falling behind', 'missing assignments', 'grades slipping', 'receiving negative feedback', 'at risk', 'disengaged'].includes(f);
                          const cls = isPositive
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : isNegative
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200';
                          return (
                            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>
                              {flag}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Raw conversations toggle */}
                    <button
                      onClick={loadRawConversations}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#4242EA] transition-colors pt-1"
                    >
                      {showRawConversations ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      {showRawConversations ? 'Hide' : 'View'} raw conversations
                    </button>

                    {showRawConversations && (
                      <div className="border-t border-[#EFEFEF] pt-3 space-y-2">
                        {rawLoading ? (
                          <div className="space-y-2">
                            {[1, 2].map(i => <div key={i} className="h-10 bg-[#EFEFEF] rounded animate-pulse" />)}
                          </div>
                        ) : rawConversations.length > 0 ? (
                          rawConversations.map((c) => (
                            <RawConversationItem key={c.task_id} conversation={c} />
                          ))
                        ) : (
                          <p className="text-xs text-slate-400">No raw conversations found.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No standup or retro conversations yet.</p>
                )}
              </Section>

              {/* Assessments */}
              {hasRadar && (
                <Section icon={Award} title="Assessments">
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-center gap-6">
                      <div className="w-[180px] h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                            <PolarGrid stroke="#E3E3E3" />
                            <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: '#1E1E1E' }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar dataKey="score" stroke="#4242EA" fill="#4242EA" fillOpacity={0.2} strokeWidth={2} dot={{ r: 2, fill: '#4242EA' }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5">
                        {radarData.map(d => (
                          <div key={d.category} className="flex items-center gap-2">
                            <span className={`text-sm font-bold w-8 text-right ${
                              d.score >= 80 ? 'text-green-600' : d.score >= 60 ? 'text-yellow-600' : d.score != null ? 'text-red-500' : 'text-slate-300'
                            }`}>{d.score != null ? `${d.score}%` : '—'}</span>
                            <span className="text-[11px] text-slate-500">{d.category}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              {/* Weekly Surveys */}
              <Section icon={ClipboardList} title="Weekly Surveys" count={surveyResponses.length} defaultOpen={false}>
                <div className="px-3 py-3 space-y-2">
                  {surveyLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map(i => <div key={i} className="h-12 bg-[#EFEFEF] rounded animate-pulse" />)}
                    </div>
                  ) : surveyResponses.length > 0 ? (
                    surveyResponses.map((r, i) => {
                      const date = r.task_date?.value || r.task_date || '';
                      const dateStr = date ? (() => { try { return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return '—'; } })() : '—';
                      const score = r.referral_likelihood;
                      const npsClass = score >= 9 ? 'bg-green-100 text-green-700' : score <= 6 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700';
                      return (
                        <div key={r.id || i} className="bg-[#FAFAFA] rounded-md px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{dateStr}</span>
                            {score != null && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${npsClass}`}>
                                NPS: {score}
                              </span>
                            )}
                          </div>
                          {r.what_we_did_well && (
                            <p className="text-[11px] text-slate-600">
                              <span className="font-medium text-green-600">Well: </span>{r.what_we_did_well}
                            </p>
                          )}
                          {r.what_to_improve && (
                            <p className="text-[11px] text-slate-600">
                              <span className="font-medium text-red-500">Improve: </span>{r.what_to_improve}
                            </p>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-2">No survey responses.</p>
                  )}
                </div>
              </Section>

              {/* Builder Notes */}
              <Section icon={FileText} title="Builder Notes" count={builderLogs.length} defaultOpen={false}>
                <div className="px-3 py-3 space-y-2">
                  {showInlineLogForm ? (
                    <div className="bg-[#FAFAFA] rounded-md p-3 space-y-2 border border-[#E3E3E3]">
                      <div className="flex items-center gap-2">
                        {['behavioral', 'conversation', 'interview'].map(t => (
                          <button key={t} onClick={() => setInlineLogType(t)}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                              inlineLogType === t ? 'bg-[#4242EA] text-white' : 'bg-white border border-[#E3E3E3] text-slate-500'
                            }`}>{t}</button>
                        ))}
                      </div>
                      <textarea value={inlineLogNotes} onChange={e => setInlineLogNotes(e.target.value)}
                        placeholder="Notes..."
                        className="w-full text-xs border border-[#E3E3E3] rounded px-2 py-1.5 bg-white focus:border-[#4242EA] focus:outline-none resize-none" rows={2} />
                      <textarea value={inlineLogNextSteps} onChange={e => setInlineLogNextSteps(e.target.value)}
                        placeholder="Next steps (optional)..."
                        className="w-full text-xs border border-[#E3E3E3] rounded px-2 py-1.5 bg-white focus:border-[#4242EA] focus:outline-none resize-none" rows={1} />
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 flex-shrink-0">Date:</label>
                        <input type="date" value={inlineLogDate}
                          onChange={e => setInlineLogDate(e.target.value)}
                          max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}
                          className="text-xs border border-[#E3E3E3] rounded px-2 py-1 bg-white focus:border-[#4242EA] focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">{inlineLogDate ? '' : 'Defaults to today'}</span>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowInlineLogForm(false)}
                          className="text-xs text-slate-500 hover:text-[#1E1E1E] px-2 py-1">Cancel</button>
                        <button onClick={handleInlineLogSave} disabled={inlineLogSaving || !inlineLogNotes.trim()}
                          className="text-xs font-medium bg-[#4242EA] text-white px-3 py-1 rounded hover:bg-[#3535c8] disabled:opacity-50">
                          {inlineLogSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : !isReadOnly ? (
                    <button onClick={() => setShowInlineLogForm(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#4242EA] hover:underline">
                      <Plus size={12} /> Add Log
                    </button>
                  ) : null}
                  {logsLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map(i => <div key={i} className="h-16 bg-[#EFEFEF] rounded animate-pulse" />)}
                    </div>
                  ) : builderLogs.length > 0 ? (
                    <div className="space-y-2">
                      {builderLogs.map(log => (
                        <BuilderLogEntry
                          key={log.log_id}
                          log={log}
                          onStatusChange={handleLogStatusChange}
                          onSupportStatusChange={handleSupportStatusChange}
                          onLogUpdated={fetchLogs}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-3">No logs recorded.</p>
                  )}
                </div>
              </Section>

              {/* Good Job Agreement */}
              <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
                docusignStatus?.hasSigned
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-[#FAFAFA] border-[#E3E3E3]'
              }`}>
                <FileSignature size={16} className={docusignStatus?.hasSigned ? 'text-indigo-500' : 'text-slate-300'} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1E1E1E]">Good Job Agreement</p>
                  {docusignStatus === undefined ? (
                    <p className="text-[10px] text-slate-400">Checking…</p>
                  ) : docusignStatus?.hasSigned ? (
                    <div className="flex items-center gap-1 text-[10px] text-indigo-600">
                      <CheckCircle size={10} />
                      <span>Signed via DocuSign</span>
                      {docusignStatus.signedAt && (
                        <span className="flex items-center gap-0.5 ml-1 text-indigo-400">
                          <Clock size={9} />
                          {new Date(docusignStatus.signedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      {docusignStatus ? `Status: ${docusignStatus.status}` : 'Not signed yet'}
                    </p>
                  )}
                </div>
              </div>

              {/* Video Submissions */}
              <Section icon={Video} title="Video Submissions" count={videoItems.length} defaultOpen={false}>
                {videoItems.length > 0 ? (
                  <div className="divide-y divide-[#EFEFEF]">
                    {videoItems.map((v, i) => <VideoItem key={v.video_id || i} v={v} />)}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No video submissions.</p>
                )}
              </Section>

              {/* Work Product */}
              <Section icon={BookOpen} title="Work Product" count={Array.isArray(wpItems) ? wpItems.length : 0}>
                {Array.isArray(wpItems) && wpItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 text-[10px] uppercase tracking-wide border-b border-[#E3E3E3]">
                          <th className="py-2 px-3 font-medium">Task</th>
                          <th className="py-2 px-3 font-medium">Date</th>
                          <th className="py-2 px-3 font-medium">Grade</th>
                          <th className="py-2 px-3 font-medium">Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wpItems.map((item, i) => <TaskRow key={i} item={item} submissionContent={submissions[item.task_id]} />)}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No work product data.</p>
                )}
              </Section>

              {/* Peer Feedback */}
              <Section icon={MessageSquare} title="Peer Feedback" count={Array.isArray(pfItems) ? pfItems.length : 0} defaultOpen={false}>
                {Array.isArray(pfItems) && pfItems.length > 0 ? (
                  <div className="divide-y divide-[#EFEFEF]">
                    {pfItems.map((item, i) => (
                      <div key={i} className="px-3 py-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[#1E1E1E]">{item.reviewer_name || item.reviewerName}</span>
                          {(item.sentiment_category || item.sentiment) && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${sentimentColor(item.sentiment_category || item.sentiment)}`}>
                              {item.sentiment_category || item.sentiment}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 ml-auto">
                            {resolveDate(item.date || item.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{resolveStr(item.feedback_text || item.feedback || item.summary)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No peer feedback data.</p>
                )}
              </Section>

              {/* Prompts Sent */}
              <Section icon={Send} title="Prompts Sent" count={Array.isArray(promptItems) ? promptItems.length : 0} defaultOpen={false}>
                {Array.isArray(promptItems) && promptItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 text-[10px] uppercase tracking-wide border-b border-[#E3E3E3]">
                          <th className="py-2 px-3 font-medium">Date</th>
                          <th className="py-2 px-3 font-medium">Prompts Sent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFEFEF]">
                        {promptItems.map((item, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-3 text-xs text-slate-500">{resolveDate(item.date)}</td>
                            <td className="py-1.5 px-3 text-xs font-medium text-[#1E1E1E]">{resolveStr(item.prompts_sent || item.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No prompt data.</p>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
};

export default BuilderDrawer;
