import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import useAuthStore from '../../../stores/authStore';
import {
  startSession,
  getSession,
  abandonSession,
  completeSession,
  streamChat,
} from '../../../services/onboardingApi';
import { useStreamingText } from '../../../hooks/useStreamingText';
import { Button } from '../../../components/ui/button';
import AutoExpandTextarea from '../../../components/AutoExpandTextarea';
import TaskCompletionBar from '../../../components/TaskCompletionBar/TaskCompletionBar';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { STAGES, normalizeStage, CHAPTER_META } from './onboarding/StageDots';
import ChapterNav from './onboarding/ChapterNav';
import TastePanel from './onboarding/TastePanel';
import InterstitialCard from './onboarding/InterstitialCard';
import TastePanelFallbackCards, { DEFAULT_OPTIONS } from './onboarding/StyleChoiceCards';
import CoachCard from './onboarding/CoachCard';

// ---------------------------------------------------------------------------
// Redesign layout (2026-08-07, mockup-approved): each chapter is its OWN
// full-screen panel — finishing one slides to the next; the ChapterNav's
// visited nodes slide back for rereading. The taste test is a focused
// TastePanel (not chat bubbles). Server-stamped state drives everything;
// with the knob off none of this renders and the legacy chat is untouched.
// ---------------------------------------------------------------------------

// Chapter headers at the top of each panel (learn/ahead descriptions shared
// with the gate cards via CHAPTER_META; story has no gate, so its copy lives
// here).
const CHAPTER_HEADERS = {
  story: {
    part: 1,
    total: 3,
    title: 'Getting to Know You',
    sub: 'Your coach has read your application and workshop work — this is a conversation, not an interview.',
  },
  learn: { ...CHAPTER_META.learn, sub: 'One small idea, taught four different ways — react to whichever actually lands.' },
  ahead: { ...CHAPTER_META.ahead, sub: "Where you're headed, what your weeks look like, and what you'll take on together." },
};

// Hydrated beat turns are persisted as '**Way N of 4 — Label:** text' — parse
// them back into the taste panel on resume.
const BEAT_TURN_RE = /^\*\*Way (\d) of (\d) — (.+?):\*\* ([\s\S]*)$/;

// Resume hydration: a persisted tap turn reads '[Builder tapped: Show me — …]'
// / '[💡 That clicked — …]' — display them like the sent messages they are.
const displayTurnContent = (content) => {
  if (typeof content !== 'string') return content;
  const tapped = content.match(/^\[Builder tapped: (.+)\]$/);
  if (tapped) return tapped[1];
  const clicked = content.match(/^\[(💡 That clicked)( — .+)?\]$/);
  if (clicked) return clicked[1];
  return content;
};

const familyOption = (family) => DEFAULT_OPTIONS.find((o) => o.family === family) || null;

