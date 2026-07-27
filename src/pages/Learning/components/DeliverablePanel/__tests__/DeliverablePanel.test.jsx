import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeliverablePanel from '../DeliverablePanel';

// Radix Sheet (Dialog) needs a few browser APIs jsdom doesn't implement.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    });
  }
  if (!global.ResizeObserver) {
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

function renderPanel(task, currentSubmission = null, extraProps = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const props = {
    task,
    currentSubmission,
    isOpen: true,
    onClose: () => {},
    onSubmit,
    userId: 1,
    taskId: 100,
    ...extraProps,
  };
  const utils = render(<DeliverablePanel {...props} />);
  const rerenderWith = (nextProps) =>
    utils.rerender(<DeliverablePanel {...props} {...nextProps} />);
  return { onSubmit, rerenderWith, ...utils };
}

const LINK_PLACEHOLDER = 'Copy and paste your link here...';

describe('DeliverablePanel — routing: each deliverable type renders its dedicated panel', () => {
  it('link / document / url / presentation → LinkSubmission (URL input)', () => {
    for (const type of ['link', 'document', 'url', 'presentation']) {
      const { unmount } = renderPanel({ deliverable_type: type });
      expect(screen.getByPlaceholderText(LINK_PLACEHOLDER)).toBeInTheDocument();
      unmount();
    }
  });

  it('image → ImageSubmission (image file upload)', () => {
    renderPanel({ deliverable_type: 'image' });
    // Radix Sheet portals content to document.body, so query the document.
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    expect(input.getAttribute('accept')).toMatch(/png|jpe?g|image/i);
    // Not the link panel.
    expect(screen.queryByPlaceholderText(LINK_PLACEHOLDER)).toBeNull();
  });

  it('file → FileSubmission (document file upload)', () => {
    renderPanel({ deliverable_type: 'file' });
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    expect(input.getAttribute('accept')).toMatch(/pdf/i);
  });

  it('video → StructuredSubmission Loom form (record instructions + loom.com link)', () => {
    renderPanel({ deliverable_type: 'video', deliverable: 'Record a 3-minute demo.' });
    expect(screen.getByText('Record Your Video')).toBeInTheDocument();
    const loomLink = screen.getByText(/Visit Loom\.com/i).closest('a');
    expect(loomLink).toHaveAttribute('href', 'https://www.loom.com');
  });

  it('structured (deliverable_schema) → StructuredSubmission multi-field form', () => {
    const schema = {
      fields: [
        { name: 'repo', type: 'url', label: 'GitHub Repository URL', required: true },
        { name: 'notes', type: 'text', label: 'Reviewer Notes', required: false },
      ],
    };
    renderPanel({ deliverable_type: 'structured', deliverable_schema: schema });
    expect(screen.getByText('GitHub Repository URL')).toBeInTheDocument();
    expect(screen.getByText('Reviewer Notes')).toBeInTheDocument();
  });

  it('deliverable_schema takes precedence over deliverable_type', () => {
    const schema = { fields: [{ name: 'x', type: 'url', label: 'Custom Field', required: true }] };
    // type says link, but a schema is present → structured form wins.
    renderPanel({ deliverable_type: 'link', deliverable_schema: schema });
    expect(screen.getByText('Custom Field')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(LINK_PLACEHOLDER)).toBeNull();
  });

  it('text is conversation-only → no submission panel (terminal fallback)', () => {
    renderPanel({ deliverable_type: 'text' });
    expect(screen.getByText(/No deliverable to submit/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(LINK_PLACEHOLDER)).toBeNull();
  });

  it('none / unknown / null → terminal "No deliverable" fallback', () => {
    for (const type of ['none', 'slideshow', null, undefined]) {
      const { unmount } = renderPanel({ deliverable_type: type });
      expect(screen.getByText(/No deliverable to submit/i)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('DeliverablePanel — submit behavior', () => {
  it('LinkSubmission submits the pasted URL as a plain string', async () => {
    const { onSubmit } = renderPanel({ deliverable_type: 'link' });
    fireEvent.change(screen.getByPlaceholderText(LINK_PLACEHOLDER), {
      target: { value: 'https://docs.google.com/document/d/abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('https://docs.google.com/document/d/abc')
    );
  });

  it('LinkSubmission blocks submit on an invalid URL', () => {
    const { onSubmit } = renderPanel({ deliverable_type: 'link' });
    fireEvent.change(screen.getByPlaceholderText(LINK_PLACEHOLDER), {
      target: { value: 'not a url' },
    });
    const btn = screen.getByRole('button', { name: /^submit$/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('video/Loom form submits the loom URL as a keyed object', async () => {
    const { onSubmit } = renderPanel({ deliverable_type: 'video', deliverable: 'Record a demo.' });
    fireEvent.change(screen.getByPlaceholderText('https://www.loom.com/share/...'), {
      target: { value: 'https://www.loom.com/share/abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ loomUrl: 'https://www.loom.com/share/abc123' });
  });

  it('does not block submit when isStreaming is omitted (safe default)', async () => {
    const { onSubmit } = renderPanel({ deliverable_type: 'link' });
    fireEvent.change(screen.getByPlaceholderText(LINK_PLACEHOLDER), {
      target: { value: 'https://example.com/work' },
    });
    expect(screen.getByRole('button', { name: /^submit$/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('a submitted link deliverable shows "Update Submission" and prefills the URL', () => {
    renderPanel(
      { deliverable_type: 'link' },
      { content: 'https://example.com/existing' }
    );
    expect(screen.getByDisplayValue('https://example.com/existing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update submission/i })).toBeInTheDocument();
  });
});

// Submitting while the chat already has an AI stream in flight opens a second
// concurrent SSE stream into the same message list, which is what let chunks
// from one stream splice into the other's bubble.
describe('DeliverablePanel — submit is blocked while a chat stream is in flight', () => {
  it('link panel: disables submit and ignores clicks while streaming', () => {
    const { onSubmit, rerenderWith } = renderPanel({ deliverable_type: 'link' });
    // Fill the URL before the stream starts, so the button is otherwise valid.
    fireEvent.change(screen.getByPlaceholderText(LINK_PLACEHOLDER), {
      target: { value: 'https://example.com/work' },
    });
    const btn = screen.getByRole('button', { name: /^submit$/i });
    expect(btn).not.toBeDisabled();

    rerenderWith({ isStreaming: true });
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(onSubmit).not.toHaveBeenCalled();

    // The input stays editable — the builder can keep preparing their answer.
    expect(screen.getByPlaceholderText(LINK_PLACEHOLDER)).not.toBeDisabled();

    // Once the stream finishes the submit works again.
    rerenderWith({ isStreaming: false });
    expect(screen.getByRole('button', { name: /^submit$/i })).not.toBeDisabled();
  });

  it('video/Loom panel: disables submit while streaming', () => {
    const { rerenderWith } = renderPanel(
      { deliverable_type: 'video', deliverable: 'Record a demo.' },
      null,
      { isStreaming: false }
    );
    fireEvent.change(screen.getByPlaceholderText('https://www.loom.com/share/...'), {
      target: { value: 'https://www.loom.com/share/abc123' },
    });
    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
    rerenderWith({ isStreaming: true });
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });
});
