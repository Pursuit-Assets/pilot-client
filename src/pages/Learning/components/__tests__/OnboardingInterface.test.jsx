import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock useAuthStore — selector-based (component reads s.token).
// ---------------------------------------------------------------------------
vi.mock('../../../../stores/authStore', () => {
  const state = { token: 'test-token', user: { id: 42, firstName: 'Bea' } };
  const useAuthStore = (selector) => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { __esModule: true, default: useAuthStore };
});

// ---------------------------------------------------------------------------
// Mock the onboarding API — no network. streamChat drives the SSE pipeline:
// the component passes us { onText, onDone, onError, signal } and we invoke
// onText/onDone synchronously to simulate a streamed reply.
// ---------------------------------------------------------------------------
vi.mock('../../../../services/onboardingApi', () => ({
  startSession: vi.fn(),
  getSession: vi.fn(),
  completeSession: vi.fn(),
  abandonSession: vi.fn(),
  streamChat: vi.fn(),
  getCoachCard: vi.fn(),
  correctCoachCard: vi.fn(),
}));

// sonner toast — keep silent; the Finish handler shows a toast on failure.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import OnboardingInterface from '../OnboardingInterface';
import {
  startSession,
  getSession,
  completeSession,
  abandonSession,
  streamChat,
} from '../../../../services/onboardingApi';

const SESSION = { sessionId: 'sess-1' };

// Render and click through the "Meet your coach" pre-call screen so the
// startSession effect runs. The component gates everything behind that
// Start button; tests that need the chat path always pass through here.
async function renderOnboarding(props = {}) {
  let utils;
  await act(async () => {
    utils = render(
      <OnboardingInterface
        taskId="task-1"
        userId={42}
        isCompleted={false}
        isLastTask={false}
        onComplete={props.onComplete || vi.fn()}
        {...props}
      />
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /start conversation/i }));
    // Two microtask flushes — startSession resolves on tick 1, the
    // opening-line sendChat() resolves on tick 2.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
}

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView — the component's auto-scroll
  // effect calls it on every new turn.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  } else {
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  }
  vi.clearAllMocks();
  startSession.mockResolvedValue(SESSION);
  getSession.mockResolvedValue({ messages: [] });
  completeSession.mockResolvedValue({});
  abandonSession.mockResolvedValue({});
  // Default streamChat: emit one coach chunk then done. Tests that need
  // different behavior override per-test.
  streamChat.mockImplementation(async (_token, _sid, _message, { onText, onDone }) => {
    onText?.({ content: 'Hi there!' });
    onDone?.({ sequenceNumber: 1 });
  });
});

afterEach(() => {
  vi.clearAllTimers();
});

