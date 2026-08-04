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
import BuildCard from './onboarding/BuildCard';
import StageDots from './onboarding/StageDots';
import StyleChoiceCards from './onboarding/StyleChoiceCards';
import CoachCard from './onboarding/CoachCard';

// ---------------------------------------------------------------------------
// Streaming markdown bubble — coach turns animate as text arrives via SSE.
// Mirrors the same pattern used in Learning.jsx and PathfinderCompass.jsx.
// ---------------------------------------------------------------------------
const StreamingMarkdownMessage = ({ content }) => {
  const displayedContent = useStreamingText(content || '');
  // Convert bare URLs to clickable links.
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
// with the new opt-in showMicButton prop — the visual is identical to the
// regular chat input, with a Voice button added on the bottom-left.
// ---------------------------------------------------------------------------
function OnboardingInterface({ taskId, userId, isCompleted, isLastTask, onComplete, onNextExercise }) {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);

  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]); // [{ role: 'user'|'coach', content, seq }]
  const [hasStarted, setHasStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState('');
  // ---- Redesign state (server-driven; all inert when the knob is off) ----
  const [redesign, setRedesign] = useState(false);
  const [stage, setStage] = useState('meet');           // server-stamped via SSE `stage` events
  const [buildCard, setBuildCard] = useState(null);     // { whatYouBuilt, artifactUrl } from /start
  const [styleOptions, setStyleOptions] = useState(null); // server payload from `style_choices`
  const [showStyleCards, setShowStyleCards] = useState(false);
  const [stylePicked, setStylePicked] = useState(null); // family key
  const startTimeRef = useRef(Date.now());
  const completedRef = useRef(false);
  // Synchronous in-flight guard for handleComplete. A bare useState would
  // let a fast double-click slip through because the state update is async
  // — both clicks would read isFinishing=false in the same microtask and
  // both call completeSession.
  const finishingRef = useRef(false);
  const seqRef = useRef(0);
  const streamingMsgIdRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  // Imperative ref into AutoExpandTextarea so we can focus() the input after
  // a coach turn completes — mirrors Learning.jsx (regular chat).
  const textareaRef = useRef(null);
  // Ref-mirror of handleComplete so sendChat (which closes over `token` only)
  // can fire the latest version when it detects the completion marker.
  const handleCompleteRef = useRef(() => {});
  // Ref-synced session id so sendChat reads the latest value without closing
  // over a stale state read. setState is async — the useEffect that calls
  // setSessionId(...) followed by sendChat('') in the same tick would
  // otherwise see sessionId=null in sendChat's closure.
  const sessionIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Auto-scroll on new turns / streamed chunks.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus the input when the most recent coach turn finishes streaming,
  // so the builder doesn't have to click into the textarea to reply. Mirrors
  // the same pattern in Learning.jsx for the regular chat.
  useEffect(() => {
    if (isSending || isFinishing || isCompleted) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'coach' || last.streaming) return;
    // Small delay so the reveal animation visibly completes before focus
    // steals attention, and so the auto-scroll has a chance to settle.
    const t = setTimeout(() => {
      textareaRef.current?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, [messages, isSending, isFinishing, isCompleted]);

  // ---- Stream a chat turn through SSE, threading chunks into one bubble ----
  // The coach emits [ONBOARDING_COMPLETE] as the very last token of its
  // final message when it has wrapped the conversation. We:
  //   1. accumulate the full streamed text per turn,
  //   2. strip the marker substring from the visible bubble,
  //   3. if the marker was present, fire handleComplete() after the stream
  //      closes so the carousel advances without a manual Finish button.
  const COMPLETION_MARKER = '[ONBOARDING_COMPLETE]';
  const stripMarker = (s) =>
    typeof s === 'string' ? s.split(COMPLETION_MARKER).join('').trimEnd() : s;

  const sendChat = useCallback(
    async (messageText, meta = null) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      setIsSending(true);
      setError('');

      // Optimistically append the builder's bubble (unless this is the opening
      // call with empty message text).
      if (messageText.length > 0) {
        seqRef.current += 1;
        setMessages((prev) => [
          ...prev,
          { id: `u-${seqRef.current}`, role: 'user', content: messageText, seq: seqRef.current },
        ]);
      }
      // Prepare a streaming coach bubble.
      seqRef.current += 1;
      const coachBubbleId = `c-${seqRef.current}`;
      streamingMsgIdRef.current = coachBubbleId;
      setMessages((prev) => [
        ...prev,
        { id: coachBubbleId, role: 'coach', content: '', seq: seqRef.current, streaming: true },
      ]);

      // Tear down any prior stream.
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      // Per-turn marker tracking. The marker may arrive split across chunks,
      // so we scan the accumulated text — never just the latest chunk.
      let accumulated = '';
      let sawCompletionMarker = false;

      try {
        await streamChat(token, sid, messageText, {
          signal: abortRef.current.signal,
          meta,
          onText: ({ content }) => {
            accumulated += content;
            if (!sawCompletionMarker && accumulated.includes(COMPLETION_MARKER)) {
              sawCompletionMarker = true;
            }
            const visible = sawCompletionMarker ? stripMarker(accumulated) : accumulated;
            setMessages((prev) => prev.map((m) =>
              m.id === coachBubbleId ? { ...m, content: visible } : m
            ));
          },
          // Redesign control events — server-emitted, never in the LLM text.
          onCoachMessage: ({ content }) => {
            // A COMPLETE coach bubble (the authored taste-test beats). The
            // streaming intro bubble already exists above; beats append after.
            // Capture id/seq NOW — the setMessages updater runs later, and two
            // synchronous beat frames would otherwise read the same final
            // seqRef value and collide on React keys.
            seqRef.current += 1;
            const id = `cm-${seqRef.current}`;
            const seq = seqRef.current;
            setMessages((prev) => [...prev, { id, role: 'coach', content, seq }]);
          },
          onStage: ({ value }) => {
            setRedesign(true);
            if (value) setStage(value);
          },
          onStyleChoices: ({ options }) => {
            setStyleOptions(Array.isArray(options) && options.length ? options : null);
            setShowStyleCards(true);
          },
          onDone: () => {
            setMessages((prev) => prev.map((m) =>
              m.id === coachBubbleId ? { ...m, streaming: false } : m
            ));
          },
          onError: ({ error: errMsg }) => {
            setMessages((prev) => prev.map((m) =>
              m.id === coachBubbleId ? { ...m, content: errMsg || 'Something went wrong.', streaming: false } : m
            ));
          },
        });

        // Final safety pass — catches the marker if it landed in a chunk
        // boundary that didn't trip the inclusion check.
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
        // Recheck the marker even on error — if the coach emitted it before
        // the connection dropped, the carousel must still advance. Without
        // this the user gets stuck after a transient network blip on the
        // final turn.
        if (!sawCompletionMarker && accumulated.includes(COMPLETION_MARKER)) {
          sawCompletionMarker = true;
        }
      } finally {
        setIsSending(false);
        streamingMsgIdRef.current = null;
        // Belt-and-suspenders: clear streaming:true on ANY bubble that's
        // still flagged. The service layer's onDone fires when the SSE
        // stream closes cleanly even without a {type:done} event, but
        // covering this here too means a thrown error (network drop,
        // abort, etc.) can't leave a permanent loading indicator.
        setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
        // Fire the deferred completion AFTER the bubble is committed and the
        // streaming flag cleared — running in finally means a stream error
        // post-marker still completes the session (vs. the previous bug
        // where the marker fired only on a clean catch-skip path).
        if (sawCompletionMarker) {
          setTimeout(() => { handleCompleteRef.current?.(); }, 400);
        }
      }
    },
    [token]  // Intentionally NOT depending on sessionId — we read it via sessionIdRef.current.
  );

  // ---- On Start: create the session, hydrate prior turns (resume), kick off opening ----
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
        // Set ref immediately so any synchronous sendChat call later in this
        // tick sees the correct id (the sync-from-state useEffect runs on
        // the NEXT render, which is too late).
        sessionIdRef.current = startData.sessionId;
        setSessionId(startData.sessionId);

        // Redesign payload (knob on): build card + server-tracked state.
        if (startData.redesign) {
          setRedesign(true);
          if (startData.stage) setStage(startData.stage);
          if (startData.stylePick) setStylePicked(startData.stylePick);
          if (startData.buildCard) setBuildCard(startData.buildCard);
        }

        // Resume: pull prior transcript ONLY when the server tells us the
        // session was resumed. Skips an unnecessary network round-trip on
        // every fresh session start.
        let hadPriorTurns = false;
        if (startData.resumed) {
          try {
            const { session: priorSession, messages: priorMessages } = await getSession(token, startData.sessionId);
            // Redesign resume: re-render the tap cards when the beats went
            // out but no pick was ever captured (stage + pick come from the
            // server-stamped session row, not the transcript).
            if (!cancelled && startData.redesign && priorSession) {
              if (priorSession.stage) setStage(priorSession.stage);
              if (priorSession.style_pick) setStylePicked(priorSession.style_pick);
              if (priorSession.beats_delivered_at && !priorSession.style_pick) {
                setShowStyleCards(true);
              }
            }
            if (!cancelled && Array.isArray(priorMessages) && priorMessages.length > 0) {
              hadPriorTurns = true;
              const hydrated = priorMessages.map((m) => {
                seqRef.current += 1;
                return {
                  id: `r-${seqRef.current}`,
                  role: m.role === 'builder' ? 'user' : 'coach',
                  content: m.content || '',
                  seq: seqRef.current,
                };
              });
              setMessages(hydrated);
            }
          } catch (hydrateErr) {
            console.error('Failed to hydrate prior onboarding turns:', hydrateErr);
          }
        }

        setIsLoading(false);

        // Kick off the OPENING (empty message) ONLY if no prior turns existed.
        if (!hadPriorTurns && !cancelled) {
          // Don't await — let the SSE stream drive the UI from here.
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
  // Mount-once cleanup so we only fire abandon ONCE on actual unmount, not on
  // every sessionId change. Read sessionId via the ref so we get whatever
  // value was current at unmount time.
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
  // AutoExpandTextarea's onSubmit signature: (messageText, modelChoice). The
  // model arg is ignored for onboarding — the coach model is server-fixed via
  // ONBOARDING_CHAT_MODEL env on the controller.
  const handleSubmit = (messageText) => {
    if (!messageText || !messageText.trim() || isSending) return;
    sendChat(messageText.trim());
  };

  // Taste-test tap: optimistic collapse to the confirmation chip, then send
  // the structured pick as a chat turn (empty message + meta). The server
  // records it first-write-wins and persists the teaching method immediately.
  const handleStylePick = (family) => {
    if (isSending || stylePicked) return;
    setStylePicked(family);
    sendChat('', { style_pick: family });
  };

  // Finalize the session (enqueues server-side extraction) then hand control
  // back to the parent so the task carousel can advance. The completedRef
  // guard suppresses the abandon-on-unmount cleanup since we're completing
  // cleanly. Idempotent — re-clicks are no-ops while finishing.
  const handleComplete = useCallback(async () => {
    if (completedRef.current || finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    // DON'T tear down the stream here — if the server gates this completion
    // (last coach turn was a question, or too-few-turns), the conversation
    // continues. Only abort once we know completion is final.
    try {
      const sid = sessionIdRef.current;
      if (!sid) {
        // Nothing to complete against; fall through to the success path so
        // the parent still gets onComplete (preserves the previous behavior).
        completedRef.current = true;
        onComplete?.();
        return;
      }
      const durationSeconds = Math.max(
        0,
        Math.round((Date.now() - startTimeRef.current) / 1000)
      );
      const result = await completeSession(token, sid, { durationSeconds });
      // Server-side gate: marker was emitted but the transcript isn't ready
      // (last coach turn was a question, or < 6 coach turns). Silently
      // ignore — let the conversation keep going. The LLM's next closing
      // turn (statement, no '?') will pass the gate.
      if (result && result.gated === true && result.completed === false) {
        console.info('[onboarding] completion gated by server:', result.reason);
        finishingRef.current = false;
        setIsFinishing(false);
        return;
      }
      // Real completion — now safe to abort any in-flight stream and tell
      // the parent we're done.
      if (abortRef.current) abortRef.current.abort();
      completedRef.current = true;
      onComplete?.();
    } catch (err) {
      console.error('Failed to complete onboarding session:', err);
      toast.error('Could not finish onboarding — please try again.');
      // Reset both gates so the user can retry.
      finishingRef.current = false;
      setIsFinishing(false);
    }
  }, [token, onComplete]);

  // Keep the ref pointed at the latest handleComplete so the marker-detection
  // path inside sendChat always invokes the current callback.
  useEffect(() => {
    handleCompleteRef.current = handleComplete;
  }, [handleComplete]);

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

  // Match the regular chat interface (Learning.jsx): first letter of the
  // signed-in user's first name from authStore, uppercase, with 'U' as a
  // last-ditch fallback. The userId prop was wrong here — String(814) → "8".
  const userInitial = authUser?.firstName
    ? authUser.firstName.charAt(0).toUpperCase()
    : 'U';

  // ---- Chat surface ----
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg-light relative">
      {/* Redesign: labeled progress dots — the session has a visible, finite
          shape. Server-stamped stage; inert for legacy sessions. */}
      {redesign && (
        <div className="border-b border-stardust/60 bg-white/70 backdrop-blur-sm">
          <StageDots stage={stage} completed={isCompleted} />
        </div>
      )}
      {/* Transcript — full height, scrolls behind the absolutely-positioned
          input tray. pb-44 reserves space so the last message clears the tray
          when scrolled to bottom; mid-scroll messages just slide behind it. */}
      <div className="flex-1 min-h-0 overflow-y-auto py-8 px-6 pb-44">
        <div className="max-w-2xl mx-auto">
          {redesign && buildCard && (
            <BuildCard whatYouBuilt={buildCard.whatYouBuilt} artifactUrl={buildCard.artifactUrl} />
          )}
          {messages.length === 0 && (
            <div className="flex items-center gap-3">
              <img src="/preloader.gif" alt="Loading…" className="w-8 h-8" />
              <span className="italic text-gray-500 text-sm font-proxima">
                Connecting you with your coach…
              </span>
            </div>
          )}
          {messages.map((message, index) => {
            // Coach bubble waiting on its first SSE chunk — show the Pursuit
            // preloader inline, same pattern as Learning.jsx (line ~1762).
            // Once any content has arrived, switch to the streaming markdown
            // renderer so the text reveals naturally.
            const isCoachThinking =
              message.role === 'coach' &&
              message.streaming &&
              !(message.content && message.content.trim().length > 0);
            return (
              <div key={message.id ?? index} className="mb-6">
                {message.role === 'user' ? (
                  <div className="bg-stardust rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                        <span className="text-pursuit-purple text-sm font-proxima font-semibold">
                          {userInitial}
                        </span>
                      </div>
                      <div className="flex-1 text-carbon-black leading-relaxed text-base font-proxima">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ) : isCoachThinking ? (
                  <div className="flex items-center gap-3">
                    <img src="/preloader.gif" alt="Coach is thinking…" className="w-8 h-8" />
                    <span className="italic text-gray-500 text-sm font-proxima">
                      Coach is thinking…
                    </span>
                  </div>
                ) : (
                  <StreamingMarkdownMessage content={message.content} />
                )}
              </div>
            );
          })}
          {/* Taste-test tap cards — shown when the server says so (or on
              resume with beats out + no pick); collapse to a chip once
              picked. Typing an answer instead of tapping stays valid. */}
          {showStyleCards && !isCompleted && (
            <StyleChoiceCards
              options={styleOptions}
              pickedFamily={stylePicked}
              disabled={isSending || isFinishing}
              onPick={handleStylePick}
            />
          )}
          {/* The wrap payoff, made durable: the Coach Card renders in-chat
              once the session completes (it also lives on the Dashboard). */}
          {redesign && isCompleted && (
            <div className="mb-6">
              <CoachCard />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input tray — absolutely positioned over the transcript so messages
          scroll behind it (matches Learning.jsx). pointer-events-none on the
          wrapper lets clicks pass through the gutter; the inner block restores
          pointer events for the textarea itself. Once isCompleted flips
          (marker-driven completion has fired and the parent has acked it),
          the textarea is replaced with the same TaskCompletionBar the chat
          interface uses — staff/builders can read the closing message in
          peace and click Next when they're ready instead of being yanked
          to the next surface. */}
      <div className="absolute bottom-6 left-0 right-0 px-6 z-10 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          {isCompleted ? (
            <TaskCompletionBar
              onNextExercise={onNextExercise}
              isLastTask={isLastTask}
            />
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
