import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings, Award, Users, FileText, Brain, X, ArrowRight, Briefcase, Calendar as CalendarIcon, Target, ClipboardList, Heart, Building2, Rocket, Shield, BarChart3, BookOpen, Navigation } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import useNavStore from '../../stores/navStore';
import { usePermissions } from '../../hooks/usePermissions';
import LoadingCurtain from '../LoadingCurtain/LoadingCurtain';
import NavDropdown from './NavDropdown';
import { cn } from '../../lib/utils';
import logo from '../../assets/logo.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7001';

const Layout = ({ children, isLoading = false }) => {
  const [isNavbarHovered, setIsNavbarHovered] = useState(false);
  const [isMobileNavbarOpen, setIsMobileNavbarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // Track which dropdown is open
  const [canViewCoaching, setCanViewCoaching] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const { canAccessPage, userRole } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Permission-based access checks
  const canViewLearning = canAccessPage('learning');
  const canViewAiChat = canAccessPage('ai_chat');
  const canViewCalendar = canAccessPage('calendar');
  const canViewPathfinder = canAccessPage('pathfinder');
  const canViewPerformance = canAccessPage('performance');
  const canViewMySchedule = canAccessPage('my_schedule');
  const canViewAdmissions = canAccessPage('admissions');
  const canViewAssessmentGrades = canAccessPage('assessment_grades');
  const canViewAdminAttendance = canAccessPage('admin_attendance');
  const canViewAdminDashboard = canAccessPage('admin_dashboard');
  const canViewContent = canAccessPage('content');
  const canViewContentPreview = canAccessPage('content_preview');
  const canViewExternalCohorts = canAccessPage('external_cohorts');
  const canViewFormBuilder = canAccessPage('form_builder');
  const canViewTemplateManagement = canAccessPage('template_management');
  const canViewPathfinderAdmin = canAccessPage('pathfinder_admin');
  const canViewPaymentAdmin = canAccessPage('payment_admin');
  const canViewSputnik = canAccessPage('sputnik');
  const canViewAdminPrompts = canAccessPage('admin_prompts');
  const canViewOrganizationManagement = canAccessPage('organization_management');
  const canViewPermissionManagement = canAccessPage('admin_section');
  const canViewVolunteerManagement = canAccessPage('volunteer_management');
  const canViewVolunteerFeedback = canAccessPage('volunteer_feedback');
  const canViewWeeklyReports = canAccessPage('weekly_reports');
  const canViewPlatformAnalytics = canAccessPage('platform_analytics');
  const canViewDemoCohort = canAccessPage('demo_cohort');
  const canViewCoach = canAccessPage('coach');
  const canViewPlatformIntake = canAccessPage('platform_intake');
  const canViewHeadshotUpload = canAccessPage('headshot_upload');

  // Check if on Pathfinder pages for light mode styling
  const isPathfinderPage = location.pathname.startsWith('/pathfinder');
  
  // Role flags for dropdown visibility
  const isStaffOrAdminRole = userRole === 'staff' || userRole === 'admin';
  // Interview candidates hold page:admin_attendance + page:assessment_grades only
  // because the Cohort Hub's data endpoints are gated on them — the Attendance and
  // Assessments PAGES are not part of their exercise, and App.jsx bounces them back to
  // the Cohort Hub. Keep those links out of their nav so nothing dead-ends.
  const isCandidate = userRole === 'candidate';
  // Program dropdown -- staff/admin roles
  const programDropdownItems = isStaffOrAdminRole ? [
    canViewAdminDashboard && { to: '/admin-dashboard', label: 'Cohort Hub' },
    canViewAdminDashboard && { to: '/program-analytics', label: 'Program Analytics' },
    canViewAdminDashboard && { to: '/attendance-viz-lab', label: 'Attendance Viz (Temp)' },
    canViewContentPreview && { to: '/content-preview', label: 'Content Mgmt' },
  ].filter(Boolean) : [];

  // Employment dropdown -- staff/admin roles
  const employmentDropdownItems = isStaffOrAdminRole ? [
    canViewPathfinderAdmin && { to: '/pathfinder/admin', label: 'Pathfinder' },
    canViewSputnik && { to: '/sputnik', label: 'Sputnik' },
    canViewPaymentAdmin && { to: '/payment-admin', label: 'Payments Admin' },
  ].filter(Boolean) : [];

  // Staff dropdown (remaining items) -- staff/admin roles
  const staffDropdownItems = isStaffOrAdminRole ? [
    canViewFormBuilder && { to: '/forms', label: 'Form Builder' },
    canViewTemplateManagement && { to: '/template-management', label: 'Templates' },
    canViewVolunteerManagement && { to: '/volunteer-management', label: 'Volunteers' },
    canViewHeadshotUpload && { to: '/admin/headshots', label: 'Headshot Upload' },
  ].filter(Boolean) : [];

  // Admin dropdown -- staff/admin roles; per-item canView* flags gate the
  // contents, and canShowAdminDropdown (length > 0) hides it when empty.
  const adminDropdownItems = isStaffOrAdminRole ? [
    canViewAdminPrompts && { to: '/admin-prompts', label: 'AI Prompts' },
    canViewExternalCohorts && { to: '/external-cohorts', label: 'External Cohorts' },
    canViewOrganizationManagement && { to: '/admin/organization-management', label: 'Organizations' },
    canViewPermissionManagement && { to: '/admin/permissions', label: 'Permissions' },
    canViewPlatformAnalytics && { to: '/admin/platform-analytics', label: 'Platform Analytics' },
    canViewCoach && { to: '/admin/coach', label: 'Coach' },
    canViewWeeklyReports && { to: '/admin/weekly-reports', label: 'Weekly Reports' },
    canViewDemoCohort && { to: '/admin/demo-cohort-refresh', label: 'Demo Cohort' },
  ].filter(Boolean) : [];

  // Volunteering dashboard visibility
  const canViewVolunteering = canAccessPage('volunteering');

  // Custom-granted items for builders and other non-staff/non-admin roles
  // These appear as flat nav links instead of inside role-labeled dropdowns
  const customGrantedItems = !isStaffOrAdminRole ? [
    canViewAdmissions && { to: '/admissions-dashboard', icon: Users, label: 'Admissions' },
    canViewAssessmentGrades && !isCandidate && { to: '/admin/assessment-grades', icon: Award, label: 'Assessments' },
    canViewAdminAttendance && !isCandidate && { to: '/admin-attendance-dashboard', icon: CalendarIcon, label: 'Attendance' },
    canViewAdminDashboard && { to: '/admin-dashboard', icon: Settings, label: isCandidate ? 'Cohort Hub' : 'Cohort Stats' },
    // Same permission key as the Cohort Hub, and reachable by URL for anyone who holds it —
    // surfacing the link keeps interview candidates (who need the cohort-level trends for
    // their exercise) from having to be sent a raw URL.
    canViewAdminDashboard && { to: '/program-analytics', icon: BarChart3, label: 'Program Analytics' },
    // Enterprise Admin is rendered as an explicit nav link (not in customGrantedItems) to avoid duplication
    // canViewContent && { to: '/content', icon: Target, label: 'Curriculum' }, // hidden — use Content Mgmt instead
    canViewContentPreview && { to: '/content-preview', icon: Target, label: 'Content Mgmt' },
    canViewExternalCohorts && { to: '/external-cohorts', icon: Building2, label: 'External Cohorts' },
    canViewFormBuilder && { to: '/forms', icon: ClipboardList, label: 'Form Builder' },
    canViewTemplateManagement && { to: '/template-management', icon: ClipboardList, label: 'Templates' },
    canViewPathfinderAdmin && { to: '/pathfinder/admin', icon: ArrowRight, label: 'Pathfinder Admin' },
    canViewPaymentAdmin && { to: '/payment-admin', icon: Briefcase, label: 'Payment Admin' },
    canViewSputnik && { to: '/sputnik', icon: Rocket, label: 'Sputnik' },
    canViewAdminPrompts && { to: '/admin-prompts', icon: Brain, label: 'AI Prompts' },
    canViewOrganizationManagement && { to: '/admin/organization-management', icon: Building2, label: 'Organizations' },
    canViewVolunteerManagement && { to: '/volunteer-management', icon: Heart, label: 'Volunteer Mgmt' },
  ].filter(Boolean) : [];

  const canShowProgramDropdown = programDropdownItems.length > 0;
  const canShowEmploymentDropdown = employmentDropdownItems.length > 0;
  const canShowStaffDropdown = staffDropdownItems.length > 0;
  const canShowAdminDropdown = adminDropdownItems.length > 0;

  // Secondary page titles — dropdown children that hide their own header and show title in collapsed nav
  const secondaryPageTitles = {
    '/admin/assessment-grades': 'Assessments',
    '/admin-attendance-dashboard': 'Attendance',
    '/admin-dashboard': 'Cohort Stats',
    '/external-cohorts': 'External Cohorts',
    '/pathfinder/admin': 'Pathfinder',
    '/sputnik': 'Sputnik',
    '/payment-admin': 'Payments Admin',
    '/content-preview': 'Content Mgmt',
    '/forms': 'Form Builder',
    '/volunteer-management': 'Volunteers',
    '/admin-prompts': 'AI Prompts',
    '/admin/organization-management': 'Organizations',
    '/admin/permissions': 'Permissions',
    '/admin/platform-analytics': 'Platform Analytics',
    '/admin/coach': 'Coach',
    '/admin/weekly-reports': 'Weekly Reports',
    '/admin/demo-cohort-refresh': 'Demo Cohort',
    '/admin/headshots': 'Headshot Upload',
  };
  const matchedSecondaryRoute = Object.keys(secondaryPageTitles).find(
    route => location.pathname === route || location.pathname.startsWith(route + '/')
  );
  const isSecondaryNavPage = !!matchedSecondaryRoute;
  const currentSecondaryTitle = matchedSecondaryRoute ? secondaryPageTitles[matchedSecondaryRoute] : null;

  // Sync isSecondaryNavPage to navStore for child components
  const setIsSecondaryNavPage = useNavStore((s) => s.setIsSecondaryNavPage);
  useEffect(() => {
    setIsSecondaryNavPage(isSecondaryNavPage);
  }, [isSecondaryNavPage, setIsSecondaryNavPage]);

  // Detect mobile vs desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Mobile breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check coaching access for builders
  useEffect(() => {
    if (!token || !userRole) return;
    if (userRole !== 'builder') { setCanViewCoaching(true); return; }
    const controller = new AbortController();
    fetch(`${API_URL}/api/coaching/check`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(r => r.json())
      .then(d => { if (!controller.signal.aborted) setCanViewCoaching(!!d.hasCoaching); })
      .catch(() => { if (!controller.signal.aborted) setCanViewCoaching(false); });
    return () => controller.abort();
  }, [token, userRole]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  const toggleMobileNavbar = () => {
    setIsMobileNavbarOpen(!isMobileNavbarOpen);
  };

  const closeMobileNavbar = () => {
    setIsMobileNavbarOpen(false);
  };

  // Get the current page icon for mobile menu button
  const logoIcon = <img src={logo} alt="Logo" className="h-5 w-5 object-contain" />;

  const getCurrentPageIcon = () => {
    const iconMap = {
      '/dashboard': logoIcon,
      '/learning': (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M2 3H8C9.1 3 10 3.9 10 5V19C10 20.1 9.1 21 8 21H2C1.45 21 1 20.55 1 20V4C1 3.45 1.45 3 2 3Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22 3H16C14.9 3 14 3.9 14 5V19C14 20.1 14.9 21 16 21H22C22.55 21 23 20.55 23 20V4C23 3.45 22.55 3 22 3Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 7H14" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 11H14" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 15H14" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      '/ai-chat': (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      '/calendar': (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="16" y1="2" x2="16" y2="6" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="8" y1="2" x2="8" y2="6" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="3" y1="10" x2="21" y2="10" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      '/performance': (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      '/assessment': (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="14,2 14,8 20,8" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="16" y1="13" x2="8" y2="13" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="16" y1="17" x2="8" y2="17" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="10,9 9,9 8,9" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      '/account': (
        <svg width="16" height="16" viewBox="0 0 14 18" fill="none">
          <path d="M7 9C9.20914 9 11 7.20914 11 5C11 2.79086 9.20914 1 7 1C4.79086 1 3 2.79086 3 5C3 7.20914 4.79086 9 7 9Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 17V15C1 13.9391 1.42143 12.9217 2.17157 12.1716C2.92172 11.4214 3.93913 11 5 11H9C10.0609 11 11.0783 11.4214 11.8284 12.1716C12.5786 12.9217 13 13.9391 13 15V17" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    };

    // Program section routes → BookOpen
    const programRoutes = ['/admin/assessment-grades', '/admin-attendance-dashboard', '/admin-dashboard', '/attendance-viz-lab', '/content-preview', '/external-cohorts'];
    if (programRoutes.some(route => location.pathname === route || location.pathname.startsWith(route))) {
      return <BookOpen className="h-4 w-4 text-[#E3E3E3]" />;
    }

    // Admissions flat link → Users
    if (location.pathname === '/admissions-dashboard' || location.pathname.startsWith('/admissions-dashboard/')) {
      return <Users className="h-4 w-4 text-[#E3E3E3]" />;
    }

    // Employment section routes → Briefcase
    const employmentRoutes = ['/pathfinder/admin', '/sputnik', '/payment-admin'];
    if (employmentRoutes.some(route => location.pathname === route || location.pathname.startsWith(route))) {
      return <Briefcase className="h-4 w-4 text-[#E3E3E3]" />;
    }

    // Volunteering flat links → Heart
    if (location.pathname === '/volunteering') {
      return <Heart className="h-4 w-4 text-[#E3E3E3]" />;
    }

    // Staff section routes → Users
    const staffRoutes = ['/forms', '/volunteer-management', '/admin/headshots'];
    if (staffRoutes.some(route => location.pathname === route || location.pathname.startsWith(route))) {
      return <Users className="h-4 w-4 text-[#E3E3E3]" />;
    }

    // Admin section routes → Settings
    const adminRoutes = ['/admin-prompts', '/admin/organization-management', '/admin/permissions', '/admin/platform-analytics', '/admin/coach', '/admin/weekly-reports', '/admin/demo-cohort-refresh'];
    if (adminRoutes.some(route => location.pathname === route || location.pathname.startsWith(route))) {
      return <Settings className="h-4 w-4 text-[#E3E3E3]" />;
    }
    // Pathfinder/Jobs routes (for fellows)
    if (location.pathname.startsWith('/pathfinder') && !location.pathname.startsWith('/pathfinder/admin')) {
      return <Navigation className="h-4 w-4 text-[#E3E3E3]" />;
    }
    // Workshop routes
    if (location.pathname.startsWith('/workshop')) {
      return <CalendarIcon className="h-4 w-4 text-[#E3E3E3]" />;
    }

    return iconMap[location.pathname] || logoIcon;
  };

  // Helper to render nav items (reduces code duplication)
  const renderNavLink = (to, icon, label, condition = true, isActiveCheck = null) => {
    if (!condition) return null;
    
    const isActiveRoute = isActiveCheck ? isActiveCheck() : location.pathname === to || location.pathname.startsWith(to + '/');
    
    if (isMobile && !isMobileNavbarOpen) return null;
    
    const linkClass = cn(
      "relative flex items-center",
      isMobile ? "h-[53px]" : "h-[44px]",
      isActiveRoute ? "bg-[#4242EA]" : "hover:bg-white/10"
    );
    
    const iconContainer = cn(
      "absolute left-0 top-0 flex items-center justify-center",
      isMobile ? "w-[60px] h-[53px]" : "w-[50px] h-[44px]"
    );
    
    const textContainer = cn(
      "flex items-center transition-all duration-300 ease-in-out",
      isMobile 
        ? "ml-[60px]"
        : isNavbarHovered 
          ? "ml-[50px] opacity-100" 
          : "ml-[50px] opacity-0 w-0 overflow-hidden"
    );
    
    return (
      <Link
        to={to}
        onClick={isMobile ? closeMobileNavbar : undefined}
        className={linkClass}
      >
        <div className={iconContainer}>
          {icon}
        </div>
        <div className={textContainer}>
          <span className="text-white text-sm font-medium whitespace-nowrap">{label}</span>
        </div>
      </Link>
    );
  };

  return (
    <div className={cn("flex min-h-screen w-full", isPathfinderPage ? "bg-white" : "bg-background")}>
      {/* Sidebar - Responsive behavior */}
      <nav
        className={cn(
          "bg-[#1E1E1E] flex flex-col fixed left-0 top-0 h-full transition-all duration-300 z-[60]",
          isMobile
            ? isMobileNavbarOpen
              ? "w-[386px]" // Mobile expanded width (overlay)
              : "w-0" // Mobile collapsed: completely hidden
            : isNavbarHovered
              ? "w-[250px]" // Desktop expanded width
              : "w-[50px]" // Desktop collapsed width
        )}
        onMouseEnter={() => !isMobile && setIsNavbarHovered(true)}
        onMouseLeave={() => {
          if (!isMobile) {
            setIsNavbarHovered(false);
            if (!isSecondaryNavPage) {
              setOpenDropdown(null);
            }
          }
        }}
      >
        {/* Mobile Menu Button / Current Page Indicator */}
        {isMobile && (
          <div className="relative">
            <button
              onClick={toggleMobileNavbar}
              className={cn(
                "w-[60px] h-[53px] flex items-center justify-center",
                isMobileNavbarOpen ? "bg-[#4242EA]" : "bg-[#4242EA] hover:bg-blue-600"
              )}
            >
              {getCurrentPageIcon()}
            </button>

            {/* Mobile Close Button */}
            {isMobileNavbarOpen && (
              <button
                onClick={closeMobileNavbar}
                className="absolute right-3 top-3 text-white hover:text-gray-300 z-[80]"
              >
                <X className="h-6 w-6" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Navigation Links Container */}
        <div className="flex-1 overflow-y-auto">
          {/* Navigation Links */}
          {/* Dashboard is the builder home; a candidate has no enrollment so it's empty
              for them (App.jsx redirects them to the Cohort Hub). */}
          {renderNavLink('/dashboard', <img src={logo} alt="Logo" className="h-5 w-5 object-contain" />, 'Dashboard', !isCandidate)}
          
          {/* Learning - permission-based */}
          {renderNavLink('/learning', (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2 3H8C9.1 3 10 3.9 10 5V19C10 20.1 9.1 21 8 21H2C1.45 21 1 20.55 1 20V4C1 3.45 1.45 3 2 3Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 3H16C14.9 3 14 3.9 14 5V19C14 20.1 14.9 21 16 21H22C22.55 21 23 20.55 23 20V4C23 3.45 22.55 3 22 3Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 7H14" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 11H14" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 15H14" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ), 'Learning', canViewLearning)}
          
          {/* AI Chat - permission-based */}
          {renderNavLink('/ai-chat', (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ), 'AI Chat', canViewAiChat)}
          
          {/* Calendar - permission-based */}
          {renderNavLink('/calendar', (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="16" y1="2" x2="16" y2="6" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="8" y1="2" x2="8" y2="6" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="3" y1="10" x2="21" y2="10" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ), 'Calendar', canViewCalendar)}
          
          {/* Jobs dropdown (Pathfinder, Compass, Coaching) - permission-based */}
          <NavDropdown
            id="jobs"
            trigger={{ icon: Navigation, label: "Jobs" }}
            items={[
              { to: '/pathfinder/dashboard', label: 'Pathfinder', activeMatch: (p) => p.startsWith('/pathfinder') && !p.startsWith('/pathfinder/admin') },
              { to: '/compass', label: 'Compass' },
              ...(canViewCoaching ? [{ to: isStaffOrAdminRole ? '/coaching/dashboard' : '/coaching', label: 'Coaching' }] : []),
            ]}
            condition={canViewPathfinder}
            isMobile={isMobile}
            isNavbarHovered={isNavbarHovered}
            isMobileNavbarOpen={isMobileNavbarOpen}
            closeMobileNavbar={closeMobileNavbar}
            isOpen={openDropdown === 'jobs'}
            onToggle={(id) => setOpenDropdown(openDropdown === id ? null : id)}
          />
          
          {/* My Performance - permission-based */}
          {renderNavLink('/performance', (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ), 'Performance', canViewPerformance)}
          
          {/* Program Dropdown (permission-based) */}
          <NavDropdown
            id="program"
            trigger={{ icon: BookOpen, label: "Program" }}
            items={programDropdownItems}
            condition={canShowProgramDropdown}
            isMobile={isMobile}
            isNavbarHovered={isNavbarHovered}
            isMobileNavbarOpen={isMobileNavbarOpen}
            closeMobileNavbar={closeMobileNavbar}
            isOpen={openDropdown === 'program'}
            onToggle={(id) => setOpenDropdown(openDropdown === id ? null : id)}
          />

          {/* Admissions Dashboard - flat link (permission-based) */}
          {renderNavLink('/admissions-dashboard', <Users className="h-4 w-4 text-[#E3E3E3]" />, 'Admissions Dashboard', isStaffOrAdminRole && canViewAdmissions)}

          {/* Employment Dropdown (permission-based) */}
          <NavDropdown
            id="employment"
            trigger={{ icon: Briefcase, label: "Employment" }}
            items={employmentDropdownItems}
            condition={canShowEmploymentDropdown}
            isMobile={isMobile}
            isNavbarHovered={isNavbarHovered}
            isMobileNavbarOpen={isMobileNavbarOpen}
            closeMobileNavbar={closeMobileNavbar}
            isOpen={openDropdown === 'employment'}
            onToggle={(id) => setOpenDropdown(openDropdown === id ? null : id)}
          />

          {/* Staff Dropdown - remaining items (permission-based) */}
          <NavDropdown
            id="staff"
            trigger={{ icon: Users, label: "Staff" }}
            items={staffDropdownItems}
            condition={canShowStaffDropdown}
            isMobile={isMobile}
            isNavbarHovered={isNavbarHovered}
            isMobileNavbarOpen={isMobileNavbarOpen}
            closeMobileNavbar={closeMobileNavbar}
            isOpen={openDropdown === 'staff'}
            onToggle={(id) => setOpenDropdown(openDropdown === id ? null : id)}
          />

          {/* Admin Dropdown - System Tools (admin only, permission-based) */}
          <NavDropdown
            id="admin"
            trigger={{ icon: Settings, label: "Admin" }}
            items={adminDropdownItems}
            condition={canShowAdminDropdown}
            isMobile={isMobile}
            isNavbarHovered={isNavbarHovered}
            isMobileNavbarOpen={isMobileNavbarOpen}
            closeMobileNavbar={closeMobileNavbar}
            isOpen={openDropdown === 'admin'}
            onToggle={(id) => setOpenDropdown(openDropdown === id ? null : id)}
          />

          {/* Volunteers (volunteer-facing dashboard with Schedule/Check-in/Feedback) */}
          {renderNavLink('/volunteering', <Heart className="h-4 w-4 text-[#E3E3E3]" />, 'Volunteers', canViewVolunteering && !isStaffOrAdminRole)}
          
          {/* Custom-granted flat nav links for builders / non-staff roles */}
          {customGrantedItems.map(item => {
            const Icon = item.icon;
            return renderNavLink(item.to, <Icon className="h-4 w-4 text-[#E3E3E3]" />, item.label);
          })}
        </div>

        {/* Account */}
        {/* {renderNavLink('/account', (
          <svg width="16" height="16" viewBox="0 0 14 18" fill="none">
            <path d="M7 9C9.20914 9 11 7.20914 11 5C11 2.79086 9.20914 1 7 1C4.79086 1 3 2.79086 3 5C3 7.20914 4.79086 9 7 9Z" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 17V15C1 13.9391 1.42143 12.9217 2.17157 12.1716C2.92172 11.4214 3.93913 11 5 11H9C10.0609 11 11.0783 11.4214 11.8284 12.1716C12.5786 12.9217 13 13.9391 13 15V17" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ), 'Account')} */}

        {/* Platform Intake — available to all authenticated users */}
        {renderNavLink('/platform-intake', <FileText className="h-4 w-4 text-[#E3E3E3]" />, 'Platform Intake', canViewPlatformIntake)}

        {/* Logout */}
        {(isMobile && isMobileNavbarOpen) || !isMobile ? (
          <button
            onClick={() => {
              handleLogout();
              if (isMobile) closeMobileNavbar();
            }}
            className={cn(
              "relative flex items-center hover:bg-white/10 text-[#E3E3E3] w-full",
              isMobile ? "h-[53px]" : "h-[44px]"
            )}
          >
            <div className={cn(
              "absolute left-0 top-0 flex items-center justify-center",
              isMobile ? "w-[60px] h-[53px]" : "w-[50px] h-[44px]"
            )}>
              <svg width="16" height="16" viewBox="0 0 16 18" fill="none" transform="rotate(90)">
                <path d="M6 17L2 13L6 9" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 13H14" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 7V5C10 3.93913 9.57857 2.92172 8.82843 2.17157C8.07828 1.42143 7.06087 1 6 1H4" stroke="#E3E3E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className={cn(
              "flex items-center transition-all duration-300 ease-in-out",
              isMobile 
                ? "ml-[60px]"
                : isNavbarHovered 
                  ? "ml-[50px] opacity-100" 
                  : "ml-[50px] opacity-0 w-0 overflow-hidden"
            )}>
              <span className="text-white text-sm font-medium whitespace-nowrap">Logout</span>
            </div>
          </button>
        ) : null}
      </nav>
      
      {/* Main Content - Desktop: 50px left margin for collapsed navbar, Mobile: no margin */}
      <main className={cn(
        "flex-1 overflow-auto",
        isPathfinderPage ? "bg-white" : "bg-[#EFEFEF]",
        isMobile ? "ml-0" : "ml-[50px]"
      )}>
        {/* Mobile Header Bar - Only show on mobile */}
        {isMobile && (
          <div className="sticky top-0 z-50 bg-[#E751E7] h-[53px] flex items-center justify-end px-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M8 15C8 15 9.5 13 12 13C14.5 13 16 15 16 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="9" cy="9" r="1" fill="currentColor"/>
                  <circle cx="15" cy="9" r="1" fill="currentColor"/>
                </svg>
                <span className="text-white font-medium">( 3 ) missed assignments</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Page Content */}
        {children}
      </main>
      
      {/* Loading Curtain Overlay */}
      <LoadingCurtain isLoading={isLoading} />
    </div>
  );
};

export default Layout;
