import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the service module before importing the component
const mockFetchWeeks = vi.fn();
const mockFetchReport = vi.fn();

vi.mock('../../../utils/weeklyFeedbackService', () => ({
  fetchAvailableReportWeeks: (...args) => mockFetchWeeks(...args),
  fetchWeeklyFeedbackReport: (...args) => mockFetchReport(...args),
}));

// Mock the Select components since they rely on Radix popovers
vi.mock('../../../components/ui/select', () => ({
  Select: ({ children, value }) => <div data-testid="select" data-value={value}>{children}</div>,
  SelectTrigger: ({ children }) => <button data-testid="select-trigger">{children}</button>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: ({ children }) => <div data-testid="select-content">{children}</div>,
  SelectItem: ({ children, value }) => <div data-testid={`select-item-${value}`}>{children}</div>,
}));

import WeeklyFeedbackReport from '../components/WeeklyFeedbackReport';

// --- Test data ---

const mockWeeks = [
  { week_number: 5, week_start_date: '2026-03-16', week_end_date: '2026-03-20' },
  { week_number: 4, week_start_date: '2026-03-09', week_end_date: '2026-03-13' },
  { week_number: 3, week_start_date: '2026-03-02', week_end_date: '2026-03-06' },
];

const fullReport = {
  success: true,
  report: {
    summary: {
      body: 'Carlos had a strong week with consistent attendance and solid task completion.',
    },
    attendance: {
      headline: 'Perfect attendance this week',
      body: 'You attended all 5 class days.',
    },
    assignment_feedback: {
      headline: 'Strong performance on assessments',
      body: 'Great progress overall. One task still outstanding:\n- Complete the React hooks exercise\n- Review peer code submissions',
      strengths: [
        { label: 'Problem Solving', explanation: 'Excellent debugging skills' },
        { label: 'Code Quality', explanation: 'Clean and readable code' },
      ],
      growth_areas: [
        { label: 'Testing', explanation: 'Add more unit test coverage' },
      ],
    },
    peer_feedback: {
      headline: 'Positive peer impressions',
      body: 'Your teammates appreciated your contributions.',
      strengths: [
        { label: 'Communication', from_name: 'Jane S.' },
        { label: 'Collaboration', from_name: 'Alex L.' },
      ],
      growth_areas: [
        { label: 'Time Management', explanation: 'Try to stay on track with deadlines' },
      ],
    },
    personal_reflections: {
      headline: 'Thoughtful self-assessment',
      body: 'You showed good awareness of your learning journey.',
    },
    recommendation: {
      headline: 'Focus on testing fundamentals',
      body: 'Spend extra time this week on unit testing patterns. Consider pairing with a peer on TDD exercises.',
    },
    footer: 'This report is AI-generated and may contain errors.',
  },
  weekNumber: 5,
  weekStartDate: '2026-03-16',
  weekEndDate: '2026-03-20',
  attendanceRate: 100,
  taskCompletionRate: 80,
  avgGradedScore: 88.5,
  generatedAt: '2026-03-20T06:00:00Z',
};

const partialReport = {
  success: true,
  report: {
    summary: { body: 'A quiet week.' },
    attendance: { headline: 'Missed one day', body: 'You attended 4 of 5 days.' },
    // No assignment_feedback, peer_feedback, personal_reflections, recommendation, or footer
  },
  weekNumber: 4,
  weekStartDate: '2026-03-09',
  weekEndDate: '2026-03-13',
  attendanceRate: 80,
  taskCompletionRate: null,
  avgGradedScore: null,
  generatedAt: '2026-03-13T06:00:00Z',
};

// --- Tests ---

