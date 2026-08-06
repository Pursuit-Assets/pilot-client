import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';
import AutoExpandTextarea from '../AutoExpandTextarea';

// Mock Radix UI Select components
vi.mock('../ui/select', () => ({
  Select: ({ children }) => <div data-testid="select">{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ children }) => <div>{children}</div>,
}));

// Mock ArrowButton
vi.mock('../ArrowButton/ArrowButton', () => ({
  default: ({ onClick, disabled }) => (
    <button data-testid="send-button" onClick={onClick} disabled={disabled}>
      Send
    </button>
  ),
}));

describe('AutoExpandTextarea', () => {
  test('renders with placeholder', () => {
    render(<AutoExpandTextarea onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText('Reply to coach...')).toBeInTheDocument();
  });

  test('exposes focus() via ref', () => {
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={vi.fn()} />);
    expect(ref.current).toHaveProperty('focus');
    expect(typeof ref.current.focus).toBe('function');
  });

  test('exposes setValue() via ref', () => {
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={vi.fn()} />);
    expect(ref.current).toHaveProperty('setValue');
    expect(typeof ref.current.setValue).toBe('function');
  });

  test('setValue() populates the textarea with the given text', () => {
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={vi.fn()} />);

    act(() => {
      ref.current.setValue('My restored message');
    });

    const textarea = screen.getByPlaceholderText('Reply to coach...');
    expect(textarea.value).toBe('My restored message');
  });

  test('setValue() enables the send button after setting content', () => {
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={vi.fn()} />);

    // Send button should be disabled when empty
    expect(screen.getByTestId('send-button')).toBeDisabled();

    act(() => {
      ref.current.setValue('Some content');
    });

    // Send button should now be enabled
    expect(screen.getByTestId('send-button')).not.toBeDisabled();
  });

  test('setValue() with empty string disables the send button', () => {
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={vi.fn()} />);

    act(() => {
      ref.current.setValue('Some content');
    });
    expect(screen.getByTestId('send-button')).not.toBeDisabled();

    act(() => {
      ref.current.setValue('');
    });
    expect(screen.getByTestId('send-button')).toBeDisabled();
  });

  test('setValue() content can be submitted via send button', () => {
    const onSubmit = vi.fn();
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={onSubmit} />);

    act(() => {
      ref.current.setValue('Restored message');
    });

    fireEvent.click(screen.getByTestId('send-button'));

    expect(onSubmit).toHaveBeenCalledWith('Restored message', expect.any(String));
  });

  test('submitting clears the textarea', () => {
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={vi.fn()} />);

    act(() => {
      ref.current.setValue('Will be cleared');
    });
    fireEvent.click(screen.getByTestId('send-button'));

    const textarea = screen.getByPlaceholderText('Reply to coach...');
    expect(textarea.value).toBe('');
  });

  test('Enter key submits the message', () => {
    const onSubmit = vi.fn();
    render(<AutoExpandTextarea onSubmit={onSubmit} />);

    const textarea = screen.getByPlaceholderText('Reply to coach...');
    // Set value directly on the DOM element (uncontrolled component)
    textarea.value = 'Enter key test';
    fireEvent.keyPress(textarea, { key: 'Enter', charCode: 13 });

    expect(onSubmit).toHaveBeenCalledWith('Enter key test', expect.any(String));
  });

  test('disabled textarea prevents send button click', () => {
    const onSubmit = vi.fn();
    const ref = createRef();
    render(<AutoExpandTextarea ref={ref} onSubmit={onSubmit} disabled={true} />);

    act(() => {
      ref.current.setValue('Cannot send');
    });

    expect(screen.getByTestId('send-button')).toBeDisabled();
  });

  describe('voice dictation', () => {
    // Minimal SpeechRecognition fake: the component drives start/abort/stop;
    // tests fire onresult/onend manually to simulate the engine.
    class FakeSpeechRecognition {
      static instances = [];
      constructor() {
        FakeSpeechRecognition.instances.push(this);
        this.aborted = false;
      }
      start() {}
      stop() { this.onend?.(); }
      abort() { this.aborted = true; this.onend?.(); }
    }
    const speechEvent = (transcript, isFinal = true) => ({
      results: [{ 0: { transcript }, isFinal }],
    });

    beforeEach(() => {
      FakeSpeechRecognition.instances = [];
      window.SpeechRecognition = FakeSpeechRecognition;
    });
    afterEach(() => {
      delete window.SpeechRecognition;
    });

    test('sending mid-dictation aborts the session and resets the base, so the next dictation starts empty', () => {
      const onSubmit = vi.fn();
      render(<AutoExpandTextarea onSubmit={onSubmit} showMicButton />);
      const textarea = screen.getByPlaceholderText('Reply to coach...');

      // Start dictating and let the engine fill the textarea.
      fireEvent.click(screen.getByTitle('Start voice dictation'));
      const session1 = FakeSpeechRecognition.instances[0];
      act(() => session1.onresult(speechEvent('hello coach')));
      expect(textarea.value).toBe('hello coach');

      // Send WITHOUT stopping the recording first.
      fireEvent.click(screen.getByTestId('send-button'));
      expect(onSubmit).toHaveBeenCalledWith('hello coach', expect.any(String));
      expect(session1.aborted).toBe(true);
      expect(textarea.value).toBe('');

      // Dictate again — the new session must start from an empty input,
      // not resurrect the previously sent message.
      fireEvent.click(screen.getByTitle('Start voice dictation'));
      const session2 = FakeSpeechRecognition.instances[1];
      act(() => session2.onresult(speechEvent('second message')));
      expect(textarea.value).toBe('second message');
    });

    test('a late onresult flush AFTER send cannot resurrect the sent message (stop→send race, 2026-08-06)', () => {
      // Real-browser sequence: tap mic off → Chrome's stop() flushes one
      // final onresult ASYNCHRONOUSLY → user hits send before the flush
      // lands → the late event used to rewrite the cleared textarea with
      // the full transcript.
      const onSubmit = vi.fn();
      render(<AutoExpandTextarea onSubmit={onSubmit} showMicButton />);
      const textarea = screen.getByPlaceholderText('Reply to coach...');

      fireEvent.click(screen.getByTitle('Start voice dictation'));
      const session = FakeSpeechRecognition.instances[0];
      act(() => session.onresult(speechEvent('hello coach')));
      // Tap the mic off — the component keeps the session ref so a normal
      // (pre-send) flush can still land.
      fireEvent.click(screen.getByTitle('Stop dictation'));
      expect(textarea.value).toBe('hello coach');

      // Capture the handler as the browser engine holds it, then send.
      const engineHeldHandler = session.onresult;
      fireEvent.click(screen.getByTestId('send-button'));
      expect(onSubmit).toHaveBeenCalledWith('hello coach', expect.any(String));
      expect(textarea.value).toBe('');

      // Layer 1: clearAfterSubmit nulled the handler — the browser would
      // find nothing to call.
      expect(session.onresult).toBeNull();

      // Layer 2 (belt+suspenders): even a retained callback reference is a
      // no-op — the stale-session guard sees the ref was cleared.
      act(() => engineHeldHandler(speechEvent('hello coach')));
      expect(textarea.value).toBe('');
    });
  });
});
