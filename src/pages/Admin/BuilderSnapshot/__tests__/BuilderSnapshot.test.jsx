import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('../../../../stores/authStore', () => {
  const state = { token: 'test-token', user: { id: 99, role: 'admin' } };
  const useAuthStore = (selector) => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { __esModule: true, default: useAuthStore };
});

vi.mock('../../../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccessPage: () => true,
    hasPermission: () => true,
    canUseFeature: () => true,
  }),
}));

vi.mock('../../../../services/builderProfileInspectorApi', () => ({
  searchUsers: vi.fn(),
  generateNarrative: vi.fn(),
}));

import { searchUsers, generateNarrative } from '../../../../services/builderProfileInspectorApi';

// Mock useSearchParams so we can control ?userId= per test.
let currentSearch = '';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => {
      const params = new URLSearchParams(currentSearch);
      const setSearchParams = (next) => {
        currentSearch =
          typeof next === 'function'
            ? next(new URLSearchParams(currentSearch)).toString()
            : next instanceof URLSearchParams
            ? next.toString()
            : new URLSearchParams(next).toString();
      };
      return [params, setSearchParams];
    },
  };
});

// Mock recharts — jsdom doesn't render canvas/SVG measurements; we just check
// the radar is invoked with the right data shape.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="recharts-responsive">{children}</div>,
  RadarChart: ({ children, data }) => (
    <div data-testid="recharts-radar" data-points={data?.length ?? 0}>
      {children}
    </div>
  ),
  PolarGrid: () => <div data-testid="recharts-polargrid" />,
  PolarAngleAxis: () => <div data-testid="recharts-axis" />,
  PolarRadiusAxis: () => <div data-testid="recharts-radius" />,
  Radar: ({ dataKey, name }) => (
    <div data-testid={`recharts-series-${dataKey}`} data-name={name} />
  ),
}));

// Mock ReactMarkdown — render plain text so we can assert content.
vi.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="markdown">{children}</div>,
}));

import BuilderSnapshot, { composeSummary } from '../BuilderSnapshot';

const FULL_SNAPSHOT = {
  identity: {
    user_id: 42,
    first_name: 'Bea',
    last_name: 'Builder',
    email: 'bea@pursuit.org',
    cohort: 'March 2026 L1',
  },
  full_name: 'Bea Builder',
  cohort_name: 'March 2026 L1',
  headshot_url: 'https://cdn.example.com/bea.jpg',
  profile: {
    background: { markdown: 'Self-taught dev from Queens with a museum-tech background.' },
    goals: { markdown: 'Land a frontend role at a values-aligned org by fall.' },
    learning_profile: { markdown: 'Likes worked examples followed by hands-on practice.' },
    learning_modality_preferences: { preferred: 'example_based' },
    competencies: {
      by_skill: {
        'write-structure-prompts': { evidence: [{ task_id: 1 }, { task_id: 2 }, { task_id: 3 }] },
        'evaluate-ai-critically': { evidence: [{ task_id: 4 }] },
      },
    },
    performance: {
      entries: [
        { date: '2026-06-01', summary: 'Strong remediation on prompt-structure task.' },
        { date: '2026-06-08', summary: 'Built a tight evaluator harness.' },
      ],
    },
    skill_levels: {
      'write-structure-prompts': 82,
      'evaluate-ai-critically': 67,
      'reason-about-models': 54,
    },
    skill_proficiency: {
      'write-structure-prompts': { level: 4, confidence: 0.8, observations: 5 },
      'evaluate-ai-critically': { level: 3, confidence: 0.6, observations: 3 },
      'reason-about-models': { level: 1, confidence: 0.3, observations: 0 },
      'write-clean-code': { level: 2, confidence: 0.7, observations: 2 },
      // communicate-effectively intentionally omitted → N/A
    },
    prior_knowledge_by_skill: {},
    apply_accuracy_by_skill: {},
    onboarding_assessment: null,
    interview_themes: null,
  },
};