describe('WeeklyFeedbackReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockFetchWeeks.mockReturnValue(new Promise(() => {})); // never resolves

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    expect(screen.getByText('Loading report...')).toBeInTheDocument();
    expect(screen.getByText('Weekly Report')).toBeInTheDocument();
  });

  it('shows empty state when no weeks are available', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: [] });

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('No reports available yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Weekly reports will appear here as they are generated.')
    ).toBeInTheDocument();
  });

  it('renders a full report with all sections', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: mockWeeks });
    mockFetchReport.mockResolvedValue(fullReport);

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    // Wait for report to load
    await waitFor(() => {
      expect(
        screen.getByText('Carlos had a strong week with consistent attendance and solid task completion.')
      ).toBeInTheDocument();
    });

    // Summary
    expect(
      screen.getByText('Carlos had a strong week with consistent attendance and solid task completion.')
    ).toBeInTheDocument();

    // Section: Attendance
    expect(screen.getByText('Perfect attendance this week')).toBeInTheDocument();

    // Assignment Feedback — replaces the legacy task_completion / graded_assignments sections
    expect(screen.getByText('Assignment Feedback')).toBeInTheDocument();
    expect(screen.getByText('Strong performance on assessments')).toBeInTheDocument();

    // Bullet items from assignment_feedback.body
    expect(screen.getByText('Complete the React hooks exercise')).toBeInTheDocument();
    expect(screen.getByText('Review peer code submissions')).toBeInTheDocument();

    // Strengths / growth areas render as numbered "label: explanation" entries
    expect(screen.getByText(/Problem Solving/)).toBeInTheDocument();
    expect(screen.getByText(/Code Quality/)).toBeInTheDocument();
    expect(screen.getByText(/Testing/)).toBeInTheDocument();

    // Legacy sections are gone
    expect(screen.queryByText('Task Completion')).not.toBeInTheDocument();
    expect(screen.queryByText('Graded Assignments')).not.toBeInTheDocument();

    // Peer Feedback — strengths render as attributed quotes; growth areas no longer shown
    expect(screen.getByText('Peer Feedback')).toBeInTheDocument();
    expect(screen.getByText('"Communication"')).toBeInTheDocument();
    expect(screen.getByText('— Jane S.')).toBeInTheDocument();
    expect(screen.getByText('"Collaboration"')).toBeInTheDocument();
    expect(screen.getByText('— Alex L.')).toBeInTheDocument();
    expect(screen.queryByText('Time Management')).not.toBeInTheDocument();

    // Personal Reflections
    expect(screen.getByText('Personal Reflections')).toBeInTheDocument();
    expect(screen.getByText('Thoughtful self-assessment')).toBeInTheDocument();

    // Recommendation
    expect(screen.getByText('Recommendation')).toBeInTheDocument();
    expect(screen.getByText('Focus on testing fundamentals')).toBeInTheDocument();
  });

  it('renders a partial report — missing sections are not shown', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: mockWeeks });
    mockFetchReport.mockResolvedValue(partialReport);

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('A quiet week.')).toBeInTheDocument();
    });

    // Summary + Attendance are present
    expect(screen.getByText('Missed one day')).toBeInTheDocument();

    // These sections should NOT be in the document
    expect(screen.queryByText('Task Completion')).not.toBeInTheDocument();
    expect(screen.queryByText('Graded Assignments')).not.toBeInTheDocument();
    expect(screen.queryByText('Peer Feedback')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal Reflections')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommendation')).not.toBeInTheDocument();
  });

  it('calls fetchAvailableReportWeeks with the token on mount', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: [] });

    render(<WeeklyFeedbackReport userId={279} token="my-jwt-token" />);

    await waitFor(() => {
      expect(mockFetchWeeks).toHaveBeenCalledWith('my-jwt-token');
    });
  });

  it('calls fetchWeeklyFeedbackReport with token and latest week number', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: mockWeeks });
    mockFetchReport.mockResolvedValue(fullReport);

    render(<WeeklyFeedbackReport userId={279} token="my-jwt-token" />);

    await waitFor(() => {
      // Should auto-select the first (latest) week: week 5
      expect(mockFetchReport).toHaveBeenCalledWith('my-jwt-token', 5);
    });
  });

  it('renders week selector with available weeks', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: mockWeeks });
    mockFetchReport.mockResolvedValue(fullReport);

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    await waitFor(() => {
      expect(screen.getByTestId('select')).toBeInTheDocument();
    });

    // Check that week items are rendered
    expect(screen.getByTestId('select-item-5')).toBeInTheDocument();
    expect(screen.getByTestId('select-item-4')).toBeInTheDocument();
    expect(screen.getByTestId('select-item-3')).toBeInTheDocument();
  });

  it('shows error state when weeks fetch fails', async () => {
    mockFetchWeeks.mockRejectedValue(new Error('Network error'));

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('Error loading report')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('handles assignment_feedback with no strengths or growth_areas', async () => {
    const reportWithMinimalGrades = {
      success: true,
      report: {
        summary: { body: 'Short week.' },
        assignment_feedback: {
          headline: 'Assessment results',
          body: 'You completed one assessment.',
          // No strengths or growth_areas arrays
        },
        // No other sections — keeps the test focused
      },
      weekNumber: 5,
      attendanceRate: null,
      taskCompletionRate: null,
      avgGradedScore: null,
    };

    mockFetchWeeks.mockResolvedValue({ success: true, weeks: mockWeeks });
    mockFetchReport.mockResolvedValue(reportWithMinimalGrades);

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('Assessment results')).toBeInTheDocument();
    });

    // Section is present but no Strengths/Growth Areas sub-headers
    expect(screen.getByText('You completed one assessment.')).toBeInTheDocument();
    expect(screen.queryByText('Strengths')).not.toBeInTheDocument();
    expect(screen.queryByText('Growth Areas')).not.toBeInTheDocument();
  });

  it('renders report.footer when present', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: mockWeeks });
    mockFetchReport.mockResolvedValue(fullReport);

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    await waitFor(() => {
      expect(
        screen.getByText('This report is AI-generated and may contain errors.')
      ).toBeInTheDocument();
    });
  });

  it('omits the footer when the report has none', async () => {
    mockFetchWeeks.mockResolvedValue({ success: true, weeks: mockWeeks });
    mockFetchReport.mockResolvedValue(partialReport);

    render(<WeeklyFeedbackReport userId={279} token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('A quiet week.')).toBeInTheDocument();
    });

    expect(
      screen.queryByText('This report is AI-generated and may contain errors.')
    ).not.toBeInTheDocument();
  });
});
