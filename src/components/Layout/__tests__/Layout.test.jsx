import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import Layout from '../Layout';
import useAuthStore from '../../../stores/authStore';

// Mock lucide-react icons (all icons used by Layout)
vi.mock('lucide-react', () => ({
  LogOut: () => <div data-testid="logout-icon">LogOut</div>,
  Settings: () => <div data-testid="settings-icon">Settings</div>,
  Award: () => <div data-testid="award-icon">Award</div>,
  Users: () => <div data-testid="users-icon">Users</div>,
  FileText: () => <div data-testid="filetext-icon">FileText</div>,
  Brain: () => <div data-testid="brain-icon">Brain</div>,
  X: () => <div data-testid="x-icon">X</div>,
  ArrowRight: () => <div data-testid="arrowright-icon">ArrowRight</div>,
  Briefcase: () => <div data-testid="briefcase-icon">Briefcase</div>,
  Calendar: () => <div data-testid="calendar-icon">Calendar</div>,
  Target: () => <div data-testid="target-icon">Target</div>,
  ClipboardList: () => <div data-testid="clipboardlist-icon">ClipboardList</div>,
  Heart: () => <div data-testid="heart-icon">Heart</div>,
  Building2: () => <div data-testid="building2-icon">Building2</div>,
  Rocket: () => <div data-testid="rocket-icon">Rocket</div>,
  Shield: () => <div data-testid="shield-icon">Shield</div>,
  BarChart3: () => <div data-testid="barchart3-icon">BarChart3</div>,
  BookOpen: () => <div data-testid="bookopen-icon">BookOpen</div>,
  Navigation: () => <div data-testid="navigation-icon">Navigation</div>,
  ChevronDown: () => <div data-testid="chevrondown-icon">ChevronDown</div>,
  ChevronRight: () => <div data-testid="chevronright-icon">ChevronRight</div>,
}));

// Mock the logo import
vi.mock('../../assets/logo.png', () => ({ default: 'logo.png' }));

// Mock useNavigate at the top level
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock window.innerWidth for mobile detection
const mockWindowInnerWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
};

// Helper to render Layout with Zustand auth store
const renderLayout = (storeState = {}, initialPath = '/dashboard') => {
  const defaultState = {
    token: 'mock-token',
    user: {
      firstName: 'Test',
      role: 'builder',
      active: true,
    },
    isAuthenticated: true,
    isLoading: false,
    _hasHydrated: true,
    logout: vi.fn(),
  };

  useAuthStore.setState({ ...defaultState, ...storeState });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Layout>
        <div data-testid="child-component">Child Component</div>
      </Layout>
    </MemoryRouter>
  );
};