// ---------------------------------------------------------------------------
// Streaming markdown bubble — coach turns animate as text arrives via SSE.
// Mirrors the same pattern used in Learning.jsx and PathfinderCompass.jsx.
// ---------------------------------------------------------------------------
const StreamingMarkdownMessage = ({ content }) => {
  const displayedContent = useStreamingText(content || '');
  const processed = displayedContent.replace(
    /(?<!\()(?<!]\()https?:\/\/[^\s)]+/g,
    (url) => `[${url}](${url})`
  );
  return (
    <div className="text-carbon-black leading-relaxed text-base font-proxima">
      <ReactMarkdown
        components={{
          p: (props) => <p className="mb-3" {...props} />,
          ul: (props) => <ul className="list-disc pl-6 my-3 space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal pl-6 my-3 space-y-1" {...props} />,
          a: (props) => (
            <a className="text-blue-500 hover:underline break-all" target="_blank" rel="noopener noreferrer" {...props} />
          ),
          strong: (props) => <strong className="font-semibold text-carbon-black" {...props} />,
          em: (props) => <em className="italic text-carbon-black" {...props} />,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
};

// ---------------------------------------------------------------------------
// OnboardingInterface — SSE-streamed chat with voice dictation.
// Uses the shared AutoExpandTextarea component (Learning.jsx's input tray)
// with the opt-in showMicButton prop.
// ---------------------------------------------------------------------------
function OnboardingInterface({ taskId, userId, isCompleted, isLastTask, onComplete, onNextExercise }) {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);

  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]); // [{ id, role|kind, content, stage, ... }]
  const [hasStarted, setHasStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState('');

  // ---- Redesign state (server-driven; all inert when the knob is off) ----
  const [redesign, setRedesign] = useState(false);
  const [stage, setStage] = useState('story');          // server-stamped progress
  const [viewStage, setViewStage] = useState('story');  // which panel is on screen
  const [stylePicked, setStylePicked] = useState(null); // family key
  // Taste-test panel state — fed by beat/beat_followup/style_choices/
  // style_resolved control events. `ways` accumulate in arrival order.
  const [taste, setTaste] = useState({ ways: [], currentIdx: 0, clicked: [], followup: null, finalOptions: null });
  const [pickSummary, setPickSummary] = useState(null); // { label, description }
  // Ref-mirror of stage so SSE handlers (closures) tag messages with the
  // chapter that was CURRENT when they arrived (the server re-emits stage
  // every turn; only transitions change it).
  const stageRef = useRef('story');
  const setStageBoth = (value) => { stageRef.current = value; setStage(value); };

  const startTimeRef = useRef(Date.now());
  const completedRef = useRef(false);
  // Synchronous in-flight guard for handleComplete (double-click safe).
  const finishingRef = useRef(false);
  const seqRef = useRef(0);
  const streamingMsgIdRef = useRef(null);
  const abortRef = useRef(null);
  const textareaRef = useRef(null);
  const handleCompleteRef = useRef(() => {});
  // Per-chapter scroll anchors — the active panel auto-scrolls independently.
  const endRefs = useRef({});
  const sessionIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Auto-follow: when server progress advances, slide the view with it.
  useEffect(() => { setViewStage(stage); }, [stage]);

  // Auto-scroll the active panel on new content.
  useEffect(() => {
    endRefs.current[viewStage]?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, taste, viewStage, pickSummary]);

  // Auto-focus the input when the most recent coach turn finishes streaming.
  useEffect(() => {
    if (isSending || isFinishing || isCompleted) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'coach' || last.streaming) return;
    const t = setTimeout(() => { textareaRef.current?.focus(); }, 300);
    return () => clearTimeout(t);
  }, [messages, isSending, isFinishing, isCompleted]);

  // ---- Stream a chat turn through SSE ----
  // The coach emits [ONBOARDING_COMPLETE] as the very last token of its final
  // message; we accumulate, strip, and fire handleComplete after the stream.
  const COMPLETION_MARKER = '[ONBOARDING_COMPLETE]';
  const stripMarker = (s) =>
    typeof s === 'string' ? s.split(COMPLETION_MARKER).join('').trimEnd() : s;

  const appendMessage = (item) => {
    seqRef.current += 1;
    const withId = { id: `${item.kind || item.role}-${seqRef.current}`, stage: stageRef.current, ...item };
    setMessages((prev) => [...prev, withId]);
    return withId.id;
  };

  const sendChat = useCallback(
    async (messageText, meta = null) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      setIsSending(true);
      setError('');

      if (messageText.length > 0) {
        appendMessage({ role: 'user', content: messageText });
      }
      // Streaming coach bubble — created UPFRONT only for turns that always
      // stream (typed messages + the opening), lazily on the first text chunk
      // otherwise, so control-event-only turns never strand a phantom bubble.
      const expectStream = messageText.length > 0 || !meta;
      let coachBubbleId = null;
      const ensureCoachBubble = () => {
        if (coachBubbleId) return;
        coachBubbleId = appendMessage({ role: 'coach', content: '', streaming: true });
        streamingMsgIdRef.current = coachBubbleId;
      };
      if (expectStream) ensureCoachBubble();

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      let accumulated = '';
      let sawCompletionMarker = false;

      try {
        await streamChat(token, sid, messageText, {
          signal: abortRef.current.signal,
          meta,
          onText: ({ content }) => {
            ensureCoachBubble();
            accumulated += content;
            if (!sawCompletionMarker && accumulated.includes(COMPLETION_MARKER)) {
              sawCompletionMarker = true;
            }
            const visible = sawCompletionMarker ? stripMarker(accumulated) : accumulated;
            const id = coachBubbleId;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: visible } : m)));
          },
          // ---- Redesign control events (server-emitted, never LLM text) ----
          onCoachMessage: ({ content }) => {
            // A COMPLETE coach bubble (e.g. the validated chapter-closing turn).
            appendMessage({ role: 'coach', content });
          },
          onStage: ({ value }) => {
            setRedesign(true);
            const next = normalizeStage(value);
            if (!next || next === stageRef.current) return;
            setStageBoth(next);
          },
          onInterstitial: (data) => {
            // The chapter gate — rendered at the END of the closing chapter's
            // panel; the next chapter starts on the "Let's go" tap.
            appendMessage({
              kind: 'interstitial', pending: true,
              gateStage: data.stage, part: data.part, total: data.total,
              title: data.title, description: data.description,
            });
          },
          onBeat: (data) => {
            setTaste((prev) => ({
              ...prev,
              ways: [...prev.ways, {
                index: data.index, family: data.family, label: data.label,
                description: data.description, content: data.content,
              }],
              currentIdx: prev.ways.length,
              followup: null,
            }));
          },
          onBeatFollowup: (data) => {
            setTaste((prev) => ({ ...prev, followup: { clickedLabel: data.clickedLabel } }));
          },
          onStyleChoices: ({ options, prompt }) => {
            setTaste((prev) => ({
              ...prev,
              followup: null,
              finalOptions: { prompt: prompt || null, options: Array.isArray(options) && options.length ? options : null },
            }));
          },
          onStyleResolved: ({ family, label, description }) => {
            setStylePicked(family);
            setPickSummary({ label: label || familyOption(family)?.label, description: description || familyOption(family)?.description });
            setTaste((prev) => ({ ...prev, followup: null, finalOptions: null }));
          },
          onDone: () => {
            setMessages((prev) => prev.map((m) => (m.id === coachBubbleId ? { ...m, streaming: false } : m)));
          },
          onError: ({ error: errMsg }) => {
            ensureCoachBubble();
            const id = coachBubbleId;
            setMessages((prev) => prev.map((m) =>
              m.id === id ? { ...m, content: errMsg || 'Something went wrong.', streaming: false } : m
            ));
          },
        });

        if (!sawCompletionMarker && accumulated.includes(COMPLETION_MARKER)) {
          sawCompletionMarker = true;
          setMessages((prev) => prev.map((m) =>
            m.id === coachBubbleId ? { ...m, content: stripMarker(accumulated) } : m
          ));
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Chat stream failed:', err);
          setMessages((prev) => prev.map((m) =>
            m.id === coachBubbleId
              ? { ...m, content: 'Something went wrong on my end — try sending that again.', streaming: false }
              : m
          ));
        }
        if (!sawCompletionMarker && accumulated.includes(COMPLETION_MARKER)) {
          sawCompletionMarker = true;
        }
      } finally {
        setIsSending(false);
        streamingMsgIdRef.current = null;
        // Clear any lingering streaming flag; DROP a bubble that never got
        // content (a control-event-only turn).
        setMessages((prev) => prev
          .filter((m) => !(m.streaming && !(m.content && m.content.length)))
          .map((m) => (m.streaming ? { ...m, streaming: false } : m)));
        if (sawCompletionMarker) {
          setTimeout(() => { handleCompleteRef.current?.(); }, 400);
        }
      }
    },
    [token]  // sessionId read via ref
  );

  // ---- On Start: create the session, hydrate prior turns, kick off opening ----
  useEffect(() => {
    if (!hasStarted) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    startTimeRef.current = Date.now();

    (async () => {
      try {
        const startData = await startSession(token, taskId);
        if (cancelled) return;
        sessionIdRef.current = startData.sessionId;
        setSessionId(startData.sessionId);

        if (startData.redesign) {
          setRedesign(true);
          if (startData.stage) setStageBoth(normalizeStage(startData.stage));
          if (startData.stylePick) {
            setStylePicked(startData.stylePick);
            const opt = familyOption(startData.stylePick);
            if (opt) setPickSummary({ label: opt.label, description: opt.description });
          }
        }

        let hadPriorTurns = false;
        if (startData.resumed) {
          try {
            const { session: priorSession, messages: priorMessages } = await getSession(token, startData.sessionId);
            const sessStage = normalizeStage(priorSession?.stage);
            const midTaste = !!(startData.redesign && priorSession &&
              priorSession.beats_delivered_at && !priorSession.style_pick);
            if (!cancelled && startData.redesign && priorSession) {
              if (priorSession.stage) setStageBoth(sessStage);
              if (priorSession.style_pick) {
                setStylePicked(priorSession.style_pick);
                const opt = familyOption(priorSession.style_pick);
                if (opt) setPickSummary({ label: opt.label, description: opt.description });
              }
            }
            if (!cancelled && Array.isArray(priorMessages) && priorMessages.length > 0) {
              hadPriorTurns = true;
              const ways = [];
              const hydrated = [];
              for (const m of priorMessages) {
                seqRef.current += 1;
                const raw = m.content || '';
                const beatMatch = m.role !== 'builder' && raw.match(BEAT_TURN_RE);
                if (beatMatch) {
                  // Beats rebuild the taste panel, not chat bubbles.
                  const family = DEFAULT_OPTIONS.find((o) => o.label === beatMatch[3])?.family || null;
                  ways.push({
                    index: parseInt(beatMatch[1], 10),
                    family,
                    label: beatMatch[3],
                    description: familyOption(family)?.description || '',
                    content: beatMatch[4],
                  });
                  continue;
                }
                hydrated.push({
                  id: `r-${seqRef.current}`,
                  role: m.role === 'builder' ? 'user' : 'coach',
                  content: displayTurnContent(raw),
                  stage: normalizeStage(m.stage) || 'story',
                });
              }
              if (ways.length) {
                setTaste({
                  ways,
                  currentIdx: ways.length - 1,
                  clicked: Array.isArray(priorSession?.beat_clicks) ? priorSession.beat_clicks : [],
                  followup: null,
                  finalOptions: null,
                });
              }
              // Gate pending — the builder left at a chapter boundary.
              const pendingGate = priorSession?.interstitial_shown_for
                && normalizeStage(priorSession.interstitial_shown_for) !== sessStage
                ? normalizeStage(priorSession.interstitial_shown_for)
                : null;
              if (pendingGate && CHAPTER_META[pendingGate]) {
                seqRef.current += 1;
                hydrated.push({
                  id: `iv-${seqRef.current}`,
                  kind: 'interstitial',
                  pending: true,
                  gateStage: pendingGate,
                  stage: sessStage,
                  ...CHAPTER_META[pendingGate],
                });
              }
              setMessages(hydrated);
              // `midTaste` sessions keep the panel's chips live (derived in
              // render from stylePicked being unset).
              void midTaste;
            }
          } catch (hydrateErr) {
            console.error('Failed to hydrate prior onboarding turns:', hydrateErr);
          }
        }

        setIsLoading(false);
        if (!hadPriorTurns && !cancelled) {
          sendChat('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to start onboarding session');
          setIsLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, taskId]);

  // ---- Abandon: best-effort on unmount when not completed ----
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      const sid = sessionIdRef.current;
      if (!completedRef.current && sid) {
        abandonSession(token, sid).catch(() => { /* ignore */ });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Handlers ----
  const handleSubmit = (messageText) => {
    if (!messageText || !messageText.trim() || isSending) return;
    sendChat(messageText.trim());
  };

  // Chapter gate: mark the card passed and ask the server to open the chapter.
  const handleChapterContinue = (item) => {
    if (isSending) return;
    setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, pending: false } : m)));
    sendChat('', { chapter_continue: item.gateStage });
  };

  // Taste-panel reactions — judged in the moment, one way at a time.
  const handleBeatClicked = () => {
    if (isSending || stylePicked) return;
    const way = taste.ways[taste.currentIdx];
    if (!way) return;
    setTaste((prev) => ({ ...prev, clicked: [...new Set([...prev.clicked, way.family])] }));
    appendMessage({ role: 'user', content: `💡 That clicked — ${way.label}` });
    sendChat('', { beat_reaction: { value: 'clicked' } });
  };
  const handleBeatNext = () => {
    if (isSending || stylePicked) return;
    sendChat('', { beat_reaction: { value: 'next' } });
  };
  const handleBeatFollowup = (value) => {
    if (isSending) return;
    setTaste((prev) => ({ ...prev, followup: null }));
    appendMessage({ role: 'user', content: value === 'rest' ? 'Show me the rest' : 'Keep moving' });
    sendChat('', { beat_followup: { value } });
  };
  const handleFinalPick = (option) => {
    if (isSending || stylePicked || !option?.family) return;
    appendMessage({ role: 'user', content: `${option.label} — ${option.description}` });
    sendChat('', { style_pick: option.family });
  };
  const handleSelectWay = (idx) => setTaste((prev) => ({ ...prev, currentIdx: idx }));

  // Finalize the session then hand control back to the parent.
  const handleComplete = useCallback(async () => {
    if (completedRef.current || finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    try {
      const sid = sessionIdRef.current;
      if (!sid) {
        completedRef.current = true;
        onComplete?.();
        return;
      }
      const durationSeconds = Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000));
      const result = await completeSession(token, sid, { durationSeconds });
      if (result && result.gated === true && result.completed === false) {
        console.info('[onboarding] completion gated by server:', result.reason);
        finishingRef.current = false;
        setIsFinishing(false);
        return;
      }
      if (abortRef.current) abortRef.current.abort();
      completedRef.current = true;
      onComplete?.();
    } catch (err) {
      console.error('Failed to complete onboarding session:', err);
      toast.error('Could not finish onboarding — please try again.');
      finishingRef.current = false;
      setIsFinishing(false);
    }
  }, [token, onComplete]);

  useEffect(() => { handleCompleteRef.current = handleComplete; }, [handleComplete]);

  // ---- Pre-call screen ----
  if (!hasStarted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-light px-6 py-10">
        <div className="max-w-xl w-full text-center">
          <h2 className="text-2xl font-proxima-bold text-carbon-black mb-3">Meet your coach</h2>
          <p className="text-[#666] font-proxima mb-8">
            You&apos;ll have a short conversation. Type your replies, or click the mic to speak
            them — your voice gets transcribed into the chat. The coach replies in text. Take
            your time; you can finish whenever you&apos;re ready.
          </p>
          <Button
            onClick={() => setHasStarted(true)}
            className="bg-pursuit-purple hover:bg-pursuit-purple/90 px-8 py-6 text-base font-proxima-bold"
          >
            Start conversation
          </Button>
        </div>
      </div>
    );
  }

  // ---- Loading the session ----
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-light">
        <div className="flex items-center gap-3 text-[#666] font-proxima">
          <Loader2 className="w-5 h-5 animate-spin" />
          Setting up your onboarding…
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-light px-6">
        <div className="max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-mastery-pink mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-carbon-black font-proxima mb-2">
            We couldn&apos;t start your onboarding session
          </h2>
          <p className="text-[#666] font-proxima text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const userInitial = authUser?.firstName ? authUser.firstName.charAt(0).toUpperCase() : 'U';
  const viewIdx = Math.max(0, STAGES.findIndex((s) => s.slug === normalizeStage(viewStage)));
  const tasteActive = taste.ways.length > 0 && !stylePicked;

  const renderChatItem = (message) => {
    if (message.kind === 'interstitial') {
      return (
        <InterstitialCard
          key={message.id}
          part={message.part}
          total={message.total}
          title={message.title}
          description={message.description}
          pending={message.pending && !isCompleted}
          disabled={isSending || isFinishing}
          onContinue={() => handleChapterContinue(message)}
        />
      );
    }
    const isCoachThinking =
      message.role === 'coach' && message.streaming &&
      !(message.content && message.content.trim().length > 0);
    return (
      <div key={message.id} className="mb-6">
        {message.role === 'user' ? (
          <div className="bg-stardust rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                <span className="text-pursuit-purple text-sm font-proxima font-semibold">{userInitial}</span>
              </div>
              <div className="flex-1 text-carbon-black leading-relaxed text-base font-proxima">
                {message.content}
              </div>
            </div>
          </div>
        ) : isCoachThinking ? (
          <div className="flex items-center gap-3">
            <img src="/preloader.gif" alt="Coach is thinking…" className="w-8 h-8" />
            <span className="italic text-gray-500 text-sm font-proxima">Coach is thinking…</span>
          </div>
        ) : (
          <StreamingMarkdownMessage content={message.content} />
        )}
      </div>
    );
  };

  // ---- Legacy surface (knob off): single scroll, no chapters ----
  if (!redesign) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-bg-light relative">
        <div className="flex-1 min-h-0 overflow-y-auto py-8 px-6 pb-44">
          <div className="max-w-2xl mx-auto">
            {messages.length === 0 && (
              <div className="flex items-center gap-3">
                <img src="/preloader.gif" alt="Loading…" className="w-8 h-8" />
                <span className="italic text-gray-500 text-sm font-proxima">Connecting you with your coach…</span>
              </div>
            )}
            {messages.map(renderChatItem)}
            <div ref={(el) => { endRefs.current.story = el; }} />
          </div>
        </div>
        <div className="absolute bottom-6 left-0 right-0 px-6 z-10 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            {isCompleted ? (
              <TaskCompletionBar onNextExercise={onNextExercise} isLastTask={isLastTask} />
            ) : (
              <AutoExpandTextarea
                ref={textareaRef}
                onSubmit={handleSubmit}
                disabled={isSending || isFinishing}
                showMicButton
                placeholder="Reply to your coach…"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Redesign surface: full-screen sliding chapter panels ----
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg-light relative">
      <div className="border-b border-stardust/60 bg-white/70 backdrop-blur-sm">
        <ChapterNav
          currentStage={stage}
          viewStage={viewStage}
          completed={isCompleted}
          onNavigate={(slug) => setViewStage(slug)}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="flex h-full w-[300%] transition-transform duration-500 ease-in-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${viewIdx * (100 / 3)}%)` }}
        >
          {STAGES.map(({ slug }) => {
            const header = CHAPTER_HEADERS[slug];
            const chapterMessages = messages.filter((m) => normalizeStage(m.stage) === slug);
            return (
              <section key={slug} className="w-1/3 h-full overflow-y-auto py-8 px-6 pb-44" aria-label={header.title}>
                <div className="max-w-2xl mx-auto">
                  <div className="text-center mb-7">
                    <div className="text-[10px] font-proxima-bold uppercase tracking-widest text-pursuit-purple">
                      Part {header.part} of {header.total}
                    </div>
                    <h2 className="text-xl font-proxima-bold text-carbon-black mt-0.5 mb-1">{header.title}</h2>
                    <p className="text-sm font-proxima text-[#666] max-w-md mx-auto">{header.sub}</p>
                  </div>

                  {slug === 'story' && chapterMessages.length === 0 && (
                    <div className="flex items-center gap-3">
                      <img src="/preloader.gif" alt="Loading…" className="w-8 h-8" />
                      <span className="italic text-gray-500 text-sm font-proxima">Connecting you with your coach…</span>
                    </div>
                  )}

                  {/* The taste test lives at the top of the learn chapter as a
                      focused panel; it collapses to the pick summary once the
                      style resolves. */}
                  {slug === 'learn' && tasteActive && (
                    <TastePanel
                      ways={taste.ways}
                      currentIdx={taste.currentIdx}
                      clickedFamilies={taste.clicked}
                      followup={taste.followup}
                      finalOptions={taste.finalOptions}
                      disabled={isSending || isFinishing || isCompleted}
                      onSelectWay={handleSelectWay}
                      onClicked={handleBeatClicked}
                      onNext={handleBeatNext}
                      onFollowup={handleBeatFollowup}
                      onFinalPick={handleFinalPick}
                    />
                  )}
                  {slug === 'learn' && !tasteActive && !stylePicked && taste.finalOptions && (
                    <div className="mb-6">
                      <TastePanelFallbackCards
                        options={taste.finalOptions.options}
                        disabled={isSending || isFinishing || isCompleted}
                        onPick={handleFinalPick}
                      />
                    </div>
                  )}
                  {slug === 'learn' && pickSummary && (
                    <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-pursuit-purple/20 bg-pursuit-purple/5 px-4 py-3 text-sm font-proxima text-carbon-black">
                      <span className="text-pursuit-purple font-proxima-bold">✓</span>
                      <span>
                        How you learn: <strong>{pickSummary.label}</strong>
                        {pickSummary.description ? <> — {pickSummary.description.toLowerCase()}</> : null}.
                        Your coach will teach you this way — changeable anytime.
                      </span>
                    </div>
                  )}

                  {chapterMessages.map(renderChatItem)}

                  {slug === 'ahead' && isCompleted && (
                    <div className="mb-6">
                      <CoachCard />
                    </div>
                  )}
                  <div ref={(el) => { endRefs.current[slug] = el; }} />
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Input tray — the existing shared tray, untouched. */}
      <div className="absolute bottom-6 left-0 right-0 px-6 z-10 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          {isCompleted ? (
            <TaskCompletionBar onNextExercise={onNextExercise} isLastTask={isLastTask} />
          ) : (
            <AutoExpandTextarea
              ref={textareaRef}
              onSubmit={handleSubmit}
              disabled={isSending || isFinishing}
              showMicButton
              placeholder="Reply to your coach…"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default OnboardingInterface;
