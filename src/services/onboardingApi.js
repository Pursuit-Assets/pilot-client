const API_URL = import.meta.env.VITE_API_URL;

const getHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export async function startSession(token, taskId) {
  const res = await fetch(`${API_URL}/api/onboarding-session/start`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ taskId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to start onboarding session: ${res.status}`);
  }
  return res.json();
}

export async function getSession(token, sessionId) {
  const res = await fetch(`${API_URL}/api/onboarding-session/${encodeURIComponent(sessionId)}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch onboarding session: ${res.status}`);
  }
  return res.json();
}

export async function completeSession(token, sessionId, { durationSeconds }) {
  const res = await fetch(`${API_URL}/api/onboarding-session/${encodeURIComponent(sessionId)}/complete`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ durationSeconds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to complete onboarding session: ${res.status}`);
  }
  return res.json();
}

/**
 * GET the builder's Coach Card — the coach's read on them (background, goals,
 * learning profile, teaching method). Returns { card } (card may be null).
 */
export async function getCoachCard(token) {
  const res = await fetch(`${API_URL}/api/onboarding-session/coach-card`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load coach card: ${res.status}`);
  }
  return res.json();
}

/**
 * POST a correction to the Coach Card. Corrections write intake_confirmed
 * provenance server-side (the builder correcting the card is the highest-
 * confidence signal there is).
 * body: { section: 'background'|'goals'|'learning_profile', field, value }
 *   or  { section: 'teaching_method', value }
 */
export async function correctCoachCard(token, correction) {
  const res = await fetch(`${API_URL}/api/onboarding-session/coach-card/corrections`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(correction),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save correction: ${res.status}`);
  }
  return res.json();
}

export async function abandonSession(token, sessionId) {
  const res = await fetch(`${API_URL}/api/onboarding-session/${encodeURIComponent(sessionId)}/abandon`, {
    method: 'POST',
    headers: getHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to abandon onboarding session: ${res.status}`);
  }
  return res.json();
}

/**
 * SSE-streamed onboarding chat. Mirrors the Compass /chat pattern.
 *
 * Pass message='' on the FIRST call (transcript empty) to get the coach's
 * opening turn — the server detects this and generates a warm greeting +
 * first anchor question via buildOpeningLine.
 *
 * Callbacks fire as the SSE stream arrives:
 *   onText({ content })          — incremental chunk (streamed coach turn)
 *   onCoachMessage({ content })  — a COMPLETE coach bubble (redesign: the
 *                                  server-sent authored taste-test beats)
 *   onStage({ value })           — server-stamped stage transition (redesign)
 *   onStyleChoices({ options })  — render the style tap cards (redesign)
 *   onDone({ sequenceNumber })   — stream finished cleanly
 *   onError({ error })           — server-emitted SSE error event
 *
 * `meta` rides in the POST body for structured turns (redesign): a style-card
 * tap sends { style_pick: '<family>' } with an empty message.
 *
 * `signal` is an AbortSignal — abort to tear down an in-flight stream
 * (e.g., on unmount). Returns when the stream ends, errors, or is aborted.
 */
export async function streamChat(token, sessionId, message, { onText, onCoachMessage, onStage, onStyleChoices, onDone, onError, signal, meta } = {}) {
  const res = await fetch(
    `${API_URL}/api/onboarding-session/${encodeURIComponent(sessionId)}/chat`,
    {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ message: message || '', ...(meta ? { meta } : {}) }),
      signal,
    }
  );
  // Non-OK responses (including 429 rate-limit) are JSON, not SSE — if we
  // pass them to getReader() the coach bubble stays in streaming:true
  // forever because the body never emits `data:` lines or a `done` event.
  // Route the error through onError so the UI surfaces it cleanly.
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    onError?.({
      error:
        body?.error ||
        (res.status === 429
          ? 'You are sending messages too quickly — slow down.'
          : `Chat request failed: ${res.status}`),
      status: res.status,
    });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Track whether the server sent {"type":"done"} during the stream. If the
  // reader closes WITHOUT having seen that event (network drop, server crash
  // mid-stream, proxy timeout), we still fire onDone so the caller's coach
  // bubble clears its streaming:true flag — otherwise it stays stuck forever.
  let sawDone = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let data;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (data.type === 'text') {
        onText?.(data);
      } else if (data.type === 'coach_message') {
        onCoachMessage?.(data);
      } else if (data.type === 'stage') {
        onStage?.(data);
      } else if (data.type === 'style_choices') {
        onStyleChoices?.(data);
      } else if (data.type === 'done') {
        sawDone = true;
        onDone?.(data);
      } else if (data.type === 'error') {
        onError?.(data);
      }
    }
  }
  if (!sawDone) onDone?.();
}
