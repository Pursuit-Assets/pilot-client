import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import useAuthStore from '../../../../stores/authStore';

/**
 * Read-only accounts (interview candidates) must never be OFFERED a write control.
 *
 * This isn't cosmetic: the server refuses every state-changing request from the role
 * (test-pilot-server middleware/readOnlyRole.js), and pilot-client's global fetch
 * interceptor is one branch away from treating a 403 as an expired session and logging
 * the user out. A candidate clicking "Add Log" mid-exercise must not be possible.
 *
 * These render the real components (no mocking of usePermissions) so the assertions
 * follow the actual role → isReadOnly → hidden-control path.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

vi.mock('../AttendanceStatusDrawer', () => ({ default: () => null }));
vi.mock('../BuilderDrawer', () => ({ default: () => null }));
vi.mock('../BuilderLogModal', () => ({ default: () => null }));
vi.mock('../../../../components/AttendanceManagement/AttendanceManagement', () => ({ default: () => null }));

import LogsTab from '../../tabs/LogsTab';
import RosterSection from '../RosterSection';

const asRole = (role) => {
  useAuthStore.setState({
    user: { userId: 1, role, userType: role === 'candidate' ? 'candidate' : 'builder' },
    token: 'test-token',
    isAuthenticated: true,
  });
};

const COHORTS = [{ cohort_id: 'c1', name: 'L1 - July 2026', start_date: '2026-07-06' }];

// Every dashboard fetch resolves to an empty-but-valid payload: these assertions are about
// which CONTROLS render, not about the data.
const emptyOk = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ success: true, logs: [], tickets: [], cohortLogs: [], builders: [], summary: {} }),
  });

describe('read-only accounts are not offered write controls', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(emptyOk);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState(useAuthStore.getInitialState());
  });

  describe('LogsTab "Add Log"', () => {
    it('is offered to staff', async () => {
      asRole('staff');
      render(<LogsTab selectedCohortId="c1" cohorts={COHORTS} />);
      await waitFor(() => expect(screen.getByText('Add Log')).toBeInTheDocument());
    });

    it('is withheld from a candidate', async () => {
      asRole('candidate');
      render(<LogsTab selectedCohortId="c1" cohorts={COHORTS} />);
      await flush();
      expect(screen.queryByText('Add Log')).not.toBeInTheDocument();
    });
  });

  describe('RosterSection "Verify Enrollment"', () => {
    it('is withheld from a candidate even when verification is overdue', async () => {
      // The amber "not verified" banner is the trigger for the button; the reminder itself
      // is still information, so only the action is withheld.
      localStorage.removeItem('enrollment_verified_c1');
      asRole('candidate');
      render(<RosterSection selectedCohortId="c1" cohorts={COHORTS} />);
      await flush();
      expect(screen.queryByText('Verify Enrollment')).not.toBeInTheDocument();
    });

    it('is offered to staff when verification is overdue', async () => {
      localStorage.removeItem('enrollment_verified_c1');
      asRole('staff');
      render(<RosterSection selectedCohortId="c1" cohorts={COHORTS} />);
      await waitFor(() => expect(screen.getByText('Verify Enrollment')).toBeInTheDocument());
    });
  });
});
