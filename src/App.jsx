import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { enableErrorTesting } from './utils/errorTestingUtils';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import GPT from './pages/GPT/GPT';
import Calendar from './pages/Calendar/Calendar';
import Learning from './pages/Learning/Learning';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import AdminAttendanceDashboard from './pages/AdminAttendanceDashboard/AdminAttendanceDashboard';
import ProgramAnalytics from './pages/ProgramAnalytics/ProgramAnalytics';
import AttendanceVizLab from './pages/AttendanceVizLab/AttendanceVizLab';
import AdmissionsDashboard from './pages/AdmissionsDashboard';
import ApplicationDetail from './pages/AdmissionsDashboard/ApplicationDetail';
import Content from './pages/Content';
import FacilitatorView from './pages/FacilitatorView';
import AdminPrompts from './pages/AdminPrompts';
import Stats from './pages/Stats';
import Performance from './pages/Performance/Performance';
import Account from './pages/Account/Account';
import Payment from './pages/Payment/Payment';
import Assessment from './pages/Assessment/Assessment';
import AssessmentLayout from './pages/Assessment/components/AssessmentLayout/AssessmentLayout';
import SelfAssessmentPage from './pages/Assessment/components/SelfAssessmentPage/SelfAssessmentPage';
import AssessmentGrades from './pages/AssessmentGrades/AssessmentGrades';

import PaymentAdmin from './pages/PaymentAdmin';
import ExpiredTokenModal from './components/ExpiredTokenModal/ExpiredTokenModal';

// Volunteering Dashboard (volunteer-facing) and Volunteer Management Dashboard (staff-facing)
import VolunteeringDashboard from './pages/VolunteeringDashboard/VolunteeringDashboard';
import VolunteerManagementDashboard from './pages/VolunteerManagementDashboard/VolunteerManagementDashboard';

// Pathfinder pages
import Pathfinder from './pages/Pathfinder';
import PathfinderPersonalDashboard from './pages/Pathfinder/PathfinderPersonalDashboard';
import PathfinderApplications from './pages/PathfinderApplications';
import PathfinderNetworking from './pages/PathfinderNetworking';
import PathfinderProjects from './pages/PathfinderProjects';
import PathfinderEventHub from './pages/PathfinderEventHub/PathfinderEventHub';
import EventDetailPage from './pages/PathfinderEventHub/EventDetailPage';
import PathfinderAdminDashboard from './pages/PathfinderDashboard';
import PathfinderAdmin from './pages/PathfinderAdmin';
import PathfinderNetwork from './pages/PathfinderNetwork';
import PathfinderJobs from './pages/PathfinderJobs';
import MockInterviewSetup from './pages/MockInterview/MockInterviewSetup';
import MockInterviewSession from './pages/MockInterview/MockInterviewSession';
import MockInterviewFeedback from './pages/MockInterview/MockInterviewFeedback';
import MockInterviewHistory from './pages/MockInterview/MockInterviewHistory';
import InterviewRubricAdmin from './pages/MockInterview/InterviewRubricAdmin';
import PathfinderCompass from './pages/PathfinderCompass';
import StaffNetworkDashboard from './pages/StaffNetworkDashboard';
import PathfinderCoaching from './pages/PathfinderCoaching';

import WorkshopAdminDashboard from './pages/WorkshopAdminDashboard/WorkshopAdminDashboard';
import ExternalCohortsDashboard from './pages/ExternalCohortsDashboard/ExternalCohortsDashboard';
import CohortAdminDashboard from './pages/CohortAdminDashboard/CohortAdminDashboard';
import OrganizationManagement from './pages/Admin/OrganizationManagement/OrganizationManagement';
import PermissionManagement from './pages/Admin/PermissionManagement';
import DemoCohortRefresh from './pages/Admin/DemoCohortRefresh/DemoCohortRefresh';
import ContentPreview from './pages/ContentPreview';