// The radar component filters out empty categories — give each of the 3 fake
// categories at least one skill so all 3 series render.
const FAKE_TAXONOMY = {
  categories: {
    ai: { name: 'AI Fluency' },
    swe: { name: 'Software Engineering' },
    pro: { name: 'Professionalism' },
  },
  skills: {
    'write-structure-prompts': { name: 'Write & Structure Prompts', slug: 'write-structure-prompts', category: 'ai' },
    'evaluate-ai-critically': { name: 'Evaluate AI Critically', slug: 'evaluate-ai-critically', category: 'ai' },
    'reason-about-models': { name: 'Reason About Models', slug: 'reason-about-models', category: 'ai' },
    'write-clean-code': { name: 'Write Clean Code', slug: 'write-clean-code', category: 'swe' },
    'communicate-effectively': { name: 'Communicate Effectively', slug: 'communicate-effectively', category: 'pro' },
  },
};

function renderUI() {
  return render(
    <MemoryRouter>
      <BuilderSnapshot embedded />
    </MemoryRouter>,
  );
}

// Route-aware fetch mock. The component fires TWO endpoints:
//   1. /api/admin/builder-profiles/:userId  → snapshot
//   2. /api/admin/prompts/skill-taxonomy    → taxonomy
// Tests configure each independently via setRoutes().
let routeHandlers = {};
const setRoutes = (handlers) => {
  routeHandlers = { ...routeHandlers, ...handlers };
};
const buildRouteFetch = () =>
  vi.fn().mockImplementation(async (url) => {
    if (url.includes('/api/admin/builder-profiles/')) {
      return routeHandlers.snapshot || {
        ok: true,
        status: 200,
        json: async () => FULL_SNAPSHOT,
      };
    }
    if (url.includes('/api/admin/prompts/v2-coach-engine')) {
      // Server wraps taxonomy under `skillTaxonomy` in the v2-coach-engine
      // bundle response. The client extracts data.skillTaxonomy.
      return routeHandlers.taxonomy || {
        ok: true,
        status: 200,
        json: async () => ({ skillTaxonomy: FAKE_TAXONOMY }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const errResponse = (status, body = { error: 'fail' }) => ({
  ok: false,
  status,
  json: async () => body,
});

beforeEach(() => {
  currentSearch = '';
  routeHandlers = {};
  vi.clearAllMocks();
  searchUsers.mockResolvedValue({ results: [] });
  global.fetch = buildRouteFetch();
});

afterEach(() => {
  delete global.fetch;
});

describe('composeSummary (pure helper)', () => {
  it('uses background prose as-is when present (no stitching with goals/skills)', () => {
    const out = composeSummary(FULL_SNAPSHOT, FAKE_TAXONOMY);
    expect(out).toContain('Self-taught dev from Queens');
    // The earlier stitched version produced "Currently focused on..."; the
    // new helper deliberately does NOT inject goals or skill names inline.
    expect(out).not.toMatch(/Currently focused on/);
    expect(out).not.toMatch(/strengths in/i);
  });

  it('falls back to goals when background is missing', () => {
    const partial = { ...FULL_SNAPSHOT, profile: { goals: FULL_SNAPSHOT.profile.goals } };
    const out = composeSummary(partial, FAKE_TAXONOMY);
    expect(out).toContain('Land a frontend role');
  });

  it('returns a no-data placeholder when every field is empty', () => {
    expect(composeSummary({ profile: {} }, FAKE_TAXONOMY)).toBe('No summary captured yet.');
  });
});

describe('BuilderSnapshot', () => {
  it('renders the user picker when no ?userId is in the URL', async () => {
    renderUI();
    expect(screen.getByLabelText(/search builders/i)).toBeInTheDocument();
    // No snapshot fetch should have fired — only the best-effort taxonomy fetch
    // (gated on auth + permission) MAY fire. Verify the inspector endpoint
    // hasn't been called.
    await waitFor(() => {
      const calls = global.fetch.mock.calls.map((c) => c[0]);
      expect(calls.find((u) => u.includes('/api/admin/builder-profiles/'))).toBeUndefined();
    });
  });

  it('fetches and renders the hero + name + cohort when ?userId is set', async () => {
    currentSearch = 'userId=42';
    renderUI();
    await waitFor(() => {
      expect(screen.getByText('Bea Builder')).toBeInTheDocument();
    });
    expect(screen.getByText(/March 2026 L1/)).toBeInTheDocument();
    // Background text appears in BOTH the hero summary AND the markdown card —
    // assert there's at least one occurrence (the summary).
    expect(screen.getAllByText(/Self-taught dev from Queens/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the silhouette placeholder when headshot_url is null', async () => {
    currentSearch = 'userId=42';
    setRoutes({
      snapshot: okResponse({ ...FULL_SNAPSHOT, headshot_url: null }),
    });
    const { container } = renderUI();
    await waitFor(() => {
      expect(screen.getByText('Bea Builder')).toBeInTheDocument();
    });
    // SVG silhouette is the fallback (matches AdminDashboard's BuilderDrawer
    // placeholder). No <img> tag should render for the headshot when URL is null.
    expect(container.querySelector('img[alt="Bea Builder"]')).toBeNull();
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('renders skills grouped into category sections as Dreyfus bar meters', async () => {
    currentSearch = 'userId=42';
    renderUI();
    // Wait for the taxonomy fetch to resolve and groups to render.
    await waitFor(() => {
      expect(screen.getByText('AI Fluency')).toBeInTheDocument();
    });
    expect(screen.getByText('Software Engineering')).toBeInTheDocument();
    // Skill names appear in their group (and may also appear in a leaderboard).
    expect(screen.getAllByText('Write & Structure Prompts').length).toBeGreaterThan(0);
    // Dreyfus level label renders (level 4 → Proficient).
    expect(screen.getAllByText(/Proficient/).length).toBeGreaterThan(0);
    // Professionalism only has an N/A skill → hidden in the assessed view.
    expect(screen.queryByText('Professionalism')).toBeNull();
  });

  it('the All toggle reveals unassessed (N/A) skills', async () => {
    currentSearch = 'userId=42';
    renderUI();
    await waitFor(() => {
      expect(screen.getByText('AI Fluency')).toBeInTheDocument();
    });
    expect(screen.queryByText('Communicate Effectively')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Communicate Effectively')).toBeInTheDocument();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

  it('collapses a category section when its header is clicked', async () => {
    currentSearch = 'userId=42';
    renderUI();
    await waitFor(() => {
      expect(screen.getByText('AI Fluency')).toBeInTheDocument();
    });
    const header = screen.getByRole('button', { name: /AI Fluency/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the themed sections with markdown content', async () => {
    currentSearch = 'userId=42';
    renderUI();
    await waitFor(() => {
      expect(screen.getByText('Bea Builder')).toBeInTheDocument();
    });
    // Background / Goals / Learning Style cards each render one markdown block.
    const markdownBlocks = screen.getAllByTestId('markdown');
    expect(markdownBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it('shows an error card with a retry button on a 500 response', async () => {
    currentSearch = 'userId=42';
    setRoutes({ snapshot: errResponse(500, { error: 'boom' }) });
    renderUI();
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows a "Builder not found" message on 404 with no retry', async () => {
    currentSearch = 'userId=999';
    setRoutes({ snapshot: errResponse(404, { error: 'not found' }) });
    renderUI();
    // "Builder not found" renders in BOTH the heading AND the body paragraph,
    // so assert at least one match rather than exactly one.
    await waitFor(() => {
      expect(screen.getAllByText(/Builder not found/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('clicking "Back to search" clears userId and re-shows the picker', async () => {
    currentSearch = 'userId=42';
    renderUI();
    await waitFor(() => {
      expect(screen.getByText('Bea Builder')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /back to search/i }));
      await Promise.resolve();
    });
    // After clearing, the search box should be the visible state.
    expect(screen.getByLabelText(/search builders/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Regressions found on Dennys Antunish's real snapshot (2026-07-28). Each of
// these silently showed a builder as weaker than the data said, or dropped the
// data entirely.
// ---------------------------------------------------------------------------
const LONG_SUMMARY =
  'Dennys demonstrated a solid conceptual grasp of LLM hallucination and its practical ' +
  'implications, and produced a coherent final answer after coach scaffolding. His ' +
  'verification instincts are directionally correct but not yet risk-prioritized.';
const TRAJECTORY =
  'Consistent with prior sessions: Dennys engages and produces usable material when ' +
  'scaffolded step-by-step, but does not volunteer structure or synthesis independently.';

const REAL_SHAPE_SNAPSHOT = {
  ...FULL_SNAPSHOT,
  full_name: 'Dennys Antunish',
  cohort_name: 'L1 - July 2026',
  recent_apply_outcomes: [
    { task_id: 8573, task_title: 'Learn: What Is AI and How AI Learns', overall_score: 30, passed: true },
  ],
  profile: {
    ...FULL_SNAPSHOT.profile,
    learning_modality_preferences: { preferred: 'experiential' },
    performance: {
      entries: [
        {
          date: '2026-07-06',
          task_id: 8573,
          summary: LONG_SUMMARY,
          trajectory_note: TRAJECTORY,
          what_went_well: 'Correctly explained hallucination as statistical prediction.',
          what_to_improve: 'Front-load verification by stakes rather than familiarity.',
          overall_score: 30,
          passed: true,
        },
      ],
    },
    // Production shape: by_skill values are the evidence ARRAY itself, and each
    // entry's text lives in `evidence` (NOT `summary`).
    competencies: {
      by_skill: {
        'write-structure-prompts': [
          { at: '2026-07-07', task_id: 8577, evidence: 'Produced a structurally complete prompt.', confidence: 0.65 },
        ],
        'reason-about-models': [
          { at: '2026-06-23', task_id: null, evidence: 'Onboarding conversation (unverified prior)', confidence: 0.3 },
          { at: '2026-07-06', task_id: 8573, evidence: 'Described a sequential checklist rather than a deliberate plan.', confidence: 0.55 },
          { at: '2026-07-15', task_id: 8634, evidence: 'Wrote a complete, structured AI prompt in the final challenge.', confidence: 0.6 },
        ],
      },
    },
  },
};

const renderRealShape = async () => {
  currentSearch = 'userId=729';
  setRoutes({ snapshot: okResponse(REAL_SHAPE_SNAPSHOT) });
  await act(async () => { renderUI(); });
  await screen.findByText('Dennys Antunish');
};

describe('Recent Performance timeline', () => {
  it('shows the FULL summary when expanded (the collapsed row truncates it)', async () => {
    await renderRealShape();
    // Collapsed: the truncated copy exists, but the trajectory note does not.
    expect(screen.queryByText(TRAJECTORY)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Dennys demonstrated/ }));

    // Expanded: summary is repeated in full, so the sentence can be finished.
    expect(screen.getAllByText(LONG_SUMMARY).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the grader's trajectory note, which was captured but never displayed", async () => {
    await renderRealShape();
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Dennys demonstrated/ }));
    expect(screen.getByText(TRAJECTORY)).toBeInTheDocument();
    expect(screen.getByText(/Pattern over time/i)).toBeInTheDocument();
  });

  it('resolves the task title from recent_apply_outcomes instead of showing a bare date', async () => {
    await renderRealShape();
    expect(screen.getByText('Learn: What Is AI and How AI Learns')).toBeInTheDocument();
  });

  it('shows a pass outcome, never the derived 0-100 score', async () => {
    await renderRealShape();
    // passed:true with overall_score:30 — the old chip rendered "30" in amber,
    // presenting a pass as a near-failure. There is no 0-100 pass bar.
    expect(screen.getByText('✓ Passed')).toBeInTheDocument();
    expect(screen.queryByText('30')).not.toBeInTheDocument();
  });
});

describe('Strongest Skills panel', () => {
  it('renders the most recent EVIDENCE (the old code read a `summary` key that never existed)', async () => {
    await renderRealShape();
    expect(screen.getByText(/Wrote a complete, structured AI prompt/)).toBeInTheDocument();
  });

  it('ranks by Dreyfus level, not evidence count', async () => {
    await renderRealShape();
    // reason-about-models has the MOST observations (2 graded) but level 1;
    // write-structure-prompts has 1 observation at level 4. Level must win —
    // ranking by count crowned the weakest skill as the top achievement.
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const strongest = headings.indexOf('Write & Structure Prompts');
    const weakest = headings.indexOf('Reason About Models');
    expect(strongest).toBeGreaterThanOrEqual(0);
    expect(strongest).toBeLessThan(weakest);
    expect(screen.getByText(/L4 Proficient/)).toBeInTheDocument();
  });

  it('excludes onboarding priors (task_id: null) from the observation count', async () => {
    await renderRealShape();
    // reason-about-models has 3 evidence rows, one of which is an onboarding
    // prior — only the 2 graded observations should count.
    expect(screen.getByText('2 observations')).toBeInTheDocument();
    expect(screen.queryByText(/Onboarding conversation/)).not.toBeInTheDocument();
  });
});

describe('Hero + story cards', () => {
  it('never renders a "N / 5" fraction anywhere on the page', async () => {
    await renderRealShape();
    // Dreyfus is an ordinal ladder whose top two levels are out of scope for a
    // first course; as a fraction it reads as a failing percentage.
    expect(screen.queryByText(/\d+(\.\d+)?\s*\/\s*5/)).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Proficiency')).not.toBeInTheDocument();
  });

  it('labels every teaching method in the 6-wide enum, not just three', async () => {
    await renderRealShape();
    expect(screen.getByText('Prefers Experiential')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Readiness panel. Replaced the "Avg Proficiency 1.6 / 5" tile. The property
// that matters is that the four signals stay SEPARATE — measured on prod, 49%
// of an L1 cohort would be misread from a level alone (below-median-but-
// improving, above-median-but-declining, or silently stopped).
// ---------------------------------------------------------------------------
const READINESS = {
  cohort: { cohort_id: 'c-1', name: 'L1 - July 2026', course_level: 'L1', peers_with_data: 77 },
  distribution: {
    histogram: { 0: 0, 1: 2, 2: 7, 3: 0, 4: 0, 5: 0 },
    assessed: 9,
    inCourseCount: 8,
    inCourse: [],
    notYetTaught: [{ slug: 'analyze-industry-market', level: 2, learnedIn: ['L2'] }],
    earlierCourse: [],
    modalLevel: 2,
  },
  direction: { label: 'improving', improved: 13, held: 7, declined: 0, movable: 20, improvedPct: 65 },
  independence: { pct_cap: 39, pct_remediation: 4, avg_turns: 8.7, max_learn_turns: 10, peer_median_pct_cap: 32 },
  engagement: { sessions: 23, completed: 22, graded: 22, last_graded_at: '2026-08-03T19:43:39Z', days_since_graded: 0, peer_median_sessions: 23 },
  position: { avg_level: 1.84, peer_median_avg_level: 1.63, percentile: 58 },
};

const SCALE = {
  tiers: [
    { tier: 'awareness', levels: [1, 2] },
    { tier: 'application', levels: [3] },
    { tier: 'adaptation', levels: [4, 5] },
  ],
  courseBands: [
    { course: 'L1', reachable: [1, 2, 3], note: 'Adaptation (4-5) is team-scoped and out of scope for a first course.' },
  ],
};

const renderWithReadiness = async (readiness = READINESS) => {
  currentSearch = 'userId=729';
  setRoutes({
    snapshot: okResponse({ ...REAL_SHAPE_SNAPSHOT, readiness }),
    taxonomy: okResponse({ skillTaxonomy: FAKE_TAXONOMY, skillProficiency: { scale: SCALE } }),
  });
  await act(async () => { renderUI(); });
  await screen.findByText('Dennys Antunish');
};

describe('Readiness panel', () => {
  it('leads with the modal stage and peer percentile instead of a mean', async () => {
    await renderWithReadiness();
    const panel = screen.getByLabelText('Readiness signals');
    expect(screen.getByText('Where this builder stands')).toBeInTheDocument();
    // The stage appears in the headline AND in the bar's legend — the legend is
    // required so identity is never colour-alone, so both are expected.
    expect(within(panel).getAllByText('Advanced Beginner').length).toBeGreaterThanOrEqual(1);
    expect(within(panel).getByText(/58th percentile/)).toBeInTheDocument();
    // 9 assessed skills, and the mean is never the headline.
    expect(within(panel).getByText(/9 skills assessed/)).toBeInTheDocument();
  });

  it('shows direction as movement against the builder\'s OWN prior, with the raw counts', async () => {
    await renderWithReadiness();
    const panel = screen.getByLabelText('Readiness signals');
    expect(within(panel).getByText('Improving')).toBeInTheDocument();
    // 13 improved appears on the bar segment and again in the labelled legend.
    expect(within(panel).getAllByText('13').length).toBeGreaterThanOrEqual(1);
    expect(within(panel).getByText('improved')).toBeInTheDocument();
    expect(within(panel).getByText('declined')).toBeInTheDocument();
    expect(within(panel).getByText(/65% of 20 movable assessments went up/)).toBeInTheDocument();
  });

  it('flags a skill the course does not teach yet as AHEAD, not a shortfall', async () => {
    await renderWithReadiness();
    expect(screen.getByText(/ahead: analyze-industry-market/)).toBeInTheDocument();
  });

  it('states the reachable band for the course rather than implying /5 is the target', async () => {
    await renderWithReadiness();
    expect(screen.getByText(/reachable band is/)).toBeInTheDocument();
    expect(screen.getByText(/out of scope for a first course/)).toBeInTheDocument();
  });

  it('reads scaffolding against the cohort median, not an invented target', async () => {
    await renderWithReadiness();
    // 39% cap vs 32% median → within 15pts → "About typical".
    expect(screen.getByText('About typical')).toBeInTheDocument();
    expect(screen.getByText('39%')).toBeInTheDocument();
  });

  it('surfaces a builder who has gone quiet', async () => {
    await renderWithReadiness({
      ...READINESS,
      engagement: { ...READINESS.engagement, days_since_graded: 11 },
    });
    expect(screen.getByText('Quiet 11d')).toBeInTheDocument();
    expect(screen.getByText(/No graded work in 11 days/)).toBeInTheDocument();
  });

  it('self-hides rather than inventing peers when the builder has no active cohort', async () => {
    await renderWithReadiness(null);
    expect(screen.queryByText('Where this builder stands')).not.toBeInTheDocument();
    // The rest of the page still renders.
    expect(screen.getByText('Dennys Antunish')).toBeInTheDocument();
  });

  it('never combines the signals into a composite score', async () => {
    await renderWithReadiness();
    expect(screen.queryByText(/readiness score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/overall score/i)).not.toBeInTheDocument();
  });
});


// ---------------------------------------------------------------------------
// Narrative panel — the evidence-cited "case both ways" summary.
// Two properties are load-bearing: it never reaches a verdict, and every claim
// shows the source it rests on.
// ---------------------------------------------------------------------------
const NARRATIVE = {
  stale: false,
  generated_at: '2026-08-03T20:00:00Z',
  model: 'anthropic/claude-sonnet-5',
  sessions_considered: 9,
  summary: {
    headline: 'Dennys is at the 58th percentile of 77 peers with 13 skills improved and 0 declined.',
    case_for: [
      {
        claim: 'Produced the full four-part competitive analysis unprompted.',
        evidence: 'Dennys named five real, differentiated competitors and tied each to its business model.',
        task_id: 9078, task_title: 'Learn: Value Propositions', skill: 'analyze-industry-market', at: '2026-07-27T17:59:51Z',
      },
    ],
    case_against: [
      {
        claim: 'Branching has been a persistent gap across all git sessions.',
        evidence: 'The full workflow — pull, branch, commit, PR — has not been produced unprompted in any session.',
        task_id: 8627, task_title: 'Learn: GitHub Workflows', skill: 'git-version-control', at: '2026-07-23T16:55:25Z',
      },
    ],
    watch_items: [
      {
        claim: 'Confirm he can produce a full git workflow unprompted.',
        evidence: 'Add the branching step before starting work.',
        task_id: 8627, task_title: 'Learn: GitHub Workflows', skill: null, at: '2026-07-23T16:55:25Z',
      },
    ],
  },
};

const renderWithNarrative = async (narrative) => {
  currentSearch = 'userId=729';
  setRoutes({ snapshot: okResponse({ ...REAL_SHAPE_SNAPSHOT, readiness: READINESS, narrative }) });
  await act(async () => { renderUI(); });
  await screen.findByText('Dennys Antunish');
};

describe('Narrative panel', () => {
  beforeEach(() => { generateNarrative.mockReset(); });

  it('shows both cases with equal weight and reaches no verdict', async () => {
    await renderWithNarrative(NARRATIVE);
    expect(screen.getByText('The case both ways')).toBeInTheDocument();
    expect(screen.getByText('Case for')).toBeInTheDocument();
    expect(screen.getByText('Case against')).toBeInTheDocument();
    // It must never tell staff what to do — that is the offer decision.
    expect(screen.queryByText(/recommend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/extend an offer to/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/do not extend/i)).not.toBeInTheDocument();
  });

  it('shows the source task and the verbatim quote under every claim', async () => {
    await renderWithNarrative(NARRATIVE);
    expect(screen.getByText(/Produced the full four-part competitive analysis/)).toBeInTheDocument();
    expect(screen.getByText(/named five real, differentiated competitors/)).toBeInTheDocument();
    expect(screen.getAllByText(/Learn: GitHub Workflows/).length).toBeGreaterThanOrEqual(1);
  });

  it('offers generation instead of auto-running it when no summary exists', async () => {
    await renderWithNarrative(null);
    // A page load must never trigger an LLM call.
    expect(generateNarrative).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Write the summary/ })).toBeInTheDocument();
  });

  it('generates on click and renders the result', async () => {
    generateNarrative.mockResolvedValue(NARRATIVE);
    await renderWithNarrative(null);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Write the summary/ })); });
    expect(generateNarrative).toHaveBeenCalledWith('test-token', 729);
    expect(screen.getByText(/58th percentile of 77 peers/)).toBeInTheDocument();
  });

  it('flags a summary as stale once the builder has been graded again', async () => {
    await renderWithNarrative({ ...NARRATIVE, stale: true });
    expect(screen.getByText(/graded since the summary was written/)).toBeInTheDocument();
  });

  it('explains an insufficient-evidence refusal in plain language', async () => {
    const err = new Error('Not enough graded evidence to write a summary yet');
    err.code = 'INSUFFICIENT_EVIDENCE';
    generateNarrative.mockRejectedValue(err);
    await renderWithNarrative(null);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Write the summary/ })); });
    expect(screen.getByText(/Not enough graded work yet/)).toBeInTheDocument();
  });

  it('discloses provenance so a stale read cannot pass as current', async () => {
    await renderWithNarrative(NARRATIVE);
    expect(screen.getByText(/from 9 graded sessions/)).toBeInTheDocument();
    expect(screen.getByText(/claude-sonnet-5/)).toBeInTheDocument();
  });

  it('keeps watch items behind a toggle so the two cases stay the focus', async () => {
    await renderWithNarrative(NARRATIVE);
    expect(screen.queryByText(/Confirm he can produce a full git workflow/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /What to check next/ }));
    expect(screen.getByText(/Confirm he can produce a full git workflow/)).toBeInTheDocument();
  });
});
