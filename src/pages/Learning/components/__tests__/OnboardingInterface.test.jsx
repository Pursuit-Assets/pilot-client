import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

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
describe('OnboardingInterface — redesign', () => {
  const REDESIGN_START = {
    sessionId: 'sess-1',
    resumed: false,
    redesign: true,
    stage: 'meet',
    stylePick: null,
    buildCard: { whatYouBuilt: 'A resume tailor that rewrites bullets per posting', artifactUrl: null },
  };

  it('renders the BuildCard and StageDots from the /start payload', async () => {
    startSession.mockResolvedValue(REDESIGN_START);
    await renderOnboarding();
    expect(screen.getByText(/your workshop build/i)).toBeInTheDocument();
    expect(screen.getByText(/resume tailor/i)).toBeInTheDocument();
    // Labeled dots
    expect(screen.getByText('Your Build')).toBeInTheDocument();
    expect(screen.getByText('How You Learn')).toBeInTheDocument();
    // No artifact link — url was null (unvalidated links never render)
    expect(screen.queryByText(/view your build/i)).not.toBeInTheDocument();
  });

  it('renders the artifact link ONLY when the server validated one', async () => {
    startSession.mockResolvedValue({
      ...REDESIGN_START,
      buildCard: { whatYouBuilt: 'A flashcard site', artifactUrl: 'https://example.com/app' },
    });
    await renderOnboarding();
    const link = screen.getByRole('link', { name: /view your build/i });
    expect(link).toHaveAttribute('href', 'https://example.com/app');
  });

  it('legacy start payload renders NO redesign chrome', async () => {
    startSession.mockResolvedValue({ sessionId: 'sess-1', resumed: false, buildReviewReady: true });
    await renderOnboarding();
    expect(screen.queryByText(/your workshop build/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Your Build')).not.toBeInTheDocument();
  });

  it('style_choices event renders the 4 tap cards; a tap sends the structured pick and collapses to a chip', async () => {
    startSession.mockResolvedValue(REDESIGN_START);
    // Opening stream: coach_message beats + the style_choices control event.
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onText, onCoachMessage, onStage, onStyleChoices, onDone }) => {
      onText?.({ content: 'Let me show you the same idea four ways.' });
      onCoachMessage?.({ content: '**Tell me** — plain explanation beat' });
      onCoachMessage?.({ content: '**Show me** — worked example beat' });
      onStage?.({ value: 'learn' });
      onStyleChoices?.({
        options: [
          { family: 'tell_me', label: 'Tell me', description: 'Explain it plainly' },
          { family: 'show_me', label: 'Show me', description: 'Worked example first' },
          { family: 'ask_me', label: 'Ask me', description: 'Questions first' },
          { family: 'let_me_try', label: 'Let me try', description: 'Real problem first' },
        ],
      });
      onDone?.({ sequenceNumber: 5 });
    });
    await renderOnboarding();

    // Beats arrived as complete bubbles.
    expect(screen.getByText(/plain explanation beat/)).toBeInTheDocument();
    expect(screen.getByText(/worked example beat/)).toBeInTheDocument();
    // Cards rendered.
    const showMe = screen.getByRole('button', { name: /show me/i });
    expect(screen.getByRole('button', { name: /tell me/i })).toBeInTheDocument();

    // Tap → second streamChat call with empty message + structured meta.
    streamChat.mockClear();
    streamChat.mockImplementationOnce(async (_t, _s, _m, { onText, onDone }) => {
      onText?.({ content: 'Worked examples it is — want to try one?' });
      onDone?.({ sequenceNumber: 7 });
    });
    await act(async () => {
      fireEvent.click(showMe);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(streamChat.mock.calls[0][2]).toBe('');
    expect(streamChat.mock.calls[0][3].meta).toEqual({ style_pick: 'show_me' });

    // Cards collapsed to the confirmation chip; tap buttons gone.
    expect(screen.queryByRole('button', { name: /tell me/i })).not.toBeInTheDocument();
    expect(screen.getByText(/show me — worked example first/i)).toBeInTheDocument();
  });

  it('resume with beats delivered but no pick re-renders the tap cards (fallback options)', async () => {
    startSession.mockResolvedValue({ ...REDESIGN_START, resumed: true, stage: 'learn' });
    getSession.mockResolvedValue({
      session: { stage: 'learn', style_pick: null, beats_delivered_at: '2026-08-04T00:00:00Z' },
      messages: [
        { role: 'coach', content: 'Earlier beats…' },
        { role: 'builder', content: 'ok' },
      ],
    });
    await renderOnboarding();
    // Cards render from DEFAULT_OPTIONS without any stream event.
    expect(screen.getByRole('button', { name: /let me try/i })).toBeInTheDocument();
    // And no opening call was made (prior turns exist) — streamChat untouched.
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('resume with a recorded pick shows the chip, not the cards', async () => {
    startSession.mockResolvedValue({ ...REDESIGN_START, resumed: true, stage: 'ahead', stylePick: 'ask_me' });
    getSession.mockResolvedValue({
      session: { stage: 'ahead', style_pick: 'ask_me', beats_delivered_at: '2026-08-04T00:00:00Z' },
      messages: [{ role: 'coach', content: 'Earlier…' }, { role: 'builder', content: 'hi' }],
    });
    await renderOnboarding();
    expect(screen.queryByRole('button', { name: /tell me/i })).not.toBeInTheDocument();
  });
});