// Template Management page
import TemplateManagement from './pages/TemplateManagement';

// Form Builder pages
import FormBuilderDashboard from './pages/FormBuilder/FormBuilderDashboard';
import FormEditor from './pages/FormBuilder/FormEditor';
import FormSubmissions from './pages/FormBuilder/FormSubmissions';
import FormAnalytics from './pages/FormBuilder/FormAnalytics';

// Sales Tracker pages
import SalesTracker from './pages/SalesTracker/SalesTracker';

// Weekly Reports page
import WeeklyReports from './pages/Admin/WeeklyReports/WeeklyReports';

// Platform Analytics page
import PlatformAnalytics from './pages/Admin/PlatformAnalytics/PlatformAnalytics';
import Coach from './pages/Admin/Coach/Coach';

// Headshot Upload page
import HeadshotUploadPage from './pages/HeadshotUpload/HeadshotUploadPage';

// Platform Intake pages
import PlatformIntake from './pages/PlatformIntake/PlatformIntake';
import PlatformIntakeBacklog from './pages/PlatformIntake/PlatformIntakeBacklog';

import useAuthStore from './stores/authStore';
import { resetAuthModalState } from './utils/globalErrorHandler';
import RouteResolver from './components/RouteResolver/RouteResolver';
import { Toaster } from './components/ui/sonner';
import {
  PermissionRoute,
  WorkshopAdminRoute,
  EnterpriseAdminRoute
} from './components/RouteGuards';
import { PAGE_PERMISSIONS } from './constants/permissions';

import './App.css';

function CoachRunsRedirect() {
  const [searchParams] = useSearchParams();
  const thread = searchParams.get('thread');
  const parsed = parseInt(thread, 10);
  const dest = (!isNaN(parsed)) ? `/admin/coach?tab=runs&thread=${parsed}` : '/admin/coach?tab=runs';
  return <Navigate to={dest} replace />;
}

// Where an authenticated user lands on "/". Interview candidates have no enrollment,
// so the builder Dashboard is empty for them — the Cohort Hub is the whole reason they
// have an account.
function HomeRedirect() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={role === 'candidate' ? '/admin-dashboard' : '/dashboard'} replace />;
}

/**
 * Keeps interview candidates inside the Cohort Hub.
 *
 * A candidate holds `page:admin_attendance` and `page:assessment_grades` only because
 * the Cohort Hub's data endpoints are gated on them — those OTHER pages are not part of
 * the exercise. PermissionRoute would happily let them through, so wrap those routes in
 * this instead of widening the permission model. (Writes are separately refused by the
 * server for this role; this is about which pages they see.)
 */
