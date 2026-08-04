import { useCallback, useMemo } from 'react';
import useAuthStore from '../stores/authStore';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PAGE_PERMISSIONS,
  READ_ONLY_ROLES,
} from '../constants/permissions';

/**
 * usePermissions Hook
 * 
 * Provides permission checking functionality for components.
 * 
 * Resolution priority:
 * 1. Database-sourced effective permissions (user.effectivePermissions) — fetched at login
 * 2. Hardcoded DEFAULT_ROLE_PERMISSIONS constants — fallback if DB permissions haven't loaded
 * 
 * Custom overrides (user.customPermissions) are already baked into effectivePermissions
 * by the backend's getUserEffectivePermissions query.
 * 
 * @returns {Object} Permission utilities
 */
export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  
  // Whether we have DB-sourced permissions (fetched at login from /api/permissions/my-permissions)
  const hasDbPermissions = !!user?.effectivePermissions;

  /**
   * Check if user has a specific permission
   * 
   * @param {string} permission - Permission key to check
   * @returns {boolean}
   */
  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    
    const role = user.role;
    if (!role) return false;
    
    // Admin always has all permissions
    if (role === 'admin') return true;

    // If we have DB-sourced effective permissions, use those (source of truth)
    if (user.effectivePermissions) {
      // effectivePermissions is { "page:dashboard": true, "feature:edit_curriculum": false, ... }
      if (permission in user.effectivePermissions) {
        return user.effectivePermissions[permission] === true;
      }
      // Permission not in the map means it wasn't granted
      return false;
    }
    
    // Fallback to hardcoded constants (only used before DB permissions have loaded)
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
    if (rolePermissions.includes('*')) return true;
    return rolePermissions.includes(permission);
  }, [user]);
  
  /**
   * Check if user can access a specific page
   * Convenience wrapper that prefixes 'page:' to the page name
   * 
   * @param {string} pageName - Page name (without 'page:' prefix)
   * @returns {boolean}
   */
  const canAccessPage = useCallback((pageName) => {
    const permissionKey = pageName.startsWith('page:') ? pageName : `page:${pageName}`;
    return hasPermission(permissionKey);
  }, [hasPermission]);
  
  /**
   * Check if user can use a specific feature
   * Convenience wrapper that prefixes 'feature:' to the feature name
   * 
   * @param {string} featureName - Feature name (without 'feature:' prefix)
   * @returns {boolean}
   */
  const canUseFeature = useCallback((featureName) => {
    const permissionKey = featureName.startsWith('feature:') ? featureName : `feature:${featureName}`;
    return hasPermission(permissionKey);
  }, [hasPermission]);
  
  /**
   * Check if user has any of the specified permissions
   * 
   * @param {string[]} permissions - Array of permission keys
   * @returns {boolean}
   */
  const hasAnyPermission = useCallback((permissions) => {
    return permissions.some(permission => hasPermission(permission));
  }, [hasPermission]);
  
  /**
   * Check if user has all of the specified permissions
   * 
   * @param {string[]} permissions - Array of permission keys
   * @returns {boolean}
   */
  const hasAllPermissions = useCallback((permissions) => {
    return permissions.every(permission => hasPermission(permission));
  }, [hasPermission]);
  
  /**
   * Get all permissions the user currently has
   */
  const userPermissions = useMemo(() => {
    if (!user?.role) return [];
    
    // Admin has everything
    if (user.role === 'admin') {
      return Object.values(PAGE_PERMISSIONS);
    }
    
    // If we have DB-sourced permissions, use those
    if (user.effectivePermissions) {
      return Object.entries(user.effectivePermissions)
        .filter(([, granted]) => granted === true)
        .map(([key]) => key);
    }
    
    // Fallback to hardcoded constants
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[user.role] || [];
    if (rolePermissions.includes('*')) {
      return Object.values(PAGE_PERMISSIONS);
    }
    return [...rolePermissions];
  }, [user]);
  
  /**
   * Check if user is admin
   */
  const isAdmin = useMemo(() => {
    if (!user?.role) return false;
    return user.role === 'admin';
  }, [user]);
  
  /**
   * Check if user is staff or admin
   */
  const isStaffOrAdmin = useMemo(() => {
    if (!user?.role) return false;
    return user.role === 'admin' || user.role === 'staff';
  }, [user]);

  /**
   * Whether this account can only READ.
   *
   * The server refuses every state-changing request from these roles
   * (test-pilot-server middleware/readOnlyRole.js) because the pages they can see gate
   * reads and writes on the same permission key — permissions alone can't express
   * "look, don't touch". Components use this to HIDE write controls: a blocked write
   * returns 403, and the global fetch interceptor is one branch away from treating a
   * 403 as an expired session, so a read-only user must never be offered the button.
   *
   * This is presentation only. The server is the enforcement.
   */
  const isReadOnly = useMemo(() => READ_ONLY_ROLES.includes(user?.role), [user]);


  return {
    // Core permission checks
    hasPermission,
    canAccessPage,
    canUseFeature,
    hasAnyPermission,
    hasAllPermissions,
    
    // Computed values
    userPermissions,
    userRole: user?.role,
    isAdmin,
    isStaffOrAdmin,
    isReadOnly,
    hasDbPermissions,
    
    // Export constants for convenience
    PAGE_PERMISSIONS,
  };
}

export default usePermissions;
