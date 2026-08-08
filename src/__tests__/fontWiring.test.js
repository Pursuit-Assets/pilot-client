import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the Adobe Fonts (Typekit) wiring.
 *
 * The kit registers the family as `proxima-nova` (lowercase, hyphenated). CSS
 * family matching is case-insensitive but NOT whitespace/hyphen-insensitive, so
 * `'Proxima Nova'` does not match it. From the app's inception until 2026-08-05
 * every stack asked for `'Proxima Nova'`, so the paid kit was downloaded on
 * every page load and used by nothing: text fell back to a local 400-only
 * subset and all ~3,300 uses of weight 500/600/700 were synthesized by the
 * browser. Chrome and Safari synthesize differently, so the same page rendered
 * differently in each — measured at 14.4px of divergence on a 13-character
 * string at weight 600.
 *
 * These are cheap file-content assertions rather than render tests on purpose:
 * the failure mode is a stack drifting back to the non-matching name, which no
 * jsdom render would catch (jsdom does not do font matching at all).
 */

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const indexCss = read('src/index.css');
const tailwind = read('tailwind.config.js');

/** index.css with comments stripped — the comments document the retired
 *  sources by name, so "is this source gone?" must look at real rules only. */
const indexCssRules = indexCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Files allowed to name 'Proxima Nova' outside src/index.css, and why. */
const ALLOWED_HARDCODES = {
  // pptxgenjs `fontFace` is an OS font name resolved by PowerPoint/Keynote on
  // the viewer's machine, not a CSS family — a CSS var here would be wrong.
  'src/pages/ContentPreview/ContentPreview.jsx': 1,
  // mermaid uses its `fontFamily` for SVG label width measurement, so it needs
  // a literal family list rather than a custom property.
  'src/pages/AdminPrompts/components/CoachV2FlowDiagram.jsx': 1,
};

const collectSourceFiles = (dir, acc = []) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    // Skip tests — this file names the retired stacks in order to forbid them.
    if (entry.name === '__tests__') continue;
    if (entry.isDirectory()) collectSourceFiles(rel, acc);
    else if (/\.(css|jsx|js)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) acc.push(rel);
  }
  return acc;
};

describe('font wiring — Typekit family name', () => {
  it('puts proxima-nova first in --font-family', () => {
    const decl = indexCss.match(/--font-family:\s*([^;]+);/);
    expect(decl).not.toBeNull();
    expect(decl[1].trim().startsWith('proxima-nova')).toBe(true);
  });

  it('puts the bold-only family first in --font-family-bold, then proxima-nova', () => {
    const decl = indexCss.match(/--font-family-bold:\s*([^;]+);/);
    expect(decl).not.toBeNull();
    const value = decl[1].trim();
    expect(value.startsWith("'Proxima Nova Bold'")).toBe(true);
    expect(value).toContain('proxima-nova');
  });

  it("puts proxima-nova first in Tailwind's sans stack", () => {
    const sans = tailwind.match(/sans:\s*\[([^\]]+)\]/);
    expect(sans).not.toBeNull();
    const first = sans[1].split(',')[0].trim().replace(/['"]/g, '');
    expect(first).toBe('proxima-nova');
  });
});

describe('font wiring — bold face', () => {
  const boldFace = indexCss.match(/@font-face\s*\{[^}]*'Proxima Nova Bold'[^}]*\}/);

  it('declares the bold @font-face at font-weight 700', () => {
    // Without this descriptor the face registers at 400, so any element setting
    // BOTH .font-proxima-bold and font-bold/font-semibold gets synthetic bold
    // layered over an already-bold face — the worst Chrome/Safari divergence
    // in the app (14.4px on 13 characters, pre-fix).
    expect(boldFace).not.toBeNull();
    expect(boldFace[0]).toMatch(/font-weight:\s*700/);
  });

  it('serves the bold face from the licensed local file, not a third-party CDN', () => {
    expect(boldFace[0]).toContain('./assets/fonts/Proxima Nova Bold.woff');
    expect(indexCssRules).not.toContain('onlinewebfonts');
  });

  it('leaves .font-proxima-bold weightless so it cannot override an explicit weight', () => {
    // .font-proxima-bold is emitted AFTER Tailwind's weight utilities at equal
    // specificity, so a font-weight here would silently beat font-medium on the
    // ~82 call sites that set both. The 700-only family makes it unnecessary.
    const util = indexCss.match(/\.font-proxima-bold\s*\{([^}]*)\}/);
    expect(util).not.toBeNull();
    expect(util[1]).not.toMatch(/font-weight/);
  });
});

describe('font wiring — no stale font sources', () => {
  it('does not import the unused Inter webfont', () => {
    expect(indexCssRules).not.toContain('fonts.googleapis');
    expect(indexCssRules).not.toMatch(/family=Inter/);
  });

  it('keeps the Typekit kit linked in index.html', () => {
    expect(read('index.html')).toContain('use.typekit.net');
  });

  it('has no hardcoded Proxima stacks outside the canonical variables', () => {
    const offenders = [];
    for (const file of collectSourceFiles('src')) {
      if (file === 'src/index.css') continue;
      const hits = read(file).split('\n').filter((l) => l.includes('Proxima Nova')).length;
      const allowed = ALLOWED_HARDCODES[file] ?? 0;
      if (hits > allowed) offenders.push(`${file} (${hits} hits, ${allowed} allowed)`);
    }
    // A new hardcoded stack silently reintroduces the bug: 'Proxima Nova' does
    // not match the kit, so that element alone falls back to faked weights.
    // Use var(--font-family) / var(--font-family-bold) instead.
    expect(offenders).toEqual([]);
  });
});
