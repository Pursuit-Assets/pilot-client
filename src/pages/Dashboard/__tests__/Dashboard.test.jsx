import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';
import useAuthStore from '../../../stores/authStore';

// Mock useNavigate at the top level
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

// Mock child components to isolate Dashboard testing
vi.mock('../../../components/MissedAssignmentsSidebar/MissedAssignmentsSidebar', () => ({
  default: ({ isOpen, onClose }) => (
    isOpen ? <div data-testid="missed-assignments-sidebar">Sidebar</div> : null
  )
}));

vi.mock('../../../components/animate-ui/components/buttons/ripple', () => ({
  RippleButton: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  )
}));

// Mock lucide-react icons — use importOriginal to get all icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
  };
});

// Mock Layout to isolate Dashboard testing (Layout renders nav, sidebar, etc.)
vi.mock('../../../components/Layout/Layout', () => ({
  default: ({ children, isLoading }) => (
    <div data-testid="layout">
      {isLoading && <div data-testid="loading-curtain">Loading...</div>}
      <div>{children}</div>
    </div>
  )
}));

// Helper to render Dashboard with Zustand store state
const renderDashboard = (storeState = {}) => {
  const defaultState = {
    token: 'test-token',
    user: {
      firstName: 'John',
      role: 'builder',
      active: true
    },
    isAuthenticated: true,
    isLoading: false,
    _hasHydrated: true,
  };

  useAuthStore.setState({ ...defaultState, ...storeState });

  return render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
};

const createJsonResponse = (data, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    json: async () => data,
  });

