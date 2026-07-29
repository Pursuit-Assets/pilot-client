import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  levelLabel, vsPriorLabel, gradeReason, topLevel, SkillAssessmentTable,
} from '../coachDreyfus';

describe('coachDreyfus helpers', () => {
  it('levelLabel renders Dreyfus labels and N/A', () => {
    expect(levelLabel(4)).toBe('L4 Proficient');
    expect(levelLabel(0)).toBe('L0 Below Novice');
    expect(levelLabel(null)).toBe('N/A');
  });

  it('vsPriorLabel describes movement vs the prior level', () => {
    expect(vsPriorLabel({ level: 3, prior: 2 })).toBe('↑ improved from L2');
    expect(vsPriorLabel({ level: 3, prior: 3 })).toBe('held L3');
    expect(vsPriorLabel({ level: 2, prior: 4 })).toBe('↓ below prior L4');
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
    expect(screen.getByText('L4 Proficient')).toBeInTheDocument();
    expect(screen.getByText('↑ improved from L3')).toBeInTheDocument();
    expect(screen.getByText('clear strategy')).toBeInTheDocument();
    expect(screen.getByText('iterated')).toBeInTheDocument();
  });

  it('renders nothing for an empty/absent assessments list', () => {
    const { container } = render(<SkillAssessmentTable assessments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
