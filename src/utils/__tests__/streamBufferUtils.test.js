import { describe, it, expect } from 'vitest';
import { createStreamBuffer, appendToMessageById } from '../streamBufferUtils';

// Feed a string through the buffer one character at a time, mimicking the
// worst-case SSE chunking where a marker is split across many chunks.
function runCharByChar(text) {
  const buf = createStreamBuffer();
  let out = '';
  for (const ch of text) out += buf.append(ch);
  out += buf.flush();
  return out;
}

describe('createStreamBuffer — marker stripping', () => {
  it('passes through plain text unchanged', () => {
    expect(runCharByChar('Hello, how is your project going?')).toBe(
      'Hello, how is your project going?'
    );
  });

  it('strips [TASK_COMPLETE] delivered in one chunk', () => {
    const buf = createStreamBuffer();
    const out = buf.append('Great work! [TASK_COMPLETE]') + buf.flush();
    expect(out).toBe('Great work! ');
  });

  it('strips [OPEN_ASSIGNMENT] delivered in one chunk', () => {
    const buf = createStreamBuffer();
    const out = buf.append('Now submit your work. [OPEN_ASSIGNMENT]') + buf.flush();
    expect(out).toBe('Now submit your work. ');
  });

  it('strips both markers when split character-by-character', () => {
    expect(runCharByChar('Done! [TASK_COMPLETE] [OPEN_ASSIGNMENT]')).toBe('Done!  ');
  });

  it('strips the space-variant markers', () => {
    expect(runCharByChar('a [TASK COMPLETE] b [OPEN ASSIGNMENT] c')).toBe('a  b  c');
  });

  it('does not swallow a bracketed non-marker word', () => {
    expect(runCharByChar('See the [notes] section')).toBe('See the [notes] section');
  });

  it('never emits a partial marker prefix mid-stream', () => {
    const buf = createStreamBuffer();
    // A tail that could be the start of [OPEN_ASSIGNMENT] is held back...
    const emitted = buf.append('Submit here [OPEN_ASS');
    expect(emitted).toBe('Submit here ');
    // ...and once completed, the whole marker is removed.
    const rest = buf.append('IGNMENT] thanks') + buf.flush();
    expect(rest).toBe(' thanks');
  });
});

// A streaming AI bubble as Learning.jsx / LearningPreview.jsx hold it.
function aiBubble(id, content = '') {
  return { id, content, sender: 'ai', isStreaming: true, isThinking: true, thinkingLabel: 'Thinking…' };
}

describe('appendToMessageById — message boundaries', () => {
  it('appends to the message that owns the id', () => {
    const messages = [
      { id: 1, content: 'hi', sender: 'user' },
      aiBubble(2)
    ];
    const next = appendToMessageById(messages, 2, 'Hello');
    expect(next[1].content).toBe('Hello');
    expect(next[0]).toBe(messages[0]); // untouched messages keep identity
  });

  it('appends to its own bubble even when a LATER bubble is also streaming', () => {
    // The old rule ("last AI bubble still streaming") would have written into
    // the second bubble here — that is exactly the splice this guards against.
    const messages = [aiBubble('chat'), aiBubble('review')];
    const next = appendToMessageById(messages, 'chat', ' more chat');
    expect(next[0].content).toBe(' more chat');
    expect(next[1].content).toBe('');
  });

  it('merges the patch into the targeted message only', () => {
    const messages = [aiBubble('a'), aiBubble('b')];
    const next = appendToMessageById(messages, 'a', 'text', { isThinking: false, thinkingLabel: null });
    expect(next[0]).toMatchObject({ content: 'text', isThinking: false, thinkingLabel: null });
    expect(next[1]).toMatchObject({ isThinking: true, thinkingLabel: 'Thinking…' });
  });

  it('drops the text when the id is gone instead of appending to another bubble', () => {
    const messages = [aiBubble('survivor', 'existing')];
    const next = appendToMessageById(messages, 'dropped-bubble', 'orphan text');
    expect(next).toBe(messages); // same reference — nothing changed
    expect(next[0].content).toBe('existing');
  });

  it('is a no-op for empty text or a missing id', () => {
    const messages = [aiBubble('a')];
    expect(appendToMessageById(messages, 'a', '')).toBe(messages);
    expect(appendToMessageById(messages, undefined, 'x')).toBe(messages);
    expect(appendToMessageById(messages, null, 'x')).toBe(messages);
  });
});

describe('appendToMessageById — two concurrent streams never fuse', () => {
  // Each stream owns the bubble it created and carries its own buffer, exactly
  // as handleSendMessage and handleDeliverableSubmit do.
  function makeStream(bubbleId) {
    return { bubbleId, buffer: createStreamBuffer() };
  }

  function feed(messages, stream, chunk) {
    const safeText = stream.buffer.append(chunk);
    return appendToMessageById(messages, stream.bubbleId, safeText, {
      isThinking: false,
      thinkingLabel: null
    });
  }

  it('keeps interleaved chunks in their own bubbles', () => {
    const chat = makeStream('chat-bubble');
    const review = makeStream('review-bubble');
    let messages = [aiBubble(chat.bubbleId), aiBubble(review.bubbleId)];

    // The deliverable review stream opens while the chat turn is mid-sentence.
    messages = feed(messages, chat, 'What felt ');
    messages = feed(messages, review, 'Nice work on ');
    messages = feed(messages, chat, 'rushed?');
    messages = feed(messages, review, 'Twitter clone.');

    const byId = Object.fromEntries(messages.map(m => [m.id, m.content]));
    expect(byId['chat-bubble']).toBe('What felt rushed?');
    expect(byId['review-bubble']).toBe('Nice work on Twitter clone.');
    // The reported symptom was one bubble holding both responses spliced
    // together with no separator.
    expect(messages.some(m => m.content.includes('rushed?Twitter'))).toBe(false);
  });

  it('each stream strips markers out of its own text only', () => {
    const chat = makeStream('chat-bubble');
    const review = makeStream('review-bubble');
    let messages = [aiBubble(chat.bubbleId), aiBubble(review.bubbleId)];

    // Chat holds back a partial marker tail while the review stream writes.
    messages = feed(messages, chat, 'All set [TASK_COMP');
    expect(messages[0].content).toBe('All set ');
    messages = feed(messages, review, 'Graded.');
    messages = feed(messages, chat, 'LETE]');

    expect(messages[0].content).toBe('All set ');
    expect(messages[1].content).toBe('Graded.');
  });

  it('finishing one stream leaves the other stream mid-flight untouched', () => {
    const chat = makeStream('chat-bubble');
    const review = makeStream('review-bubble');
    let messages = [aiBubble(chat.bubbleId), aiBubble(review.bubbleId)];

    messages = feed(messages, review, 'Reviewed');
    // The review stream's done event flushes into its own bubble.
    messages = appendToMessageById(messages, review.bubbleId, review.buffer.flush());
    messages = feed(messages, chat, 'still typing');

    expect(messages[0].content).toBe('still typing');
    expect(messages[1].content).toBe('Reviewed');
  });
});
