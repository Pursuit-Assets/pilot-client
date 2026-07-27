// System markers the AI may embed in streamed text. [TASK_COMPLETE] signals
// conversation conclusion; [OPEN_ASSIGNMENT] tells the client to render an
// Open Assignment button under the message (the server sends the semantic
// flag on the done event — here we only keep the raw text from flashing).
const MARKERS = ['[TASK_COMPLETE]', '[TASK COMPLETE]', '[OPEN_ASSIGNMENT]', '[OPEN ASSIGNMENT]'];
const MAX_MARKER_LEN = Math.max(...MARKERS.map(m => m.length)); // 17
const MARKER_REGEX = /\[(?:TASK(?:_| )COMPLETE|OPEN(?:_| )ASSIGNMENT)\]/gi;

// Check if `text` is a prefix of any marker
function couldBeMarkerPrefix(text) {
  const upper = text.toUpperCase();
  return MARKERS.some(marker => marker.startsWith(upper));
}

export function createStreamBuffer() {
  let held = '';

  return {
    append(chunk) {
      held += chunk;
      // Strip any complete markers
      held = held.replace(MARKER_REGEX, '');
      // Find how much of the tail could be a partial marker prefix
      // Check progressively shorter tails
      let safe = held;
      let tail = '';
      for (let i = Math.min(held.length, MAX_MARKER_LEN); i > 0; i--) {
        const candidate = held.slice(-i);
        if (couldBeMarkerPrefix(candidate)) {
          safe = held.slice(0, -i);
          tail = candidate;
          break;
        }
      }
      held = tail;
      return safe;
    },
    flush() {
      const final = held.replace(MARKER_REGEX, '');
      held = '';
      return final;
    }
  };
}

// Append streamed text to the ONE message a stream owns, matched by id.
//
// Streams must never target "the last AI bubble that is still streaming":
// two concurrent streams (a chat turn and a deliverable review) both leave a
// streaming bubble in the list, so whichever chunk arrives next lands in the
// other stream's bubble and the two responses fuse into one string with no
// separator. Matching by id keeps each stream inside its own bubble.
//
// If the id is no longer in the list (bubble dropped, task switched) the text
// is discarded — dropping a chunk is always safer than splicing it into
// someone else's message. `patch` is merged into the matched message.
export function appendToMessageById(messages, messageId, text, patch = {}) {
  if (!text || messageId == null) return messages;
  if (!messages.some(m => m.id === messageId)) return messages;
  return messages.map(m =>
    m.id === messageId
      ? { ...m, ...patch, content: `${m.content || ''}${text}` }
      : m
  );
}
