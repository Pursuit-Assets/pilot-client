/**
 * User Permissions System
 * 
 * Centralized permission definitions for the application.
 * This file defines what each role can access by default.
 */

// Page-level permission keys
export const PAGE_PERMISSIONS = {
  DASHBOARD: 'page:dashboard',
  LEARNING: 'page:learning',
  AI_CHAT: 'page:ai_chat',
  CALENDAR: 'page:calendar',
  PERFORMANCE: 'page:performance',
  PATHFINDER: 'page:pathfinder',
  ASSESSMENT: 'page:assessment',
  ACCOUNT: 'page:account',
  PAYMENT: 'page:payment',
  
  // Volunteer section
  VOLUNTEERING: 'page:volunteering',
  VOLUNTEER_FEEDBACK: 'page:volunteer_feedback',
  VOLUNTEER_SECTION: 'page:volunteer_section',
  MY_SCHEDULE: 'page:my_schedule',
  
  // Staff section (admin/staff)
  STAFF_SECTION: 'page:staff_section',
  ADMIN_DASHBOARD: 'page:admin_dashboard',
  ADMIN_ATTENDANCE: 'page:admin_attendance',
  ADMISSIONS: 'page:admissions',
  CONTENT: 'page:content',
  CONTENT_PREVIEW: 'page:content_preview',
  EXTERNAL_COHORTS: 'page:external_cohorts',
  FORM_BUILDER: 'page:form_builder',
  PATHFINDER_ADMIN: 'page:pathfinder_admin',
  PAYMENT_ADMIN: 'page:payment_admin',
  SPUTNIK: 'page:sputnik',
  ASSESSMENT_GRADES: 'page:assessment_grades',
  ADMIN_VOLUNTEER_FEEDBACK: 'page:admin_volunteer_feedback',
  VOLUNTEER_MANAGEMENT: 'page:volunteer_management',
  TEMPLATE_MANAGEMENT: 'page:template_management',
  HEADSHOT_UPLOAD: 'page:headshot_upload',

  // Admin only section
  ADMIN_SECTION: 'page:admin_section',
  ADMIN_PROMPTS: 'page:admin_prompts',
  ORGANIZATION_MANAGEMENT: 'page:organization_management',
  WEEKLY_REPORTS: 'page:weekly_reports',
  PLATFORM_ANALYTICS: 'page:platform_analytics',
  DEMO_COHORT: 'page:demo_cohort',
  COACH: 'page:coach',

  // Workshop admin
  WORKSHOP_ADMIN: 'page:workshop_admin',

  // Cohort/Enterprise admin
  COHORT_ADMIN: 'page:cohort_admin',

  // Platform Intake — available to all authenticated roles
  PLATFORM_INTAKE: 'page:platform_intake',
};

/**
 * Roles that may only READ. The server refuses every state-changing request from these
 * (test-pilot-server `middleware/readOnlyRole.js`); the client uses this list — via
 * `usePermissions().isReadOnly` — to hide write controls so a read-only user is never
 * offered a button that will 403.
 *
 * Keep in sync with READ_ONLY_ROLES in test-pilot-server middleware/readOnlyRole.js.
 */
export const READ_ONLY_ROLES = ['candidate'];

// Feature-level permission keys (for future use)
export const FEATURE_PERMISSIONS = {
  EDIT_CURRICULUM: 'feature:edit_curriculum',
  EDIT_PROMPTS: 'feature:edit_prompts',
  MANAGE_USERS: 'feature:manage_users',
  MANAGE_ENROLLMENTS: 'feature:manage_enrollments',
  VIEW_ANALYTICS: 'feature:view_analytics',
  EXPORT_DATA: 'feature:export_data',
};

/**
 * Default permissions by role
 * 
 * Role hierarchy concept:
 * - builder: Core learning experience
 * - staff: Builder access + Staff tools + Volunteer management
 * - admin: Everything (uses wildcard '*')
 * - volunteer: Dashboard + Learning (to follow along) + Volunteer feedback
 * - workshop_participant: Limited builder experience
 * - workshop_admin: Workshop management only
 * - enterprise_builder: Limited builder experience for external cohorts
 * - enterprise_admin: Enterprise builder + their cohort management
 * - applicant: No authenticated page access (uses applicant portal)
 */
