import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Integration tests for usePermissions hook with Zustand authStore.
 *
 * After the migration, usePermissions reads `user` from authStore instead of
 * authStore. These tests set the authStore state directly and verify that
 * the usePermissions hook returns correct permission check results.
 */

let useAuthStore;
let usePermissions;

// Mock user fixtures
const adminUser = {
  userId: 1,
  userType: 'builder',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
};

const builderUserWithDbPermissions = {
  userId: 2,
  userType: 'builder',
  email: 'builder@example.com',
  firstName: 'Builder',
  lastName: 'User',
  role: 'builder',
  effectivePermissions: {
    'page:dashboard': true,
    'page:learning': true,
    'page:ai_chat': true,
    'page:calendar': false,
    'feature:edit_curriculum': true,
  },
};

const builderUserWithoutDbPermissions = {
  userId: 3,
  userType: 'builder',
  email: 'builder2@example.com',
  firstName: 'Builder',
  lastName: 'Two',
  role: 'builder',
  // No effectivePermissions -- falls back to DEFAULT_ROLE_PERMISSIONS
};

const staffUser = {
  userId: 4,
  userType: 'builder',
  email: 'staff@example.com',
  firstName: 'Staff',
  lastName: 'User',
  role: 'staff',
};

const volunteerUser = {
  userId: 5,
  userType: 'volunteer',
  email: 'volunteer@example.com',
  firstName: 'Volunteer',
  lastName: 'User',
  role: 'volunteer',
};

