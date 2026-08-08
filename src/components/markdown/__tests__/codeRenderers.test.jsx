import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ReactMarkdown from 'react-markdown';
import { createCodeRenderers } from '../codeRenderers';

const components = createCodeRenderers({
  inlineClassName: 'inline-chip',
  preClassName: 'fenced-container',
});

const renderMarkdown = (md) => render(<ReactMarkdown components={components}>{md}</ReactMarkdown>);

describe('createCodeRenderers', () => {
  it('styles inline code as a chip and keeps it in the flow of its paragraph', () => {
    const { container } = renderMarkdown('what would you make of `grade` being `null`?');

    const chip = screen.getByText('grade');
    expect(chip.tagName).toBe('CODE');
    expect(chip.className).toBe('inline-chip');
    // the regression: inline code must not sit inside a block container
    expect(chip.closest('pre')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p').textContent).toBe('what would you make of grade being null?');
  });

  it('renders a language-tagged fence in the container, not as a chip', () => {
    const { container } = renderMarkdown('```json\n{ "a": 1 }\n```');

    const pre = container.querySelector('pre');
    expect(pre.className).toBe('fenced-container');
    expect(pre.querySelector('code').className).not.toContain('inline-chip');
  });

  it('renders an untagged fence in the container too', () => {
    // the case a /language-(\w+)/ className check gets wrong
    const { container } = renderMarkdown('```\n{ "grade": null }\n```');

    const pre = container.querySelector('pre');
    expect(pre.className).toBe('fenced-container');
    expect(pre.querySelector('code').className).not.toContain('inline-chip');
  });

  it('classifies correctly when inline code and a fence appear in the same document', () => {
    const { container } = renderMarkdown(
      ['a `grade` field', '', '```', '{ "grade": null }', '```', '', 'and `null` again'].join('\n')
    );

    const chips = [...container.querySelectorAll('code.inline-chip')];
    expect(chips.map((el) => el.textContent)).toEqual(['grade', 'null']);
    expect(container.querySelectorAll('pre')).toHaveLength(1);
    // context does not leak past the block it wraps
    chips.forEach((el) => expect(el.closest('pre')).toBeNull());
  });
});