function CohortHubOnly({ children }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'candidate') return <Navigate to="/admin-dashboard" replace />;
  return children;
}

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  
  // Modal state
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'token_expired',
    message: '',
    action: null
  });
  
  // Track if we've already shown a modal this session
  const [hasShownModal, setHasShownModal] = useState(false);
  
  // Reset auth state on app load
  useEffect(() => {
    resetAuthModalState();
    
    // Enable error testing utilities in development
    enableErrorTesting();
  }, []);
  
  // Listen for auth error events from global error handler
  useEffect(() => {
    const handleAuthError = (event) => {
      const { type, message, action } = event.detail;
      
      // Only show modal once per session
      if (hasShownModal) {
        console.log('🚫 Modal already shown this session, ignoring auth error');
        return;
      }
      
      console.log('📱 Opening auth error modal:', { type, message });
      setHasShownModal(true);
      setModalConfig({
        isOpen: true,
        type,
        message,
        action
      });
    };
    
    window.addEventListener('authError', handleAuthError);
    
    return () => {
      window.removeEventListener('authError', handleAuthError);
    };
  }, [hasShownModal]);
  
  // Handle modal redirect/close
  const handleModalRedirect = () => {
    console.log('🔄 Modal button clicked - forcing immediate redirect');
    
    // Close modal immediately
    setModalConfig(prev => ({ ...prev, isOpen: false }));
    
    // Force immediate redirect regardless of type
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth-storage');
    localStorage.removeItem('applicantToken');
    window.location.href = '/login';
  };

  // Protected route component (basic auth check)
  const ProtectedRoute = ({ children }) => {
    if (isLoading) {
      return <div>Loading...</div>;
    }
    
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    
    return children;
  };

  // If auth is still loading, show a minimal loading state
  if (isLoading) {
    return <div className="app-loading">Loading application...</div>;
  }

  return (
    <>
      <Routes>
        {/* Builder routes (with layout) */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <CohortHubOnly>
              <Dashboard />
            </CohortHubOnly>
          </ProtectedRoute>
        } />
        <Route path="/ai-chat" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.AI_CHAT}>
              <GPT />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/calendar" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.CALENDAR}>
              <Calendar />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/learning" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.LEARNING}>
              <Learning />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/assessment" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ASSESSMENT}>
              <Assessment />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/assessment/:period/:assessmentType/:assessmentId" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ASSESSMENT}>
              <RouteResolver
                selfComponent={<SelfAssessmentPage />}
                defaultComponent={<AssessmentLayout />}
              />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/assessment/:period/:assessmentType/:assessmentId/readonly" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ASSESSMENT}>
              <RouteResolver
                selfComponent={<SelfAssessmentPage />}
                defaultComponent={<AssessmentLayout readonly={true} />}
              />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admin-dashboard" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_DASHBOARD}>
              <AdminDashboard />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admin" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_DASHBOARD}>
              <AdminDashboard />
            </PermissionRoute>
          </Layout>
        } />
        {/* Program Analytics is deliberately open to interview candidates — the exercise
            asks them to read cohort-level trends, not just one cohort. */}
        <Route path="/program-analytics" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_DASHBOARD}>
              <ProgramAnalytics />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/attendance-viz-lab" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_DASHBOARD}>
              <CohortHubOnly>
                <AttendanceVizLab />
              </CohortHubOnly>
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admin/assessment-grades" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ASSESSMENT_GRADES}>
              <CohortHubOnly>
                <AssessmentGrades />
              </CohortHubOnly>
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admin-attendance-dashboard" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_ATTENDANCE}>
              <CohortHubOnly>
                <AdminAttendanceDashboard />
              </CohortHubOnly>
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admissions-dashboard" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMISSIONS}>
              <AdmissionsDashboard />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admissions-dashboard/applicant/:applicantId" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMISSIONS}>
              <ApplicationDetail />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/content/*" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.CONTENT}>
              <Content />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admin-prompts" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_PROMPTS}>
              <AdminPrompts />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/facilitator-view" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.STAFF_SECTION}>
              <FacilitatorView />
            </PermissionRoute>
          </Layout>
        } />
        {/* Volunteer Management Dashboard (staff-facing: List, Calendar, Attendance, Feedback) */}
        <Route path="/volunteer-management" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.VOLUNTEER_MANAGEMENT}>
              <VolunteerManagementDashboard />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/admin-volunteer-feedback" element={<Navigate to="/volunteer-management?tab=feedback" replace />} />
        <Route path="/payment-admin" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PAYMENT_ADMIN}>
              <PaymentAdmin />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/workshop-admin-dashboard" element={
          <Layout>
            <WorkshopAdminRoute>
              <WorkshopAdminDashboard />
            </WorkshopAdminRoute>
          </Layout>
        } />
        
        {/* External Cohorts Management (Admin/Staff only) */}
        <Route path="/external-cohorts" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.EXTERNAL_COHORTS}>
              <ExternalCohortsDashboard />
            </PermissionRoute>
          </Layout>
        } />
        
        {/* Organization Management (Admin only) */}
        <Route path="/admin/organization-management" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ORGANIZATION_MANAGEMENT}>
              <OrganizationManagement />
            </PermissionRoute>
          </Layout>
        } />
        
        {/* Demo Cohort Manager (Admin only) */}
        <Route path="/admin/demo-cohort-refresh" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.DEMO_COHORT}>
              <DemoCohortRefresh />
            </PermissionRoute>
          </Layout>
        } />

        {/* Permission Management (Admin only) */}
        <Route path="/admin/permissions" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_SECTION}>
              <PermissionManagement />
            </PermissionRoute>
          </Layout>
        } />
        
        {/* Interview Rubric Management (Admin) */}
        <Route path="/admin/interview-rubrics" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ADMIN_SECTION}>
              <InterviewRubricAdmin />
            </PermissionRoute>
          </Layout>
        } />

        {/* Weekly Reports Management (Admin + custom permission) */}
        <Route path="/admin/weekly-reports" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.WEEKLY_REPORTS}>
              <WeeklyReports />
            </PermissionRoute>
          </Layout>
        } />

        {/* Platform Analytics (Admin only) */}
        <Route path="/admin/platform-analytics" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PLATFORM_ANALYTICS}>
              <PlatformAnalytics />
            </PermissionRoute>
          </Layout>
        } />

        {/* Coach — v2 coach agent: Runs, Evals, Snapshot, Golden Dataset, etc. (admin-only page:coach) */}
        <Route path="/admin/coach" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.COACH}>
              <Coach />
            </PermissionRoute>
          </Layout>
        } />
        {/* Back-compat: old standalone routes redirect into the combined page, forwarding ?thread= */}
        <Route path="/admin/coach-runs" element={<CoachRunsRedirect />} />
        <Route path="/admin/coach-evals" element={<Navigate to="/admin/coach?tab=evals" replace />} />

        {/* Headshot Bulk Upload (Staff + Admin) */}
        <Route path="/admin/headshots" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.HEADSHOT_UPLOAD}>
              <HeadshotUploadPage />
            </PermissionRoute>
          </Layout>
        } />

        {/* Content Preview (Staff/Admin/Volunteer - permission-based) */}
        <Route path="/content-preview" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.CONTENT_PREVIEW}>
              <ContentPreview />
            </PermissionRoute>
          </Layout>
        } />
        
        {/* Enterprise Admin Dashboard (for enterprise admins) */}
        <Route path="/cohort-admin-dashboard" element={
          <Layout>
            <EnterpriseAdminRoute>
              <CohortAdminDashboard />
            </EnterpriseAdminRoute>
          </Layout>
        } />
        
        <Route path="/stats" element={<Navigate to="/performance" replace />} />
        <Route path="/performance" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PERFORMANCE}>
              <Performance />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/account" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.ACCOUNT}>
              <Account />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/payment" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PAYMENT}>
              <Payment />
            </PermissionRoute>
          </Layout>
        } />
        
        {/* Pathfinder routes - personal view with nested routes */}
        <Route path="/pathfinder/*" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PATHFINDER}>
              <Pathfinder />
            </PermissionRoute>
          </Layout>
        }>
          <Route path="dashboard" element={<PathfinderPersonalDashboard />} />
          <Route path="applications" element={<PathfinderApplications />} />
          <Route path="networking" element={<PathfinderNetworking />} />
          <Route path="projects" element={<PathfinderProjects />} />
          <Route path="events" element={<PathfinderEventHub />} />
          <Route path="events/:eventId" element={<EventDetailPage />} />
          <Route path="network" element={<PathfinderNetwork />} />
          <Route path="jobs" element={<PathfinderJobs />} />
          <Route
            path="staff-network"
            element={
              <PermissionRoute permission={PAGE_PERMISSIONS.PATHFINDER_ADMIN}>
                <StaffNetworkDashboard />
              </PermissionRoute>
            }
          />
          <Route path="mock-interview" element={<MockInterviewSetup />} />
          <Route path="mock-interview/session/:interviewId" element={<MockInterviewSession />} />
          <Route path="mock-interview/feedback/:interviewId" element={<MockInterviewFeedback />} />
          <Route path="mock-interview/history" element={<MockInterviewHistory />} />
        </Route>
        
        {/* Compass - top-level route */}
        <Route path="/compass" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PATHFINDER}>
              <PathfinderCompass />
            </PermissionRoute>
          </Layout>
        } />

        {/* Coaching - top-level route */}
        <Route path="/coaching/*" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PATHFINDER}>
              <PathfinderCoaching />
            </PermissionRoute>
          </Layout>
        } />

        {/* Pathfinder admin dashboard - separate route */}
        <Route path="/pathfinder-admin" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PATHFINDER_ADMIN}>
              <PathfinderAdminDashboard />
            </PermissionRoute>
          </Layout>
        } />

        {/* New Pathfinder Admin page */}
        <Route path="/pathfinder/admin" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.PATHFINDER_ADMIN}>
              <PathfinderAdmin />
            </PermissionRoute>
          </Layout>
        } />

        {/* Volunteering Dashboard (volunteer-facing: Schedule, Check In, Feedback) */}
        <Route path="/volunteering" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.VOLUNTEERING}>
              <VolunteeringDashboard />
            </PermissionRoute>
          </Layout>
        } />

        {/* Redirects from old volunteer routes to new tabbed dashboards */}
        <Route path="/volunteer-feedback" element={<Navigate to="/volunteering?tab=feedback" replace />} />
        <Route path="/volunteer-checkin" element={<Navigate to="/volunteering?tab=checkin" replace />} />
        <Route path="/my-schedule" element={<Navigate to="/volunteering?tab=schedule" replace />} />
        <Route path="/volunteer-list" element={<Navigate to="/volunteer-management?tab=list" replace />} />
        <Route path="/volunteer-roster" element={<Navigate to="/volunteer-management?tab=calendar" replace />} />
        <Route path="/volunteer-attendance" element={<Navigate to="/volunteer-management?tab=attendance" replace />} />

        {/* Template Management (Staff/Admin) */}
        <Route path="/template-management" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.TEMPLATE_MANAGEMENT}>
              <TemplateManagement />
            </PermissionRoute>
          </Layout>
        } />

        {/* Form Builder routes (Admin/Staff only) */}
        <Route path="/forms" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.FORM_BUILDER}>
              <FormBuilderDashboard />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/forms/new" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.FORM_BUILDER}>
              <FormEditor />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/forms/:formId/edit" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.FORM_BUILDER}>
              <FormEditor />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/forms/:formId/submissions" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.FORM_BUILDER}>
              <FormSubmissions />
            </PermissionRoute>
          </Layout>
        } />
        <Route path="/forms/:formId/analytics" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.FORM_BUILDER}>
              <FormAnalytics />
            </PermissionRoute>
          </Layout>
        } />

        {/* Sputnik routes (Admin/Staff only) */}
        <Route path="/sputnik" element={
          <Layout>
            <PermissionRoute permission={PAGE_PERMISSIONS.SPUTNIK}>
              <SalesTracker />
            </PermissionRoute>
          </Layout>
        } />

        {/* Platform Intake — all authenticated users */}
        <Route path="/platform-intake" element={
          <ProtectedRoute>
            <PlatformIntake />
          </ProtectedRoute>
        } />

        {/* Platform Intake Backlog — all authenticated users */}
        <Route path="/platform-intake/backlog" element={
          <ProtectedRoute>
            <PlatformIntakeBacklog />
          </ProtectedRoute>
        } />

        <Route path="/" element={<HomeRedirect />} />
      </Routes>
      
      {/* Global Auth Error Modal */}
      <ExpiredTokenModal
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        message={modalConfig.message}
        onRedirect={handleModalRedirect}
      />
      
      {/* Toast Notifications */}
      <Toaster />
    </>
  );
}

export default App;
