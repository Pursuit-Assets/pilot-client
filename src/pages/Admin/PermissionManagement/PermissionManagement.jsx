import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { Shield, Plus, Trash2, ChevronDown, ChevronRight, Eye, Pencil, Save, X } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Textarea } from '../../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { toast } from 'sonner';
import CandidateInvites from './components/CandidateInvites';

// Format role name for display (e.g. "workshop_admin" -> "Workshop Admin")
const formatRoleName = (role) => {
  return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// Fallback role list (used until DB roles are loaded)
const FALLBACK_ROLES = ['admin', 'staff', 'builder', 'volunteer', 'workshop_participant', 'workshop_admin', 'enterprise_builder', 'enterprise_admin', 'candidate', 'applicant'];

// Admin page permissions that can be toggled for staff users
const ADMIN_PAGE_PERMISSIONS = [
  { key: 'page:admin_section', label: 'Permission Management' },
  { key: 'page:admin_prompts', label: 'AI Prompts' },
  { key: 'page:organization_management', label: 'Organization Management' },
  { key: 'page:weekly_reports', label: 'Weekly Reports' },
];

// Human-friendly labels for all permission keys
const PERMISSION_LABELS = {
  // Pages
  'page:dashboard': 'Dashboard',
  'page:learning': 'Learning',
  'page:ai_chat': 'AI Chat',
  'page:calendar': 'Calendar',
  'page:performance': 'Performance',
  'page:pathfinder': 'Pathfinder',
  'page:assessment': 'Assessment',
  'page:account': 'Account',
  'page:payment': 'Payment',
  'page:volunteering': 'Volunteering',
  'page:volunteer_feedback': 'Volunteer Feedback',
  'page:volunteer_section': 'Volunteer Section',
  'page:my_schedule': 'My Schedule',
  'page:staff_section': 'Staff Section',
  'page:admin_dashboard': 'Admin Dashboard',
  'page:admin_attendance': 'Attendance Admin',
  'page:admissions': 'Admissions',
  'page:content': 'Content',
  'page:content_preview': 'Content Management',
  'page:external_cohorts': 'External Cohorts',
  'page:coach': 'Coach',
  'page:form_builder': 'Form Builder',
  'page:pathfinder_admin': 'Pathfinder Admin',
  'page:payment_admin': 'Payment Admin',
  'page:sputnik': 'Sputnik',
  'page:assessment_grades': 'Assessment Grades',
  'page:admin_volunteer_feedback': 'Admin Volunteer Feedback',
  'page:volunteer_management': 'Volunteer Management',
  'page:admin_section': 'Permission Management',
  'page:admin_prompts': 'AI Prompts',
  'page:organization_management': 'Organization Management',
  'page:weekly_reports': 'Weekly Reports',
  'page:workshop_admin': 'Workshop Admin',
  'page:cohort_admin': 'Cohort Admin',
  // Features
  'feature:edit_curriculum': 'Edit Curriculum',
  'feature:edit_prompts': 'Edit Prompts',
  'feature:manage_users': 'Manage Users',
  'feature:manage_enrollments': 'Manage Enrollments',
  'feature:view_analytics': 'View Analytics',
  'feature:export_data': 'Export Data',
};

const getPermissionLabel = (key) =>
  PERMISSION_LABELS[key] || key.split(':').pop().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Get role badge color
const getRoleBadgeColor = (role) => {
  const colors = {
    admin: 'bg-red-100 text-red-800',
    staff: 'bg-blue-100 text-blue-800',
    builder: 'bg-green-100 text-green-800',
    volunteer: 'bg-purple-100 text-purple-800',
    workshop_participant: 'bg-orange-100 text-orange-800',
    workshop_admin: 'bg-orange-100 text-orange-800',
    enterprise_builder: 'bg-cyan-100 text-cyan-800',
    enterprise_admin: 'bg-cyan-100 text-cyan-800',
    applicant: 'bg-gray-100 text-gray-800',
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
};

// Pagination component
const Pagination = ({ currentPage, totalPages, totalItems, pageSize, onPageChange }) => {
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);
      
      if (currentPage <= 3) {
        end = 4;
      }
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
      }
      
      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) pages.push('...');
      if (totalPages > 1) pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="text-sm text-gray-600 font-proxima">
        Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalItems)} of {totalItems} users
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="font-proxima h-8 px-2"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          ← Prev
        </Button>
        
        {getPageNumbers().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-400">...</span>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'outline'}
              size="sm"
              className={`font-proxima h-8 w-8 p-0 ${currentPage === page ? 'bg-[#4242ea] hover:bg-[#3333d1]' : ''}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          )
        ))}
        
        <Button
          variant="outline"
          size="sm"
          className="font-proxima h-8 px-2"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
};

/**
 * Permission Management Page
 * Admin-only page for managing user permissions
 */
function PermissionManagement() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userPermissions, setUserPermissions] = useState({});
  const [rolePermissions, setRolePermissions] = useState({});
  const [permissionKeys, setPermissionKeys] = useState([]);
  
  // Filters and sorting
  const [roleFilter, setRoleFilter] = useState('');
  const [sortDirection, setSortDirection] = useState('name_asc');
  // Two surfaces live on this page now: per-user permissions and candidate invites.
  const [activeTab, setActiveTab] = useState('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  
  // Grant permission dialog
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantTargetUser, setGrantTargetUser] = useState(null);
  const [grantForm, setGrantForm] = useState({
    permissionKey: '',
    notes: '',
    action: 'grant', // 'grant' or 'deny'
  });
  
  // Role change
  const [roleChangeDialogOpen, setRoleChangeDialogOpen] = useState(false);
  const [roleChangeTargetUser, setRoleChangeTargetUser] = useState(null);
  const [selectedNewRole, setSelectedNewRole] = useState('');
  
  // Enrollment management
  const [userEnrollments, setUserEnrollments] = useState([]);
  const [availableCohorts, setAvailableCohorts] = useState([]);
  const [selectedCohortForEnrollment, setSelectedCohortForEnrollment] = useState('');
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  
  // Role defaults modal
  const [roleDefaultsOpen, setRoleDefaultsOpen] = useState(false);
  const [selectedRoleForDefaults, setSelectedRoleForDefaults] = useState('builder');
  
  // Role editing state
  const [roleEditMode, setRoleEditMode] = useState(false);
  const [editedPermissions, setEditedPermissions] = useState({});
  const [roleSaving, setRoleSaving] = useState(false);
  
  // New role creation state
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState({});
  const [creatingRole, setCreatingRole] = useState(false);
  
  // Role deletion
  const [deletingRole, setDeletingRole] = useState(false);

  // Admin page permission toggling (per-checkbox loading state)
  const [togglingAdminPerm, setTogglingAdminPerm] = useState({});

  const { canAccessPage } = usePermissions();
  const isAdmin = canAccessPage('admin_section');
  
  // Core roles that cannot be deleted
  const CORE_ROLES = ['admin', 'staff', 'builder', 'applicant', 'workshop_participant', 'workshop_admin', 'volunteer', 'enterprise_builder', 'enterprise_admin'];

  // Fetch users with pagination, filtering, and sorting
  const fetchUsers = useCallback(async () => {
    if (!token || !isAdmin) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: ((currentPage - 1) * PAGE_SIZE).toString(),
        sort: sortDirection,
      });
      
      if (roleFilter) params.append('role', roleFilter);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/users?${params}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      } else {
        toast.error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin, currentPage, sortDirection, roleFilter, searchQuery]);

  // Fetch role permissions for the modal
  const fetchRolePermissions = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/permissions/roles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRolePermissions(data.roles || {});
      }
    } catch (error) {
      console.error('Error fetching role permissions:', error);
    }
  }, [token, isAdmin]);

  // Fetch permission keys for the grant dialog
  const fetchPermissionKeys = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/permissions/keys`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPermissionKeys(data.permissionKeys || []);
      }
    } catch (error) {
      console.error('Error fetching permission keys:', error);
    }
  }, [token, isAdmin]);

  // Fetch permissions for a specific user (when row is expanded)
  const fetchUserPermissions = useCallback(async (userId) => {
    if (!token) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/users/${userId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setUserPermissions(prev => ({
          ...prev,
          [userId]: data
        }));
      }
    } catch (error) {
      console.error('Error fetching user permissions:', error);
    }
  }, [token]);

  // Initial data fetch
  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchRolePermissions();
      fetchPermissionKeys();
    }
  }, [isAdmin, fetchUsers, fetchRolePermissions, fetchPermissionKeys]);

  // Refetch when filters change
  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [currentPage, sortDirection, roleFilter, isAdmin]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAdmin) {
        setCurrentPage(1);
        fetchUsers();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Enter edit mode for role permissions
  const enterRoleEditMode = () => {
    // Build a map of permissionKey -> true/false from current role permissions
    const currentPerms = rolePermissions[selectedRoleForDefaults] || [];
    const permMap = {};
    // Start with all available keys unchecked
    permissionKeys.forEach(pk => {
      permMap[pk.permission_key] = false;
    });
    // Check the ones that are currently assigned
    currentPerms.forEach(p => {
      if (p.permission_key !== '*') {
        permMap[p.permission_key] = p.default_granted;
      }
    });
    setEditedPermissions(permMap);
    setRoleEditMode(true);
  };

  // Save edited role permissions
  const handleSaveRolePermissions = async () => {
    setRoleSaving(true);
    try {
      const permissions = Object.entries(editedPermissions)
        .filter(([, granted]) => granted)
        .map(([key]) => ({
          permissionKey: key,
          defaultGranted: true,
          description: permissionKeys.find(pk => pk.permission_key === key)?.description || null,
        }));
      
      // For admin role, always include wildcard
      if (selectedRoleForDefaults === 'admin') {
        permissions.push({ permissionKey: '*', defaultGranted: true, description: 'Full system access' });
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/roles/${selectedRoleForDefaults}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ permissions }),
        }
      );

      if (response.ok) {
        toast.success(`Updated permissions for role '${selectedRoleForDefaults}'`);
        setRoleEditMode(false);
        fetchRolePermissions(); // Refresh
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to update permissions');
      }
    } catch (error) {
      console.error('Error saving role permissions:', error);
      toast.error('Failed to save role permissions');
    } finally {
      setRoleSaving(false);
    }
  };

  // Create a new role
  const handleCreateRole = async () => {
    if (!newRoleName) {
      toast.error('Role name is required');
      return;
    }
    
    const roleNameRegex = /^[a-z][a-z0-9_]*$/;
    if (!roleNameRegex.test(newRoleName)) {
      toast.error('Role name must be lowercase, start with a letter, and contain only letters, numbers, and underscores');
      return;
    }

    const permissions = Object.entries(newRolePermissions)
      .filter(([, granted]) => granted)
      .map(([key]) => ({
        permissionKey: key,
        defaultGranted: true,
        description: permissionKeys.find(pk => pk.permission_key === key)?.description || null,
      }));

    if (permissions.length === 0) {
      toast.error('Select at least one permission for the new role');
      return;
    }

    setCreatingRole(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/roles`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roleName: newRoleName, permissions }),
        }
      );

      if (response.ok) {
        toast.success(`Role '${newRoleName}' created successfully`);
        setCreateRoleOpen(false);
        setNewRoleName('');
        setNewRolePermissions({});
        fetchRolePermissions(); // Refresh
        setSelectedRoleForDefaults(newRoleName);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to create role');
      }
    } catch (error) {
      console.error('Error creating role:', error);
      toast.error('Failed to create role');
    } finally {
      setCreatingRole(false);
    }
  };

  // Delete a role
  const handleDeleteRole = async () => {
    if (!selectedRoleForDefaults || CORE_ROLES.includes(selectedRoleForDefaults)) {
      toast.error('Cannot delete core roles');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the role '${selectedRoleForDefaults}'? This cannot be undone.`)) {
      return;
    }

    setDeletingRole(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/roles/${selectedRoleForDefaults}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (response.ok) {
        toast.success(`Role '${selectedRoleForDefaults}' deleted successfully`);
        setRoleEditMode(false); // Exit edit mode
        setSelectedRoleForDefaults('builder');
        fetchRolePermissions(); // Refresh
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete role');
      }
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error('Failed to delete role');
    } finally {
      setDeletingRole(false);
    }
  };

  // Group permission keys by category (page: / feature: / etc.)
  const groupPermissionKeys = (keys) => {
    const groups = {};
    keys.forEach(pk => {
      const parts = pk.permission_key.split(':');
      const category = parts.length > 1 ? parts[0] : 'other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(pk);
    });
    // Sort keys within each group
    Object.values(groups).forEach(arr => arr.sort((a, b) => a.permission_key.localeCompare(b.permission_key)));
    return groups;
  };

  const permissionKeyGroups = useMemo(() => groupPermissionKeys(permissionKeys), [permissionKeys]);

  // Dynamic role filter options — uses DB roles when loaded, falls back to hardcoded list
  const roleFilterOptions = useMemo(() => {
    const dbRoles = Object.keys(rolePermissions);
    const roleList = dbRoles.length > 0 ? dbRoles : FALLBACK_ROLES;
    return [
      { value: '', label: 'All Roles' },
      ...roleList.sort().map(role => ({ value: role, label: formatRoleName(role) })),
    ];
  }, [rolePermissions]);

  // Handle row expand/collapse
  const handleRowClick = (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
      // Fetch permissions if not already loaded
      if (!userPermissions[userId]) {
        fetchUserPermissions(userId);
      }
    }
  };

  // Handle sort toggle
  const handleSortToggle = () => {
    setSortDirection(prev => prev === 'name_asc' ? 'name_desc' : 'name_asc');
    setCurrentPage(1);
  };

  // Handle role filter change
  const handleRoleFilterChange = (value) => {
    setRoleFilter(value);
    setCurrentPage(1);
  };

  // Open grant dialog
  const openGrantDialog = (targetUser) => {
    setGrantTargetUser(targetUser);
    setGrantForm({ permissionKey: '', notes: '', action: 'grant' });
    setGrantDialogOpen(true);
  };

  // Handle grant/deny permission
  const handleGrantPermission = async () => {
    if (!grantForm.permissionKey || !grantTargetUser) return;

    try {
      const endpoint = grantForm.action === 'grant' 
        ? `/api/permissions/users/${grantTargetUser.user_id}/grant`
        : `/api/permissions/users/${grantTargetUser.user_id}/deny`;
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            permissionKey: grantForm.permissionKey,
            notes: grantForm.notes || undefined,
          })
        }
      );

      if (response.ok) {
        toast.success(`Permission ${grantForm.action === 'grant' ? 'granted' : 'denied'} successfully`);
        setGrantDialogOpen(false);
        // Refresh the user's permissions
        fetchUserPermissions(grantTargetUser.user_id);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update permission');
      }
    } catch (error) {
      console.error('Error updating permission:', error);
      toast.error('Failed to update permission');
    }
  };

  // Handle remove custom permission
  const handleRemoveCustomPermission = async (userId, permissionKey) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/users/${userId}/permissions/${encodeURIComponent(permissionKey)}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        toast.success('Custom permission removed');
        fetchUserPermissions(userId);
      } else {
        toast.error('Failed to remove permission');
      }
    } catch (error) {
      console.error('Error removing permission:', error);
      toast.error('Failed to remove permission');
    }
  };

  // Toggle an admin page permission for a staff user
  const handleToggleAdminPermission = async (userId, permissionKey, currentlyGranted) => {
    setTogglingAdminPerm(prev => ({ ...prev, [permissionKey]: true }));
    try {
      if (currentlyGranted) {
        // Remove the custom permission
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/permissions/users/${userId}/permissions/${encodeURIComponent(permissionKey)}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );
        if (response.ok) {
          toast.success(`Removed ${permissionKey}`);
        } else {
          toast.error('Failed to remove permission');
        }
      } else {
        // Grant the permission
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/permissions/users/${userId}/grant`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ permissionKey }),
          }
        );
        if (response.ok) {
          toast.success(`Granted ${permissionKey}`);
        } else {
          toast.error('Failed to grant permission');
        }
      }
      // Refresh user permissions after toggle
      await fetchUserPermissions(userId);
    } catch (error) {
      console.error('Error toggling admin permission:', error);
      toast.error('Failed to update permission');
    } finally {
      setTogglingAdminPerm(prev => ({ ...prev, [permissionKey]: false }));
    }
  };

  // Open role change dialog
  const openRoleChangeDialog = (targetUser) => {
    setRoleChangeTargetUser(targetUser);
    setSelectedNewRole(targetUser.role); // Default to current role
    setRoleChangeDialogOpen(true);
  };

  // Fetch enrollments when dialog opens for builder/enterprise_builder
  const fetchUserEnrollments = useCallback(async (userId) => {
    setEnrollmentsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/users/${userId}/enrollments`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setUserEnrollments(data.enrollments || []);
      }
    } catch (error) {
      console.error('Error fetching enrollments:', error);
    } finally {
      setEnrollmentsLoading(false);
    }
  }, [token]);

  // Fetch cohorts based on role selection
  const fetchCohortsForRole = useCallback(async (role) => {
    if (role !== 'builder' && role !== 'enterprise_builder') {
      setAvailableCohorts([]);
      return;
    }
    
    const cohortType = role === 'builder' ? 'builder' : 'external';
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/cohorts?type=${cohortType}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAvailableCohorts(data.cohorts || []);
      }
    } catch (error) {
      console.error('Error fetching cohorts:', error);
    }
  }, [token]);

  // Watch for role selection changes and fetch cohorts/enrollments accordingly
  useEffect(() => {
    if (!roleChangeDialogOpen || !selectedNewRole || !roleChangeTargetUser) return;
    
    // If the selected role is builder or enterprise_builder, fetch data
    if (selectedNewRole === 'builder' || selectedNewRole === 'enterprise_builder') {
      fetchCohortsForRole(selectedNewRole);
      fetchUserEnrollments(roleChangeTargetUser.user_id);
    } else {
      // Clear cohorts and enrollments for non-builder roles
      setAvailableCohorts([]);
      setUserEnrollments([]);
    }
  }, [selectedNewRole, roleChangeDialogOpen, roleChangeTargetUser, fetchCohortsForRole, fetchUserEnrollments]);

  // Create enrollment
  const handleCreateEnrollment = async () => {
    if (!selectedCohortForEnrollment || !roleChangeTargetUser) return;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/users/${roleChangeTargetUser.user_id}/enrollments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cohortId: selectedCohortForEnrollment })
        }
      );
      
      if (response.ok) {
        toast.success('Enrollment created successfully');
        setSelectedCohortForEnrollment('');
        // Refresh enrollments
        fetchUserEnrollments(roleChangeTargetUser.user_id);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create enrollment');
      }
    } catch (error) {
      console.error('Error creating enrollment:', error);
      toast.error('Failed to create enrollment');
    }
  };

  // Handle role change
  const handleRoleChange = async () => {
    if (!selectedNewRole || !roleChangeTargetUser) return;
    
    // Don't make API call if role hasn't changed
    if (selectedNewRole === roleChangeTargetUser.role) {
      toast.info('Role unchanged');
      setRoleChangeDialogOpen(false);
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/permissions/users/${roleChangeTargetUser.user_id}/role`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: selectedNewRole })
        }
      );

      if (response.ok) {
        toast.success(`Role changed to ${selectedNewRole}`);
        
        // Update the target user's role so button state reflects the change
        setRoleChangeTargetUser(prev => ({ ...prev, role: selectedNewRole }));
        
        // If new role is builder or enterprise_builder, keep dialog open
        // (enrollments already fetched via useEffect)
        if (selectedNewRole === 'builder' || selectedNewRole === 'enterprise_builder') {
          // Keep dialog open to show enrollment management
        } else {
          setRoleChangeDialogOpen(false);
        }
        
        // Refresh the users list to show updated role
        fetchUsers();
        
        // If this user's permissions are currently expanded, refresh them to show new role permissions
        if (expandedUserId === roleChangeTargetUser.user_id) {
          fetchUserPermissions(roleChangeTargetUser.user_id);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to change role');
      }
    } catch (error) {
      console.error('Error changing role:', error);
      toast.error('Failed to change role');
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  // Access denied for non-admins
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to manage user permissions.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Render sortable + filterable header for Role column
  const renderRoleFilterHeader = () => {
    const isFiltered = roleFilter !== '';
    
    return (
      <div className="flex items-center gap-1">
        <span className="font-proxima-bold">Role</span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button 
              className={`p-1 rounded hover:bg-gray-200 ${isFiltered ? 'text-[#4242ea]' : 'text-gray-400'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 font-proxima">
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Filter by Role</div>
            <DropdownMenuSeparator />
            {roleFilterOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={roleFilter === option.value}
                onCheckedChange={() => handleRoleFilterChange(option.value)}
                onSelect={(e) => e.preventDefault()}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
            {isFiltered && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 hover:text-red-700"
                  onSelect={(e) => {
                    e.preventDefault();
                    handleRoleFilterChange('');
                  }}
                >
                  ✕ Clear Filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  // Render expanded permissions section
  const renderExpandedPermissions = (userId) => {
    const perms = userPermissions[userId];
    const userInfo = users.find(u => u.user_id === userId);
    
    if (!perms) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="bg-slate-50 p-6">
            <div className="text-center text-slate-500">Loading permissions...</div>
          </TableCell>
        </TableRow>
      );
    }

    const effectivePerms = perms.effectivePermissions?.filter(p => p.has_permission) || [];
    const customPerms = perms.customPermissions || [];

    // Group permissions by category (page: vs feature: vs action:, etc.)
    const groupedPerms = effectivePerms.reduce((groups, perm) => {
      const [category, ...rest] = perm.permission_key.split(':');
      const categoryLabel = category || 'other';
      if (!groups[categoryLabel]) {
        groups[categoryLabel] = [];
      }
      groups[categoryLabel].push(perm);
      return groups;
    }, {});

    // Sort categories with 'page' first, then 'feature', then alphabetically
    const sortedCategories = Object.keys(groupedPerms).sort((a, b) => {
      if (a === 'page') return -1;
      if (b === 'page') return 1;
      if (a === 'feature') return -1;
      if (b === 'feature') return 1;
      return a.localeCompare(b);
    });

    // Sort permissions within each category alphabetically
    sortedCategories.forEach(category => {
      groupedPerms[category].sort((a, b) => 
        a.permission_key.localeCompare(b.permission_key)
      );
    });

    return (
      <TableRow>
        <TableCell colSpan={4} className="bg-slate-50 p-0">
          <div className="p-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900">
                Permissions for {userInfo?.first_name} {userInfo?.last_name}
              </h4>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRoleChangeDialog(userInfo);
                  }}
                  className="font-proxima"
                >
                  <Shield className="h-4 w-4 mr-1" />
                  Change Role
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openGrantDialog(userInfo);
                  }}
                  className="bg-[#4242ea] hover:bg-[#3333d1]"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Custom Permission
                </Button>
              </div>
            </div>

            {/* Admin Page Permissions — staff only */}
            {userInfo?.role === 'staff' && (
              <div className="mb-6 p-4 bg-white rounded-lg border border-slate-200">
                <h5 className="text-sm font-semibold text-slate-700 mb-3">Admin Page Permissions</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {ADMIN_PAGE_PERMISSIONS.map((ap) => {
                    const isGranted = effectivePerms.some(p => p.permission_key === ap.key);
                    const isCustom = customPerms.some(p => p.permission_key === ap.key);
                    const isToggling = !!togglingAdminPerm[ap.key];
                    return (
                      <label
                        key={ap.key}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isGranted
                            ? 'bg-green-50 border-green-200 hover:bg-green-100'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        } ${isToggling ? 'opacity-60 pointer-events-none' : ''}`}
                      >
                        {isToggling ? (
                          <div className="w-4 h-4 border-2 border-[#4242ea] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : (
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#4242ea] focus:ring-[#4242ea] flex-shrink-0"
                            checked={isGranted}
                            onChange={() => handleToggleAdminPermission(userId, ap.key, isGranted)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span className="text-sm text-slate-800">{ap.label}</span>
                        {isCustom && (
                          <span className="text-xs text-blue-600 ml-auto">(custom)</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Permissions Section */}
            {customPerms.length > 0 && (
              <div className="mb-6 p-4 bg-white rounded-lg border border-slate-200">
                <h5 className="text-sm font-semibold text-slate-700 mb-3">Custom Overrides</h5>
                <div className="flex flex-wrap gap-2">
                  {customPerms.map((perm) => (
                    <div
                      key={perm.permission_id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                        perm.granted 
                          ? 'bg-green-100 text-green-800 border border-green-200' 
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}
                    >
                      <span title={perm.permission_key}>{getPermissionLabel(perm.permission_key)}</span>
                      <span className="text-xs">({perm.granted ? 'granted' : 'denied'})</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCustomPermission(userId, perm.permission_key);
                        }}
                        className="hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Effective Permissions Section - Columnar Layout */}
            <div>
              <h5 className="text-sm font-semibold text-slate-700 mb-3">
                Effective Permissions ({effectivePerms.length})
              </h5>
              {effectivePerms.length === 0 ? (
                <span className="text-slate-500 text-sm">No permissions</span>
              ) : (
                <div className="space-y-4">
                  {sortedCategories.map((category) => (
                    <div key={category} className="bg-white rounded-lg border border-slate-200 p-4">
                      <h6 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200">
                        {category} Permissions ({groupedPerms[category].length})
                      </h6>
                      <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-1.5">
                        {groupedPerms[category].map((perm) => {
                          const permLabel = getPermissionLabel(perm.permission_key);
                          return (
                            <div
                              key={perm.permission_key}
                              className="flex items-center text-sm break-inside-avoid"
                              title={perm.description || perm.permission_key}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full mr-2 flex-shrink-0 ${
                                perm.source === 'custom'
                                  ? 'bg-blue-500'
                                  : 'bg-slate-400'
                              }`} />
                              <span className="text-slate-700 break-words">
                                {permLabel}
                              </span>
                              {perm.source === 'custom' && (
                                <span className="ml-auto text-xs text-blue-600 flex-shrink-0">custom</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-[#4242EA]" />
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 font-proxima">
                    Permission Management
                  </h1>
                  <p className="text-slate-600 mt-1 font-proxima">
                    Manage user permissions and access control
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setRoleDefaultsOpen(true)}
                className="font-proxima"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Role Defaults
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-8 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-white border border-slate-200 p-1 mb-6 rounded-lg inline-flex">
              <TabsTrigger
                value="users"
                className="data-[state=active]:bg-[#4242EA] data-[state=active]:text-white text-slate-700 font-medium font-proxima px-6 py-2.5 rounded-md transition-all"
              >
                User Permissions
              </TabsTrigger>
              <TabsTrigger
                value="candidates"
                className="data-[state=active]:bg-[#4242EA] data-[state=active]:text-white text-slate-700 font-medium font-proxima px-6 py-2.5 rounded-md transition-all"
              >
                Candidate Invites
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-0">
          {/* Search bar */}
          <div className="bg-white rounded-lg border border-slate-200 mb-4">
            <div className="p-4 flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full font-proxima pr-8"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="text-sm text-slate-500">
                {total} users total
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-12"></TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-slate-100 select-none"
                    onClick={handleSortToggle}
                  >
                    <span className="flex items-center font-proxima-bold">
                      Name
                      <span className={`ml-1 ${sortDirection.includes('name') ? 'text-[#4242ea]' : 'text-gray-400'}`}>
                        {sortDirection === 'name_asc' ? '▲' : '▼'}
                      </span>
                    </span>
                  </TableHead>
                  <TableHead className="font-proxima-bold">Email</TableHead>
                  <TableHead>{renderRoleFilterHeader()}</TableHead>
                  <TableHead className="font-proxima-bold text-xs">Metrics</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  // Loading skeleton
                  [...Array(10)].map((_, index) => (
                    <TableRow key={index} className="animate-pulse">
                      <TableCell><div className="h-4 w-4 bg-gray-200 rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-32 bg-gray-200 rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-48 bg-gray-200 rounded"></div></TableCell>
                      <TableCell><div className="h-6 w-20 bg-gray-200 rounded-full"></div></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <React.Fragment key={u.user_id}>
                      <TableRow 
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => handleRowClick(u.user_id)}
                      >
                        <TableCell>
                          {expandedUserId === u.user_id ? (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 font-proxima">
                          {u.first_name} {u.last_name}
                        </TableCell>
                        <TableCell className="text-slate-600 font-proxima">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getRoleBadgeColor(u.role)} font-proxima`}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newVal = !u.exclude_from_metrics;
                              try {
                                await fetch(`${import.meta.env.VITE_API_URL}/api/permissions/users/${u.user_id}/exclude-from-metrics`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ exclude: newVal }),
                                });
                                setUsers(prev => prev.map(user => user.user_id === u.user_id ? { ...user, exclude_from_metrics: newVal } : user));
                              } catch { toast.error('Failed to update'); }
                            }}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              u.exclude_from_metrics ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'
                            }`}
                            title={u.exclude_from_metrics ? 'Excluded from metrics — click to include' : 'Click to exclude from metrics'}
                          >
                            {u.exclude_from_metrics ? 'Excluded' : 'In Metrics'}
                          </button>
                        </TableCell>
                      </TableRow>
                      {expandedUserId === u.user_id && renderExpandedPermissions(u.user_id)}
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
            
            {/* Pagination */}
            {!loading && total > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            )}
          </div>
            </TabsContent>

            <TabsContent value="candidates" className="mt-0">
              <CandidateInvites />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Grant/Deny Permission Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Permission</DialogTitle>
            <DialogDescription>
              Add a custom permission override for {grantTargetUser?.first_name} {grantTargetUser?.last_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Action</label>
              <Select
                value={grantForm.action}
                onValueChange={(value) => setGrantForm({ ...grantForm, action: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grant">Grant (allow permission)</SelectItem>
                  <SelectItem value="deny">Deny (block permission)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700">Permission</label>
              <Select
                value={grantForm.permissionKey}
                onValueChange={(value) => setGrantForm({ ...grantForm, permissionKey: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a permission" />
                </SelectTrigger>
                <SelectContent>
                  {permissionKeys.map((key) => (
                    <SelectItem key={key.permission_key} value={key.permission_key}>
                      {getPermissionLabel(key.permission_key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
              <Textarea
                placeholder="Reason for this permission change..."
                value={grantForm.notes}
                onChange={(e) => setGrantForm({ ...grantForm, notes: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleGrantPermission} 
              disabled={!grantForm.permissionKey}
              className={grantForm.action === 'deny' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#4242ea] hover:bg-[#3333d1]'}
            >
              {grantForm.action === 'grant' ? 'Grant Permission' : 'Deny Permission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Defaults Modal (View + Edit) */}
      <Dialog open={roleDefaultsOpen} onOpenChange={(open) => {
        setRoleDefaultsOpen(open);
        if (!open) {
          setRoleEditMode(false);
          setCreateRoleOpen(false);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {createRoleOpen ? 'Create New Role' : roleEditMode ? `Edit Permissions — ${selectedRoleForDefaults}` : 'Default Role Permissions'}
            </DialogTitle>
            <DialogDescription>
              {createRoleOpen
                ? 'Define a new role and select its default permissions'
                : roleEditMode
                  ? 'Check or uncheck permissions for this role, then save'
                  : 'View and manage the default permissions assigned to each role'}
            </DialogDescription>
          </DialogHeader>

          {createRoleOpen ? (
            /* ---- CREATE NEW ROLE VIEW ---- */
            <>
              <div className="py-2">
                <label className="text-sm font-medium text-slate-700">Role Name</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. mentor, reviewer, team_lead"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
                <p className="text-xs text-slate-500 mt-1">Lowercase letters, numbers, and underscores only</p>
              </div>

              <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-slate-50">
                {Object.entries(permissionKeyGroups).map(([category, keys]) => (
                  <div key={category} className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2 border-b pb-1">
                      {category} permissions
                    </h4>
                    <div className="grid grid-cols-2 gap-1">
                      {keys.map(pk => (
                        <label
                          key={pk.permission_key}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#4242ea] focus:ring-[#4242ea]"
                            checked={!!newRolePermissions[pk.permission_key]}
                            onChange={(e) =>
                              setNewRolePermissions(prev => ({ ...prev, [pk.permission_key]: e.target.checked }))
                            }
                          />
                          <span className="text-slate-800">{pk.permission_key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setCreateRoleOpen(false); setNewRoleName(''); setNewRolePermissions({}); }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateRole}
                  disabled={creatingRole || !newRoleName}
                  className="bg-[#4242ea] hover:bg-[#3333d1]"
                >
                  {creatingRole ? 'Creating...' : 'Create Role'}
                </Button>
              </DialogFooter>
            </>
          ) : roleEditMode ? (
            /* ---- EDIT MODE VIEW ---- */
            <>
              <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-slate-50">
                {selectedRoleForDefaults === 'admin' && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Note:</strong> The admin wildcard (*) permission is always included. The checkboxes below are for reference only — admin has full access regardless.
                    </p>
                  </div>
                )}
                {Object.entries(permissionKeyGroups).map(([category, keys]) => (
                  <div key={category} className="mb-4">
                    <div className="flex items-center justify-between mb-2 border-b pb-1">
                      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                        {category} permissions
                      </h4>
                      <div className="flex gap-2">
                        <button
                          className="text-xs text-[#4242ea] hover:underline"
                          onClick={() => {
                            const updated = { ...editedPermissions };
                            keys.forEach(pk => { updated[pk.permission_key] = true; });
                            setEditedPermissions(updated);
                          }}
                        >
                          Select all
                        </button>
                        <button
                          className="text-xs text-slate-500 hover:underline"
                          onClick={() => {
                            const updated = { ...editedPermissions };
                            keys.forEach(pk => { updated[pk.permission_key] = false; });
                            setEditedPermissions(updated);
                          }}
                        >
                          Clear all
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {keys.map(pk => (
                        <label
                          key={pk.permission_key}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#4242ea] focus:ring-[#4242ea]"
                            checked={!!editedPermissions[pk.permission_key]}
                            onChange={(e) =>
                              setEditedPermissions(prev => ({ ...prev, [pk.permission_key]: e.target.checked }))
                            }
                          />
                          <span className="text-slate-800">{pk.permission_key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter className="!flex-row !justify-between items-center gap-2">
                {/* Delete button on the left - always visible, disabled for core roles */}
                <Button
                  variant="destructive"
                  onClick={handleDeleteRole}
                  disabled={deletingRole || CORE_ROLES.includes(selectedRoleForDefaults)}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
                  title={CORE_ROLES.includes(selectedRoleForDefaults) ? 'Core roles cannot be deleted' : 'Delete this role'}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deletingRole ? 'Deleting...' : 'Delete Role'}
                </Button>
                
                {/* Cancel and Save buttons on the right */}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRoleEditMode(false)}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button
                    onClick={handleSaveRolePermissions}
                    disabled={roleSaving}
                    className="bg-[#4242ea] hover:bg-[#3333d1]"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {roleSaving ? 'Saving...' : 'Save Permissions'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : (
            /* ---- VIEW MODE (default) ---- */
            <>
              <div className="flex items-center gap-2 py-2">
                <Select
                  value={selectedRoleForDefaults}
                  onValueChange={(val) => { setSelectedRoleForDefaults(val); setRoleEditMode(false); }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(rolePermissions).map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={enterRoleEditMode}
                  title="Edit permissions for this role"
                >
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                
                {!CORE_ROLES.includes(selectedRoleForDefaults) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteRole}
                    disabled={deletingRole}
                    title="Delete this role"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> {deletingRole ? 'Deleting...' : 'Delete'}
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-slate-50">
                {selectedRoleForDefaults === 'admin' ? (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                      <Shield className="h-8 w-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Full System Access</h3>
                    <p className="text-slate-600 max-w-md mx-auto">
                      The <span className="font-semibold">admin</span> role has unrestricted access to all permissions throughout the entire system, including all current and future features.
                    </p>
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg max-w-md mx-auto">
                      <p className="text-sm text-amber-800">
                        <strong>Note:</strong> This includes all page:, feature:, and action: permissions without needing to define them individually.
                      </p>
                    </div>
                  </div>
                ) : rolePermissions[selectedRoleForDefaults]?.length > 0 ? (
                  <div className="space-y-2">
                    {rolePermissions[selectedRoleForDefaults].map((perm) => (
                      <div
                        key={perm.permission_key}
                        className="flex items-center justify-between p-2 bg-white rounded border"
                      >
                        <div>
                          <div className="font-medium text-slate-900">{perm.permission_key}</div>
                          {perm.description && (
                            <div className="text-sm text-slate-500">{perm.description}</div>
                          )}
                        </div>
                        <Badge variant={perm.default_granted ? 'default' : 'destructive'}>
                          {perm.default_granted ? 'Granted' : 'Denied'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-slate-500 py-8">
                    No permissions defined for this role
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateRoleOpen(true);
                    setNewRoleName('');
                    setNewRolePermissions({});
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Create New Role
                </Button>
                <Button variant="outline" onClick={() => setRoleDefaultsOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={roleChangeDialogOpen} onOpenChange={setRoleChangeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Change the role for {roleChangeTargetUser?.first_name} {roleChangeTargetUser?.last_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Warning:</strong> Changing a user's role will immediately affect their access to pages and features. 
                Custom permission overrides will remain intact.
              </p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700">Current Role</label>
              <div className="mt-1 mb-3">
                <Badge className={`${getRoleBadgeColor(roleChangeTargetUser?.role)} font-proxima text-base px-3 py-1`}>
                  {roleChangeTargetUser?.role}
                </Badge>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700">New Role</label>
              <Select
                value={selectedNewRole}
                onValueChange={setSelectedNewRole}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a new role" />
                </SelectTrigger>
                <SelectContent>
                  {roleFilterOptions
                    .filter(opt => opt.value !== '') // Exclude "All Roles" option
                    .map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* After role selection, show enrollments for builder/enterprise_builder */}
            {selectedNewRole && (selectedNewRole === 'builder' || selectedNewRole === 'enterprise_builder') && (
              <div className="mt-4 p-4 border rounded-lg bg-slate-50">
                <h4 className="font-semibold text-slate-900 mb-3">Cohort Enrollments</h4>
                
                {enrollmentsLoading ? (
                  <div className="text-center py-4">
                    <div className="inline-block w-6 h-6 border-4 border-[#4242ea] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <>
                    {/* Existing Enrollments */}
                    {userEnrollments.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        <div className="text-sm font-medium text-slate-700">Current Enrollments:</div>
                        {userEnrollments.map((enrollment) => (
                          <div key={enrollment.enrollment_id} className="flex items-center justify-between p-2 bg-white rounded border">
                            <div>
                              <div className="font-medium">{enrollment.cohort_name}</div>
                              <div className="text-xs text-slate-500">
                                Enrolled: {new Date(enrollment.enrolled_date).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {enrollment.is_active && (
                                <Badge className="bg-green-100 text-green-800">Active</Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {enrollment.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-amber-600 mb-4 p-2 bg-amber-50 rounded">
                        ⚠️ This user has no enrollments. Select a cohort below to enroll them.
                      </div>
                    )}
                    
                    {/* Add New Enrollment */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-slate-700">
                        {userEnrollments.length > 0 ? 'Enroll in Another Cohort:' : 'Select a cohort for this user:'}
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={selectedCohortForEnrollment}
                          onValueChange={setSelectedCohortForEnrollment}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select cohort..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableCohorts.length > 0 ? (
                              availableCohorts.map((cohort) => (
                                <SelectItem key={cohort.cohort_id} value={cohort.cohort_id}>
                                  {cohort.name} ({new Date(cohort.start_date).toLocaleDateString()})
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="none" disabled>No active cohorts available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleCreateEnrollment}
                          disabled={!selectedCohortForEnrollment || availableCohorts.length === 0}
                          size="sm"
                          className="bg-[#4242ea] hover:bg-[#3333d1]"
                        >
                          Enroll
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRoleChangeDialogOpen(false);
              setUserEnrollments([]);
              setAvailableCohorts([]);
              setSelectedCohortForEnrollment('');
            }}>
              {(selectedNewRole === 'builder' || selectedNewRole === 'enterprise_builder') && userEnrollments.length === 0 
                ? 'Close' 
                : 'Cancel'}
            </Button>
            <Button 
              onClick={handleRoleChange} 
              disabled={!selectedNewRole || selectedNewRole === roleChangeTargetUser?.role}
              className="bg-[#4242ea] hover:bg-[#3333d1]"
            >
              Change Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PermissionManagement;
