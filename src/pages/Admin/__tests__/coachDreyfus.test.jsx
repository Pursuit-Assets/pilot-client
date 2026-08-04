import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  levelLabel, vsPriorLabel, gradeReason, topLevel, SkillAssessmentTable,
} from '../coachDreyfus';

describe('coachDreyfus helpers', () => {
  // The L-number was dropped from every Coach surface (2026-08-03) — staff read
  // the stage name, and the digit implied a score the Dreyfus scale doesn't carry.
  it('levelLabel renders the bare Dreyfus stage name, not an L-number', () => {
    expect(levelLabel(4)).toBe('Proficient');
    expect(levelLabel(0)).toBe('Below Novice');
    expect(levelLabel(null)).toBe('N/A');
    expect(levelLabel(undefined)).toBe('N/A');
  });

  // An off-scale level must stay VISIBLE rather than render as an empty chip —
  // the previous implementation surfaced it as a bare "L6".
  it('levelLabel falls back to "Level <n>" for a level outside the scale', () => {
    expect(levelLabel(6)).toBe('Level 6');
  });

  it('vsPriorLabel describes movement vs the prior level', () => {
    expect(vsPriorLabel({ level: 3, prior: 2 })).toBe('↑ improved from Advanced Beginner');
    expect(vsPriorLabel({ level: 3, prior: 3 })).toBe('held Competent');
    expect(vsPriorLabel({ level: 2, prior: 4 })).toBe('↓ below prior Proficient');
    expect(vsPriorLabel({ level: 3 })).toBe('new skill'); // no prior
    expect(vsPriorLabel({ level: null })).toBeNull();
  });

  it('gradeReason prefers metCount/assessedCount, falls back to held flags', () => {
    expect(gradeReason({ metCount: 2, assessedCount: 2 })).toBe('held or improved on 2 of 2 skills');
    expect(gradeReason({ metCount: 1, assessedCount: 1 })).toBe('held or improved on 1 of 1 skill');
    expect(gradeReason({ skillAssessments: [{ held: true }, { held: false }] }))
      .toBe('held or improved on 1 of 2 skills');
    expect(gradeReason({})).toBeNull();
  });

  it('topLevel returns the highest integer level, ignoring N/A', () => {
    expect(topLevel([{ level: 2 }, { level: 4 }, { level: null }])).toBe(4);
    expect(topLevel([])).toBeNull();
    expect(topLevel([{ level: null }])).toBeNull();
  });
});

describe('SkillAssessmentTable', () => {
  it('renders a row per assessment with level + vs-prior + rationale + evidence', () => {
    render(<SkillAssessmentTable assessments={[
      { skill_slug: 'write-structure-prompts', level: 4, prior: 3, rationale: 'clear strategy', evidence: 'iterated' },
    ]} />);
    expect(screen.getByText('write structure prompts')).toBeInTheDocument();
    expect(screen.getByText('Proficient')).toBeInTheDocument();
    expect(screen.getByText('↑ improved from Competent')).toBeInTheDocument();
    expect(screen.getByText('clear strategy')).toBeInTheDocument();
    expect(screen.getByText('iterated')).toBeInTheDocument();
  });

  it('renders nothing for an empty/absent assessments list', () => {
    const { container } = render(<SkillAssessmentTable assessments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
