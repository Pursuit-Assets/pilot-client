import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PAGE_PERMISSIONS,
  roleHasPermission,
} from '../permissions';

/**
 * The `candidate` role exists for one purpose: an interview candidate reading the Cohort
 * Hub for their practical exercise. These assertions pin that scope — the fallback list
 * here must keep matching the server's role_permissions rows
 * (test-pilot-server db/migrations/20260803_candidate_invites.sql), since this list is
 * what drives nav + route guards whenever the DB permission fetch fails.
 */
describe('candidate role default permissions', () => {
  it('can open the Cohort Hub', () => {
    expect(roleHasPermission('candidate', PAGE_PERMISSIONS.ADMIN_DASHBOARD)).toBe(true);
  });

  it('holds the two keys the Cohort Hub data endpoints are gated on', () => {
    // Every route in routes/adminDashboard.js requires page:admin_attendance, and the
    // Assessments tab additionally needs page:assessment_grades. Drop either and the
    // dashboard renders empty.
    expect(roleHasPermission('candidate', PAGE_PERMISSIONS.ADMIN_ATTENDANCE)).toBe(true);
    expect(roleHasPermission('candidate', PAGE_PERMISSIONS.ASSESSMENT_GRADES)).toBe(true);
  });

  it('gets no builder-facing pages — a candidate has no enrollment, so they render empty', () => {
    for (const key of [
      PAGE_PERMISSIONS.DASHBOARD,
      PAGE_PERMISSIONS.LEARNING,
      PAGE_PERMISSIONS.AI_CHAT,
      PAGE_PERMISSIONS.CALENDAR,
      PAGE_PERMISSIONS.PERFORMANCE,
      PAGE_PERMISSIONS.ASSESSMENT,
      PAGE_PERMISSIONS.PATHFINDER,
      PAGE_PERMISSIONS.PLATFORM_INTAKE,
    ]) {
      expect(roleHasPermission('candidate', key)).toBe(false);
    }
  });

  it('gets none of the staff or admin surfaces', () => {
    for (const key of [
      PAGE_PERMISSIONS.ADMISSIONS,
      PAGE_PERMISSIONS.CONTENT,
      PAGE_PERMISSIONS.CONTENT_PREVIEW,
      PAGE_PERMISSIONS.FORM_BUILDER,
      PAGE_PERMISSIONS.ADMIN_SECTION,
      PAGE_PERMISSIONS.ADMIN_PROMPTS,
      PAGE_PERMISSIONS.COACH,
      PAGE_PERMISSIONS.PAYMENT_ADMIN,
      PAGE_PERMISSIONS.EXTERNAL_COHORTS,
      PAGE_PERMISSIONS.VOLUNTEER_MANAGEMENT,
      PAGE_PERMISSIONS.ORGANIZATION_MANAGEMENT,
    ]) {
      expect(roleHasPermission('candidate', key)).toBe(false);
    }
  });

  it('is exactly three permissions — widening it should be a deliberate edit', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.candidate).toHaveLength(3);
  });

  it('never carries the admin wildcard', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.candidate).not.toContain('*');
  });
});