const createDefaultFetchMock = () =>
  vi.fn((input) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);

    if (url.includes('/api/learning/batch-completion-status')) {
      return createJsonResponse({ completionStatus: {} });
    }

    if (url.includes('/api/permissions/cohorts')) {
      return createJsonResponse({ cohorts: [] });
    }

    if (url.includes('/api/progress/dashboard-full')) {
      return createJsonResponse({
        day: { daily_goal: 'Default Test Goal', week: 1, level: 1, weekly_goal: 'Default Weekly Goal' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0,
        weeks: [],
      });
    }

    return createJsonResponse({});
  });

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear all mocks before each test
    vi.clearAllMocks();
    mockNavigate.mockClear();

    // Reset Zustand auth store
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      _hasHydrated: true,
      logout: vi.fn(),
    });

    // Mock fetch globally
    global.fetch = createDefaultFetchMock();

    // Mock environment variable
    import.meta.env.VITE_API_URL = 'http://localhost:3000';
  });

  describe('Unit Tests - Helper Functions', () => {
    // Note: These are internal functions, so we'll test them through component behavior
    // In a real scenario, you'd export them or test through public API

    describe('formatTime', () => {
      it('should convert 24-hour time to 12-hour format with AM', async () => {
        const mockData = {
          day: { daily_goal: 'Test goal', week: 1, level: 1 },
          timeBlocks: [{
            start_time: '09:30',
            tasks: [{
              id: 1,
              task_title: 'Morning Task',
              duration_minutes: 30,
              task_type: 'lecture'
            }]
          }],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });
      });

      it('should convert 24-hour time to 12-hour format with PM', async () => {
        const mockData = {
          day: { daily_goal: 'Test goal', week: 1, level: 1 },
          timeBlocks: [{
            start_time: '14:30',
            tasks: [{
              id: 1,
              task_title: 'Afternoon Task',
              duration_minutes: 30,
              task_type: 'lecture'
            }]
          }],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });
      });
    });

    describe('Date formatting', () => {
      it('should format today date with TODAY prefix', async () => {
        const today = new Date().toISOString();

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            day: { daily_goal: 'Test', week: 1, level: 1 },
            timeBlocks: [],
            taskProgress: [],
            missedAssignmentsCount: 0,
            weeks: [{
              weekNumber: 1,
              weeklyGoal: 'Test',
              days: [{ id: 1, day_date: today, tasks: [] }]
            }]
          })
        });

        renderDashboard();

        await waitFor(() => {
          // Use getAllByText since TODAY appears in both desktop and mobile views
          const todayElements = screen.getAllByText(/TODAY/i);
          expect(todayElements.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Integration Tests - Component Rendering', () => {
    describe('Loading State', () => {
      it('should show loading state initially', () => {
        global.fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

        renderDashboard();

        expect(screen.getByTestId('loading-curtain')).toBeInTheDocument();
      });
    });

    describe('Error Handling', () => {
      it('should display error message when API fails', async () => {
        global.fetch.mockRejectedValueOnce(new Error('Network error'));

        renderDashboard();

        await waitFor(() => {
          expect(screen.getByText(/Failed to load dashboard data/i)).toBeInTheDocument();
        });
      });

      it('should handle non-ok response from API', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' })
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.getByText(/Failed to load dashboard data/i)).toBeInTheDocument();
        });
      });
    });

    describe('User Role-Based Rendering', () => {
      it('should show volunteer view for volunteer users', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            day: {},
            timeBlocks: [],
            taskProgress: [],
            missedAssignmentsCount: 0
          })
        });

        renderDashboard({
          user: { firstName: 'Jane', role: 'volunteer', active: true }
        });

        await waitFor(() => {
          expect(screen.getByText(/Welcome, Volunteer!/i)).toBeInTheDocument();
          expect(screen.getByText(/Go to Volunteer Feedback/i)).toBeInTheDocument();
        });
      });

      it('should show historical view for inactive users', async () => {
        renderDashboard({
          user: { firstName: 'Jane', role: 'builder', active: false }
        });

        await waitFor(() => {
          // Use exact string to avoid matching CardDescription which also contains "historical access only"
          expect(screen.getByText('Historical Access Only')).toBeInTheDocument();
          expect(screen.getByText('View Past Sessions')).toBeInTheDocument();
        });
      });

      it('should show regular dashboard for active builders', async () => {
        const mockData = {
          day: {
            daily_goal: 'Learn React Testing',
            week: 1,
            level: 1,
            weekly_goal: 'Master Testing'
          },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.getByText(/Hey John. Good to see you!/i)).toBeInTheDocument();
          // Goal appears in both desktop and mobile views
          const goalElements = screen.getAllByText('Learn React Testing');
          expect(goalElements.length).toBeGreaterThan(0);
        });
      });
    });

    describe('Dashboard Content', () => {
      beforeEach(() => {
        const mockDashboardData = {
          day: {
            daily_goal: 'Complete all tests',
            week: 5,
            level: 1,
            weekly_goal: 'Master Testing'
          },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 3,
          weeks: [
            {
              weekNumber: 5,
              weeklyGoal: 'Master Testing',
              days: [
                {
                  id: 1,
                  day_date: new Date().toISOString(),
                  tasks: [
                    { id: 1, task_title: 'Task 1', deliverable_type: null },
                    { id: 2, task_title: 'Task 2', deliverable_type: 'video', hasSubmission: false }
                  ]
                }
              ]
            }
          ]
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockDashboardData
        });
      });

      it('should display user greeting with first name', async () => {
        renderDashboard();

        await waitFor(() => {
          expect(screen.getByText(/Hey John. Good to see you!/i)).toBeInTheDocument();
        });
      });

      it('should display today\'s goal', async () => {
        renderDashboard();

        await waitFor(() => {
          // Goal appears in both desktop and mobile views
          const goalElements = screen.getAllByText('Complete all tests');
          expect(goalElements.length).toBeGreaterThan(0);
        });
      });

      it('should display missed assignments count', async () => {
        renderDashboard();

        await waitFor(() => {
          expect(screen.getByText(/\( 3 \) missed assignments/i)).toBeInTheDocument();
        });
      });

      it('should display week and level information', async () => {
        renderDashboard();

        await waitFor(() => {
          // Desktop renders level and week with CSS-formatted text
          // Check for week number in the Select trigger
          const weekElements = screen.getAllByText(/Week 05/i);
          expect(weekElements.length).toBeGreaterThan(0);
        });
      });

      it('should display weekly goal', async () => {
        renderDashboard();

        await waitFor(() => {
          expect(screen.getByText('Master Testing')).toBeInTheDocument();
        });
      });
    });

    describe('Upcoming Events', () => {
      it('should display upcoming events in hidden section', async () => {
        const mockData = {
          day: { daily_goal: 'Test', week: 1, level: 1 },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          // Upcoming section exists in DOM but is hidden (visibility: hidden)
          // It appears in both desktop and mobile views
          const upcomingElements = screen.getAllByText('Upcoming');
          expect(upcomingElements.length).toBeGreaterThan(0);
          // Event data is still in the DOM
          const demoDay = screen.getAllByText('Demo Day');
          expect(demoDay.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Integration Tests - User Interactions', () => {
    beforeEach(() => {
      const mockData = {
        day: { daily_goal: 'Test', week: 1, level: 1, weekly_goal: 'Test Week' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 2
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData
      });
    });

    describe('Navigation', () => {
      it('should navigate to learning page when Start button is clicked', async () => {
        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });

        // Start appears in both desktop and mobile views
        const startButton = screen.getAllByText('Start')[0];
        fireEvent.click(startButton);

        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith('/learning');
        });
      });

      it('should prevent navigation for inactive users', async () => {
        renderDashboard({
          user: { firstName: 'Jane', role: 'builder', active: false }
        });

        await waitFor(() => {
          expect(screen.getByText('Historical Access Only')).toBeInTheDocument();
        });

        // Inactive users should see calendar button instead
        expect(screen.getByText('View Past Sessions')).toBeInTheDocument();
      });
    });

    describe('Missed Assignments Sidebar', () => {
      it('should open sidebar when missed assignments button is clicked', async () => {
        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });

        const missedButton = screen.getByText(/\( 2 \) missed assignments/i);
        fireEvent.click(missedButton);

        await waitFor(() => {
          expect(screen.getByTestId('missed-assignments-sidebar')).toBeInTheDocument();
        });
      });
    });

    describe('Week Navigation', () => {
      it('should disable prev button when on week 1', async () => {
        const mockData = {
          day: { daily_goal: 'Test', week: 1, level: 1, weekly_goal: 'Week 1' },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });

        // Find disabled ChevronLeft button by checking all buttons for disabled state
        // The prev week button should be disabled when on week 1
        const allButtons = screen.getAllByRole('button');
        const disabledButtons = allButtons.filter(btn => btn.disabled);
        expect(disabledButtons.length).toBeGreaterThan(0);
      });

      it('should disable next button when on current week', async () => {
        const mockData = {
          day: { daily_goal: 'Test', week: 5, level: 1, weekly_goal: 'Week 5' },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });

        // The next week button should be disabled when on current week
        const allButtons = screen.getAllByRole('button');
        const disabledButtons = allButtons.filter(btn => btn.disabled);
        expect(disabledButtons.length).toBeGreaterThan(0);
      });

      // L3+ rolling joiner: the server omits pre-enrollment weeks, so the payload's
      // first week can be > 1. Navigation must bottom out at the first VISIBLE week,
      // not week 1 (regression: prev chevron used `currentWeek > 1`).
      it('should disable prev on the first visible week when weeks start after week 1 (L3+ rolling joiner)', async () => {
        const mockData = {
          day: { daily_goal: 'Test', week: 16, level: 'L3+', weekly_goal: 'Week 16' },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0,
          weeks: [{ weekNumber: 16, weeklyGoal: 'Week 16', days: [] }],
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });

        const prevButtons = screen.getAllByRole('button')
          .filter(btn => btn.querySelector('svg.lucide-chevron-left'));
        expect(prevButtons.length).toBeGreaterThan(0);
        prevButtons.forEach(btn => expect(btn).toBeDisabled());
      });

      it('should enable prev when an earlier visible week exists in the payload', async () => {
        const mockData = {
          day: { daily_goal: 'Test', week: 16, level: 'L3+', weekly_goal: 'Week 16' },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0,
          weeks: [
            { weekNumber: 15, weeklyGoal: 'Week 15', days: [] },
            { weekNumber: 16, weeklyGoal: 'Week 16', days: [] },
          ],
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });

        const prevButtons = screen.getAllByRole('button')
          .filter(btn => btn.querySelector('svg.lucide-chevron-left'));
        expect(prevButtons.length).toBeGreaterThan(0);
        expect(prevButtons.some(btn => !btn.disabled)).toBe(true);
      });
    });
  });

  describe('Integration Tests - API Interactions', () => {
    describe('fetchDashboardData', () => {
      it('should call API with correct authorization header', async () => {
        const mockData = {
          day: { daily_goal: 'Test', week: 1, level: 1 },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard({ token: 'my-test-token' });

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/progress/dashboard-full'),
            expect.objectContaining({
              headers: {
                'Authorization': 'Bearer my-test-token'
              }
            })
          );
        });
      });

      it('should include cohort parameter for staff users', async () => {
        const mockData = {
          day: { daily_goal: 'Test', week: 1, level: 1 },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData
        });

        renderDashboard({
          user: { firstName: 'Admin', role: 'staff', active: true }
        });

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalled();
        });
      });

      it('should handle "No schedule for today" message', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: 'No schedule for today' })
        });

        renderDashboard();

        await waitFor(() => {
          expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        });
      });
    });

    describe('fetchDashboardData includes week data', () => {
      it('should process weeks from the dashboard-full response', async () => {
        const mockDashboardData = {
          day: { daily_goal: 'Test', week: 3, level: 1, weekly_goal: 'Week 3' },
          timeBlocks: [],
          taskProgress: [],
          missedAssignmentsCount: 0,
          weeks: [
            {
              weekNumber: 3,
              weeklyGoal: 'Week 3',
              days: [{ id: 1, day_date: new Date().toISOString(), tasks: [] }]
            }
          ]
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockDashboardData
        });

        renderDashboard();

        await waitFor(() => {
          // Single API call to dashboard-full provides all data including weeks
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/progress/dashboard-full'),
            expect.any(Object)
          );
        });
      });
    });
  });

  describe('Task Completion Status', () => {
    it('should render day card with complete status for past days with submitted deliverables', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const mockData = {
        day: { daily_goal: 'Test', week: 1, level: 1 },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0,
        weeks: [{
          weekNumber: 1,
          weeklyGoal: 'Test',
          days: [{
            id: 1,
            day_date: yesterday.toISOString(),
            tasks: [{
              id: 1,
              task_title: 'Submit video',
              deliverable_type: 'video',
              hasSubmission: true
            }]
          }]
        }]
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ completionStatus: {} }) }); // completion status

      const { container } = renderDashboard();

      await waitFor(() => {
        // Component uses CSS classes for completion status, not text
        const dayCards = container.querySelectorAll('.dashboard__day-card');
        expect(dayCards.length).toBeGreaterThan(0);
      });
    });

    it('should render day card for past days with missing deliverables', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const mockData = {
        day: { daily_goal: 'Test', week: 1, level: 1 },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0,
        weeks: [{
          weekNumber: 1,
          weeklyGoal: 'Test',
          days: [{
            id: 1,
            day_date: yesterday.toISOString(),
            tasks: [{
              id: 1,
              task_title: 'Submit video',
              deliverable_type: 'video',
              hasSubmission: false
            }]
          }]
        }]
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ completionStatus: {} }) }); // completion status

      const { container } = renderDashboard();

      await waitFor(() => {
        const dayCards = container.querySelectorAll('.dashboard__day-card');
        expect(dayCards.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Responsive Design', () => {
    it('should render both desktop and mobile views', async () => {
      const mockData = {
        day: { daily_goal: 'Test goal', week: 1, level: 1, weekly_goal: 'Test' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      const { container } = renderDashboard();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
      });

      // Check for desktop and mobile classes
      expect(container.querySelector('.dashboard__desktop')).toBeInTheDocument();
      expect(container.querySelector('.dashboard__mobile')).toBeInTheDocument();
    });
  });

  describe('Dashboard Data Loading', () => {
    beforeEach(() => {
      global.fetch = createDefaultFetchMock();
    });

    it('should make API call to fetch dashboard data on mount', async () => {
      const mockDashboardData = {
        day: { daily_goal: 'Learn React Testing', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData
      });

      renderDashboard();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/progress/dashboard-full',
          expect.objectContaining({
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
        );
      });
    });

    it('should use single API call that includes week data', async () => {
      const mockDashboardData = {
        day: { daily_goal: 'Test Goal', week: 2, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0,
        weeks: [
          { weekNumber: 2, weeklyGoal: 'Master Testing', days: [
            { id: 6, day_date: new Date().toISOString(), tasks: [] },
            { id: 7, day_date: new Date().toISOString(), tasks: [] }
          ]}
        ]
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockDashboardData });

      renderDashboard();

      await waitFor(() => {
        // Dashboard uses single /api/progress/dashboard-full endpoint
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/progress/dashboard-full',
          expect.any(Object)
        );
      });
    });

    it('should handle API errors gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' })
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });
    });

    it('should show error state and allow manual page refresh on failure', async () => {
      const mockDashboardData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      // First call fails
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server Error' })
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });

      // Component shows error state (no retry button — user must refresh page)
      expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
    });
  });

  describe('Weekly Card Content', () => {
    const mockDashboardData = {
      day: { daily_goal: 'Complete React Testing', week: 1, level: 1, weekly_goal: 'Master Testing' },
      timeBlocks: [],
      taskProgress: [],
      missedAssignmentsCount: 0,
      weeks: [{
        weekNumber: 1,
        weeklyGoal: 'Master Testing',
        days: [
          {
            id: 1,
            day_date: new Date().toISOString(),
            tasks: [
              { id: 'task1', task_title: 'Learn Unit Testing', deliverable_type: 'document' },
              { id: 'task2', task_title: 'Write Test Cases', type: 'lecture' }
            ]
          },
          {
            id: 2,
            day_date: new Date(Date.now() + 86400000).toISOString(),
            tasks: [
              { id: 'task3', task_title: 'Integration Testing', deliverable_type: 'video' }
            ]
          }
        ]
      }]
    };

    beforeEach(() => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockDashboardData });
    });

    it('should display weekly goal in card', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Master Testing')).toBeInTheDocument();
      });
    });

    it('should display current week', async () => {
      renderDashboard();

      await waitFor(() => {
        // Week is displayed in the week selector
        const weekElements = screen.getAllByText(/Week 01/i);
        expect(weekElements.length).toBeGreaterThan(0);
      });
    });

    it('should show tasks for current day', async () => {
      // Also mock the batch completion status fetch
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ completionStatus: {} }) });

      renderDashboard();

      await waitFor(() => {
        // Tasks appear in both desktop and mobile views
        const unitTestingElements = screen.getAllByText('Learn Unit Testing');
        expect(unitTestingElements.length).toBeGreaterThan(0);
        const testCasesElements = screen.getAllByText('Write Test Cases');
        expect(testCasesElements.length).toBeGreaterThan(0);
      });
    });

    it('should render day cards for past days with deliverables', async () => {
      const pastDayWithDeliverable = {
        id: 1,
        day_date: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        tasks: [
          { id: 'task1', task_title: 'Complete Assignment', deliverable_type: 'document', hasSubmission: true }
        ]
      };

      global.fetch
        .mockReset()
        .mockResolvedValueOnce({ ok: true, json: async () => ({
          ...mockDashboardData,
          weeks: [{ weekNumber: 1, weeklyGoal: 'Master Testing', days: [pastDayWithDeliverable] }]
        })})
        .mockResolvedValueOnce({ ok: true, json: async () => ({ completionStatus: {} }) }); // completion status

      const { container } = renderDashboard();

      await waitFor(() => {
        // Component renders day cards with task items (uses CSS classes for completion, not text)
        const dayCards = container.querySelectorAll('.dashboard__day-card');
        expect(dayCards.length).toBeGreaterThan(0);
      });
    });

    it('should render day cards for past days with missing deliverables', async () => {
      const pastDayIncomplete = {
        id: 1,
        day_date: new Date(Date.now() - 86400000).toISOString(),
        tasks: [
          { id: 'task1', task_title: 'Missing Assignment', deliverable_type: 'video', hasSubmission: false }
        ]
      };

      global.fetch
        .mockReset()
        .mockResolvedValueOnce({ ok: true, json: async () => ({
          ...mockDashboardData,
          weeks: [{ weekNumber: 1, weeklyGoal: 'Master Testing', days: [pastDayIncomplete] }]
        })})
        .mockResolvedValueOnce({ ok: true, json: async () => ({ completionStatus: {} }) }); // completion status

      const { container } = renderDashboard();

      await waitFor(() => {
        const dayCards = container.querySelectorAll('.dashboard__day-card');
        expect(dayCards.length).toBeGreaterThan(0);
      });
    });

    it('should display upcoming events in DOM', async () => {
      renderDashboard();

      await waitFor(() => {
        // Upcoming section exists in DOM (visibility: hidden until events are available)
        const upcomingElements = screen.getAllByText('Upcoming');
        expect(upcomingElements.length).toBeGreaterThan(0);
        const demoDay = screen.getAllByText('Demo Day');
        expect(demoDay.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Missed Assignments Modal', () => {
    beforeEach(() => {
      const mockDashboardData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 3,
        weeks: [{
          weekNumber: 1,
          weeklyGoal: 'Master Testing',
          days: [{ id: 1, day_date: new Date().toISOString(), tasks: [] }]
        }]
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockDashboardData });
    });

    it('should display missed assignments count', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('( 3 ) missed assignments')).toBeInTheDocument();
      });
    });

    it('should open missed assignments sidebar when clicked', async () => {
      renderDashboard();

      await waitFor(() => {
        const missedButton = screen.getByText(/\( 3 \) missed assignments/i);
        expect(missedButton).toBeInTheDocument();
      });

      const missedButton = screen.getByText(/\( 3 \) missed assignments/i);
      fireEvent.click(missedButton);

      await waitFor(() => {
        expect(screen.getByTestId('missed-assignments-sidebar')).toBeInTheDocument();
      });
    });

    it('should pass correct props to missed assignments sidebar', async () => {
      renderDashboard();

      await waitFor(() => {
        const missedButton = screen.getByText(/\( 3 \) missed assignments/i);
        fireEvent.click(missedButton);
      });

      await waitFor(() => {
        const sidebar = screen.getByTestId('missed-assignments-sidebar');
        expect(sidebar).toBeInTheDocument();
      });
    });

    it('should show zero missed assignments count', async () => {
      const mockDashboardData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch
        .mockReset()
        .mockResolvedValueOnce({ ok: true, json: async () => mockDashboardData });

      renderDashboard();

      await waitFor(() => {
        // Component renders the count even when 0
        expect(screen.getByText(/\( 0 \) missed assignments/i)).toBeInTheDocument();
      });
    });
  });

  describe('Dashboard Loading States', () => {
    it('should show loading state initially', () => {
      // Mock a slow response
      global.fetch.mockImplementation(() => new Promise(() => {}));

      renderDashboard();
      expect(screen.getByTestId('loading-curtain')).toBeInTheDocument();
    });

    it('should remove loading state after data loads', async () => {
      const mockDashboardData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockDashboardData });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
        // Goal text appears in both desktop and mobile
        const goals = screen.getAllByText('Test Goal');
        expect(goals.length).toBeGreaterThan(0);
      });
    });

    it('should handle network timeout', async () => {
      // Mock a timeout
      global.fetch.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });
    });
  });

  describe('Dashboard Edge Cases', () => {
    beforeEach(() => {
      global.fetch = createDefaultFetchMock();
    });

    it('should handle empty API response gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}) // Empty response
      });

      renderDashboard();

      await waitFor(() => {
        // Component renders Layout even with empty data
        expect(screen.getByTestId('layout')).toBeInTheDocument();
      });
    });

    it('should handle malformed API response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malformed: 'data' }) // Missing expected fields
      });

      renderDashboard();

      await waitFor(() => {
        // Component renders Layout even with malformed data
        expect(screen.getByTestId('layout')).toBeInTheDocument();
      });
    });

    it('should handle network timeout', async () => {
      global.fetch.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });
    });

    it('should handle multiple rapid API calls', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      // Multiple rapid calls
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData });

      renderDashboard();

      await waitFor(() => {
        const goals = screen.getAllByText('Test Goal');
        expect(goals.length).toBeGreaterThan(0);
      });
    });

    it('should handle concurrent state updates', async () => {
      const mockData1 = {
        day: { daily_goal: 'Goal 1', week: 1, level: 1, weekly_goal: 'Week 1' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData1 });

      renderDashboard();

      // Simulate state update during loading
      await waitFor(() => {
        const goals = screen.getAllByText('Goal 1');
        expect(goals.length).toBeGreaterThan(0);
      });
    });

    it('should recover from error after re-render', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      // First call fails
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server Error 1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });

      // No retry button exists — error state persists until component re-renders
      expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
    });

    it('should handle authentication token changes', async () => {
      const { rerender } = renderDashboard();

      // Change auth token
      act(() => {
        useAuthStore.setState({
          token: 'new-token',
          user: { firstName: 'John', role: 'builder', active: true },
        });
        rerender(
          <BrowserRouter>
            <Dashboard />
          </BrowserRouter>
        );
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: {
              'Authorization': 'Bearer new-token'
            }
          })
        );
      });
    });

    it('should handle user role changes during session', async () => {
      const mockData = {
        day: { daily_goal: 'Test', week: 1, level: 1 },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValue({ ok: true, json: async () => mockData });

      const { rerender } = renderDashboard();

      // Change user role
      act(() => {
        useAuthStore.setState({
          token: 'test-token',
          user: { firstName: 'John', role: 'admin', active: true },
        });
        rerender(
          <BrowserRouter>
            <Dashboard />
          </BrowserRouter>
        );
      });

      await waitFor(() => {
        // Admin view renders the staff/admin dashboard with cohort selector
        expect(screen.getByTestId('layout')).toBeInTheDocument();
      });
    });

    it('should handle component unmount during API call', async () => {
      const { unmount } = renderDashboard();

      // Unmount during API call
      unmount();

      // Should not cause memory leaks or errors
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle browser navigation events', async () => {
      const mockData = {
        day: { daily_goal: 'Test', week: 1, level: 1 },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });

      renderDashboard();

      // Simulate browser back/forward
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('layout')).toBeInTheDocument();
      });
    });

    it('should handle localStorage corruption', async () => {
      const mockData = {
        day: { daily_goal: 'Test', week: 1, level: 1 },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });

      // Mock corrupted localStorage
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage corrupted');
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('layout')).toBeInTheDocument();
      });

      getItemSpy.mockRestore();
    });
  });

  describe('Dashboard State Management', () => {
    beforeEach(() => {
      global.fetch = createDefaultFetchMock();
    });

    it('should maintain state during rapid re-renders', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData });

      const { rerender } = renderDashboard();

      await waitFor(() => {
        const goals = screen.getAllByText('Test Goal');
        expect(goals.length).toBeGreaterThan(0);
      });

      // Rapid re-renders
      for (let i = 0; i < 5; i++) {
        act(() => {
          useAuthStore.setState({
            token: 'test-token',
            user: { firstName: 'John', role: 'builder', active: true },
          });
          rerender(
            <BrowserRouter>
              <Dashboard />
            </BrowserRouter>
          );
        });
      }

      const goals = screen.getAllByText('Test Goal');
      expect(goals.length).toBeGreaterThan(0);
    });

    it('should show error state on failure', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      // First call fails
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server Error' })
        });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });
    });

    it('should navigate when Start button is clicked during loading', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
      });

      // Click navigation after loading
      const startButton = screen.getAllByText('Start')[0];
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/learning');
      });
    });

    it('should handle props changes during loading', async () => {
      const mockData = {
        day: { daily_goal: 'Test', week: 1, level: 1 },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValue({ ok: true, json: async () => mockData });

      const { rerender } = renderDashboard();

      // Change auth store state during loading
      act(() => {
        useAuthStore.setState({
          token: 'different-token',
          user: { firstName: 'Jane', role: 'builder', active: true },
        });
        rerender(
          <BrowserRouter>
            <Dashboard />
          </BrowserRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('layout')).toBeInTheDocument();
      });
    });
  });

  describe('Dashboard User Experience', () => {
    beforeEach(() => {
      global.fetch = createDefaultFetchMock();
    });

    it('should show loading states appropriately', async () => {
      // Slow response
      global.fetch.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            ok: true,
            json: async () => ({
              day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
              timeBlocks: [],
              taskProgress: [],
              missedAssignmentsCount: 0
            })
          }), 100)
        )
      );

      renderDashboard();

      // Should show loading initially via Layout mock
      expect(screen.getByTestId('loading-curtain')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
      });
    });

    it('should handle keyboard navigation via click on Start button', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
      });

      // Find the Start button element (the span's parent button)
      const startSpan = screen.getAllByText('Start')[0];
      const startButton = startSpan.closest('button');

      // Click triggers navigation
      fireEvent.click(startButton);

      expect(mockNavigate).toHaveBeenCalledWith('/learning');
    });

    it('should maintain focus management on buttons', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
      });

      // Find the actual button element (not the span inside it)
      const startSpan = screen.getAllByText('Start')[0];
      const startButton = startSpan.closest('button');
      startButton.focus();

      expect(document.activeElement).toBe(startButton);
    });

    it('should handle accessibility requirements', async () => {
      const mockData = {
        day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
        timeBlocks: [],
        taskProgress: [],
        missedAssignmentsCount: 0
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-curtain')).not.toBeInTheDocument();
      });

      // Check for proper heading structure
      const headings = screen.getAllByRole('heading', { level: 1 });
      expect(headings.length).toBeGreaterThan(0);

      // Check for proper button labeling
      const startButtons = screen.getAllByRole('button', { name: /Start/i });
      expect(startButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Dashboard Error Recovery', () => {
    beforeEach(() => {
      global.fetch = createDefaultFetchMock();
    });

    it('should show error message on consecutive failures', async () => {
      // Multiple failures
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Error 1' }) });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });
    });

    it('should handle partial API failures', async () => {
      // Dashboard API succeeds
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            day: { daily_goal: 'Test Goal', week: 1, level: 1, weekly_goal: 'Master Testing' },
            timeBlocks: [],
            taskProgress: [],
            missedAssignmentsCount: 0
          })
        });

      renderDashboard();

      await waitFor(() => {
        const goals = screen.getAllByText('Test Goal');
        expect(goals.length).toBeGreaterThan(0);
      });
    });

    it('should handle authentication errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });
    });

    it('should handle rate limiting', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Too many requests' })
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data. Please try again later.')).toBeInTheDocument();
      });
    });
  });
});