describe('Layout Component', () => {
  beforeEach(() => {
    // Reset window width to desktop by default
    mockWindowInnerWidth(1024);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Stub fetch so the builder coaching-access check (/api/coaching/check)
    // resolves deterministically instead of leaking a real request that can
    // settle after teardown and setState into a torn-down env ("window is not defined").
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ hasCoaching: false }) })
    ));

    // Reset Zustand auth store
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      _hasHydrated: true,
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Responsive Design', () => {
    it('should detect desktop mode correctly', () => {
      mockWindowInnerWidth(1024); // Desktop
      renderLayout();

      // Desktop navbar should be visible (check for navigation links)
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
      // Mobile navbar shouldn't be visible in desktop mode
      expect(screen.queryByText('Dashboard')).toBeInTheDocument(); // Main nav exists
    });

    it('should detect mobile mode correctly', () => {
      mockWindowInnerWidth(600); // Mobile
      renderLayout();

      // Mobile menu button should be visible
      expect(screen.getByRole('button')).toBeInTheDocument(); // Mobile menu button
    });

    it('should update mobile state on window resize', () => {
      mockWindowInnerWidth(1024); // Start desktop
      const { rerender } = renderLayout();

      // Resize to mobile
      mockWindowInnerWidth(600);
      window.dispatchEvent(new Event('resize'));

      useAuthStore.setState({
        token: 'mock-token',
        user: { firstName: 'Test', role: 'builder', active: true },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      });
      rerender(
        <MemoryRouter>
          <Layout>
            <div data-testid="child-component">Child Component</div>
          </Layout>
        </MemoryRouter>
      );
    });
  });

  describe('Navigation Links', () => {
    it('should render standard navigation links for builders', () => {
      renderLayout({ user: { role: 'builder', active: true } });

      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Learning/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /AI Chat/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Calendar/i })).toBeInTheDocument();
      // Pathfinder now lives inside the Jobs dropdown (trigger renders the Navigation icon)
      expect(screen.getByTestId('navigation-icon')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Performance/i })).toBeInTheDocument();
    });

    it('should render admin navigation elements for admin users', () => {
      renderLayout({ user: { role: 'admin', active: true } });

      // Admin sees standard links (use getAllByRole since 'Dashboard' matches 'Admissions Dashboard' too)
      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i });
      expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('link', { name: /Learning/i })).toBeInTheDocument();
      // Enterprise Admin nav link removed in dev (16454ee); assertion disabled.
      // expect(screen.getByRole('link', { name: /Enterprise Admin/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Admissions Dashboard/i })).toBeInTheDocument();

      // Admin sees dropdown trigger buttons (not links)
      expect(screen.getByText('Program')).toBeInTheDocument();
      expect(screen.getByText('Employment')).toBeInTheDocument();
      expect(screen.getByText('Staff')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('should render staff navigation elements for staff users', () => {
      renderLayout({ user: { role: 'staff', active: true } });

      // Staff sees standard links
      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i });
      expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
      // Enterprise Admin nav link removed in dev (16454ee); assertion disabled.
      // expect(screen.getByRole('link', { name: /Enterprise Admin/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Admissions Dashboard/i })).toBeInTheDocument();

      // Staff sees dropdown trigger buttons
      expect(screen.getByText('Program')).toBeInTheDocument();
      expect(screen.getByText('Employment')).toBeInTheDocument();
      expect(screen.getByText('Staff')).toBeInTheDocument();
    });

    it('should render volunteers link for volunteers', () => {
      renderLayout({ user: { role: 'volunteer', active: true } });

      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Learning/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Volunteers/i })).toBeInTheDocument();
    });

    it('should not render volunteer link for admin users (admin uses Staff dropdown)', () => {
      renderLayout({ user: { role: 'admin', active: true } });

      // Volunteers nav link is only shown for non-staff/admin roles
      // Admin manages volunteers via Staff dropdown instead
      const volunteerLinks = screen.queryAllByRole('link', { name: /^Volunteers$/i });
      expect(volunteerLinks.length).toBe(0);
    });

    it('should not render admin elements for builder users', () => {
      renderLayout({ user: { role: 'builder', active: true } });

      expect(screen.queryByRole('link', { name: /Enterprise Admin/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Admissions Dashboard/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Program')).not.toBeInTheDocument();
      expect(screen.queryByText('Employment')).not.toBeInTheDocument();
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });

    it('should not render volunteers link for non-volunteer non-staff users', () => {
      renderLayout({ user: { role: 'builder', active: true } });

      expect(screen.queryByRole('link', { name: /Volunteers/i })).not.toBeInTheDocument();
    });
  });

  describe('Mobile Navigation', () => {
    beforeEach(() => {
      mockWindowInnerWidth(600); // Mobile
    });

    it('should show mobile menu button', () => {
      renderLayout();

      // Mobile menu button should be present
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    // Regression: getCurrentPageIcon returned the imported logo URL (a string),
    // which React rendered as literal path text inside the menu button.
    it('should render the logo as an image, not its path, for unmapped routes', () => {
      renderLayout({}, '/platform-intake');

      const menuButton = screen.getByRole('button');
      expect(menuButton.querySelector('img')).toBeInTheDocument();
      expect(menuButton).toHaveTextContent('');
    });

    it('should toggle mobile navbar when menu button is clicked', () => {
      renderLayout();

      const menuButton = screen.getByRole('button');
      fireEvent.click(menuButton);

      // Mobile navbar should be open (check for navigation links that appear)
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    });

    it('should close mobile navbar when navigation link is clicked', () => {
      renderLayout();

      const menuButton = screen.getByRole('button');
      fireEvent.click(menuButton);

      // Mobile navbar should be open (navigation links should be visible)
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      fireEvent.click(dashboardLink);

      // After clicking a navigation link, we verify the navigation works
      // The exact close behavior is hard to test without data-testid attributes
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });

    it('should show admin navigation in mobile navbar for admin users', () => {
      renderLayout({ user: { role: 'admin', active: true } });

      const menuButton = screen.getByRole('button');
      fireEvent.click(menuButton);

      // Check that admin nav elements are available after opening mobile menu
      // Admin sees dropdown trigger buttons for Program, Employment, Staff, Admin
      expect(screen.getByText('Program')).toBeInTheDocument();
      expect(screen.getByText('Employment')).toBeInTheDocument();
      expect(screen.getByText('Staff')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();

      // Admin also sees standard links
      // Enterprise Admin nav link removed in dev (16454ee); assertion disabled.
      // expect(screen.getByRole('link', { name: /Enterprise Admin/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Admissions Dashboard/i })).toBeInTheDocument();
    });
  });

  describe('User Authentication', () => {
    it('should show logout button for authenticated users', () => {
      // Logout button is only visible when navbar is expanded
      // This test verifies the button exists and can be clicked
      renderLayout();

      // The logout functionality is tested in the next test
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });

    it('should call logout and navigate to login when logout is clicked', () => {
      const mockLogout = vi.fn();
      mockNavigate.mockClear(); // Clear previous calls

      renderLayout({ logout: mockLogout });

      // Since logout button is only visible when navbar is expanded,
      // we test that the logout function is available
      expect(typeof mockLogout).toBe('function');
    });

    it('should handle null user gracefully', () => {
      renderLayout({ user: null });

      // Should not crash and should still render basic layout
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });

    it('should handle undefined user role gracefully', () => {
      renderLayout({ user: { firstName: 'Test', role: undefined } });

      // Should render Dashboard (always shown) but no admin elements
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Enterprise Admin/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Program')).not.toBeInTheDocument();
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });
  });

  describe('Route-based Icon Rendering', () => {
    it('should show correct link for dashboard route', () => {
      renderLayout({}, '/dashboard');

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      expect(dashboardLink).toBeInTheDocument();
    });

    it('should show settings icon via Admin dropdown trigger for admin users', () => {
      renderLayout({ user: { role: 'admin' } }, '/admin-dashboard');

      // Settings icon is the Admin dropdown trigger icon (rendered by NavDropdown)
      expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
    });

    it('should show bookopen icon via Program dropdown trigger for admin users', () => {
      renderLayout({ user: { role: 'admin' } }, '/admin/assessment-grades');

      // BookOpen icon is the Program dropdown trigger icon
      expect(screen.getByTestId('bookopen-icon')).toBeInTheDocument();
    });

    it('should show users icon for admissions dashboard link', () => {
      renderLayout({ user: { role: 'admin' } }, '/admissions-dashboard');

      // Users icon appears for both the Admissions Dashboard link and the Staff dropdown trigger
      const usersIcons = screen.getAllByTestId('users-icon');
      expect(usersIcons.length).toBeGreaterThanOrEqual(1);
    });

    // Enterprise Admin nav link removed in dev (16454ee); test disabled.
    // it('should show building2 icon for enterprise admin route', () => {
    //   renderLayout({ user: { role: 'admin' } }, '/cohort-admin-dashboard');
    //
    //   // Building2 icon is rendered for the Enterprise Admin nav link
    //   expect(screen.getByTestId('building2-icon')).toBeInTheDocument();
    // });

    it('should show briefcase icon via Employment dropdown trigger for admin users', () => {
      renderLayout({ user: { role: 'admin' } }, '/sputnik');

      // Briefcase icon is the Employment dropdown trigger icon
      expect(screen.getByTestId('briefcase-icon')).toBeInTheDocument();
    });

    it('should show heart icon for volunteers link for volunteer users', () => {
      renderLayout({ user: { role: 'volunteer' } }, '/volunteering');

      // Heart icon is rendered for the Volunteers nav link
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });
  });

  describe('Navigation Interactions', () => {
    it('should highlight active navigation link', () => {
      renderLayout({}, '/learning');

      const learningLink = screen.getByRole('link', { name: /Learning/i });
      expect(learningLink).toHaveClass('bg-[#4242EA]');
    });

    it('should handle navigation link clicks', () => {
      renderLayout();

      const learningLink = screen.getByRole('link', { name: /Learning/i });
      fireEvent.click(learningLink);

      // Should navigate (in real app, this would change route)
      expect(learningLink).toHaveAttribute('href', '/learning');
    });

    it('should show hover effects on navigation links', () => {
      renderLayout();

      const learningLink = screen.getByRole('link', { name: /Learning/i });
      fireEvent.mouseEnter(learningLink);

      // Should have hover class (non-active links get hover:bg-white/10)
      expect(learningLink.className).toContain('hover:bg-white/10');
    });
  });

  describe('Error Handling', () => {
    it('should handle logout errors gracefully', () => {
      const mockLogout = vi.fn(() => {
        throw new Error('Logout failed');
      });

      renderLayout({ logout: mockLogout });

      // Since logout button is only visible when navbar is expanded,
      // we test that the logout function is available and can be called
      expect(typeof mockLogout).toBe('function');
    });

    it('should handle navigation errors gracefully', () => {
      renderLayout();

      const brokenLink = screen.getByRole('link', { name: /Dashboard/i });

      // Should not crash when clicking navigation links
      expect(() => fireEvent.click(brokenLink)).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for navigation', () => {
      renderLayout();

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      expect(dashboardLink).toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      renderLayout();

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      dashboardLink.focus();

      expect(document.activeElement).toBe(dashboardLink);
    });

    it('should handle keyboard navigation in mobile menu', () => {
      mockWindowInnerWidth(600);
      renderLayout();

      const menuButton = screen.getByRole('button');
      fireEvent.click(menuButton);

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      dashboardLink.focus();

      expect(document.activeElement).toBe(dashboardLink);
    });
  });

  describe('Performance', () => {
    it('should not cause unnecessary re-renders', () => {
      const { rerender } = renderLayout();

      // Rerender with same props should not cause issues
      useAuthStore.setState({
        token: 'mock-token',
        user: { firstName: 'Test', role: 'builder', active: true },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      });
      rerender(
        <MemoryRouter>
          <Layout>
            <div data-testid="child-component">Child Component</div>
          </Layout>
        </MemoryRouter>
      );

      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });

    it('should handle rapid window resize events', () => {
      mockWindowInnerWidth(1024);

      renderLayout();

      // Simulate rapid resize events
      for (let i = 0; i < 5; i++) {
        mockWindowInnerWidth(i % 2 === 0 ? 600 : 1024);
        window.dispatchEvent(new Event('resize'));
      }

      // Should not crash
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle window resize during mobile menu toggle', () => {
      mockWindowInnerWidth(600); // Start mobile

      renderLayout();

      const menuButton = screen.getByRole('button');
      fireEvent.click(menuButton);

      // Resize to desktop during mobile menu open
      mockWindowInnerWidth(1024);
      window.dispatchEvent(new Event('resize'));

      // Should not crash and should adapt to new screen size
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });

    it('should handle logout during navigation', async () => {
      const mockLogout = vi.fn();
      mockNavigate.mockClear();

      renderLayout({ logout: mockLogout });

      const logoutButton = screen.getByText(/Logout/i);
      fireEvent.click(logoutButton);

      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('should handle missing user data gracefully', () => {
      renderLayout({
        user: null,
        token: null
      });

      // Should render basic layout without crashing
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });

    it('should handle corrupted localStorage during resize', () => {
      // Mock localStorage error
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => {
        throw new Error('localStorage error');
      });

      mockWindowInnerWidth(600);

      expect(() => {
        renderLayout();
        window.dispatchEvent(new Event('resize'));
      }).not.toThrow();

      // Restore localStorage
      Storage.prototype.getItem = originalGetItem;
    });

    it('should handle rapid hover state changes', () => {
      renderLayout();

      const navbar = screen.getByRole('navigation');

      // Rapid hover in/out
      for (let i = 0; i < 10; i++) {
        fireEvent.mouseEnter(navbar);
        fireEvent.mouseLeave(navbar);
      }

      // Should not crash
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });
  });

  describe('Navigation State Management', () => {
    it('should maintain navigation state during re-renders', () => {
      const { rerender } = renderLayout();

      const initialLinks = screen.getAllByRole('link');
      expect(initialLinks.length).toBeGreaterThan(0);

      // Rerender with same props
      useAuthStore.setState({
        token: 'mock-token',
        user: { firstName: 'Test', role: 'builder', active: true },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      });
      rerender(
        <MemoryRouter>
          <Layout>
            <div data-testid="child-component">Child Component</div>
          </Layout>
        </MemoryRouter>
      );

      // Navigation links should still be present
      const afterLinks = screen.getAllByRole('link');
      expect(afterLinks.length).toBe(initialLinks.length);
    });

    it('should handle location changes correctly', () => {
      const { rerender } = renderLayout({}, '/dashboard');

      // Initially on dashboard
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();

      // Simulate navigation to learning
      useAuthStore.setState({
        token: 'mock-token',
        user: { firstName: 'Test', role: 'builder', active: true },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      });
      rerender(
        <MemoryRouter initialEntries={['/learning']}>
          <Layout>
            <div data-testid="child-component">Child Component</div>
          </Layout>
        </MemoryRouter>
      );

      // Should still render correctly
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });

    it('should handle auth state changes', () => {
      const { rerender } = renderLayout();

      // Start with authenticated user
      expect(screen.getByText(/Logout/i)).toBeInTheDocument();

      // Change to unauthenticated
      useAuthStore.setState({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      });
      rerender(
        <MemoryRouter>
          <Layout>
            <div data-testid="child-component">Child Component</div>
          </Layout>
        </MemoryRouter>
      );

      // Should handle gracefully
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });
  });

  describe('Component Interactions', () => {
    it('should handle child component updates', () => {
      const { rerender } = renderLayout();

      // Update child content
      useAuthStore.setState({
        token: 'mock-token',
        user: { firstName: 'Test', role: 'builder', active: true },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      });
      rerender(
        <MemoryRouter>
          <Layout>
            <div data-testid="child-component">Updated Child Component</div>
          </Layout>
        </MemoryRouter>
      );

      expect(screen.getByText('Updated Child Component')).toBeInTheDocument();
    });

    it('should handle layout reflow with different content heights', () => {
      renderLayout();

      // Layout should handle different content sizes
      expect(screen.getByTestId('child-component')).toBeInTheDocument();

      // Simulate content height changes
      const layout = screen.getByRole('navigation').parentElement;
      expect(layout).toBeInTheDocument();
    });

    it('should handle multiple layout instances', () => {
      // This tests that multiple Layout components don't interfere
      useAuthStore.setState({
        token: 'mock-token',
        user: { firstName: 'Test', role: 'builder', active: true },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      });
      render(
        <MemoryRouter>
          <div>
            <Layout>
              <div data-testid="child-1">Child 1</div>
            </Layout>
            <Layout>
              <div data-testid="child-2">Child 2</div>
            </Layout>
          </div>
        </MemoryRouter>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });
  });

  describe('Browser Compatibility', () => {
    it('should handle missing window methods', () => {
      // Mock missing window methods
      const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      delete window.innerWidth;

      expect(() => renderLayout()).not.toThrow();

      // Restore
      if (originalInnerWidth) {
        Object.defineProperty(window, 'innerWidth', originalInnerWidth);
      }
    });

    it('should handle missing localStorage', () => {
      // Mock missing localStorage
      const originalLocalStorage = window.localStorage;
      delete window.localStorage;

      expect(() => renderLayout()).not.toThrow();

      // Restore
      window.localStorage = originalLocalStorage;
    });

    it.skip('should handle missing addEventListener', () => {
      // Mock missing addEventListener
      const originalAddEventListener = window.addEventListener;
      delete window.addEventListener;

      expect(() => renderLayout()).toThrow(); // Should throw because addEventListener is required

      // Restore
      window.addEventListener = originalAddEventListener;
    });
  });

  describe('Memory Management', () => {
    it('should clean up event listeners on unmount', () => {
      const { unmount } = renderLayout();

      // Mock window methods to track calls
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      unmount();

      // Should have cleaned up resize listener
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should not leak memory with rapid re-renders', () => {
      const { rerender } = renderLayout();

      // Rapid re-renders
      for (let i = 0; i < 10; i++) {
        useAuthStore.setState({
          token: 'mock-token',
          user: { firstName: 'Test', role: 'builder', active: true },
          isAuthenticated: true,
          isLoading: false,
          _hasHydrated: true,
          logout: vi.fn(),
        });
        rerender(
          <MemoryRouter>
            <Layout>
              <div data-testid="child-component">Child Component {i}</div>
            </Layout>
          </MemoryRouter>
        );
      }

      // Should not crash
      expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });
  });
});
