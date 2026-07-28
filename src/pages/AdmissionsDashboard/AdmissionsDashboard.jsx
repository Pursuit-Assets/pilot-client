import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import NotesModal from '../../components/NotesModal';
import BulkActionsModal from '../../components/BulkActionsModal';
import Swal from 'sweetalert2';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

// Lazy load tab components for better performance
const OverviewTab = lazy(() => import('./components/OverviewTab/OverviewTab'));
const ApplicationsTab = lazy(() => import('./components/ApplicationsTab/ApplicationsTab'));
const InfoSessionsTab = lazy(() => import('./components/InfoSessionsTab/InfoSessionsTab'));
const WorkshopsTab = lazy(() => import('./components/WorkshopsTab/WorkshopsTab'));
const LeadsTab = lazy(() => import('./components/LeadsTab/LeadsTab'));
const EmailsTab = lazy(() => import('./components/EmailsTab/EmailsTab'));
const SettingsTab = lazy(() => import('./components/SettingsTab/SettingsTab'));

const AdmissionsDashboard = () => {
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Check for tab parameter in URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam && ['overview', 'applications', 'info-sessions', 'workshops', 'leads', 'emails', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  // Data state
  const [stats, setStats] = useState(null);
  // Applicant list is one row per applicant from the API. With a cohort selected, the server joins the
  // latest application row for that applicant within that cohort (newest created_at / application_id).
  const [applications, setApplications] = useState([]);
  const [infoSessions, setInfoSessions] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [demographicFilters, setDemographicFilters] = useState({ race: 'all', gender: 'all', education: 'all', borough: 'all' });
  const [demographicFilter, setDemographicFilter] = useState('race');
  const [cohorts, setCohorts] = useState([]);
  
  // Demographics modal for KPI tiles
  const [demographicsModalOpen, setDemographicsModalOpen] = useState(false);
  const [demographicsModalTitle, setDemographicsModalTitle] = useState('');
  const [demographicsModalView, setDemographicsModalView] = useState('race');
  const [demographicsModalData, setDemographicsModalData] = useState({ race: [], gender: [], education: [] });
  
  // Overview stage demographics
  const [activeOverviewStage, setActiveOverviewStage] = useState('applied');
  const [stageDemographics, setStageDemographics] = useState({ race: [], gender: [], education: [], age: [], referral: [] });
  const [averageIncome, setAverageIncome] = useState(null);
  
  // Application status filter for demographics
  const [applicantStatusFilter, setApplicantStatusFilter] = useState('all');
  const [submittedAssessmentBreakdown, setSubmittedAssessmentBreakdown] = useState(null);
  const [genderHover, setGenderHover] = useState(null);
  const [overviewDetailsOpen, setOverviewDetailsOpen] = useState(false);
  
  // Modal for showing filtered applicants by demographic
  const [demographicApplicantsModalOpen, setDemographicApplicantsModalOpen] = useState(false);
  const [demographicApplicantsFilter, setDemographicApplicantsFilter] = useState(null);
  const [filteredApplicants, setFilteredApplicants] = useState([]);
  const [filteredApplicantsLoading, setFilteredApplicantsLoading] = useState(false);
  const [stageDetailedApplicantsCache, setStageDetailedApplicantsCache] = useState({ key: '', rows: [] });
  
  // Modal for showing filtered applications from KPI tiles
  const [applicationsModalOpen, setApplicationsModalOpen] = useState(false);
  const [applicationsModalFilter, setApplicationsModalFilter] = useState(null);
  const [modalApplications, setModalApplications] = useState([]);
  const [modalApplicationsLoading, setModalApplicationsLoading] = useState(false);
  
  // CSV export tracking
  const [exportSelections, setExportSelections] = useState(new Set());

  // Pagination state
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(() => {
    try {
      const saved = sessionStorage.getItem('admissions-dashboard-filters-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.currentPage || 1;
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
    return 1;
  });
  const [searchIndex, setSearchIndex] = useState([]);
  const [searchIndexLoading, setSearchIndexLoading] = useState(false);
  const [loadAllMode, setLoadAllMode] = useState(false); // Never persist - always start in paginated mode

  // Tracks whether applyCurrentCycleDefault has run during THIS mount.
  // Scope is intentionally per-mount (not persisted to sessionStorage) so a
  // page reload or route-revisit re-applies the current-cycle default on both
  // Overview and Applicants. Mid-session refetches (e.g., after a bulk action)
  // still find the ref true and skip — preserving an explicit All Time choice
  // within the session. Do not re-seed this from sessionStorage; that pattern
  // (previously here) broke the current-cycle default on every reload.
  const cycleDefaultAppliedRef = useRef(false);

  // Application filters and sorting
  const [applicationFilters, setApplicationFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem('admissions-dashboard-filters-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate legacy string filters to arrays
        const toArray = (val) => {
          if (Array.isArray(val)) return val;
          if (typeof val === 'string' && val !== '') return [val];
          return [];
        };
        return {
          status: toArray(parsed.applicationFilters?.status),
          final_status: toArray(parsed.applicationFilters?.final_status),
          info_session_status: toArray(parsed.applicationFilters?.info_session_status),
          workshop_status: toArray(parsed.applicationFilters?.workshop_status),
          program_admission_status: toArray(parsed.applicationFilters?.program_admission_status),
          enrollment_status: toArray(parsed.applicationFilters?.enrollment_status),
          source_bucket: toArray(parsed.applicationFilters?.source_bucket),
          account_age_bucket: toArray(parsed.applicationFilters?.account_age_bucket),
          application_age_bucket: toArray(parsed.applicationFilters?.application_age_bucket),
          last_activity_bucket: toArray(parsed.applicationFilters?.last_activity_bucket),
          structured_task_grade: toArray(parsed.applicationFilters?.structured_task_grade),
          ready_for_workshop_invitation: false,
          name_search: '',
          cohort_id: parsed.applicationFilters?.cohort_id || '',
          deliberation: toArray(parsed.applicationFilters?.deliberation),
          pledge_completed: toArray(parsed.applicationFilters?.pledge_completed),
          gja_signed: toArray(parsed.applicationFilters?.gja_signed),
          limit: PAGE_SIZE,
          offset: 0
        };
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
    return {
      status: [],
      final_status: [],
      info_session_status: [],
      workshop_status: [],
      program_admission_status: [],
      enrollment_status: [],
      source_bucket: [],
      account_age_bucket: [],
      application_age_bucket: [],
      last_activity_bucket: [],
      structured_task_grade: [],
      ready_for_workshop_invitation: false,
      name_search: '',
      cohort_id: '',
      deliberation: [],
      pledge_completed: [],
      gja_signed: [],
      limit: PAGE_SIZE,
      offset: 0
    };
  });

  const [hasMore, setHasMore] = useState(true);
  const [columnSort, setColumnSort] = useState(() => {
    try {
      const saved = sessionStorage.getItem('admissions-dashboard-filters-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.columnSort || { column: 'created_at', direction: 'desc' };
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
    return { column: 'created_at', direction: 'desc' };
  });

  // Column visibility state
  const defaultVisibleColumns = {
    name: true,
    email: true,
    phone: true,
    app_start_date: false,
    status: true,
    assessment: true,
    info_session: true,
    workshop: true,
    structured_task_grade: true,
    admission: true,
    enrollment: true,
    cohort: true,
    source_bucket: false,
    account_age_bucket: false,
    application_age_bucket: false,
    last_activity_bucket: true,
    notes: true,
    deliberation: true,
    age: false,
    gender: false,
    race: false,
    education: false,
    referral: false,
    referral_detail: false,
    referral_channel: false,
    pledge: false,
    gja: true,
    income: false
  };

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = sessionStorage.getItem('admissions-dashboard-filters-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.visibleColumns) {
          // Merge saved state with defaults so new columns are always present
          return { ...defaultVisibleColumns, ...parsed.visibleColumns };
        }
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
    return defaultVisibleColumns;
  });


  // Overview quick views state

  const [overviewQuickView, setOverviewQuickView] = useState('');
  const [overviewDeliberationFilter, setOverviewDeliberationFilter] = useState('');

  // Event registrations management
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventRegistrations, setEventRegistrations] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Notes modal management
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);

  // Info session form state
  const [infoSessionModalOpen, setInfoSessionModalOpen] = useState(false);
  const [editingInfoSession, setEditingInfoSession] = useState(null);
  const [infoSessionForm, setInfoSessionForm] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    location: '',
    capacity: 50,
    is_online: false,
    meeting_link: ''
  });
  const [infoSessionSubmitting, setInfoSessionSubmitting] = useState(false);

  // Workshop form state
  const [workshopModalOpen, setWorkshopModalOpen] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState(null);
  const [workshopForm, setWorkshopForm] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    location: 'Pursuit NYC Campus - 47-10 Austell Pl 2nd floor, Long Island City, NY',
    capacity: 50,
    is_online: false,
    meeting_link: '',
    cohort_name: 'Admissions Workshop',
    workshop_type: 'admissions',
    access_window_days: 0,
    allow_early_access: false
  });
  const [workshopSubmitting, setWorkshopSubmitting] = useState(false);
  
  // Available cohorts for workshops
  const [availableCohorts, setAvailableCohorts] = useState([]);
  const [loadingCohorts, setLoadingCohorts] = useState(true);

  // Bulk actions state
  const [selectedApplicants, setSelectedApplicants] = useState([]);
  const [bulkActionsModalOpen, setBulkActionsModalOpen] = useState(false);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  
  // Filter dropdown state
  const [openFilterColumn, setOpenFilterColumn] = useState(null);

  // Manual registration state
  const [addRegistrationModalOpen, setAddRegistrationModalOpen] = useState(false);
  const [selectedEventForRegistration, setSelectedEventForRegistration] = useState(null);
  const [selectedEventType, setSelectedEventType] = useState(null);
  const [applicantSearch, setApplicantSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedApplicantsForRegistration, setSelectedApplicantsForRegistration] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [laptopNeeds, setLaptopNeeds] = useState({});

  // Event filtering state
  const [showInactiveInfoSessions, setShowInactiveInfoSessions] = useState(false);
  const [showInactiveWorkshops, setShowInactiveWorkshops] = useState(false);

  // Email automation state
  const [emailStats, setEmailStats] = useState(null);
  const [queuedEmails, setQueuedEmails] = useState([]);
  const [emailHistory, setEmailHistory] = useState([]);
  const [applicantEmailStatus, setApplicantEmailStatus] = useState([]);
  const [emailAutomationLoading, setEmailAutomationLoading] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testEmailLoading, setTestEmailLoading] = useState(false);

  // Email mappings state
  const [emailMappings, setEmailMappings] = useState([]);
  const [emailMappingsLoading, setEmailMappingsLoading] = useState(false);

  // Check if user has admin access
  const hasAdminAccess = canAccessPage('admissions');

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isTableHeader = event.target.closest('th');
      const isColumnToggle = event.target.closest('[data-column-toggle]');
      
      if (openFilterColumn && !isTableHeader && !isColumnToggle) {
        setOpenFilterColumn(null);
      }
    };

    if (openFilterColumn) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openFilterColumn]);

  // Helper: map overview quick view to a cohort_id or 'deferred'
  const getCurrentActiveCohort = (candidateCohorts = []) => {
    const now = new Date();
    return [...candidateCohorts]
      .filter((cohort) => {
        if (!cohort?.cohort_id) return false;
        const name = (cohort.name || '').toLowerCase();
        if (!name.includes('l1')) return false;
        const cutoffOrStart = cohort.cutoff_date || cohort.start_date;
        return cutoffOrStart && new Date(cutoffOrStart) >= now;
      })
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0] || null;
  };

  const applyCurrentCycleDefault = (candidateCohorts = []) => {
    if (cycleDefaultAppliedRef.current) return;

    const currentActive = getCurrentActiveCohort(candidateCohorts);
    if (!currentActive?.cohort_id) return;

    if (!overviewQuickView) {
      setOverviewQuickView(currentActive.cohort_id);
    }

    setApplicationFilters(prev => {
      if (prev.cohort_id) return prev;
      return { ...prev, cohort_id: currentActive.cohort_id, offset: 0 };
    });

    cycleDefaultAppliedRef.current = true;
  };

  const getOverviewCohortParam = () => {
    if (!overviewQuickView || overviewQuickView === 'all_time') return '';
    if (overviewQuickView === 'deferred') return 'deferred';
    
    // If it's a UUID (cohort_id), return it directly
    // UUIDs are 36 characters with hyphens
    if (overviewQuickView.length === 36 && overviewQuickView.includes('-')) {
      return overviewQuickView;
    }

    // Legacy support for hardcoded values (can be removed later)
    const norm = (s) => (s || '').toLowerCase();
    const candidates = cohorts || [];

    if (overviewQuickView === 'dec2025') {
      const match = candidates.find(c => {
        const n = norm(c.name);
        return (n.includes('dec') || n.includes('december')) && n.includes('2025');
      });
      return match?.cohort_id || '';
    }

    if (overviewQuickView === 'sep2025') {
      const match = candidates.find(c => {
        const n = norm(c.name);
        return (n.includes('sep') || n.includes('september')) && n.includes('2025');
      });
      return match?.cohort_id || '';
    }

    return '';
  };

  // Fetch cohorts
  // ============================================================================
  // TAB-SPECIFIC DATA FETCHING - Lazy Loading Per Tab
  // ============================================================================

  // Fetch overview tab data
  const fetchOverviewData = async () => {
    if (!hasAdminAccess || !token) {
      setError('You do not have permission to view this page.');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (applicationFilters.cohort_id) {
        params.append('cohort_id', applicationFilters.cohort_id);
      }
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/dashboard/overview?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error('Failed to fetch overview data');
      
      const data = await response.json();
      setStats(data.stats);
      setCohorts(data.cohorts);
      // Note: Overview endpoint no longer returns applications to prevent timeout
      // Applications are fetched separately per-tab as needed
    } catch (error) {
      console.error('Error fetching overview data:', error);
      setError('Failed to load overview data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch search index for fast client-side filtering
  const fetchSearchIndex = async (cohortId = '') => {
    if (!hasAdminAccess || !token) return;
    
    try {
      setSearchIndexLoading(true);
      const params = new URLSearchParams();
      if (cohortId) {
        params.append('cohort_id', cohortId);
      }
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/dashboard/applications/search-index?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error('Failed to fetch search index');
      
      const data = await response.json();
      setSearchIndex(data);
    } catch (error) {
      console.error('Error fetching search index:', error);
    } finally {
      setSearchIndexLoading(false);
    }
  };

  // Fetch applications tab data
  const fetchApplicationsData = async () => {
    if (!hasAdminAccess || !token) return;
    
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      // Calculate offset and limit based on load all mode
      const offset = loadAllMode ? 0 : (currentPage - 1) * PAGE_SIZE;
      const limit = loadAllMode ? 10000 : PAGE_SIZE;
      
      // Add filter parameters (skip limit and offset as we calculate them above)
      Object.entries(applicationFilters).forEach(([key, value]) => {
        if (key === 'limit' || key === 'offset') {
          // Skip - we calculate these separately based on loadAllMode
          return;
        }
        // Array filters: send as comma-separated values
        if (Array.isArray(value)) {
          if (value.length > 0) {
            params.append(key, value.join(','));
          }
        } else if (value !== '' && value !== false) {
          params.append(key, value);
        }
      });
      
      // Set limit and offset from our calculated values
      params.append('limit', limit);
      params.append('offset', offset);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/dashboard/applications?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error('Failed to fetch applications data');
      
      const data = await response.json();
      setApplications(data.applications);
      setCohorts(data.cohorts);
      setHasMore(data.applications?.applications?.length < data.applications?.total);
    } catch (error) {
      console.error('Error fetching applications data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch info sessions tab data
  const fetchInfoSessionsData = async () => {
    if (!hasAdminAccess || !token) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/dashboard/info-sessions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error('Failed to fetch info sessions data');
      
      const data = await response.json();
      setInfoSessions(data.infoSessions);
      setCohorts(data.cohorts);
    } catch (error) {
      console.error('Error fetching info sessions data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch workshops tab data
  const fetchWorkshopsData = async () => {
    if (!hasAdminAccess || !token) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/dashboard/workshops`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error('Failed to fetch workshops data');
      
      const data = await response.json();
      setWorkshops(data.workshops);
      setAvailableCohorts(data.workshopCohorts.map(c => c.name));
    } catch (error) {
      console.error('Error fetching workshops data:', error);
      setAvailableCohorts(['Admissions Workshop']);
    } finally {
      setLoading(false);
      setLoadingCohorts(false);
    }
  };

  // Fetch emails tab data
  const fetchEmailsData = async () => {
    if (!hasAdminAccess || !token) return;
    
    try {
      setEmailAutomationLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/dashboard/emails`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error('Failed to fetch emails data');
      
      const data = await response.json();
      setEmailStats(data.emailStats);
      setQueuedEmails(data.queuedEmails);
      setEmailHistory(data.emailHistory);
      setApplicantEmailStatus(data.applicantEmailStatus);
    } catch (error) {
      console.error('Error fetching emails data:', error);
    } finally {
      setEmailAutomationLoading(false);
    }
  };

  // Fetch email mappings data
  const fetchEmailMappings = async (page = 1, search = '') => {
    if (!hasAdminAccess || !token) return;
    
    try {
      setEmailMappingsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25'
      });
      
      if (search) {
        params.append('search', search);
      }
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/email-mappings?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch email mappings data');
      }
      
      const mappingsData = await response.json();
      
      setEmailMappings(mappingsData.data);
    } catch (error) {
      console.error('Error fetching email mappings:', error);
    } finally {
      setEmailMappingsLoading(false);
    }
  };

  // ============================================================================
  // USE EFFECT HOOKS - Tab-Based Data Loading
  // ============================================================================

  // Initial load - only overview tab
  useEffect(() => {
    if (hasAdminAccess && token) {
      fetchOverviewData();
    }
  }, [token, hasAdminAccess]);

  // Apply the current-cycle default once cohorts are known. Centralized here so
  // the three tab fetchers can't race each other on first render.
  useEffect(() => {
    if (cohorts && cohorts.length > 0) {
      applyCurrentCycleDefault(cohorts);
    }
  }, [cohorts]);

  // Tab-specific data loading - lazy load when switching tabs
  useEffect(() => {
    if (!hasAdminAccess || !token) return;
    
    switch (activeTab) {
      case 'overview':
        // Overview already loaded on initial mount
        if (!stats) fetchOverviewData();
        break;
      case 'applications':
        // Load applications tab data if not already loaded
        if (!applications.applications || applications.applications.length === 0) {
          fetchApplicationsData();
        }
        break;
      case 'info-sessions':
        // Load info sessions tab data if not already loaded
        if (infoSessions.length === 0) {
          fetchInfoSessionsData();
        }
        break;
      case 'workshops':
        // Load workshops tab data if not already loaded
        if (workshops.length === 0) {
          fetchWorkshopsData();
        }
        break;
      case 'emails':
        // Load emails tab data if not already loaded
        if (!emailStats) {
          fetchEmailsData();
        }
        break;
      default:
        break;
    }
  }, [activeTab, hasAdminAccess, token]);

  // Applications tab - refetch when filters or page change
  useEffect(() => {
    if (hasAdminAccess && token && activeTab === 'applications') {
      fetchApplicationsData();
    }
  }, [applicationFilters, currentPage, loadAllMode, token, hasAdminAccess, activeTab]);

  // Fetch search index when cohort changes or when switching to applications tab
  useEffect(() => {
    if (hasAdminAccess && token && activeTab === 'applications') {
      fetchSearchIndex(applicationFilters.cohort_id);
    }
  }, [applicationFilters.cohort_id, activeTab, token, hasAdminAccess]);

  // Reset load all mode when filters change
  useEffect(() => {
    if (loadAllMode) {
      setLoadAllMode(false);
      setCurrentPage(1);
    }
  }, [applicationFilters]);

  // Save filter state to sessionStorage
  useEffect(() => {
    try {
      const stateToSave = {
        applicationFilters: {
          status: applicationFilters.status,
          final_status: applicationFilters.final_status,
          info_session_status: applicationFilters.info_session_status,
          workshop_status: applicationFilters.workshop_status,
          program_admission_status: applicationFilters.program_admission_status,
          enrollment_status: applicationFilters.enrollment_status,
          source_bucket: applicationFilters.source_bucket,
          account_age_bucket: applicationFilters.account_age_bucket,
          application_age_bucket: applicationFilters.application_age_bucket,
          last_activity_bucket: applicationFilters.last_activity_bucket,
          structured_task_grade: applicationFilters.structured_task_grade,
          cohort_id: applicationFilters.cohort_id,
          deliberation: applicationFilters.deliberation,
          pledge_completed: applicationFilters.pledge_completed,
          gja_signed: applicationFilters.gja_signed
        },
        columnSort,
        currentPage,
        visibleColumns
        // Note: loadAllMode is NOT saved - always return to paginated view
      };
      sessionStorage.setItem('admissions-dashboard-filters-v1', JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Error saving filters to sessionStorage:', error);
    }
  }, [applicationFilters, columnSort, currentPage, visibleColumns]);

  // Handle page change
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    setSelectedApplicants([]); // Clear selections when changing pages
  };

  // Handle load all applicants
  const handleLoadAll = async () => {
    const totalCount = applications?.total || 0;
    
    // Show confirmation if count > 500
    if (totalCount > 500) {
      const result = await Swal.fire({
        title: 'Load All Applicants?',
        text: `This will load ${totalCount} applicants. This may take a moment.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#4242ea',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, load all',
        cancelButtonText: 'Cancel'
      });
      
      if (!result.isConfirmed) {
        return;
      }
    }
    
    // Enable load all mode and fetch
    setLoadAllMode(true);
    setCurrentPage(1);
    setSelectedApplicants([]); // Clear selections
  };

  // Handle return to paginated view
  const handleReturnToPagination = () => {
    setLoadAllMode(false);
    setCurrentPage(1);
    setSelectedApplicants([]); // Clear selections
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // Handle bulk action
  const handleBulkAction = async (action, customSubject = '', customBody = '') => {
    if (selectedApplicants.length === 0) return;

    setBulkActionInProgress(true);
    try {
      const requestBody = {
        action,
        applicant_ids: selectedApplicants
      };

      if (action === 'send_custom_email') {
        requestBody.custom_subject = customSubject;
        requestBody.custom_body = customBody;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/bulk-actions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        await fetchApplicationsData();
        setSelectedApplicants([]);
        setBulkActionsModalOpen(false);
        setError(null);
      } else {
        const errorData = await response.json();
        setError(`Bulk action failed: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
      setError('Failed to perform bulk action. Please try again.');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  // Handle notes modal
  const openNotesModal = (applicant) => {
    setSelectedApplicant(applicant);
    setNotesModalOpen(true);
  };

  const closeNotesModal = () => {
    setNotesModalOpen(false);
    setSelectedApplicant(null);
  };

  // Handle column sorting
  const handleColumnSort = (column) => {
    setColumnSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Handle deliberation change
  const handleDeliberationChange = async (applicantId, newValue) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/applicants/${applicantId}/deliberation`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ deliberation: newValue })
      });

      if (!response.ok) {
        throw new Error('Failed to update deliberation');
      }

      setApplications(prev => ({
        ...prev,
        applications: prev.applications.map(app =>
          app.applicant_id === applicantId
            ? { ...app, deliberation: newValue }
            : app
        )
      }));

      Swal.fire({
        icon: 'success',
        title: 'Updated!',
        text: 'Deliberation status has been updated',
        timer: 1500,
        showConfirmButton: false
      });

    } catch (error) {
      console.error('Error updating deliberation:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to update deliberation status'
      });
    }
  };

  // Get filtered info sessions
  const getFilteredInfoSessions = () => {
    if (showInactiveInfoSessions) {
      return infoSessions;
    }
    return infoSessions.filter(session => session.is_active);
  };

  // Get filtered workshops
  const getFilteredWorkshops = () => {
    if (showInactiveWorkshops) {
      return workshops;
    }
    return workshops.filter(workshop => workshop.is_active);
  };

  // Access denied view
  if (!hasAdminAccess) {
    return (
      <div className="w-full h-full bg-[#f5f5f5] flex items-center justify-center p-6 font-proxima">
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center max-w-md">
          <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-2 font-proxima-bold">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to view the admissions dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#f5f5f5] text-[#1a1a1a] overflow-hidden flex flex-col font-proxima">
      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 text-red-600 border border-red-200 rounded-lg font-proxima flex justify-between items-center">
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
          <div className="px-6 pt-4 pb-0 shrink-0">
            <TabsList className="grid w-full grid-cols-7 bg-white border border-gray-200">
            <TabsTrigger 
              value="overview" 
              className="font-proxima data-[state=active]:bg-[#4242ea] data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="applications" 
              className="font-proxima data-[state=active]:bg-[#4242ea] data-[state=active]:text-white"
            >
              Applicants
            </TabsTrigger>
            <TabsTrigger 
              value="info-sessions" 
              className="font-proxima data-[state=active]:bg-[#4242ea] data-[state=active]:text-white"
            >
              Info Sessions
            </TabsTrigger>
            <TabsTrigger 
              value="workshops" 
              className="font-proxima data-[state=active]:bg-[#4242ea] data-[state=active]:text-white"
            >
              Workshops
            </TabsTrigger>
            <TabsTrigger 
              value="leads" 
              className="font-proxima data-[state=active]:bg-[#4242ea] data-[state=active]:text-white"
            >
              Leads
            </TabsTrigger>
            <TabsTrigger
              value="emails"
              className="font-proxima data-[state=active]:bg-[#4242ea] data-[state=active]:text-white"
            >
              Emails
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="font-proxima data-[state=active]:bg-[#4242ea] data-[state=active]:text-white"
            >
              Settings
            </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 overflow-auto px-6 py-4">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 font-proxima">Loading Overview...</div>
              </div>
            }>
            <OverviewTab
              loading={loading}
              error={error}
              stats={stats}
              cohorts={cohorts}
              overviewQuickView={overviewQuickView}
              setOverviewQuickView={setOverviewQuickView}
              compareEnabled={compareEnabled}
              setCompareEnabled={setCompareEnabled}
              activeOverviewStage={activeOverviewStage}
              setActiveOverviewStage={setActiveOverviewStage}
              stageDemographics={stageDemographics}
              setStageDemographics={setStageDemographics}
              applicantStatusFilter={applicantStatusFilter}
              setApplicantStatusFilter={setApplicantStatusFilter}
              overviewDeliberationFilter={overviewDeliberationFilter}
              setOverviewDeliberationFilter={setOverviewDeliberationFilter}
              token={token}
              getOverviewCohortParam={getOverviewCohortParam}
              fetchAdmissionsData={fetchOverviewData}
            />
            </Suspense>
          </TabsContent>

          {/* Applications Tab - Full width, no padding */}
          <TabsContent value="applications" className="flex-1 overflow-hidden">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 font-proxima">Loading Applicants...</div>
              </div>
            }>
              <ApplicationsTab
                loading={loading}
                applications={applications}
                cohorts={cohorts}
                applicationFilters={applicationFilters}
                setApplicationFilters={setApplicationFilters}
                visibleColumns={visibleColumns}
                setVisibleColumns={setVisibleColumns}
                columnSort={columnSort}
                handleColumnSort={handleColumnSort}
                selectedApplicants={selectedApplicants}
                setSelectedApplicants={setSelectedApplicants}
                openFilterColumn={openFilterColumn}
                setOpenFilterColumn={setOpenFilterColumn}
                openNotesModal={openNotesModal}
                handleDeliberationChange={handleDeliberationChange}
                setBulkActionsModalOpen={setBulkActionsModalOpen}
                fetchApplications={fetchApplicationsData}
                token={token}
                searchIndex={searchIndex}
                currentPage={currentPage}
                pageSize={PAGE_SIZE}
                onPageChange={handlePageChange}
                loadAllMode={loadAllMode}
                onLoadAll={handleLoadAll}
                onReturnToPagination={handleReturnToPagination}
              />
            </Suspense>
          </TabsContent>

          {/* Info Sessions Tab */}
          <TabsContent value="info-sessions" className="flex-1 overflow-auto px-6 py-4">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 font-proxima">Loading Info Sessions...</div>
              </div>
            }>
              <InfoSessionsTab
                loading={loading}
                infoSessions={infoSessions}
                setInfoSessions={setInfoSessions}
                showInactiveInfoSessions={showInactiveInfoSessions}
                setShowInactiveInfoSessions={setShowInactiveInfoSessions}
                selectedEvent={selectedEvent}
                setSelectedEvent={setSelectedEvent}
                eventRegistrations={eventRegistrations}
                setEventRegistrations={setEventRegistrations}
                attendanceLoading={attendanceLoading}
                setAttendanceLoading={setAttendanceLoading}
                infoSessionModalOpen={infoSessionModalOpen}
                setInfoSessionModalOpen={setInfoSessionModalOpen}
                editingInfoSession={editingInfoSession}
                setEditingInfoSession={setEditingInfoSession}
                infoSessionForm={infoSessionForm}
                setInfoSessionForm={setInfoSessionForm}
                infoSessionSubmitting={infoSessionSubmitting}
                setInfoSessionSubmitting={setInfoSessionSubmitting}
                addRegistrationModalOpen={addRegistrationModalOpen}
                setAddRegistrationModalOpen={setAddRegistrationModalOpen}
                selectedEventForRegistration={selectedEventForRegistration}
                setSelectedEventForRegistration={setSelectedEventForRegistration}
                selectedEventType={selectedEventType}
                setSelectedEventType={setSelectedEventType}
                applicantSearch={applicantSearch}
                setApplicantSearch={setApplicantSearch}
                searchResults={searchResults}
                setSearchResults={setSearchResults}
                selectedApplicantsForRegistration={selectedApplicantsForRegistration}
                setSelectedApplicantsForRegistration={setSelectedApplicantsForRegistration}
                searchLoading={searchLoading}
                setSearchLoading={setSearchLoading}
                registrationLoading={registrationLoading}
                setRegistrationLoading={setRegistrationLoading}
                laptopNeeds={laptopNeeds}
                setLaptopNeeds={setLaptopNeeds}
                fetchInfoSessions={fetchInfoSessionsData}
                token={token}
              />
            </Suspense>
          </TabsContent>

          {/* Workshops Tab */}
          <TabsContent value="workshops" className="flex-1 overflow-auto px-6 py-4">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 font-proxima">Loading Workshops...</div>
              </div>
            }>
              <WorkshopsTab
                loading={loading}
                workshops={workshops}
                setWorkshops={setWorkshops}
                showInactiveWorkshops={showInactiveWorkshops}
                setShowInactiveWorkshops={setShowInactiveWorkshops}
                selectedEvent={selectedEvent}
                setSelectedEvent={setSelectedEvent}
                eventRegistrations={eventRegistrations}
                setEventRegistrations={setEventRegistrations}
                attendanceLoading={attendanceLoading}
                setAttendanceLoading={setAttendanceLoading}
                workshopModalOpen={workshopModalOpen}
                setWorkshopModalOpen={setWorkshopModalOpen}
                editingWorkshop={editingWorkshop}
                setEditingWorkshop={setEditingWorkshop}
                workshopForm={workshopForm}
                setWorkshopForm={setWorkshopForm}
                workshopSubmitting={workshopSubmitting}
                setWorkshopSubmitting={setWorkshopSubmitting}
                availableCohorts={availableCohorts}
                loadingCohorts={loadingCohorts}
                addRegistrationModalOpen={addRegistrationModalOpen}
                setAddRegistrationModalOpen={setAddRegistrationModalOpen}
                selectedEventForRegistration={selectedEventForRegistration}
                setSelectedEventForRegistration={setSelectedEventForRegistration}
                selectedEventType={selectedEventType}
                setSelectedEventType={setSelectedEventType}
                applicantSearch={applicantSearch}
                setApplicantSearch={setApplicantSearch}
                searchResults={searchResults}
                setSearchResults={setSearchResults}
                selectedApplicantsForRegistration={selectedApplicantsForRegistration}
                setSelectedApplicantsForRegistration={setSelectedApplicantsForRegistration}
                searchLoading={searchLoading}
                setSearchLoading={setSearchLoading}
                registrationLoading={registrationLoading}
                setRegistrationLoading={setRegistrationLoading}
                laptopNeeds={laptopNeeds}
                setLaptopNeeds={setLaptopNeeds}
                fetchWorkshops={fetchWorkshopsData}
                token={token}
              />
            </Suspense>
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads" className="flex-1 overflow-auto px-6 py-4">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 font-proxima">Loading Leads...</div>
              </div>
            }>
              <LeadsTab token={token} />
            </Suspense>
          </TabsContent>

          {/* Emails Tab */}
          <TabsContent value="emails" className="flex-1 overflow-auto px-6 py-4">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 font-proxima">Loading Emails...</div>
              </div>
            }>
              <EmailsTab
                emailStats={emailStats}
                queuedEmails={queuedEmails}
                emailHistory={emailHistory}
                applicantEmailStatus={applicantEmailStatus}
                emailAutomationLoading={emailAutomationLoading}
                setEmailAutomationLoading={setEmailAutomationLoading}
                testEmailAddress={testEmailAddress}
                setTestEmailAddress={setTestEmailAddress}
                testEmailLoading={testEmailLoading}
                setTestEmailLoading={setTestEmailLoading}
                fetchEmailStats={fetchEmailsData}
                fetchQueuedEmails={fetchEmailsData}
                fetchEmailHistory={fetchEmailsData}
                fetchApplicantEmailStatus={fetchEmailsData}
                emailMappings={emailMappings}
                emailMappingsLoading={emailMappingsLoading}
                fetchEmailMappings={fetchEmailMappings}
                token={token}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 overflow-auto">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 font-proxima">Loading Settings...</div>
              </div>
            }>
              <SettingsTab />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <NotesModal
        isOpen={notesModalOpen && selectedApplicant}
        applicantId={selectedApplicant?.applicant_id}
        applicantName={selectedApplicant?.name || `${selectedApplicant?.first_name} ${selectedApplicant?.last_name}`}
        onClose={closeNotesModal}
      />

      <BulkActionsModal
        isOpen={bulkActionsModalOpen}
        onClose={() => setBulkActionsModalOpen(false)}
        selectedCount={selectedApplicants.length}
        onAction={handleBulkAction}
        isLoading={bulkActionInProgress}
      />
    </div>
  );
};

export default AdmissionsDashboard;