describe('usePermissions integration with authStore', () => {
  beforeEach(async () => {
    vi.resetModules();

    // Import authStore first so we can set state before usePermissions reads it
    const authMod = await import('../authStore.js');
    useAuthStore = authMod.default;

    const permsMod = await import('../../hooks/usePermissions.js');
    usePermissions = permsMod.usePermissions || permsMod.default;

    // Reset store
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      _hasHydrated: true,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Admin user
  // ---------------------------------------------------------------------------
  describe('admin user', () => {
    it('hasPermission returns true for any permission', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(true);
      expect(result.current.hasPermission('page:admin_prompts')).toBe(true);
      expect(result.current.hasPermission('feature:edit_curriculum')).toBe(true);
      expect(result.current.hasPermission('some:random:permission')).toBe(true);
    });

    it('isAdmin is true', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isAdmin).toBe(true);
    });

    it('isStaffOrAdmin is true', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Builder user with DB permissions
  // ---------------------------------------------------------------------------
  describe('builder user with DB-sourced effectivePermissions', () => {
    it('hasPermission returns true for granted permissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(true);
      expect(result.current.hasPermission('page:learning')).toBe(true);
      expect(result.current.hasPermission('page:ai_chat')).toBe(true);
      expect(result.current.hasPermission('feature:edit_curriculum')).toBe(true);
    });

    it('hasPermission returns false for denied permissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      // Explicitly set to false in effectivePermissions
      expect(result.current.hasPermission('page:calendar')).toBe(false);
    });

    it('hasPermission returns false for permissions not in the map', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:admin_prompts')).toBe(false);
      expect(result.current.hasPermission('nonexistent:perm')).toBe(false);
    });

    it('isAdmin is false for builder', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isAdmin).toBe(false);
    });

    it('isStaffOrAdmin is false for builder', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Builder user without DB permissions (fallback to DEFAULT_ROLE_PERMISSIONS)
  // ---------------------------------------------------------------------------
  describe('builder user without DB permissions (fallback)', () => {
    it('hasPermission falls back to DEFAULT_ROLE_PERMISSIONS for builder role', () => {
      useAuthStore.setState({
        user: builderUserWithoutDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      // Builder default permissions include page:dashboard, page:learning, etc.
      expect(result.current.hasPermission('page:dashboard')).toBe(true);
      expect(result.current.hasPermission('page:learning')).toBe(true);
      expect(result.current.hasPermission('page:ai_chat')).toBe(true);
      expect(result.current.hasPermission('page:calendar')).toBe(true);
      expect(result.current.hasPermission('page:performance')).toBe(true);
      expect(result.current.hasPermission('page:assessment')).toBe(true);
      expect(result.current.hasPermission('page:account')).toBe(true);
      expect(result.current.hasPermission('page:payment')).toBe(true);
    });

    it('hasPermission returns false for permissions not in builder defaults', () => {
      useAuthStore.setState({
        user: builderUserWithoutDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      // Staff/admin-only permissions should be denied
      expect(result.current.hasPermission('page:admin_dashboard')).toBe(false);
      expect(result.current.hasPermission('page:admin_prompts')).toBe(false);
      expect(result.current.hasPermission('feature:edit_curriculum')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. No user (null)
  // ---------------------------------------------------------------------------
  describe('no user (null)', () => {
    it('all permission checks return false', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(false);
      expect(result.current.hasPermission('page:admin_prompts')).toBe(false);
      expect(result.current.hasPermission('feature:edit_curriculum')).toBe(false);
    });

    it('isAdmin is false', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isAdmin).toBe(false);
    });

    it('isStaffOrAdmin is false', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(false);
    });

    it('userPermissions is empty array', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.userPermissions).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. canAccessPage prefixes 'page:' correctly
  // ---------------------------------------------------------------------------
  describe('canAccessPage', () => {
    it('prefixes "page:" to the page name', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      // 'dashboard' -> checks 'page:dashboard' which is true in effectivePermissions
      expect(result.current.canAccessPage('dashboard')).toBe(true);
      // 'learning' -> checks 'page:learning' which is true
      expect(result.current.canAccessPage('learning')).toBe(true);
      // 'calendar' -> checks 'page:calendar' which is false
      expect(result.current.canAccessPage('calendar')).toBe(false);
    });

    it('does not double-prefix if already starts with "page:"', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      // Should not become 'page:page:dashboard'
      expect(result.current.canAccessPage('page:dashboard')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. isAdmin computed property
  // ---------------------------------------------------------------------------
  describe('isAdmin', () => {
    it('returns true for admin role', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isAdmin).toBe(true);
    });

    it('returns false for non-admin roles', () => {
      useAuthStore.setState({ user: builderUserWithoutDbPermissions, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isAdmin).toBe(false);
    });

    it('returns false when user is null', () => {
      useAuthStore.setState({ user: null });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isAdmin).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. isStaffOrAdmin computed property
  // ---------------------------------------------------------------------------
  describe('isStaffOrAdmin', () => {
    it('returns true for admin role', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(true);
    });

    it('returns true for staff role', () => {
      useAuthStore.setState({ user: staffUser, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(true);
    });

    it('returns false for builder role', () => {
      useAuthStore.setState({ user: builderUserWithoutDbPermissions, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(false);
    });

    it('returns false for volunteer role', () => {
      useAuthStore.setState({ user: volunteerUser, isAuthenticated: true });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(false);
    });

    it('returns false when user is null', () => {
      useAuthStore.setState({ user: null });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.isStaffOrAdmin).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Additional integration tests
  // ---------------------------------------------------------------------------
  describe('canUseFeature', () => {
    it('prefixes "feature:" to the feature name', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canUseFeature('edit_curriculum')).toBe(true);
    });

    it('does not double-prefix if already starts with "feature:"', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canUseFeature('feature:edit_curriculum')).toBe(true);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true if user has at least one of the given permissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(
        result.current.hasAnyPermission(['page:dashboard', 'page:admin_prompts'])
      ).toBe(true);
    });

    it('returns false if user has none of the given permissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(
        result.current.hasAnyPermission(['page:admin_prompts', 'page:organization_management'])
      ).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('returns true if user has all of the given permissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(
        result.current.hasAllPermissions(['page:dashboard', 'page:learning'])
      ).toBe(true);
    });

    it('returns false if user is missing any of the given permissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(
        result.current.hasAllPermissions(['page:dashboard', 'page:calendar'])
      ).toBe(false);
    });
  });

  describe('hasDbPermissions flag', () => {
    it('is true when user has effectivePermissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasDbPermissions).toBe(true);
    });

    it('is false when user does not have effectivePermissions', () => {
      useAuthStore.setState({
        user: builderUserWithoutDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasDbPermissions).toBe(false);
    });
  });

  describe('userPermissions list', () => {
    it('returns all granted permission keys for a user with DB permissions', () => {
      useAuthStore.setState({
        user: builderUserWithDbPermissions,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      // Only the permissions set to true
      expect(result.current.userPermissions).toContain('page:dashboard');
      expect(result.current.userPermissions).toContain('page:learning');
      expect(result.current.userPermissions).toContain('page:ai_chat');
      expect(result.current.userPermissions).toContain('feature:edit_curriculum');
      expect(result.current.userPermissions).not.toContain('page:calendar');
    });
  });

  // ---------------------------------------------------------------------------
  // All RBAC roles: default permissions fallback
  // ---------------------------------------------------------------------------
  describe('workshop_participant role (no DB permissions)', () => {
    it('has limited builder pages via DEFAULT_ROLE_PERMISSIONS', () => {
      useAuthStore.setState({
        user: { userId: 10, role: 'workshop_participant', userType: 'workshop_participant' },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(true);
      expect(result.current.hasPermission('page:learning')).toBe(true);
      expect(result.current.hasPermission('page:ai_chat')).toBe(true);
      expect(result.current.hasPermission('page:calendar')).toBe(true);
      // Should NOT have admin/staff pages
      expect(result.current.hasPermission('page:admin_dashboard')).toBe(false);
      expect(result.current.hasPermission('page:pathfinder')).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isStaffOrAdmin).toBe(false);
    });
  });

  describe('workshop_admin role (no DB permissions)', () => {
    it('has only dashboard and workshop admin page', () => {
      useAuthStore.setState({
        user: { userId: 11, role: 'workshop_admin', userType: 'builder' },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(true);
      expect(result.current.hasPermission('page:workshop_admin')).toBe(true);
      expect(result.current.hasPermission('page:learning')).toBe(false);
      expect(result.current.hasPermission('page:admin_dashboard')).toBe(false);
    });
  });

  describe('enterprise_builder role (no DB permissions)', () => {
    it('has limited builder pages', () => {
      useAuthStore.setState({
        user: { userId: 12, role: 'enterprise_builder', userType: 'builder' },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(true);
      expect(result.current.hasPermission('page:learning')).toBe(true);
      expect(result.current.hasPermission('page:ai_chat')).toBe(true);
      expect(result.current.hasPermission('page:calendar')).toBe(true);
      expect(result.current.hasPermission('page:pathfinder')).toBe(false);
      expect(result.current.hasPermission('page:performance')).toBe(false);
    });
  });

  describe('enterprise_admin role (no DB permissions)', () => {
    it('has enterprise builder pages plus cohort admin', () => {
      useAuthStore.setState({
        user: { userId: 13, role: 'enterprise_admin', userType: 'builder' },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(true);
      expect(result.current.hasPermission('page:learning')).toBe(true);
      expect(result.current.hasPermission('page:cohort_admin')).toBe(true);
      expect(result.current.hasPermission('page:admin_dashboard')).toBe(false);
    });
  });

  describe('candidate role (no DB permissions)', () => {
    // Interview candidates (AI-Native Instructor exercise) are scoped to the Cohort Hub
    // and Program Analytics. The two extra keys exist only because the Cohort Hub's data
    // endpoints are gated on them. Narrowed 2026-08-03 — they used to carry the
    // builder-facing pages too, which render empty for an account with no enrollment.
    it('is scoped to the Cohort Hub and the data it needs', () => {
      useAuthStore.setState({
        user: { userId: 14, role: 'candidate', userType: 'candidate' },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:admin_dashboard')).toBe(true);
      expect(result.current.hasPermission('page:admin_attendance')).toBe(true);
      expect(result.current.hasPermission('page:assessment_grades')).toBe(true);

      // No builder-facing pages — a candidate has no enrollment behind them
      expect(result.current.hasPermission('page:dashboard')).toBe(false);
      expect(result.current.hasPermission('page:learning')).toBe(false);

      // And nothing admin
      expect(result.current.hasPermission('page:admin_prompts')).toBe(false);
      expect(result.current.isAdmin).toBe(false);
    });

    it('is read-only, so write controls are withheld', () => {
      useAuthStore.setState({
        user: { userId: 14, role: 'candidate', userType: 'candidate' },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.isReadOnly).toBe(true);
    });

    it.each(['staff', 'admin', 'builder', 'volunteer'])('does not mark %s read-only', (role) => {
      useAuthStore.setState({
        user: { userId: 15, role, userType: 'builder' },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.isReadOnly).toBe(false);
    });
  });

  describe('applicant role (no DB permissions)', () => {
    it('has no page access — empty permissions', () => {
      useAuthStore.setState({
        user: { userId: 15, role: 'applicant', userType: 'applicant' },
        isAuthenticated: false,
      });

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('page:dashboard')).toBe(false);
      expect(result.current.hasPermission('page:learning')).toBe(false);
      expect(result.current.userPermissions).toEqual([]);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isStaffOrAdmin).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Custom permission override: builder with admin_dashboard access
  // ---------------------------------------------------------------------------
  describe('custom permission override for builder', () => {
    it('builder with custom DB override can access admin_dashboard', () => {
      useAuthStore.setState({
        user: {
          userId: 20,
          role: 'builder',
          userType: 'builder',
          effectivePermissions: {
            'page:dashboard': true,
            'page:learning': true,
            'page:admin_dashboard': true,  // Custom override
          },
        },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => usePermissions());

      // Builder normally can't access admin_dashboard, but custom override grants it
      expect(result.current.hasPermission('page:admin_dashboard')).toBe(true);
      expect(result.current.canAccessPage('admin_dashboard')).toBe(true);
      // Still not admin though
      expect(result.current.isAdmin).toBe(false);
    });
  });
});
