import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../stores/authStore';
import pursuitLogoFull from '../../assets/logo-full.png';
import databaseService from '../../services/databaseService';
import Swal from 'sweetalert2';
import { Button } from '../../components/ui/button';
import { CheckCircle2, Lock, XCircle, Calendar, Clock, MapPin } from 'lucide-react';

const SECTION_CONFIG = [
  {
    key: 'infoSession',
    label: 'Attend an Info Session',
    description: 'Please note that info session attendance, in addition to a completed application, is required to be considered for the AI Native Program. This is a great opportunity to learn more about the program and our community.',
    statusOptions: ['not signed-up', 'signed-up', 'attended'],
    defaultStatus: 'not signed-up',
    getButtonLabel: (status) => {
      if (status === 'not signed-up') return 'Sign Up Here';
      if (status === 'signed-up') return 'Manage Registration';
      if (status === 'attended') return 'Completed';
      return 'Sign Up Here';
    },
    buttonEnabled: (status) => status !== 'attended',
  },
  {
    key: 'application',
    label: 'Complete your Application',
    description: 'Tell us about yourself and your background. Complete an exercise to learn more about AI.',
    statusOptions: ['not started', 'in process', 'submitted', 'ineligible'],
    defaultStatus: 'not started',
    getButtonLabel: (status) => {
      if (status === 'not started') return 'Apply';
      if (status === 'in process') return 'Continue Application';
      if (status === 'submitted') return '✓ Successfully Applied';
      if (status === 'ineligible') return 'Not Eligible';
      return 'Apply';
    },
    buttonEnabled: (status) => status !== 'submitted' && status !== 'ineligible',
  },
  {
    key: 'workshop',
    label: 'Complete a Workshop',
    description: 'Get introduced to AI and experience a day in the life of a Builder.',
    statusOptions: ['locked', 'not signed-up', 'signed-up', 'attended'],
    defaultStatus: 'locked',
    getButtonLabel: (status) => {
      if (status === 'locked') return 'Invitation Required';
      if (status === 'not signed-up') return 'Sign Up Here';
      if (status === 'signed-up') return 'Manage Registration';
      if (status === 'attended') return 'Completed';
      return 'Sign Up Here';
    },
    buttonEnabled: (status, applicationStatus) => {
      return status !== 'locked' && status !== 'attended';
    },
    lockedLabel: 'Invitation Required',
  },
  {
    key: 'pledge',
    label: 'Complete your Pledge',
    description: 'Commit to the program expectations',
    statusOptions: ['locked', 'not completed', 'completed'],
    defaultStatus: 'locked',
    getButtonLabel: (status) => {
      if (status === 'locked') return 'Program Admission Required';
      if (status === 'not completed') return 'Make Pledge';
      if (status === 'completed') return 'Pledge Completed';
      return 'Make Pledge';
    },
    buttonEnabled: (status) => status === 'not completed',
    lockedLabel: 'Program Admission Required',
  },
]

function ApplicantDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthState = useAuthStore((s) => s.setAuthState);
  const refreshPermissions = useAuthStore((s) => s.refreshPermissions);
  const [user, setUser] = useState(null);
  const [currentApplicantId, setCurrentApplicantId] = useState(null);
  const [statuses, setStatuses] = useState({
    infoSession: 'not signed-up',
    application: 'not started',
    workshop: 'locked',
    pledge: 'locked',
    onboarding: 'not started',
  });
  const [sessionDetails, setSessionDetails] = useState(null);
  const [workshopDetails, setWorkshopDetails] = useState(null);
  const [applicantStage, setApplicantStage] = useState(null);
  const [currentApplication, setCurrentApplication] = useState(null);
  const [cohortOptions, setCohortOptions] = useState([]);
  const [isUpdatingCohort, setIsUpdatingCohort] = useState(false);
  const [applicationProgress, setApplicationProgress] = useState(null);
  const [onboardingStatus, setOnboardingStatus] = useState(null);
  const [cohortInfo, setCohortInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
      console.log('Dashboard: Clearing old localStorage status data');
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    const loadApplicantId = async () => {
      if (!user?.email) return;
      
      try {
        console.log('Loading applicant ID for dashboard:', user.email);
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/applications/applicant/by-email/${user.email}`);
        if (response.ok) {
          const applicant = await response.json();
          setCurrentApplicantId(applicant.applicant_id);
          console.log('Dashboard loaded applicant ID:', applicant.applicant_id);
        } else {
          console.warn('Could not load applicant ID for dashboard');
        }
      } catch (error) {
        console.error('Error loading applicant ID for dashboard:', error);
      }
    };
    
    if (user) {
      loadApplicantId();
    }
  }, [user]);

  useEffect(() => {
    setRefreshTrigger(prev => prev + 1);
  }, [location]);

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!currentApplicantId) return;
      
      console.log('Loading dashboard data for applicant:', currentApplicantId);
      setIsLoading(true);
      
      try {
        await loadInfoSessionStatus();
        await loadApplicationStatus();
        await loadWorkshopStatus();
        await loadOnboardingStatus();
        await loadCohortInfo();
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (currentApplicantId) {
      loadDashboardData();
    }
  }, [currentApplicantId, refreshTrigger]);

  const loadCohortInfo = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/onboarding/cohort-info`);
      if (response.ok) {
        const data = await response.json();
        setCohortInfo(data);
      } else {
        setCohortInfo(null);
      }
    } catch (error) {
      console.error('Error loading cohort info:', error);
      setCohortInfo(null);
    }
  };

  const loadInfoSessionStatus = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/info-sessions`);
      if (!response.ok) return;
      
      const events = await response.json();
      let foundRegistration = null;
      let registeredEvent = null;
      let hasAttendedSession = false;
      
      for (const event of events) {
        const registrations = event.registrations || [];
        const attendedRegistration = registrations.find(reg => 
          reg.applicant_id === currentApplicantId && 
          (reg.status === 'attended' || reg.status === 'attended_late' || reg.status === 'very_late')
        );
        
        if (attendedRegistration) {
          foundRegistration = attendedRegistration;
          registeredEvent = event;
          hasAttendedSession = true;
          break;
        }
      }
      
      if (!hasAttendedSession) {
        for (const event of events) {
          const registrations = event.registrations || [];
          const userRegistration = registrations.find(reg => 
            reg.applicant_id === currentApplicantId && reg.status === 'registered'
          );
          
          if (userRegistration) {
            foundRegistration = userRegistration;
            registeredEvent = event;
            break;
          }
        }
      }
      
      if (foundRegistration && registeredEvent) {
        const dbDate = new Date(registeredEvent.start_time);
        const year = dbDate.getUTCFullYear();
        const month = dbDate.getUTCMonth();
        const day = dbDate.getUTCDate();
        const hour = dbDate.getUTCHours();
        const minute = dbDate.getUTCMinutes();
        const easternDate = new Date(year, month, day, hour, minute);

        const eventDetails = {
          date: easternDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          time: easternDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          location: registeredEvent.location
        };

        setStatuses(prev => ({
          ...prev,
          infoSession: hasAttendedSession ? 'attended' : 'signed-up'
        }));
        setSessionDetails(eventDetails);
        return;
      }

      // Fallback: no /api/info-sessions registration matched, but the
      // applicant_stage may already reflect attendance via an external
      // event (DOL career fair, partner event, etc.) — markApplicantAttendedEvent
      // upserts current_stage to 'info_session_attended', which is the
      // source of truth for pipeline progress. Honor stage rank so the
      // dashboard doesn't tell someone to "Sign Up" for an info session
      // they've already cleared a different way.
      const STAGE_ORDER = {
        info_session_registered: 1,
        info_session_no_show: 1,
        info_session_attended: 2,
        workshop_invited: 3,
        workshop_registered: 4,
        workshop_no_show: 4,
        workshop_attended: 5,
        application_submitted: 6,
        application_under_review: 7
      };
      try {
        const stageResp = await fetch(
          `${import.meta.env.VITE_API_URL}/api/admissions/applicants/${currentApplicantId}/stage`
        );
        if (stageResp.ok) {
          const stageData = await stageResp.json();
          const rank = STAGE_ORDER[stageData?.current_stage] || 0;
          if (rank >= STAGE_ORDER.info_session_attended) {
            setStatuses(prev => ({ ...prev, infoSession: 'attended' }));
            setSessionDetails(null);
            return;
          }
        }
      } catch (stageErr) {
        // Non-fatal — fall through to default 'not signed-up'.
        console.error('Error reading applicant stage for info session fallback:', stageErr);
      }

      setStatuses(prev => ({ ...prev, infoSession: 'not signed-up' }));
      setSessionDetails(null);
    } catch (error) {
      console.error('Error loading info session status for dashboard:', error);
    }
  };

  const loadApplicationStatus = async () => {
    // Track which load step we're in so the catch can decide whether the
    // failure was "no application" (legitimately 'not started') vs "we
    // have an application but a side-fetch failed" (don't lie about it).
    let application = null;
    let applicant = null;

    try {
      applicant = await databaseService.createOrGetApplicant(
        user.email,
        user.firstName || user.first_name,
        user.lastName || user.last_name
      );

      application = await databaseService.getLatestApplicationByApplicantId(applicant.applicant_id);
      setCurrentApplication(application || null);

      if (!application) {
        setStatuses(prev => ({ ...prev, application: 'not started' }));
        setApplicationProgress(null);
        return;
      }

      try {
        const stageResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/applicants/${applicant.applicant_id}/stage`);
        if (stageResponse.ok) {
          const stageData = await stageResponse.json();
          setApplicantStage(stageData);
        }
      } catch (error) {
        console.error('Error fetching applicant stage:', error);
      }

      if (application.status === 'ineligible') {
        setStatuses(prev => ({ ...prev, application: 'ineligible' }));
        setApplicationProgress(null);
      } else if (application.status === 'submitted') {
        setStatuses(prev => ({ ...prev, application: 'submitted' }));
        setApplicationProgress(null);
      } else {
        const responses = await databaseService.getApplicationResponses(application.application_id);
        const currentSection = localStorage.getItem('applicationCurrentSection');

        if (responses && responses.length > 0) {
          setStatuses(prev => ({ ...prev, application: 'in process' }));
          let completedSections = 0;
          if (currentSection !== null) {
            completedSections = parseInt(currentSection, 10) + 1;
          } else {
            completedSections = Math.min(Math.ceil(responses.length / 5), 5);
          }
          setApplicationProgress({ completedSections, totalSections: 5 });
        } else if (currentSection !== null) {
          setStatuses(prev => ({ ...prev, application: 'in process' }));
          const completedSections = parseInt(currentSection, 10) + 1;
          setApplicationProgress({ completedSections, totalSections: 5 });
        } else {
          setStatuses(prev => ({ ...prev, application: 'not started' }));
          setApplicationProgress(null);
        }
      }
    } catch (error) {
      // Log enough context to debug from a screenshot / browser console.
      console.error('Error loading application status for dashboard:', {
        message: error?.message,
        status: error?.status,
        applicantId: applicant?.applicant_id,
        applicationId: application?.application_id,
        applicationStatus: application?.status,
      });

      // 401 is handled by the global fetch interceptor (ExpiredTokenModal
      // -> redirect to login). Don't paper over it with a fake status.
      if (error?.status === 401) {
        return;
      }

      // If we already loaded the application, NEVER downgrade to
      // 'not started' just because a side-fetch failed — the application
      // exists and the user must be able to continue it. Best-effort fall
      // back to 'in process' for in_progress apps so they see "Continue".
      if (application) {
        if (application.status === 'in_progress') {
          setStatuses(prev => ({ ...prev, application: 'in process' }));
          setApplicationProgress(null);
        }
        // For submitted / ineligible, the earlier branches already set
        // the correct status before the throw; leave them as-is.
        return;
      }

      // Genuinely couldn't load anything — surface 'not started'.
      setCurrentApplication(null);
      setStatuses(prev => ({ ...prev, application: 'not started' }));
      setApplicationProgress(null);
    }
  };

  const loadCohortOptions = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/applications/cohort-options`, {
        headers: databaseService.getAuthHeaders()
      });
      if (!response.ok) return;
      const data = await response.json();
      setCohortOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading application cohort options:', error);
    }
  };

  useEffect(() => {
    loadCohortOptions();
  }, []);

  const formatCohortDate = (dateValue) => {
    if (!dateValue) return null;
    try {
      return new Date(dateValue).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return null;
    }
  };

  const getCohortOptionLabel = (cohort, index) => {
    const cycleLabel = index === 0 ? 'Current cycle' : 'Next cycle';
    const startDate = formatCohortDate(cohort.start_date);
    const cutoffDate = formatCohortDate(cohort.cutoff_date || cohort.effective_cutoff);
    const dateParts = [
      startDate ? `starts ${startDate}` : null,
      cutoffDate ? `deadline ${cutoffDate}` : null
    ].filter(Boolean);

    return `${cycleLabel}: ${cohort.name}${dateParts.length ? ` (${dateParts.join(', ')})` : ''}`;
  };

  const getCurrentApplicationCohort = () => {
    if (!currentApplication?.cohort_id) return null;
    return cohortOptions.find((cohort) => cohort.cohort_id === currentApplication.cohort_id) || null;
  };

  const changeSubmittedApplicationCohort = async () => {
    if (!currentApplication?.application_id || !currentApplicantId) return;
    if (!canEditSubmittedApplication()) return;

    if (cohortOptions.length === 0) {
      await Swal.fire({
        icon: 'info',
        title: 'No Cohorts Available',
        text: 'There are no cohorts available to switch to right now.',
        confirmButtonColor: '#4242ea'
      });
      return;
    }

    const inputOptions = cohortOptions.reduce((acc, cohort, index) => {
      acc[cohort.cohort_id] = getCohortOptionLabel(cohort, index);
      return acc;
    }, {});

    const { value: selectedCohortId, isConfirmed } = await Swal.fire({
      title: 'Change Application Cohort',
      html: '<p style="color:#555;">Choose which cohort this application should be considered for. This does not change your admission decision.</p>',
      input: 'select',
      inputOptions,
      inputValue: currentApplication.cohort_id || '',
      inputPlaceholder: 'Select a cohort',
      showCancelButton: true,
      confirmButtonText: 'Update Cohort',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4242ea',
      cancelButtonColor: '#6c757d',
      inputValidator: (value) => !value && 'Please select a cohort'
    });

    if (!isConfirmed || !selectedCohortId || selectedCohortId === currentApplication.cohort_id) return;

    setIsUpdatingCohort(true);
    try {
      const token = localStorage.getItem('applicantToken');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/applications/application/${currentApplication.application_id}/cohort`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ cohortId: selectedCohortId })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update cohort');
      }

      const data = await response.json();
      const updatedApplication = data.updated_application || data.updatedApplication || data;
      setCurrentApplication((prev) => ({
        ...prev,
        cohort_id: updatedApplication.cohort_id || selectedCohortId,
        cohort_assigned_at: updatedApplication.cohort_assigned_at || prev?.cohort_assigned_at
      }));

      await Swal.fire({
        icon: 'success',
        title: 'Cohort Updated',
        text: 'Your application cohort has been updated.',
        confirmButtonColor: '#4242ea'
      });
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to update cohort.',
        confirmButtonColor: '#dc3545'
      });
    } finally {
      setIsUpdatingCohort(false);
    }
  };

  const loadWorkshopStatus = async () => {
    try {
      const stageResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/applicants/${currentApplicantId}/stage`);
      let isInvited = false;
      let hasAttendedWorkshop = false;
      
      if (stageResponse.ok) {
        const stageData = await stageResponse.json();
        
        if (stageData.current_stage === 'workshop_attended') {
          hasAttendedWorkshop = true;
        }
        
        if (stageData.current_stage && 
            (stageData.current_stage.includes('workshop') || 
             stageData.current_stage === 'workshop_invited' ||
             stageData.current_stage === 'workshop_registered' ||
             stageData.current_stage === 'workshop_attended')) {
          isInvited = true;
        }
      }
      
      if (!isInvited) {
        setStatuses(prev => ({ ...prev, workshop: 'locked' }));
        setWorkshopDetails(null);
        return;
      }
      
      if (hasAttendedWorkshop) {
        setStatuses(prev => ({ ...prev, workshop: 'attended' }));
      }
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/workshops?applicant_id=${currentApplicantId}`);
      if (!response.ok) {
        setStatuses(prev => ({ ...prev, workshop: 'not signed-up' }));
        setWorkshopDetails(null);
        return;
      }
      
      const workshops = await response.json();
      
      if (workshops.length > 0 && workshops[0].registration_id) {
        const registeredWorkshop = workshops[0];
        
        if (registeredWorkshop.attended) {
          setStatuses(prev => ({ ...prev, workshop: 'attended' }));
        } else {
          setStatuses(prev => ({ ...prev, workshop: 'signed-up' }));
        }
        
        const dbDate = new Date(registeredWorkshop.start_time);
        const year = dbDate.getUTCFullYear();
        const month = dbDate.getUTCMonth();
        const day = dbDate.getUTCDate();
        const hour = dbDate.getUTCHours();
        const minute = dbDate.getUTCMinutes();
        const easternDate = new Date(year, month, day, hour, minute);

        setWorkshopDetails({
          event_id: registeredWorkshop.event_id,
          name: registeredWorkshop.name || registeredWorkshop.title,
          date: easternDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          time: easternDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          location: registeredWorkshop.location,
          registration_id: registeredWorkshop.registration_id,
          registered_at: registeredWorkshop.registered_at,
          attended: registeredWorkshop.attended,
          start_time: registeredWorkshop.start_time,
          allow_early_access: registeredWorkshop.allow_early_access,
          access_window_days: registeredWorkshop.access_window_days
        });
      } else {
        setStatuses(prev => ({ ...prev, workshop: 'not signed-up' }));
        setWorkshopDetails(null);
      }
    } catch (error) {
      console.error('Error loading workshop status for dashboard:', error);
      setStatuses(prev => ({ ...prev, workshop: 'locked' }));
    }
  };

  const loadOnboardingStatus = async () => {
    try {
      const stageResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/applicants/${currentApplicantId}/stage`);

      if (stageResponse.ok) {
        const stageData = await stageResponse.json();

        if (stageData.program_admission_status === 'accepted') {
          const pledgeResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/pledge/status/${currentApplicantId}`);

          if (pledgeResponse.ok) {
            const pledgeData = await pledgeResponse.json();
            if (pledgeData.pledge_completed) {
              setStatuses(prev => ({ ...prev, pledge: 'completed' }));
            } else {
              setStatuses(prev => ({ ...prev, pledge: 'not completed' }));
            }
          }

          // Check onboarding progress (only relevant after pledge is completed)
          let allRequiredCompleted = false;
          let hasProgress = false;

          const onboardingStatusResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/applicants/${currentApplicantId}/onboarding-status`);
          if (onboardingStatusResponse.ok) {
            const onboardingData = await onboardingStatusResponse.json();
            allRequiredCompleted = onboardingData.completed_required_tasks >= onboardingData.required_tasks;
            hasProgress = onboardingData.completed_required_tasks > 0;
          }

          if (allRequiredCompleted) {
            setStatuses(prev => ({ ...prev, onboarding: 'completed' }));
          } else if (hasProgress) {
            setStatuses(prev => ({ ...prev, onboarding: 'in progress' }));
          } else {
            setStatuses(prev => ({ ...prev, onboarding: 'not started' }));
          }
        } else {
          setStatuses(prev => ({ ...prev, pledge: 'locked' }));
        }
      } else {
        setStatuses(prev => ({ ...prev, pledge: 'locked' }));
      }

      // Fetch detailed onboarding task status for progress display
      const onboardingTaskResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/onboarding/status/${currentApplicantId}`);
      if (onboardingTaskResponse.ok) {
        const statusData = await onboardingTaskResponse.json();
        setOnboardingStatus(statusData);
      } else {
        setOnboardingStatus(null);
      }
    } catch (error) {
      console.error('Error loading onboarding status:', error);
      setStatuses(prev => ({ ...prev, pledge: 'locked' }));
      setOnboardingStatus(null);
    }
  };

  const isComplete = (key, status) => {
    if (key === 'infoSession') return status === 'attended'
    if (key === 'application') return status === 'submitted'
    if (key === 'workshop') return status === 'attended'
    if (key === 'pledge') return status === 'completed'
    if (key === 'onboarding') return onboardingStatus?.all_required_completed || false
    return false
  }

  const isIneligible = (key, status) => {
    if (key === 'application') return status === 'ineligible'
    return false
  }

  const isLocked = (key, status) => {
    if (key === 'workshop') return status === 'locked'
    if (key === 'pledge') return status === 'locked'
    if (key === 'onboarding') return cohortInfo && !cohortInfo.is_open
    return false
  }

  const isButtonEnabled = (section) => {
    if (section.key === 'application' && statuses.application === 'submitted') {
      return canEditSubmittedApplication();
    }
    if (section.key === 'workshop') {
      return section.buttonEnabled(statuses.workshop, statuses.application)
    }
    if (section.key === 'onboarding') {
      return section.buttonEnabled(statuses.onboarding)
    }
    return section.buttonEnabled(statuses[section.key])
  }

  const canEditSubmittedApplication = () => {
    return (
      statuses.application === 'submitted' &&
      currentApplication?.application_id &&
      (
        !applicantStage?.program_admission_status ||
        applicantStage.program_admission_status === 'pending'
      )
    );
  };

  const getApplicationProgressText = () => {
    if (applicationProgress) {
      return `${applicationProgress.completedSections}/${applicationProgress.totalSections} sections complete`;
    }
    return '0/5 sections complete';
  };

  // Determine which sections to show based on current state
  const getSectionsToDisplay = () => {
    // Show onboarding card instead of pledge card if eligible
    const showOnboarding = statuses.pledge === 'completed' && 
                           applicantStage?.program_admission_status === 'accepted';

    if (showOnboarding) {
      const onboardingLocked = cohortInfo && !cohortInfo.is_open;
      // Replace pledge section with onboarding section
      return [
        ...SECTION_CONFIG.slice(0, 3), // Keep first 3 sections (info, application, workshop)
        {
          key: 'onboarding',
          label: 'Complete Onboarding',
          description: onboardingLocked
            ? `Onboarding opens on ${new Date(cohortInfo.onboarding_date || cohortInfo.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}. You'll be able to complete your onboarding tasks then.`
            : 'Complete the required onboarding tasks to create your builder account and start the program.',
          statusOptions: ['not started', 'in progress', 'completed'],
          defaultStatus: 'not started',
          getButtonLabel: (status) => {
            if (onboardingLocked) return 'Coming Soon';
            if (onboardingStatus?.all_required_completed) return 'Create Builder Account';
            if (status === 'in progress') return 'Continue Onboarding';
            return 'Start Onboarding';
          },
          buttonEnabled: (status) => !onboardingLocked,
        }
      ];
    }

    // Show default sections (including pledge)
    return SECTION_CONFIG;
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('applicantToken');
    localStorage.removeItem('infoSessionStatus');
    localStorage.removeItem('infoSessionDetails');
    localStorage.removeItem('workshopStatus');
    localStorage.removeItem('workshopDetails');
    localStorage.removeItem('applicationStatus');
    setUser(null);
    navigate('/login');
  };

  const handleBackToMainApp = () => {
    navigate('/dashboard');
  };

  const isWorkshopAccessible = () => {
    if (!workshopDetails) return false;
    if (workshopDetails.allow_early_access) return true;
    
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/New_York'
    });
    
    const currentParts = formatter.formatToParts(now);
    const currentDate = `${currentParts.find(p => p.type === 'year').value}-${currentParts.find(p => p.type === 'month').value}-${currentParts.find(p => p.type === 'day').value}`;
    
    const workshopStart = new Date(workshopDetails.start_time);
    const workshopParts = formatter.formatToParts(workshopStart);
    const workshopStartDate = `${workshopParts.find(p => p.type === 'year').value}-${workshopParts.find(p => p.type === 'month').value}-${workshopParts.find(p => p.type === 'day').value}`;
    
    return currentDate >= workshopStartDate;
  };

  const handleEnterWorkshop = async () => {
    try {
      if (!user?.email || !workshopDetails?.event_id) {
        throw new Error('Missing required data to enter workshop');
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/workshop/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: workshopDetails.event_id,
          applicant_email: user.email
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        await Swal.fire({
          icon: 'error',
          title: 'Cannot Access Workshop',
          text: errorData.error || `Failed to enter workshop (${response.status})`,
          confirmButtonColor: '#667eea'
        });
        return;
      }

      const data = await response.json();
      const userData = {
        ...data.user,
        userType: 'builder',
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        isWorkshopParticipant: data.user.is_workshop_participant || false,
        workshopEventId: data.workshop?.event_id || null
      };

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(userData));
      setAuthState(userData, data.token);

      // Fetch effective permissions so PermissionRoute checks pass on navigation
      await refreshPermissions();

      await Swal.fire({
        icon: 'success',
        title: 'Entering Workshop',
        text: `Loading workshop...`,
        timer: 1500,
        showConfirmButton: false
      });

      navigate('/dashboard');
    } catch (error) {
      console.error('Error entering workshop:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Workshop Entry Failed',
        text: error.message || 'Failed to enter workshop.'
      });
    }
  };

  const handleEditEligibility = async () => {
    try {
      const savedUser = localStorage.getItem('user');
      let applicantId = null;
      
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        if (userData.applicantId) {
          applicantId = userData.applicantId;
        } else {
          const applicant = await databaseService.createOrGetApplicant(
            userData.email || user.email,
            userData.firstName || userData.first_name || user.firstName || user.first_name,
            userData.lastName || userData.last_name || user.lastName || user.last_name
          );
          applicantId = applicant.applicant_id;
        }
      }
      
      if (!applicantId) {
        alert('Unable to find your application. Please try logging in again.');
        return;
      }

      localStorage.setItem('eligibilityResetForEditing', 'true');
      setStatuses(prev => ({ ...prev, application: 'in process' }));
      navigate('/application-form?resetEligibility=true');
    } catch (error) {
      console.error('Error resetting eligibility:', error);
      alert('An error occurred while resetting your eligibility. Please try again.');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EFEFEF]">
        <div className="text-[#1E1E1E] text-xl font-proxima">Loading...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EFEFEF]">
        <div className="text-[#1E1E1E] text-xl font-proxima">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EFEFEF] font-sans">
      {/* Top Bar */}
      <div className="bg-white border-b border-[#C8C8C8] px-4 md:px-8 py-2">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 md:gap-5">
            <Link to="/apply">
              <img 
                src={pursuitLogoFull} 
                alt="Pursuit Logo" 
                className="h-8 md:h-10 object-contain cursor-pointer"
                style={{ filter: 'invert(1)' }}
              />
            </Link>
            <div className="text-base md:text-lg font-semibold text-[#1E1E1E]">
              Welcome, {user.firstName || user.first_name}!
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Link 
              to="/apply" 
              className="hidden md:block bg-[#4242EA] text-white px-4 py-2 rounded-lg font-semibold hover:bg-[#3535D1] transition-colors"
            >
              Apply
            </Link>
            <Link 
              to="/program-details" 
              className="hidden md:block text-[#666] hover:text-[#1E1E1E] px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Details
            </Link>
            {user.userType === 'builder' && (
              <Button 
                onClick={handleBackToMainApp}
                variant="outline"
                className="border-[#4242EA] text-[#4242EA] hover:bg-[#4242EA] hover:text-white"
              >
                Main App
              </Button>
            )}
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="border-[#4242EA] text-[#4242EA] hover:bg-[#4242EA] hover:text-white"
            >
              Log Out
            </Button>
          </div>
        </div>
      </div>

      {/* Title Section */}
      <div className="px-4 md:px-8 py-4 md:py-6">
        <div className="max-w-[550px]">
          <h1 
            className="text-3xl md:text-[3rem] text-[#1E1E1E] leading-[1.15] tracking-tight"
            style={{ fontFamily: "'Proxima Nova Bold', 'Proxima Nova', sans-serif" }}
          >
            Start your AI-Native<br className="hidden md:block" />
            {' '}journey by completing<br className="hidden md:block" />
            {' '}the following steps.
          </h1>
        </div>
      </div>
      
      {/* Action Cards Grid */}
      <div className="px-4 md:px-8 pb-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {getSectionsToDisplay().map((section, index) => {
              const status = statuses[section.key];
              const complete = isComplete(section.key, status);
              const ineligible = isIneligible(section.key, status);
              const enabled = isButtonEnabled(section);
              const locked = isLocked(section.key, status);
              
              return (
                <div 
                  key={section.key} 
                  className={`
                    relative bg-white rounded-3xl p-6 min-h-[380px] flex flex-col
                    shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1
                    ${locked ? 'opacity-70' : ''}
                  `}
                  style={{
                    background: 'white',
                    boxShadow: complete 
                      ? '0 0 0 3px #48bb78, 0 10px 40px rgba(72, 187, 120, 0.2)' 
                      : locked 
                        ? '0 0 0 2px #C8C8C8, 0 4px 20px rgba(0,0,0,0.05)'
                        : '0 0 0 2px transparent, 0 10px 40px rgba(66, 66, 234, 0.1)',
                  }}
                >
                  {/* Gradient border effect on hover */}
                  <div 
                    className={`
                      absolute inset-0 rounded-3xl pointer-events-none transition-opacity duration-300
                      ${locked ? 'opacity-0' : 'opacity-0 hover:opacity-100'}
                    `}
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%)',
                      padding: '2px',
                      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      maskComposite: 'xor',
                      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      WebkitMaskComposite: 'xor',
                    }}
                  />

                  {/* Step Number / Icon */}
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center mb-4
                    ${complete ? 'bg-green-500' : locked ? 'bg-gray-300' : ineligible ? 'bg-red-100 border-2 border-red-300' : 'bg-[#4242EA]'}
                  `}>
                    {complete ? (
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    ) : ineligible ? (
                      <XCircle className="h-6 w-6 text-red-600" />
                    ) : locked ? (
                      <Lock className="h-5 w-5 text-gray-500" />
                    ) : (
                      <span className="text-white text-xl font-bold">{index + 1}</span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold text-[#1E1E1E] mb-2">
                    {section.label}
                  </h3>

                  {/* Description */}
                  <p className="text-[#666] text-sm leading-relaxed mb-4 flex-shrink-0">
                    {section.description}
                  </p>

                  {/* Dynamic Content Area */}
                  <div className="flex-1 flex flex-col justify-end space-y-3">
                    {/* Ineligible message */}
                    {section.key === 'application' && ineligible && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                        You do not meet our current eligibility requirements.
                      </div>
                    )}
                    
                    {/* Locked messages */}
                    {section.key === 'workshop' && locked && applicantStage?.program_admission_status !== 'rejected' && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-[#666] italic">
                        Workshop sign-up will be available after your application is reviewed and you are invited to the next stage.
                      </div>
                    )}
                    
                    {section.key === 'pledge' && locked && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-[#666] italic">
                        Pledge will be available after you are admitted to the program.
                      </div>
                    )}

                    {section.key === 'onboarding' && locked && cohortInfo && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-[#666] italic">
                        Onboarding opens on {new Date(cohortInfo.onboarding_date || cohortInfo.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}. Check back then to complete your tasks and create your builder account.
                      </div>
                    )}

                    {/* Application progress */}
                    {section.key === 'application' && status === 'in process' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500">💾</span>
                          <div>
                            <div className="text-sm font-semibold text-blue-900">Progress Saved</div>
                            <div className="text-sm text-blue-700">{getApplicationProgressText()}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {section.key === 'application' && status === 'submitted' && currentApplication && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span>🎯</span>
                          <strong className="text-indigo-700 font-semibold">Application Cohort</strong>
                        </div>
                        <p className="text-sm text-indigo-700 mb-3">
                          You applied for <strong>{getCurrentApplicationCohort()?.name || 'your selected cohort'}</strong>.
                        </p>
                        {cohortOptions.length > 1 && canEditSubmittedApplication() && (
                          <button
                            onClick={changeSubmittedApplicationCohort}
                            disabled={isUpdatingCohort}
                            className="w-full text-sm text-[#4242ea] border border-[#4242ea] rounded-xl py-2 px-4 hover:bg-[#4242ea] hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isUpdatingCohort ? 'Updating...' : 'Change Cohort'}
                          </button>
                        )}
                        {canEditSubmittedApplication() && (
                          <p className="text-xs text-indigo-600 mt-2">
                            Need to make a change? You can edit and resubmit while your application is still pending review.
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Returning applicant: reinstated and awaiting staff outreach.
                        Shown instead of nothing — after reinstatement both enrollment_status and
                        program_admission_status are back to 'pending', so neither the deferred
                        notice nor the pause button renders and the applicant would otherwise get
                        no acknowledgement that their reinstatement landed. */}
                    {section.key === 'application' && status === 'submitted'
                      && applicantStage?.reinstatement_status
                      && applicantStage.reinstatement_status !== 'resolved'
                      && applicantStage?.enrollment_status !== 'deferred' && (
                      <div className="bg-blue-50 border border-blue-300 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span>👋</span>
                          <strong className="text-blue-800 font-semibold">Welcome back — we have your application</strong>
                        </div>
                        <p className="text-sm text-blue-800">
                          Your application has been reinstated and is being reviewed again. Someone from admissions will reach out to confirm your plans.
                        </p>
                        {applicantStage.reinstated_at && (
                          <p className="text-xs text-blue-600 mt-2">
                            Reinstated on {new Date(applicantStage.reinstated_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Deferred notice with reinstate button */}
                    {section.key === 'application' && status === 'submitted' && applicantStage?.enrollment_status === 'deferred' && (
                      <div className="bg-amber-50 border border-amber-400 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span>📅</span>
                          <strong className="text-amber-700 font-semibold">Application Deferred</strong>
                        </div>
                        <p className="text-sm text-amber-700 mb-1">
                          Your application is paused. When you're ready to rejoin, reinstate it and choose which cohort you'd like to be considered for.
                        </p>
                        {applicantStage.deferred_at && (
                          <p className="text-xs text-amber-600 mb-3">
                            Paused on {new Date(applicantStage.deferred_at).toLocaleDateString()}
                          </p>
                        )}
                        <button
                          onClick={async () => {
                            // Cohort selection lives HERE, not on the defer button. Pausing is
                            // "not now" and takes no cohort; reinstating is the moment a cohort is
                            // genuinely chosen, from whatever is open at that time.
                            let cohortList = [];
                            try {
                              const token = localStorage.getItem('applicantToken');
                              const res = await fetch(`${import.meta.env.VITE_API_URL}/api/applications/cohorts/available`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                              });
                              const data = await res.json();
                              cohortList = Array.isArray(data?.cohorts) ? data.cohorts : [];
                            } catch (err) {
                              console.warn('Failed to load cohorts for reinstatement:', err);
                            }

                            if (cohortList.length === 0) {
                              await Swal.fire({
                                icon: 'info',
                                title: 'No Cohorts Open Right Now',
                                text: 'There are no upcoming cohorts open to rejoin at the moment. Please check back soon, or contact admissions.',
                                confirmButtonColor: '#4242ea'
                              });
                              return;
                            }

                            const cohortOptions = cohortList.reduce((acc, c) => {
                              acc[c.cohort_id] = `${c.name} — starts ${new Date(c.start_date).toLocaleDateString()}`;
                              return acc;
                            }, {});

                            const { value: chosenCohortId, isConfirmed } = await Swal.fire({
                              title: 'Which cohort would you like to join?',
                              html: `<p style="color: #555;">Your application will be reinstated and reviewed for the cohort you pick. Someone from admissions will reach out to confirm your plans.</p>`,
                              input: 'select',
                              inputOptions: cohortOptions,
                              inputPlaceholder: 'Select a cohort',
                              showCancelButton: true,
                              confirmButtonText: 'Reinstate My Application',
                              cancelButtonText: 'Cancel',
                              confirmButtonColor: '#4242ea',
                              cancelButtonColor: '#6c757d',
                              inputValidator: (value) => !value && 'Please select a cohort'
                            });

                            if (!isConfirmed || !chosenCohortId) return;

                            try {
                              const token = localStorage.getItem('applicantToken');
                              const response = await fetch(`${import.meta.env.VITE_API_URL}/api/applications/undefer`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ cohortId: chosenCohortId })
                              });

                              if (!response.ok) {
                                const error = await response.json();
                                throw new Error(error.error || 'Failed to reinstate your application');
                              }

                              const undeferResult = await response.json();
                              await Swal.fire({
                                icon: 'success',
                                title: 'Welcome Back!',
                                text: undeferResult.message || 'Your application has been reinstated. Someone from admissions will reach out to confirm your plans.',
                                confirmButtonColor: '#4242ea'
                              });
                              window.location.reload();
                            } catch (error) {
                              await Swal.fire({
                                icon: 'error',
                                title: 'Error',
                                text: error.message || 'Failed to reinstate your application.',
                                confirmButtonColor: '#dc3545'
                              });
                            }
                          }}
                          className="w-full text-sm text-[#4242ea] border border-[#4242ea] rounded-xl py-2 px-4 hover:bg-[#4242ea] hover:text-white transition-colors"
                        >
                          Reinstate My Application
                        </button>
                      </div>
                    )}

                    {/* Accepted applicants can defer enrollment to a later cohort */}
                    {section.key === 'application' && status === 'submitted' && currentApplicantId && applicantStage?.program_admission_status === 'accepted' && applicantStage?.enrollment_status !== 'deferred' && (
                      <button
                        onClick={async () => {
                          // No cohort picker: pausing is "not now", not a move to a later cohort.
                          // The applicant chooses a cohort when they REINSTATE (see the deferred
                          // notice above), from whatever is open at that time. The old dropdown
                          // offered "the next cohort", which is how deferrals ended up counted as
                          // fresh activity in a cycle they were never recruited for.
                          const { isConfirmed } = await Swal.fire({
                            title: 'Pause your application?',
                            html: `<p style="color: #555;">Your application will be paused and you'll be taken out of your current cohort.</p>
                                   <p style="color: #555; margin-top: 10px;">You can reinstate it whenever you're ready, and pick which cohort to be considered for then.</p>`,
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Pause My Application',
                            cancelButtonText: 'Never mind',
                            confirmButtonColor: '#4242ea',
                            cancelButtonColor: '#6c757d'
                          });

                          if (!isConfirmed) return;

                          try {
                            const token = localStorage.getItem('applicantToken');
                            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/applications/defer`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              }
                            });

                            if (!response.ok) {
                              const error = await response.json();
                              throw new Error(error.error || 'Failed to pause application');
                            }

                            const deferResult = await response.json();
                            await Swal.fire({
                              icon: 'success',
                              title: 'Application Paused',
                              text: deferResult.message,
                              confirmButtonColor: '#4242ea'
                            });
                            window.location.reload();
                          } catch (error) {
                            await Swal.fire({
                              icon: 'error',
                              title: 'Error',
                              text: error.message || 'Failed to pause application.',
                              confirmButtonColor: '#dc3545'
                            });
                          }
                        }}
                        className="w-full text-sm text-red-600 border border-red-300 rounded-xl py-2 px-4 hover:bg-red-50 transition-colors"
                      >
                        Not ready for this cohort? Pause my application
                      </button>
                    )}

                    {/* Rejected notice with reapply option */}
                    {section.key === 'workshop' && applicantStage?.program_admission_status === 'rejected' && (
                      <div className="bg-red-50 border border-red-300 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span>❌</span>
                          <strong className="text-red-700 font-semibold">Application Not Accepted</strong>
                        </div>
                        <p className="text-sm text-red-700 mb-3">
                          Unfortunately, we were not able to offer you a spot in the program at this time. If you'd like to be reconsidered, you can start a new application below.
                        </p>
                        <button
                          onClick={async () => {
                            const result = await Swal.fire({
                              title: 'Start a New Application?',
                              html: `<p>We'll copy your prior application answers where possible, but you'll need to complete the key analysis questions again.</p><p style="color: #666; margin-top: 10px;">You can edit any copied answer before submitting.</p>`,
                              icon: 'question',
                              showCancelButton: true,
                              confirmButtonText: 'Start New Application',
                              cancelButtonText: 'Cancel',
                              confirmButtonColor: '#4242ea',
                              cancelButtonColor: '#6c757d'
                            });

                            if (result.isConfirmed) {
                              try {
                                const token = localStorage.getItem('applicantToken');
                                const response = await fetch(`${import.meta.env.VITE_API_URL}/api/applications/reapply`, {
                                  method: 'POST',
                                  headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                  }
                                });

                                if (!response.ok) {
                                  const error = await response.json();
                                  throw new Error(error.error || 'Failed to reapply');
                                }

                                const reapplyResult = await response.json();
                              localStorage.removeItem('applicationCurrentSection');
                              localStorage.removeItem('applicationCurrentQuestionIndex');
                              localStorage.setItem('applicationStatus', 'in_progress');
                                await Swal.fire({
                                  icon: 'success',
                                  title: 'New Application Started',
                                  text: reapplyResult.message || 'Your new application is ready to edit.',
                                  confirmButtonColor: '#4242ea'
                                });
                              navigate('/application-form?reapply=true');
                              } catch (error) {
                                await Swal.fire({
                                  icon: 'error',
                                  title: 'Error',
                                  text: error.message || 'Failed to reapply.',
                                  confirmButtonColor: '#dc3545'
                                });
                              }
                            }
                          }}
                          className="w-full text-sm text-[#4242ea] border border-[#4242ea] rounded-xl py-2 px-4 hover:bg-[#4242ea] hover:text-white transition-colors"
                        >
                          Start New Application
                        </button>
                      </div>
                    )}

                    {/* Info session details */}
                    {section.key === 'infoSession' && (status === 'signed-up' || status === 'attended') && sessionDetails && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="flex items-start gap-2">
                          <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <div className="font-semibold text-blue-900">{sessionDetails.date}</div>
                            <div className="text-blue-700">{sessionDetails.time}</div>
                            <div className="text-blue-700">{sessionDetails.location}</div>
                          </div>
                        </div>
                        {status === 'attended' && (
                          <div className="mt-2 text-center bg-green-100 text-green-700 rounded-lg py-1 px-2 text-sm font-semibold">
                            ✅ Attended
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Workshop details */}
                    {section.key === 'workshop' && (status === 'signed-up' || status === 'attended') && workshopDetails && (
                      <div className="space-y-3">
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                          <div className="flex items-start gap-2">
                            <Calendar className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-center flex-1">
                              <div className="font-semibold text-purple-900">{workshopDetails.date}</div>
                              <div className="text-purple-700">{workshopDetails.time}</div>
                              <div className="text-purple-700">{workshopDetails.location}</div>
                            </div>
                          </div>
                          {status === 'attended' && (
                            <div className="mt-2 text-center bg-green-100 text-green-700 rounded-lg py-1 px-2 text-sm font-semibold">
                              ✅ Attended
                            </div>
                          )}
                        </div>
                        {(status === 'signed-up' || status === 'attended') && (
                          <button
                            onClick={handleEnterWorkshop}
                            disabled={!isWorkshopAccessible()}
                            className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
                              isWorkshopAccessible() 
                                ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:from-[#5a67d8] hover:to-[#6b46c1] shadow-lg' 
                                : 'bg-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {isWorkshopAccessible() ? 'Enter Workshop' : 'Workshop Locked'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Pledge completed buttons */}
                    {section.key === 'pledge' && status === 'completed' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            Swal.fire({
                              title: 'PURSUIT AI-Native Program Pledge',
                              html: `<div style="text-align: left; max-height: 400px; overflow-y: auto; font-size: 14px; line-height: 1.6;">
                                <h4 style="font-weight: 600; margin-top: 16px;">Everyone in the AI-Native Program is a Builder</h4>
                                <p>The world is evolving at an unprecedented pace...</p>
                                <h4 style="font-weight: 600; margin-top: 16px;">Learning</h4>
                                <ul><li>Cultivate a growth mindset</li><li>Drive my own learning</li><li>Share my learning openly</li></ul>
                                <h4 style="font-weight: 600; margin-top: 16px;">Community</h4>
                                <ul><li>Foster a positive environment</li><li>Uphold Pursuit's code of conduct</li></ul>
                              </div>`,
                              confirmButtonColor: '#4242ea',
                              confirmButtonText: 'Close'
                            });
                          }}
                          className="flex-1 text-sm border border-[#4242EA] text-[#4242EA] rounded-xl py-2 px-3 hover:bg-[#4242EA] hover:text-white transition-colors"
                        >
                          📜 Pledge
                        </button>
                        <button
                          onClick={() => {
                            Swal.fire({
                              title: 'Code of Conduct',
                              html: `<div style="text-align: left; font-size: 14px; line-height: 1.6;">
                                <p><strong>Mutual Respect:</strong> We foster an environment where everyone feels valued.</p>
                                <p><strong>Collaborative Learning:</strong> We commit to learning together.</p>
                                <p><strong>Constructive Communication:</strong> We communicate thoughtfully.</p>
                              </div>`,
                              confirmButtonColor: '#4242ea',
                              confirmButtonText: 'Close'
                            });
                          }}
                          className="flex-1 text-sm border border-gray-300 text-gray-600 rounded-xl py-2 px-3 hover:bg-gray-100 transition-colors"
                        >
                          📋 Code
                        </button>
                      </div>
                    )}

                    {/* Onboarding progress */}
                    {section.key === 'onboarding' && onboardingStatus && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500">📋</span>
                          <div>
                            <div className="text-sm font-semibold text-blue-900">Onboarding Progress</div>
                            <div className="text-sm text-blue-700">
                              {onboardingStatus.completed_required_tasks} of {onboardingStatus.required_tasks} tasks completed
                            </div>
                          </div>
                        </div>
                        {onboardingStatus.all_required_completed && (
                          <div className="mt-2 text-center bg-green-100 text-green-700 rounded-lg py-1 px-2 text-sm font-semibold">
                            ✅ Ready to Create Builder Account
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Button */}
                    <div className="pt-2">
                      {ineligible && section.key === 'application' ? (
                        <div className="space-y-2">
                          <div className="text-center text-sm italic text-[#666]">Made a mistake?</div>
                          <button
                            onClick={handleEditEligibility}
                            className="w-full py-3 rounded-xl font-semibold text-white bg-[#4242EA] hover:bg-[#3535D1] transition-colors"
                          >
                            ✏️ Edit Responses
                          </button>
                        </div>
                      ) : ineligible ? (
                        <button disabled className="w-full py-3 rounded-xl font-semibold text-gray-500 bg-gray-200 cursor-not-allowed">
                          ❌ {section.getButtonLabel(status)}
                        </button>
                      ) : locked ? (
                        <button disabled className="w-full py-3 rounded-xl font-semibold text-gray-400 border-2 border-dashed border-gray-300 cursor-not-allowed bg-gray-50">
                          🔒 {section.getButtonLabel(status)}
                        </button>
                      ) : (
                        <Link to={enabled ? (
                          section.key === 'infoSession' ? '/info-sessions' :
                          section.key === 'workshop' ? '/workshops' :
                          section.key === 'application' ? (
                            status === 'submitted' ? '/application-form?editSubmitted=true' : '/application-form'
                          ) :
                          section.key === 'pledge' ? '/pledge' :
                          section.key === 'onboarding' ? '/onboarding' : '#'
                        ) : '#'}>
                          <button
                            disabled={!enabled}
                            className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
                              complete ? 'bg-green-500 hover:bg-green-600' :
                              status === 'submitted' ? 'bg-green-500 hover:bg-green-600' :
                              enabled ? 'bg-[#4242EA] hover:bg-[#3535D1] shadow-md hover:shadow-lg' : 
                              'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {section.key === 'application' && status === 'submitted' && canEditSubmittedApplication()
                              ? 'Edit Application'
                              : section.getButtonLabel(status)}
                          </button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ApplicantDashboard