describe('OnboardingInterface', () => {
  // -------------------------------------------------------------------------
  // Pre-call screen + Start gate
  // -------------------------------------------------------------------------
  it('renders the "Meet your coach" pre-call screen before any API call', () => {
    render(
      <OnboardingInterface taskId="task-1" userId={42} isCompleted={false} />
    );
    expect(screen.getByText(/meet your coach/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start conversation/i })).toBeInTheDocument();
    // No session has started yet — startSession must not fire on mount.
    expect(startSession).not.toHaveBeenCalled();
  });

  it('clicking Start triggers startSession with the token and taskId', async () => {
    await renderOnboarding();
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledWith('test-token', 'task-1');
  });

  it('shows an error state when startSession rejects', async () => {
    startSession.mockRejectedValueOnce(new Error('boom'));
    await renderOnboarding();
    expect(screen.getByText(/couldn.t start your onboarding session/i)).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Opening turn: with no prior transcript, the component calls sendChat('')
  // to fetch the coach's greeting via SSE.
  // -------------------------------------------------------------------------
  it('kicks off the opening turn via streamChat when no prior turns exist', async () => {
    await renderOnboarding();
    expect(streamChat).toHaveBeenCalledTimes(1);
    const [token, sid, message] = streamChat.mock.calls[0];
    expect(token).toBe('test-token');
    expect(sid).toBe(SESSION.sessionId);
    expect(message).toBe('');
  });

  // -------------------------------------------------------------------------
  // Resume: prior transcript → hydrate, skip the opening sendChat
  // -------------------------------------------------------------------------
  it('hydrates prior turns via getSession when startSession reports resumed:true', async () => {
    startSession.mockResolvedValueOnce({ ...SESSION, resumed: true });
    getSession.mockResolvedValueOnce({
      messages: [
        { role: 'builder', content: 'Earlier builder message', seq: 1 },
        { role: 'coach', content: 'Earlier coach reply', seq: 2 },
      ],
    });
    await renderOnboarding();
    expect(getSession).toHaveBeenCalledWith('test-token', SESSION.sessionId);
    expect(await screen.findByText('Earlier builder message')).toBeInTheDocument();
    // Coach reply still renders (via the streaming-markdown bubble), but
    // since useStreamingText reveals one char at a time, we wait for it.
    await waitFor(() => {
      expect(screen.getByText(/Earlier coach reply/)).toBeInTheDocument();
    }, { timeout: 3000 });
    // No opening sendChat — only hydration.
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('SKIPS the getSession round-trip on a fresh session (resumed:false)', async () => {
    // Default SESSION mock has no resumed flag → component must not fetch
    // the transcript, since there's nothing to hydrate.
    await renderOnboarding();
    expect(getSession).not.toHaveBeenCalled();
    // It does call streamChat with empty message to get the coach's opener.
    expect(streamChat).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // User typing: textarea → streamChat with the message + optimistic user bubble
  // -------------------------------------------------------------------------
  it('sends a typed reply via streamChat and renders the user bubble optimistically', async () => {
    await renderOnboarding();
    streamChat.mockClear(); // ignore the opening-turn call

    const textarea = screen.getByPlaceholderText(/reply to your coach/i);
    fireEvent.input(textarea, { target: { value: 'Typed hello' } });
    await act(async () => {
      fireEvent.keyPress(textarea, { key: 'Enter', code: 'Enter', charCode: 13 });
      await Promise.resolve();
    });

    expect(streamChat).toHaveBeenCalledTimes(1);
    const [, sid, message] = streamChat.mock.calls[0];
    expect(sid).toBe(SESSION.sessionId);
    expect(message).toBe('Typed hello');
    expect(await screen.findByText('Typed hello')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Marker-driven completion: when the coach emits [ONBOARDING_COMPLETE] as
  // its last token, the client must strip it from the visible bubble AND
  // auto-fire onComplete so the carousel advances. No manual Finish button.
  // -------------------------------------------------------------------------
  it('strips [ONBOARDING_COMPLETE] from the visible coach bubble', async () => {
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onText, onDone }) => {
      onText?.({ content: 'Great chatting! [ONBOARDING_COMPLETE]' });
      onDone?.({ sequenceNumber: 1 });
    });
    await renderOnboarding();
    await waitFor(() => {
      expect(screen.getByText(/Great chatting!/i)).toBeInTheDocument();
    });
    // The marker itself must NOT be visible to the builder.
    expect(screen.queryByText(/ONBOARDING_COMPLETE/)).toBeNull();
    // Drain the deferred handleComplete timer scheduled by the marker path
    // so it can't leak into the next test as a stale completeSession call.
    await waitFor(
      () => { expect(completeSession).toHaveBeenCalled(); },
      { timeout: 2000 },
    );
  });

  it('marker on the coach turn triggers completeSession + onComplete (no button needed)', async () => {
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onText, onDone }) => {
      onText?.({ content: 'All set!\n[ONBOARDING_COMPLETE]' });
      onDone?.({ sequenceNumber: 1 });
    });
    const onComplete = vi.fn();
    await renderOnboarding({ onComplete });
    // The component defers handleComplete by 400ms after the marker; wait
    // for completeSession to be called rather than racing the timer.
    await waitFor(
      () => {
        expect(completeSession).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Finish button is gone — the input tray has no manual completion control', async () => {
    await renderOnboarding();
    expect(screen.queryByTitle(/finish onboarding/i)).toBeNull();
    expect(screen.queryByText(/finish & wrap up/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Abandon on unmount when never completed (best-effort cleanup)
  // -------------------------------------------------------------------------
  it('abandons the session on unmount when it was never completed', async () => {
    const { unmount } = await renderOnboarding();
    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    expect(abandonSession).toHaveBeenCalledTimes(1);
    expect(abandonSession).toHaveBeenCalledWith('test-token', SESSION.sessionId);
  });

  it('does NOT abandon on unmount when the session was completed via marker', async () => {
    // Coach emits the completion marker → handleComplete fires → completedRef
    // is set → the unmount cleanup should skip abandonSession.
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onText, onDone }) => {
      onText?.({ content: 'See you soon! [ONBOARDING_COMPLETE]' });
      onDone?.({ sequenceNumber: 1 });
    });
    const { unmount } = await renderOnboarding();
    await waitFor(
      () => {
        expect(completeSession).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
    abandonSession.mockClear();
    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    expect(abandonSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Redesign ("Meet Your Coach" v2) — server-signal-driven UI. Everything below
// is inert unless /start returns redesign:true or the stream emits control
// events, so the legacy tests above double as the knob-off regression suite.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Redesign ("Meet Your Coach" v2) — full-screen chapter panels. All three
// panels are MOUNTED at once inside a sliding track (so a chapter title
// appears in both the ChapterNav and its own panel header — queries must be
// scoped or count-aware). The taste test is a focused TastePanel fed by
// beat/style control events, not chat bubbles. Everything here is inert
// unless /start returns redesign:true, so the legacy tests above double as
// the knob-off regression suite.
// ---------------------------------------------------------------------------
describe('OnboardingInterface — redesign', () => {
  const REDESIGN_START = {
    sessionId: 'sess-1',
    resumed: false,
    redesign: true,
    stage: 'story',
    stylePick: null,
  };

  // The panel for a chapter, addressed by its aria-label (set on <section>).
  const panel = (title) => screen.getByRole('region', { name: title });
  const beat = (n, family, label, content) =>
    ({ index: n, total: 4, family, label, description: `${label} description`, content });

  it('renders three chapter panels + tappable chapter nav (no build chrome — workshop material lives in the coach context only)', async () => {
    startSession.mockResolvedValue(REDESIGN_START);
    await renderOnboarding();

    // Nav has all three chapters…
    const nav = screen.getByRole('navigation', { name: /chapters/i });
    expect(within(nav).getByText('Getting to Know You')).toBeInTheDocument();
    expect(within(nav).getByText('How You Learn')).toBeInTheDocument();
    expect(within(nav).getByText('Looking Ahead')).toBeInTheDocument();

    // …and each chapter is its own panel with its own header.
    expect(panel('Getting to Know You')).toBeInTheDocument();
    expect(panel('How You Learn')).toBeInTheDocument();
    expect(panel('Looking Ahead')).toBeInTheDocument();
    expect(within(panel('Getting to Know You')).getByText(/Part 1 of 3/i)).toBeInTheDocument();
  });

  it('legacy start payload renders the single-scroll surface, no chapter chrome', async () => {
    startSession.mockResolvedValue({ sessionId: 'sess-1', resumed: false, buildReviewReady: true });
    await renderOnboarding();
    expect(screen.queryByRole('navigation', { name: /chapters/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Getting to Know You' })).not.toBeInTheDocument();
  });

  it('coach turns land in the panel for the chapter that was current when they arrived', async () => {
    startSession.mockResolvedValue(REDESIGN_START);
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onText, onDone }) => {
      onText?.({ content: 'Tell me about your build.' });
      onDone?.({ sequenceNumber: 1 });
    });
    await renderOnboarding();
    await waitFor(() => {
      expect(within(panel('Getting to Know You')).getByText(/Tell me about your build/)).toBeInTheDocument();
    }, { timeout: 3000 });
    // Not leaked into the other chapters.
    expect(within(panel('How You Learn')).queryByText(/Tell me about your build/)).not.toBeInTheDocument();
  });

  it('a chapter boundary renders the interstitial GATE; "Let\'s go" sends chapter_continue and opens the taste panel', async () => {
    startSession.mockResolvedValue(REDESIGN_START);
    // The server's boundary response: validated closing turn + gate card.
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onCoachMessage, onInterstitial, onDone }) => {
      onCoachMessage?.({ content: 'Loved hearing all of that.' });
      onInterstitial?.({ stage: 'learn', part: 2, total: 3, title: 'How You Learn', description: 'React to whichever lands.' });
      onDone?.({ sequenceNumber: 3 });
    });
    await renderOnboarding();

    // Gate is up inside the CLOSING chapter's panel — the conversation stopped.
    const story = panel('Getting to Know You');
    expect(within(story).getByText('Part 2 of 3')).toBeInTheDocument();
    const go = within(story).getByRole('button', { name: /let'?s go/i });

    // Tapping continue sends chapter_continue; the server answers with beat 1.
    streamChat.mockClear();
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onStage, onBeat, onDone }) => {
      onStage?.({ value: 'learn', label: 'How You Learn' });
      onBeat?.(beat(1, 'tell_me', 'Tell me', 'TELL beat body'));
      onDone?.({ sequenceNumber: 5 });
    });
    await act(async () => {
      fireEvent.click(go);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(streamChat.mock.calls[0][2]).toBe('');
    expect(streamChat.mock.calls[0][3].meta).toEqual({ chapter_continue: 'learn' });

    // Gate consumed; the taste panel opened in the LEARN panel with way 1.
    expect(within(story).queryByRole('button', { name: /let'?s go/i })).not.toBeInTheDocument();
    const learn = panel('How You Learn');
    expect(within(learn).getByText(/Way 1 of 4/i)).toBeInTheDocument();
    expect(within(learn).getByText('TELL beat body')).toBeInTheDocument();
    expect(within(learn).getByRole('button', { name: /that clicked/i })).toBeInTheDocument();
    expect(within(learn).getByRole('button', { name: /next way/i })).toBeInTheDocument();
  });

  it('the step strip lets you flip BACK to a previously seen way (read-only compare)', async () => {
    startSession.mockResolvedValue({ ...REDESIGN_START, stage: 'learn' });
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onStage, onBeat, onDone }) => {
      onStage?.({ value: 'learn' });
      onBeat?.(beat(1, 'tell_me', 'Tell me', 'TELL beat body'));
      onBeat?.(beat(2, 'show_me', 'Show me', 'SHOW beat body'));
      onDone?.({ sequenceNumber: 4 });
    });
    await renderOnboarding();
    const learn = panel('How You Learn');

    // Latest way is showing; step 1 is seen and tappable.
    expect(within(learn).getByText('SHOW beat body')).toBeInTheDocument();
    const step1 = within(learn).getByRole('tab', { name: 'Way 1' });
    await act(async () => { fireEvent.click(step1); await Promise.resolve(); });

    // Flipped back — no server round-trip for a read-only compare.
    expect(within(learn).getByText('TELL beat body')).toBeInTheDocument();
    expect(within(learn).queryByText('SHOW beat body')).not.toBeInTheDocument();
    expect(streamChat).toHaveBeenCalledTimes(1); // just the opening call
  });

  it('"That clicked" becomes a sent message + the followup chips send the meta', async () => {
    startSession.mockResolvedValue({ ...REDESIGN_START, stage: 'learn' });
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onStage, onBeat, onDone }) => {
      onStage?.({ value: 'learn' });
      onBeat?.(beat(2, 'show_me', 'Show me', 'SHOW beat body'));
      onDone?.({ sequenceNumber: 4 });
    });
    await renderOnboarding();
    const learn = panel('How You Learn');

    streamChat.mockClear();
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onBeatFollowup, onDone }) => {
      onBeatFollowup?.({ clickedFamily: 'show_me', clickedLabel: 'Show me' });
      onDone?.({ sequenceNumber: 5 });
    });
    await act(async () => {
      fireEvent.click(within(learn).getByRole('button', { name: /that clicked/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(streamChat.mock.calls[0][3].meta).toEqual({ beat_reaction: { value: 'clicked' } });
    // Sent-message semantics — the reaction reads as the builder's turn.
    expect(within(learn).getByText(/That clicked — Show me/)).toBeInTheDocument();

    // Followup chips arrived; "Keep moving" sends its meta.
    streamChat.mockClear();
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onStyleResolved, onText, onDone }) => {
      onStyleResolved?.({ family: 'show_me', label: 'Show me', description: 'Walk me through a worked example first' });
      onText?.({ content: 'Worked examples it is.' });
      onDone?.({ sequenceNumber: 7 });
    });
    await act(async () => {
      fireEvent.click(within(learn).getByRole('button', { name: /keep moving/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(streamChat.mock.calls[0][3].meta).toEqual({ beat_followup: { value: 'move_on' } });

    // style_resolved collapses the panel into the one-line pick summary.
    expect(within(learn).queryByText('SHOW beat body')).not.toBeInTheDocument();
    expect(within(learn).getByText(/How you learn:/)).toBeInTheDocument();
    expect(within(learn).getByText('Show me')).toBeInTheDocument();
  });

  it('multi-click resolution renders the final pick cards inside the panel', async () => {
    startSession.mockResolvedValue({ ...REDESIGN_START, stage: 'learn' });
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onStage, onBeat, onStyleChoices, onDone }) => {
      onStage?.({ value: 'learn' });
      onBeat?.(beat(4, 'let_me_try', 'Let me try', 'TRY beat body'));
      onStyleChoices?.({
        prompt: 'A few of these landed — which one should I lead with?',
        options: [
          { family: 'tell_me', label: 'Tell me', description: 'Explain it plainly' },
          { family: 'let_me_try', label: 'Let me try', description: 'Real problem first' },
        ],
      });
      onDone?.({ sequenceNumber: 6 });
    });
    await renderOnboarding();
    const learn = panel('How You Learn');

    // Only the two clicked families are offered.
    expect(within(learn).getByRole('button', { name: /tell me/i })).toBeInTheDocument();
    expect(within(learn).getByRole('button', { name: /let me try/i })).toBeInTheDocument();
    expect(within(learn).queryByRole('button', { name: /^show me/i })).not.toBeInTheDocument();

    streamChat.mockClear();
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onStyleResolved, onDone }) => {
      onStyleResolved?.({ family: 'tell_me', label: 'Tell me', description: 'Explain it to me plainly' });
      onDone?.({ sequenceNumber: 8 });
    });
    await act(async () => {
      fireEvent.click(within(learn).getByRole('button', { name: /tell me/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(streamChat.mock.calls[0][3].meta).toEqual({ style_pick: 'tell_me' });
  });

  it('resume rebuilds the taste panel from persisted beat turns and re-renders a pending gate', async () => {
    startSession.mockResolvedValue({ ...REDESIGN_START, resumed: true, stage: 'learn' });
    getSession.mockResolvedValue({
      session: {
        stage: 'learn', style_pick: null, beats_delivered_at: 'x', beat_index: 2,
        beat_clicks: ['tell_me'], interstitial_shown_for: 'learn',
      },
      messages: [
        { role: 'coach', content: 'Closing chapter one.', stage: 'story' },
        { role: 'coach', content: '**Way 1 of 4 — Tell me:** TELL beat body', stage: 'learn' },
        { role: 'coach', content: '**Way 2 of 4 — Show me:** SHOW beat body', stage: 'learn' },
      ],
    });
    await renderOnboarding();

    // Beats rebuilt into the panel (latest showing), earlier one reachable.
    const learn = panel('How You Learn');
    expect(within(learn).getByText('SHOW beat body')).toBeInTheDocument();
    expect(within(learn).getByRole('tab', { name: 'Way 1' })).toBeInTheDocument();
    // Chat turns went to their tagged chapter.
    expect(within(panel('Getting to Know You')).getByText(/Closing chapter one/)).toBeInTheDocument();
    // No opening call — prior turns existed.
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('a resolved pick on resume shows the summary, not the panel', async () => {
    startSession.mockResolvedValue({ ...REDESIGN_START, resumed: true, stage: 'ahead', stylePick: 'ask_me' });
    getSession.mockResolvedValue({
      session: { stage: 'ahead', style_pick: 'ask_me', beats_delivered_at: 'x', beat_index: 4 },
      messages: [{ role: 'coach', content: '**Way 1 of 4 — Tell me:** TELL beat body', stage: 'learn' }],
    });
    await renderOnboarding();
    const learn = panel('How You Learn');
    expect(within(learn).queryByText('TELL beat body')).not.toBeInTheDocument();
    expect(within(learn).getByText(/How you learn:/)).toBeInTheDocument();
  });
});