export const DEFAULT_ROLE_PERMISSIONS = {
  builder: [
    // Core builder pages
    PAGE_PERMISSIONS.DASHBOARD,
    PAGE_PERMISSIONS.LEARNING,
    PAGE_PERMISSIONS.AI_CHAT,
    PAGE_PERMISSIONS.CALENDAR,
    PAGE_PERMISSIONS.PERFORMANCE,
    PAGE_PERMISSIONS.PATHFINDER,
    PAGE_PERMISSIONS.ASSESSMENT,
    PAGE_PERMISSIONS.ACCOUNT,
    PAGE_PERMISSIONS.PAYMENT,
    PAGE_PERMISSIONS.PLATFORM_INTAKE,
    // Note: volunteer_feedback, staff, and admin pages are NOT included here.
    // Builders only see these nav items when granted custom permissions.
  ],
  
  staff: [
    // All builder permissions
    PAGE_PERMISSIONS.DASHBOARD,
    PAGE_PERMISSIONS.LEARNING,
    PAGE_PERMISSIONS.AI_CHAT,
    PAGE_PERMISSIONS.CALENDAR,
    PAGE_PERMISSIONS.PERFORMANCE,
    PAGE_PERMISSIONS.PATHFINDER,
    PAGE_PERMISSIONS.ASSESSMENT,
    PAGE_PERMISSIONS.ACCOUNT,
    PAGE_PERMISSIONS.PAYMENT,
    PAGE_PERMISSIONS.VOLUNTEER_FEEDBACK,
    
    // Staff section
    PAGE_PERMISSIONS.STAFF_SECTION,
    PAGE_PERMISSIONS.ADMIN_DASHBOARD,
    PAGE_PERMISSIONS.ADMIN_ATTENDANCE,
    PAGE_PERMISSIONS.ADMISSIONS,
    PAGE_PERMISSIONS.CONTENT,
    PAGE_PERMISSIONS.CONTENT_PREVIEW,
    PAGE_PERMISSIONS.FORM_BUILDER,
    PAGE_PERMISSIONS.PATHFINDER_ADMIN,
    PAGE_PERMISSIONS.PAYMENT_ADMIN,
    PAGE_PERMISSIONS.SPUTNIK,
    PAGE_PERMISSIONS.ASSESSMENT_GRADES,
    
    // Volunteer management
    PAGE_PERMISSIONS.VOLUNTEERING,
    PAGE_PERMISSIONS.VOLUNTEER_SECTION,
    PAGE_PERMISSIONS.ADMIN_VOLUNTEER_FEEDBACK,
    PAGE_PERMISSIONS.VOLUNTEER_MANAGEMENT,
    
    // Workshop/Cohort admin (staff can access these)
    PAGE_PERMISSIONS.WORKSHOP_ADMIN,
    PAGE_PERMISSIONS.COHORT_ADMIN,

    // Platform Intake
    PAGE_PERMISSIONS.PLATFORM_INTAKE,

    // Headshot bulk upload tool
    PAGE_PERMISSIONS.HEADSHOT_UPLOAD,

    // NOTE: External Cohorts + Coach (observability/evals) are admin-only pages.
    // They are intentionally NOT staff defaults — staff receive them only via an
    // explicit grant in Permission Management. Keep them out of this list.

    // Feature permissions
    FEATURE_PERMISSIONS.EDIT_CURRICULUM,
  ],
  
  admin: ['*'], // Wildcard = all permissions
  
  volunteer: [
    // Limited access - dashboard + learning to follow content
    PAGE_PERMISSIONS.DASHBOARD,
    PAGE_PERMISSIONS.LEARNING,

    // Volunteer-specific
    PAGE_PERMISSIONS.VOLUNTEERING,
    PAGE_PERMISSIONS.VOLUNTEER_FEEDBACK,
    PAGE_PERMISSIONS.VOLUNTEER_SECTION,
    PAGE_PERMISSIONS.MY_SCHEDULE,
    PAGE_PERMISSIONS.CONTENT_PREVIEW, // Can preview content they'll help with
    PAGE_PERMISSIONS.PLATFORM_INTAKE,
  ],

  workshop_participant: [
    // Limited builder experience
    PAGE_PERMISSIONS.DASHBOARD,
    PAGE_PERMISSIONS.LEARNING,
    PAGE_PERMISSIONS.AI_CHAT,
    PAGE_PERMISSIONS.CALENDAR,
    PAGE_PERMISSIONS.PLATFORM_INTAKE,
  ],

  workshop_admin: [
    // Workshop management only
    PAGE_PERMISSIONS.DASHBOARD,
    PAGE_PERMISSIONS.WORKSHOP_ADMIN,
    PAGE_PERMISSIONS.PLATFORM_INTAKE,
  ],

  enterprise_builder: [
    // Limited builder experience for external cohorts
    PAGE_PERMISSIONS.DASHBOARD,
    PAGE_PERMISSIONS.LEARNING,
    PAGE_PERMISSIONS.AI_CHAT,
    PAGE_PERMISSIONS.CALENDAR,
    PAGE_PERMISSIONS.PLATFORM_INTAKE,
  ],

  enterprise_admin: [
    // Enterprise builder access + cohort management
    PAGE_PERMISSIONS.DASHBOARD,
    PAGE_PERMISSIONS.LEARNING,
    PAGE_PERMISSIONS.AI_CHAT,
    PAGE_PERMISSIONS.CALENDAR,
    PAGE_PERMISSIONS.COHORT_ADMIN,
    PAGE_PERMISSIONS.PLATFORM_INTAKE,
  ],

  // Interview candidates (AI-Native Instructor practical exercise). Read-only by
  // enforcement, not by permission: every Cohort Hub route is gated on the single key
  // page:admin_attendance, which covers reads AND writes, so the server refuses any
  // state-changing request from this role (test-pilot-server middleware/readOnlyRole.js).
  // Kept narrow on purpose — a candidate has no enrollment, so builder pages would be
  // empty, and nothing outside the Cohort Hub is part of the exercise.
  // Must stay in sync with role_permissions (server migration 20260803_candidate_invites.sql).
  candidate: [
    PAGE_PERMISSIONS.ADMIN_DASHBOARD,   // the Cohort Hub page + nav entry
    PAGE_PERMISSIONS.ADMIN_ATTENDANCE,  // gates every Cohort Hub data endpoint
    PAGE_PERMISSIONS.ASSESSMENT_GRADES, // gates the Assessments tab's grade data
  ],
  
  applicant: [
    // No authenticated page access - uses separate applicant portal
  ],
};

/**
 * Helper to check if a role has a specific permission
 * @param {string} role - User's role
 * @param {string} permission - Permission key to check
 * @returns {boolean}
 */
export const roleHasPermission = (role, permission) => {
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
  
  // Admin wildcard
  if (rolePermissions.includes('*')) return true;
  
  return rolePermissions.includes(permission);
};

/**
 * Get all permissions for a role
 * @param {string} role - User's role
 * @returns {string[]} Array of permission keys
 */
export const getRolePermissions = (role) => {
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
};
