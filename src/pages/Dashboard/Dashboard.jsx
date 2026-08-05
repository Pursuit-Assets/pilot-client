import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, BookOpen, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import Layout from '../../components/Layout/Layout';
import ArrowButton from '../../components/ArrowButton/ArrowButton';
import MissedAssignmentsSidebar from '../../components/MissedAssignmentsSidebar/MissedAssignmentsSidebar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toLegacyFormat } from '../AdminDashboard/utils/cohortUtils';
import { usePermissions } from '../../hooks/usePermissions';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { hasPermission } = usePermissions();

  // Check if user has active status
  const isActive = user?.active !== false;
  // Check if user is volunteer
  const isVolunteer = user?.role === 'volunteer';
  // Check if user is staff or admin
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';
  // Check if user is a workshop participant (applicant with workshop flag)
  const isWorkshopParticipant = user?.isWorkshopParticipant === true;
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDay, setCurrentDay] = useState(null);
  const [dailyTasks, setDailyTasks] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [cohortFilter, setCohortFilter] = useState(null);
  const [missedAssignmentsCount, setMissedAssignmentsCount] = useState(0);
  const [allWeeksData, setAllWeeksData] = useState([]); // Store all weeks from API
  const [currentWeek, setCurrentWeek] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(null);
  const [weeklyGoal, setWeeklyGoal] = useState('');
  const [slideDirection, setSlideDirection] = useState(null); // 'left' or 'right'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // NEW: Task completion status map for current week
  const [taskCompletionMap, setTaskCompletionMap] = useState({});

  // Cohort info for pre-curriculum countdown display
  const [cohortInfo, setCohortInfo] = useState(null);
  
  // NEW: Enrollments for course switcher (user's enrolled cohorts)
  const [enrollments, setEnrollments] = useState([]);
  const [selectedCohort, setSelectedCohort] = useState(null); // Currently selected cohort for viewing
  
  // Track user-selected week to preserve it when switching cohorts
  const [pendingWeek, setPendingWeek] = useState(null);

  // Participant Mode: staff/admin experiences the dashboard as a builder
  const [participantMode, setParticipantMode] = useState(() => {
    try {
      return localStorage.getItem('staffParticipantMode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('staffParticipantMode', String(participantMode));
  }, [participantMode]);

  // Builder View (staff/admin only)
  const [builderViewCohort, setBuilderViewCohort] = useState(null);
  const [availableCohorts, setAvailableCohorts] = useState([]);
  const [cohortsLoading, setCohortsLoading] = useState(false);

  // Fetch available cohorts for staff/admin builder view
  // Uses the staff-accessible /api/permissions/cohorts endpoint (not the admin org-management one)
  useEffect(() => {
    if (!isStaffOrAdmin) return;
    const loadCohorts = async () => {
      try {
        setCohortsLoading(true);
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/permissions/cohorts?type=builder`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Cohorts API error: ${res.status}`);
        const data = await res.json();
        const cohorts = (data.cohorts || []).map(c => ({
          name: c.name,
          legacyName: toLegacyFormat(c.name),
          cohort_id: c.cohort_id,
          is_active: true, // endpoint already filters to active only
          curriculum_day_count: parseInt(c.curriculum_day_count) || 0,
        }));
        setAvailableCohorts(cohorts);
        const activeWithContent = cohorts.filter(c => c.curriculum_day_count > 0);
        if (activeWithContent.length > 0 && !builderViewCohort) {
          setBuilderViewCohort(activeWithContent[0].legacyName);
        }
      } catch (error) {
        console.error('Error fetching cohorts for builder view:', error);
      } finally {
        setCohortsLoading(false);
      }
    };
    loadCohorts();
  }, [isStaffOrAdmin, token]);

  useEffect(() => {
    if (isActive && !isVolunteer && !isStaffOrAdmin) {
      fetchDashboardData();
    } else if (isStaffOrAdmin && participantMode) {
      fetchDashboardData();
    } else if (isStaffOrAdmin && builderViewCohort) {
      fetchDashboardData(builderViewCohort);
    } else {
      setIsLoading(false);
    }
  }, [token, cohortFilter, selectedCohort, user?.role, isActive, isVolunteer, isStaffOrAdmin, builderViewCohort, participantMode]);

  const fetchDashboardData = async (explicitCohort) => {
    try {
      setIsLoading(true);
      setError(null);

      // NEW: Single optimized API call for ALL dashboard data
      let url = `${import.meta.env.VITE_API_URL}/api/progress/dashboard-full`;

      // Add cohort parameter — prefer explicit argument to avoid stale closures
      if (explicitCohort) {
        url += `?cohort=${encodeURIComponent(explicitCohort)}`;
      } else if (isStaffOrAdmin && !participantMode && builderViewCohort) {
        url += `?cohort=${encodeURIComponent(builderViewCohort)}`;
      } else if ((user?.role === 'staff' || user?.role === 'admin') && !participantMode && cohortFilter) {
        url += `?cohort=${encodeURIComponent(cohortFilter)}`;
      } else if (selectedCohort) {
        // User selected a different cohort from their enrollments
        url += `?cohort=${encodeURIComponent(selectedCohort)}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || 'Failed to fetch dashboard data');
        error.response = { status: response.status, data: errorData };
        throw error;
      }
      
      const data = await response.json();
      
      // Store enrollments for course switcher (only on initial load, not when switching)
      if (data.enrollments && data.enrollments.length > 0 && enrollments.length === 0) {
        setEnrollments(data.enrollments);
        // Set initial selected cohort to active enrollment
        const activeEnrollment = data.enrollments.find(e => e.is_active);
        if (activeEnrollment && !selectedCohort) {
          setSelectedCohort(activeEnrollment.cohort_name);
        }
      }
      
      if (data.message === 'No schedule for today') {
        setCohortInfo(data.cohortInfo || null);
        // Still store enrollments even if no schedule
        if (data.enrollments && data.enrollments.length > 0) {
          setEnrollments(data.enrollments);
        }
        setIsLoading(false);
        return;
      }
      
      // Process the data
      const timeBlocks = data.timeBlocks || [];
      const taskProgress = Array.isArray(data.taskProgress) ? data.taskProgress : [];
      
      // Extract tasks from all time blocks
      const allTasks = [];
      
      timeBlocks.forEach(block => {
        // Add tasks with their completion status
        block.tasks.forEach(task => {
          const taskCompleted = taskProgress.find(
            progress => progress.task_id === task.id
          )?.status === 'completed';
          
          allTasks.push({
            id: task.id,
            time: formatTime(block.start_time),
            title: task.task_title,
            duration: `${task.duration_minutes} min`,
            type: task.task_type,
            completed: taskCompleted
          });
        });
      });
      
      // Set state with the processed data
      setCurrentDay(data.day || {});
      setDailyTasks(allTasks);
      
      // Get learning objectives from the day object
      const dayObjectives = data.day && data.day.learning_objectives ? 
        data.day.learning_objectives : [];
      setObjectives(dayObjectives);
      
      // Set missed assignments count
      setMissedAssignmentsCount(data.missedAssignmentsCount || 0);
      
      // Set all weeks data (already includes tasks and submission status)
      setAllWeeksData(data.weeks || []);
      
      // Set level, week, and weekly goal
      // When staff/admin views a specific cohort, data.day reflects the USER's own
      // enrollment (not the selected cohort), so derive from data.weeks instead.
      if (explicitCohort && data.weeks && data.weeks.length > 0) {
        const targetWeek = pendingWeek !== null
          ? data.weeks.find(w => w.weekNumber === pendingWeek) || data.weeks[data.weeks.length - 1]
          : data.weeks[data.weeks.length - 1];
        setCurrentWeek(targetWeek.weekNumber);
        setWeeklyGoal(targetWeek.weeklyGoal || '');
        if (targetWeek.days && targetWeek.days.length > 0) {
          setCurrentLevel(targetWeek.days[0].level || 1);
        }
        if (pendingWeek !== null) setPendingWeek(null);
      } else if (data.day) {
        setCurrentLevel(data.day.level || 1);

        // Use pending week if user explicitly selected one, otherwise use current day's week.
        // Clamp to a week that's actually in the payload — an L3+ rolling joiner's
        // pre-enrollment weeks are omitted by the server (mirrors the explicit-cohort
        // fallback above).
        if (pendingWeek !== null) {
          const selectedWeekData = (data.weeks || []).find(w => w.weekNumber === pendingWeek)
            || (data.weeks || [])[data.weeks.length - 1];
          const resolvedWeek = selectedWeekData?.weekNumber ?? data.day.week;
          setCurrentWeek(resolvedWeek);
          // Find the weekly goal for the selected week
          setWeeklyGoal(selectedWeekData?.weeklyGoal || data.day.weekly_goal || '');
          setPendingWeek(null); // Clear pending week after using it
        } else {
          setCurrentWeek(data.day.week);
          setWeeklyGoal(data.day.weekly_goal || '');
        }
      } else if (data.weeks && data.weeks.length > 0) {
        // Fallback: no current day data and no explicit cohort
        const lastWeek = data.weeks[data.weeks.length - 1];
        setCurrentWeek(lastWeek.weekNumber);
        setWeeklyGoal(lastWeek.weeklyGoal || '');
        if (lastWeek.days && lastWeek.days.length > 0) {
          setCurrentLevel(lastWeek.days[0].level || 1);
        }
      }
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Memoized week data for current week - only recalculates when currentWeek or allWeeksData changes
  const weekData = useMemo(() => {
    if (currentWeek === null || currentWeek === undefined || !allWeeksData.length) return [];
    const week = allWeeksData.find(w => w.weekNumber === currentWeek);
    return week?.days || [];
  }, [currentWeek, allWeeksData]);

  // Weeks actually present in the payload. For an L3+ rolling joiner the server omits
  // pre-enrollment weeks, so all navigation (chevrons + dropdowns) must step through
  // this list — never raw week arithmetic from 1.
  const availableWeeks = useMemo(
    () => allWeeksData.map(w => w.weekNumber).sort((a, b) => a - b),
    [allWeeksData]
  );
  const currentWeekIndex = availableWeeks.indexOf(currentWeek);
  const hasPrevWeek = currentWeekIndex > 0;
  const hasNextWeek = currentWeekIndex !== -1 && currentWeekIndex < availableWeeks.length - 1;
  
  // NEW: Fetch completion status for all tasks in current week
  useEffect(() => {
    const fetchWeekCompletionStatus = async () => {
      if (!weekData.length || !token) return;
      
      // Collect all task IDs from the current week
      const taskIds = [];
      weekData.forEach(day => {
        day.tasks?.forEach(task => {
          taskIds.push(task.id);
        });
      });
      
      if (taskIds.length === 0) return;
      
      try {
        console.log(`📊 Fetching completion status for ${taskIds.length} tasks in week ${currentWeek}`);
        
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/learning/batch-completion-status?taskIds=${taskIds.join(',')}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Received completion status for ${Object.keys(data.completionStatus).length} tasks`);
          setTaskCompletionMap(data.completionStatus);
        } else {
          console.error('Failed to fetch completion status');
        }
      } catch (error) {
        console.error('Error fetching batch completion status:', error);
      }
    };
    
    fetchWeekCompletionStatus();
  }, [weekData, currentWeek, token]);

  // Memoized navigation handlers
  const navigateToWeek = useCallback(async (direction) => {
    if (!currentWeek) return;

    // Step through the weeks the server actually returned — for an L3+ rolling joiner
    // the payload starts at their enrollment week, so index math (not week ± 1) keeps
    // navigation inside the visible range and skips any gaps.
    const index = availableWeeks.indexOf(currentWeek);
    if (index === -1) return;
    const newIndex = direction === 'prev' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= availableWeeks.length) return;
    const newWeek = availableWeeks[newIndex];

    // Phase 1: Slide out old cards
    const slideOutDirection = direction === 'prev' ? 'out-right' : 'out-left';
    setSlideDirection(slideOutDirection);
    
    // Wait for slide-out animation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Phase 2: Update week
    setCurrentWeek(newWeek);
    
    // Update weekly goal and level
    const newWeekData = allWeeksData.find(w => w.weekNumber === newWeek);
    if (newWeekData) {
      setWeeklyGoal(newWeekData.weeklyGoal || '');
      // Update level based on the first day of the new week
      if (newWeekData.days && newWeekData.days.length > 0) {
        setCurrentLevel(newWeekData.days[0].level || 1);
      }
    }
    
    // Phase 3: Slide in new cards from opposite direction
    const slideInDirection = direction === 'prev' ? 'in-from-left' : 'in-from-right';
    setSlideDirection(slideInDirection);
    
    // Reset after slide-in completes
    setTimeout(() => {
      setSlideDirection(null);
    }, 1000);
  }, [currentWeek, availableWeeks, allWeeksData]);

  // Handle continue session button click
  const handleContinueSession = useCallback(() => {
    if (!isActive) {
      setError('You have historical access only and cannot access new learning sessions.');
      return;
    }
    
    const cohortParam = (user?.role === 'staff' || user?.role === 'admin') && cohortFilter
      ? `?cohort=${encodeURIComponent(cohortFilter)}`
      : '';
    
    navigate(`/learning${cohortParam}`);
  }, [isActive, user?.role, cohortFilter, navigate]);

  // Navigate to the specific task in the Learning page
  const navigateToTask = useCallback((taskId) => {
    if (!isActive) {
      setError('You have historical access only and cannot access new learning sessions.');
      return;
    }
    
    const cohortParam = (user?.role === 'staff' || user?.role === 'admin') && cohortFilter
      ? `&cohort=${encodeURIComponent(cohortFilter)}`
      : '';
    
    navigate(`/learning?taskId=${taskId}${cohortParam}`);
  }, [isActive, user?.role, cohortFilter, navigate]);

  // Navigate to calendar for historical viewing
  const navigateToCalendar = useCallback(() => {
    navigate('/calendar');
  }, [navigate]);

  // Add a helper function to format time from 24-hour to 12-hour format
  const formatTime = (timeString) => {
    if (!timeString) return '';
    
    const timeParts = timeString.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = timeParts[1];
    
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    
    return `${formattedHours}:${minutes} ${period}`;
  };

  // Format date for display (e.g., "10.2 SAT" or "TODAY 10.22 MON")
  const formatDayDate = (dateString, isToday = false) => {
    if (!dateString) return { prefix: '', date: '', full: '' };
    // Handle ISO timestamps or simple date strings
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    
    const dateStr = `${month}.${day} ${dayOfWeek}`;
    
    if (isToday) {
      return {
        prefix: 'TODAY ',
        date: dateStr,
        full: `TODAY ${dateStr}`
      };
    }
    return {
      prefix: '',
      date: dateStr,
      full: dateStr
    };
  };

  // Format card header for workshop participants (Day 1, Day 2, etc.)
  const formatWorkshopCardHeader = (dayNumber, isToday = false) => {
    if (isToday) {
      return {
        prefix: 'TODAY ',
        date: `Day ${dayNumber}`,
        full: `TODAY Day ${dayNumber}`
      };
    }
    return {
      prefix: '',
      date: `Day ${dayNumber}`,
      full: `Day ${dayNumber}`
    };
  };

  // Check if a date is today
  const isDateToday = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Check if date is in the past
  const isDatePast = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Cutoff date for showing incomplete task indicators (12/1/2025)
  const TASK_TRACKING_CUTOFF_DATE = new Date('2025-12-01');

  // Check if date is on or after the cutoff date for task tracking
  const isDateAfterCutoff = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return date >= TASK_TRACKING_CUTOFF_DATE;
  };

  // Navigate to volunteer feedback
  const navigateToVolunteerFeedback = useCallback(() => {
    navigate('/volunteering?tab=feedback');
  }, [navigate]);

  // Handle opening missed assignments sidebar
  const handleMissedAssignmentsClick = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  // Handle closing sidebar
  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  // Handle navigation from sidebar to specific day/task - DEPRECATED, kept for other uses
  const handleNavigateToDay = useCallback((dayId, taskId) => {
    // Navigate to the day view with the task highlighted
    navigate(`/calendar?day=${dayId}&task=${taskId}`);
  }, [navigate]);

  // Handle navigation to Learning page for a specific day
  const handleNavigateToDayLearning = useCallback((dayId) => {
    if (!isActive) {
      setError('You have historical access only and cannot access new learning sessions.');
      return;
    }
    
    // Build query params
    const params = new URLSearchParams();
    params.append('dayId', dayId);
    
    // Pass cohort for all users when viewing a specific enrolled cohort
    if (selectedCohort) {
      params.append('cohort', selectedCohort);
    } else if ((user?.role === 'staff' || user?.role === 'admin') && cohortFilter) {
      params.append('cohort', cohortFilter);
    }
    
    navigate(`/learning?${params.toString()}`);
  }, [isActive, user?.role, cohortFilter, selectedCohort, navigate]);

  // Handle navigation to Learning page for a specific task
  const handleNavigateToTask = useCallback((dayId, taskId) => {
    if (!isActive) {
      setError('You have historical access only and cannot access new learning sessions.');
      return;
    }
    
    const params = new URLSearchParams();
    params.append('dayId', dayId);
    params.append('taskId', taskId);
    
    // Pass cohort for all users when viewing a specific enrolled cohort
    if (selectedCohort) {
      params.append('cohort', selectedCohort);
    } else if ((user?.role === 'staff' || user?.role === 'admin') && cohortFilter) {
      params.append('cohort', cohortFilter);
    }
    
    navigate(`/learning?${params.toString()}`);
  }, [isActive, user?.role, cohortFilter, selectedCohort, navigate]);

  // Render participant mode toggle for staff/admin users
  const renderModeToggle = () => {
    if (!isStaffOrAdmin) return null;
    return (
      <button
        onClick={() => setParticipantMode(prev => !prev)}
        className="inline-flex items-center self-center gap-2 h-9 px-3 bg-pursuit-purple font-proxima text-[14px] text-white border border-pursuit-purple transition-colors duration-200 hover:opacity-90"
        style={{ borderRadius: '7px' }}
      >
        <span className={`inline-block w-2 h-2 rounded-full transition-colors ${participantMode ? 'bg-green-500' : 'bg-gray-400'}`} />
        {participantMode ? 'Participant Mode' : 'Preview Mode'}
      </button>
    );
  };

  // Render skeleton loading cards
  const renderSkeletonCards = () => {
    return Array(5).fill(0).map((_, index) => (
      <div key={`skeleton-${index}`} className="dashboard__day-card dashboard__day-card--skeleton">
        <div className="skeleton-line skeleton-date"></div>
        <div className="skeleton-divider"></div>
        <div className="skeleton-section">
          <div className="skeleton-line skeleton-title"></div>
          <div className="skeleton-line"></div>
          <div className="skeleton-line"></div>
          <div className="skeleton-line skeleton-short"></div>
        </div>
        <div className="skeleton-section">
          <div className="skeleton-line skeleton-title"></div>
          <div className="skeleton-line"></div>
        </div>
      </div>
    ));
  };

  // Render historical access view
  const renderHistoricalView = () => {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Historical Access Only</CardTitle>
            <CardDescription>
              You have historical access only. You can view your past activities but cannot 
              participate in new sessions. Please visit the calendar to access your completed work.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={navigateToCalendar}>
              <Calendar className="h-4 w-4 mr-2" />
              View Past Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render volunteer dashboard view
  const renderVolunteerView = () => {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome, Volunteer!</CardTitle>
            <CardDescription>
              Thank you for volunteering with us. You can provide feedback on learner sessions below.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <button 
              className="group relative overflow-hidden inline-flex justify-center items-center px-6 py-2.5 bg-pursuit-purple border border-pursuit-purple rounded-full font-normal text-base leading-5 text-white cursor-pointer transition-colors duration-300"
              onClick={navigateToVolunteerFeedback}
            >
              <BookOpen className="h-4 w-4 mr-2 relative z-10 transition-colors duration-300 group-hover:text-pursuit-purple" />
              <span className="relative z-10 transition-colors duration-300 group-hover:text-pursuit-purple">Go to Volunteer Feedback</span>
              <div className="absolute inset-0 bg-[#EFEFEF] -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
            </button>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render the builder weekly view (reused by both renderDashboardContent and renderStaffAdminView)
  const renderBuilderWeeklyView = () => {
    const isExternalCohort = (user?.role === 'enterprise_builder' || user?.role === 'enterprise_admin' || hasPermission('page:cohort_admin')) && !(isStaffOrAdmin && participantMode);
    const isStaffBuilderView = isStaffOrAdmin && !participantMode;

    return (
      <>
        {/* Top Grid: Today's Goal and Upcoming */}
        <div className="dashboard__top-grid">
          {/* Today's Goal Section */}
          <div className="dashboard__todays-goal">
            <h2 className="dashboard__section-title">Today's Goal</h2>
            <p className="dashboard__goal-text">
              {currentDay?.daily_goal || 'No goal set for today'}
            </p>
            {!isStaffBuilderView && (
              <button className="group relative overflow-hidden inline-flex justify-center items-center px-[30px] py-2.5 w-fit bg-pursuit-purple border border-pursuit-purple rounded-full font-normal text-2xl leading-5 text-white cursor-pointer transition-colors duration-300 animate-breathe hover:animate-none" onClick={handleContinueSession}>
                <span className="relative z-10 transition-colors duration-300 group-hover:text-pursuit-purple">Start</span>
                <div className="absolute inset-0 bg-[#EFEFEF] -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
              </button>
            )}
          </div>

          {/* Vertical Divider */}
          <div className="dashboard__vertical-divider"></div>

          {/* Upcoming Section - Hidden until events are available */}
          <div className="dashboard__upcoming" style={{ visibility: 'hidden' }}>
            <h2 className="dashboard__section-title">Upcoming</h2>
            <div className="dashboard__upcoming-list">
              {upcomingEvents.map((event, index) => (
                <div key={index} className="dashboard__upcoming-item">
                  <div className="dashboard__upcoming-content">
                    <span className="dashboard__upcoming-date">{event.date}</span>
                    <div className="dashboard__upcoming-details">
                      <p className="dashboard__upcoming-title">{event.title}</p>
                      <p className="dashboard__upcoming-time">{event.time}</p>
                      {event.location && <p className="dashboard__upcoming-location">{event.location}</p>}
                    </div>
                  </div>
                  <button className="dashboard__signup-btn">Sign up</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Divider 2 */}
        <div className="dashboard__divider-2" />

        {/* Week Header: Title and Date Picker */}
        <div className="dashboard__week-header-wrapper">
          <div className="dashboard__week-header">
            <div className="dashboard__week-title">
              {isWorkshopParticipant ? (
                <span className="dashboard__week-label">AI Native Workshop</span>
              ) : (isExternalCohort && !isStaffBuilderView) ? (
                <span className="dashboard__week-label">{user?.cohort || 'Your Program'}</span>
              ) : (
                <span className="dashboard__week-label">
                  <span className="dashboard__week-level">{currentLevel}</span>: Week {currentWeek}
                </span>
              )}
            </div>

            {!isWorkshopParticipant && (
            <div className="dashboard__date-picker">
              <button
                className={`group relative overflow-hidden inline-flex items-center justify-center w-10 h-10 transition-all duration-300 ${
                  hasPrevWeek
                    ? 'bg-[#EFEFEF] border border-pursuit-purple text-pursuit-purple cursor-pointer'
                    : 'bg-background border border-divider text-divider cursor-not-allowed opacity-100'
                }`}
                style={{ borderRadius: '.5rem' }}
                onClick={() => navigateToWeek('prev')}
                disabled={!hasPrevWeek || slideDirection !== null}
              >
                <ChevronLeft className={`w-10 h-10 relative z-10 transition-colors duration-300 ${hasPrevWeek ? 'group-hover:!text-white' : ''}`} strokeWidth={0.8} />
                {hasPrevWeek && (
                  <div className="absolute inset-0 bg-pursuit-purple -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                )}
              </button>

              {/* Week Dropdown - shows cohorts with weeks if multiple enrollments */}
              <Select
                value={`${selectedCohort || currentDay?.cohort}|${currentWeek}`}
                onValueChange={(val) => {
                  const [cohort, weekStr] = val.split('|');
                  const targetWeek = parseInt(weekStr);

                  // Check if switching cohorts
                  const switchingCohort = cohort !== (selectedCohort || currentDay?.cohort);

                  if (switchingCohort) {
                    // Switching to different cohort - set pending week so fetchDashboardData uses it
                    setPendingWeek(targetWeek);
                    setSelectedCohort(cohort);
                    // Don't set currentWeek here - let fetchDashboardData handle it with pendingWeek
                  } else if (targetWeek !== currentWeek && !slideDirection) {
                    // Same cohort, different week
                    setSlideDirection(targetWeek > currentWeek ? 'out-left' : 'out-right');
                    setTimeout(() => {
                      setCurrentWeek(targetWeek);
                      const newWeekData = allWeeksData.find(w => w.weekNumber === targetWeek);
                      if (newWeekData) {
                        setWeeklyGoal(newWeekData.weeklyGoal || '');
                        if (newWeekData.days && newWeekData.days.length > 0) {
                          setCurrentLevel(newWeekData.days[0].level || 1);
                        }
                      }
                      setSlideDirection(targetWeek > currentWeek ? 'in-from-right' : 'in-from-left');
                      setTimeout(() => setSlideDirection(null), 1000);
                    }, 1000);
                  }
                }}
              >
                <SelectTrigger className="w-[140px] h-10 bg-white px-[10px] border-0 text-[16px] leading-[18px] font-proxima font-normal text-carbon-black justify-center" style={{ borderRadius: '7px' }}>
                  <SelectValue className="text-center">Week {String(currentWeek).padStart(2, '0')}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[400px] w-[140px]">
                  {enrollments.length > 1 ? (
                    // Show cohorts with nested weeks
                    enrollments.map((enrollment) => (
                      <SelectGroup key={enrollment.cohort_id}>
                        <SelectLabel className="text-sm font-bold text-carbon-black text-left px-3 py-1.5">
                          {enrollment.cohort_name}
                        </SelectLabel>
                        {/* Weeks visible to THIS builder for this cohort — min_week is
                            server-computed and > 1 for an L3+ rolling joiner, so their
                            pre-enrollment weeks never appear in the picker */}
                        {Array.from(
                          { length: Math.max(0, (enrollment.max_week || 12) - (enrollment.min_week || 1) + 1) },
                          (_, i) => (enrollment.min_week || 1) + i
                        ).map((week) => (
                          <SelectItem
                            key={`${enrollment.cohort_name}|${week}`}
                            value={`${enrollment.cohort_name}|${week}`}
                            className="pl-2 justify-center text-center"
                          >
                            <span className="w-full text-center">Week {String(week).padStart(2, '0')}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  ) : (
                    // Single cohort - only the weeks present in the payload
                    availableWeeks.map((week) => (
                      <SelectItem key={week} value={`${currentDay?.cohort}|${week}`}>
                        Week {String(week).padStart(2, '0')}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <button
                className={`group relative overflow-hidden inline-flex items-center justify-center w-10 h-10 transition-all duration-300 ${
                  hasNextWeek
                    ? 'bg-[#EFEFEF] border border-pursuit-purple text-pursuit-purple cursor-pointer'
                    : 'bg-background border border-divider text-divider cursor-not-allowed opacity-100'
                }`}
                style={{ borderRadius: '.5rem' }}
                onClick={() => navigateToWeek('next')}
                disabled={!hasNextWeek || slideDirection !== null}
              >
                <ChevronRight className={`w-10 h-10 relative z-10 transition-colors duration-300 ${hasNextWeek ? 'group-hover:!text-white' : ''}`} strokeWidth={0.8} />
                {hasNextWeek && (
                  <div className="absolute inset-0 bg-pursuit-purple -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                )}
              </button>
            </div>
            )}
          </div>

          {/* Weekly Goal - separate row below header */}
          {!isWorkshopParticipant && weeklyGoal && (
            <div
              className={`dashboard__week-subtitle ${
                slideDirection === 'out-left' ? 'animate__animated animate__fadeOutLeft' :
                slideDirection === 'out-right' ? 'animate__animated animate__fadeOutRight' :
                slideDirection === 'in-from-left' ? 'animate__animated animate__fadeInLeft' :
                slideDirection === 'in-from-right' ? 'animate__animated animate__fadeInRight' : ''
              }`}
              style={{ animationDuration: '0.6s' }}
            >
              {weeklyGoal}
            </div>
          )}
        </div>

        {/* Weekly Agenda Cards */}
        <div className="dashboard__weekly-grid">
          {weekData.map((day, index) => {
            const dayIsToday = isDateToday(day.day_date);
            const dayIsPast = isDatePast(day.day_date);
            const dayIsFuture = !dayIsToday && !dayIsPast;
            const showCheckbox = dayIsPast && !dayIsToday;

            // For future weeks (going forward): out-left and in-from-right flow left-to-right
            // For past weeks (going back): out-right and in-from-left flow right-to-left (reversed)
            const isRightToLeft = slideDirection === 'out-right' || slideDirection === 'in-from-left';
            const cardCount = weekData.length;
            const delayIndex = isRightToLeft ? (cardCount - 1 - index) : index;

            // Determine Animate.css classes based on slide direction
            let animateClass = '';
            if (slideDirection === 'out-left') animateClass = 'animate__animated animate__fadeOutLeft';
            else if (slideDirection === 'out-right') animateClass = 'animate__animated animate__fadeOutRight';
            else if (slideDirection === 'in-from-left') animateClass = 'animate__animated animate__fadeInLeft';
            else if (slideDirection === 'in-from-right') animateClass = 'animate__animated animate__fadeInRight';

            // Calculate completion status for past days
            const deliverableTasks = day.tasks?.filter(t =>
              t.deliverable_type && ['video', 'document', 'link', 'structured'].includes(t.deliverable_type)
            ) || [];
            const completedDeliverables = deliverableTasks.filter(t => t.hasSubmission);
            const isComplete = deliverableTasks.length > 0 && deliverableTasks.length === completedDeliverables.length;

            return (
              <div
                key={day.id}
                className={`dashboard__day-card ${dayIsToday ? 'dashboard__day-card--today' : ''} ${animateClass}`}
                style={{
                  animationDelay: `${delayIndex * 0.08}s`
                }}
                onClick={(e) => {
                  // Don't double-navigate if user clicked an interactive element inside
                  if (e.target.closest('button, a, .dashboard__day-activity--clickable')) return;
                  if (!isStaffBuilderView) {
                    handleNavigateToDayLearning(day.id);
                  }
                }}
              >

                {/* Date */}
                <div className="dashboard__day-date">
                  {(() => {
                    const formattedDate = isWorkshopParticipant
                      ? formatWorkshopCardHeader(day.day_number, dayIsToday)
                      : formatDayDate(day.day_date, dayIsToday);
                    return (
                      <>
                        {formattedDate.prefix && <strong>{formattedDate.prefix}</strong>}
                        {formattedDate.date}
                      </>
                    );
                  })()}
                </div>

                {/* Separator */}
                <div className="dashboard__day-separator" />

                {/* Activities */}
                {day.tasks && day.tasks.length > 0 && (
                  <div className="dashboard__day-section">
                    <h4 className="dashboard__day-section-title">Activities</h4>
                    <div className="dashboard__day-activities">
                      {day.tasks.map((task, taskIndex) => {
                        // NEW: Use completion map for all tasks (not just deliverables)
                        const completionStatus = taskCompletionMap[task.id];
                        const isComplete = completionStatus?.isComplete || false;
                        // Only show checkbox for past days on or after 11/1/2025
                        const showTaskCheckbox = dayIsPast && !dayIsToday && isDateAfterCutoff(day.day_date);
                        const isBreakTask = task.task_type === 'break';

                        return (
                          <div key={task.id}>
                            <div
                              className={`dashboard__day-activity${
                                showTaskCheckbox && !isBreakTask && !isComplete && completionStatus?.requiresDeliverable
                                  ? ' dashboard__day-activity--clickable'
                                  : ''
                              }`}
                              onClick={(e) => {
                                if (showTaskCheckbox && !isBreakTask && !isComplete && completionStatus?.requiresDeliverable) {
                                  e.stopPropagation();
                                  handleNavigateToTask(day.id, task.id);
                                }
                              }}
                            >
                              {/* Task Checkbox - Purple (complete), Pink (incomplete with deliverable), or White circle (incomplete without deliverable) */}
                              {/* Hide checkbox for break tasks but add spacer to maintain alignment */}
                              {showTaskCheckbox && !isBreakTask && (
                                <div className={`dashboard__task-checkbox ${
                                  isComplete
                                    ? 'dashboard__task-checkbox--complete'
                                    : completionStatus?.requiresDeliverable
                                      ? 'dashboard__task-checkbox--incomplete'
                                      : 'dashboard__task-checkbox--empty'
                                }`}>
                                  {isComplete ? (
                                    <svg viewBox="0 0 14 14" className="dashboard__task-checkbox-check">
                                      <polyline points="2.5,6 5.5,9 11.5,3" />
                                    </svg>
                                  ) : completionStatus?.requiresDeliverable ? (
                                    <svg viewBox="0 0 8 8" className="dashboard__task-checkbox-x">
                                      <line x1="1" y1="1" x2="7" y2="7" />
                                      <line x1="7" y1="1" x2="1" y2="7" />
                                    </svg>
                                  ) : null}
                                </div>
                              )}
                              {/* Empty spacer for break tasks to maintain alignment */}
                              {showTaskCheckbox && isBreakTask && (
                                <div className="dashboard__task-checkbox" style={{ visibility: 'hidden' }} />
                              )}

                              <div className="dashboard__day-activity-content">
                                <span className="dashboard__task-title">{task.task_title}</span>

                {/* Deliverable / Assessment Submit Button */}
                {completionStatus?.requiresDeliverable && (
                  <button
                    className={`dashboard__deliverable-link ${
                      (task.hasSubmission || completionStatus?.isComplete) ? 'dashboard__deliverable-link--submitted' : 'dashboard__deliverable-link--pending'
                    } ${dayIsFuture ? 'dashboard__deliverable-link--disabled' : ''}`}
                    onClick={() => {
                      if (!dayIsFuture) {
                        handleNavigateToTask(day.id, task.id);
                      }
                    }}
                    disabled={dayIsFuture}
                  >
                    {(task.hasSubmission || completionStatus?.isComplete) ? (
                      <>
                        <svg viewBox="0 0 14 14" className="inline-block w-3 h-3 mr-1 align-middle" style={{ marginTop: '-2px' }}>
                          <polyline points="2.5,6 5.5,9 11.5,3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {task.deliverable_type.charAt(0).toUpperCase() + task.deliverable_type.slice(1)} Submitted
                      </>
                    ) : (
                      `Submit ${task.deliverable_type}`
                    )}
                  </button>
                )}
                              </div>
                            </div>
                            {taskIndex < day.tasks.length - 1 && (
                              <div className="dashboard__activity-divider" />
                            )}
                          </div>
                        );
                      })}
                    </div>
            </div>
          )}

                {/* Arrow Button in top-right corner — hidden for staff builder view */}
                {!isStaffBuilderView && dayIsToday && (
                  <div className="absolute top-[13px] right-3 z-10">
                    <ArrowButton
                      onClick={() => handleNavigateToDayLearning(day.id)}
                      borderColor="#FFFFFF"
                      backgroundColor="#FFFFFF"
                      arrowColor="#4242EA"
                      hoverBackgroundColor="#4242EA"
                      hoverArrowColor="#FFFFFF"
                      size="md"
                      strokeWidth={1}
                    />
                  </div>
                )}
                {!isStaffBuilderView && !dayIsToday && showCheckbox && (
                  <div className="absolute top-[13px] right-3 z-10">
                    <ArrowButton
                      onClick={() => handleNavigateToDayLearning(day.id)}
                      borderColor="#4242EA"
                      backgroundColor="#E3E3E3"
                      arrowColor="#4242EA"
                      hoverBackgroundColor="#4242EA"
                      hoverArrowColor="#E3E3E3"
                      size="md"
                      strokeWidth={1}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider 3 */}
        <div className="dashboard__divider-3" />
      </>
    );
  };

  // Render staff/admin dashboard view
  const renderStaffAdminView = () => {
    // Determine what content to show
    const renderBuilderViewContent = () => {
      if (!builderViewCohort) {
        return (
          <div className="dashboard__builder-view-placeholder">
            Select a cohort to preview the builder dashboard
          </div>
        );
      }
      if (isLoading) {
        return (
          <div className="dashboard__weekly-grid">
            {renderSkeletonCards()}
          </div>
        );
      }
      if (!allWeeksData.length) {
        return (
          <div className="dashboard__builder-view-placeholder">
            No curriculum data available for this cohort yet
          </div>
        );
      }
      return renderBuilderWeeklyView();
    };

    return (
      <div className="dashboard">
        {/* Desktop View */}
        <div className="dashboard__desktop hidden md:block">
          {/* Greeting with cohort dropdown */}
          <div className="dashboard__greeting">
            <h1 className="dashboard__greeting-text">
              Welcome back, {user?.firstName || 'there'}!
            </h1>
            <div className="dashboard__builder-view-toggle">
              {renderModeToggle()}
              <div className="dashboard__builder-view-cohort">
                <Select
                  value={builderViewCohort || ''}
                  onValueChange={(val) => setBuilderViewCohort(val)}
                >
                  <SelectTrigger className="w-[220px] h-9 bg-white px-3 border border-[#ccc] text-[14px] font-proxima text-carbon-black" style={{ borderRadius: '7px' }}>
                    <SelectValue placeholder="Select a cohort..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {cohortsLoading ? (
                      <SelectItem value="__loading" disabled>Loading cohorts...</SelectItem>
                    ) : (
                      availableCohorts.filter(c => c.is_active && c.curriculum_day_count > 0).map((cohort) => (
                        <SelectItem key={cohort.cohort_id} value={cohort.legacyName}>
                          {cohort.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {renderBuilderViewContent()}
        </div>

        {/* Mobile View */}
        <div className="dashboard__mobile block md:hidden">
          <div className="dashboard__mobile-divider-top" />
          <div className="dashboard__builder-view-toggle dashboard__builder-view-toggle--mobile">
            {renderModeToggle()}
            <div className="dashboard__builder-view-cohort">
              <Select
                value={builderViewCohort || ''}
                onValueChange={(val) => setBuilderViewCohort(val)}
              >
                <SelectTrigger className="w-[220px] h-9 bg-white px-3 border border-[#ccc] text-[14px] font-proxima text-carbon-black" style={{ borderRadius: '7px' }}>
                  <SelectValue placeholder="Select a cohort..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {cohortsLoading ? (
                    <SelectItem value="__loading" disabled>Loading cohorts...</SelectItem>
                  ) : (
                    availableCohorts.filter(c => c.is_active && c.curriculum_day_count > 0).map((cohort) => (
                      <SelectItem key={cohort.cohort_id} value={cohort.legacyName}>
                        {cohort.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {renderBuilderViewContent()}
        </div>
      </div>
    );
  };

  // Render pre-curriculum countdown view
  const renderPreCurriculumView = () => {
    let daysUntilStart = 0;
    
    if (cohortInfo?.start_date) {
      // Use the same approach as isDateToday - extract components with getDate/getMonth/getFullYear
      const startDateObj = new Date(cohortInfo.start_date);
      const today = new Date();
      
      // Create local midnight dates using extracted components
      const startLocal = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
      const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const diffMs = startLocal.getTime() - todayLocal.getTime();
      daysUntilStart = Math.round(diffMs / (1000 * 60 * 60 * 24));
    }
    
    const cohortName = cohortInfo?.cohort_name || 'your program';
    
    return (
      <div className="dashboard">
        {/* Desktop View */}
        <div className="dashboard__desktop hidden md:block">
          {/* Greeting */}
          <div className="dashboard__greeting">
            <h1 className="dashboard__greeting-text">
              Welcome, {user?.firstName || 'there'}!
            </h1>
          </div>
          
          {/* Countdown Section */}
          <div className="dashboard__countdown-section">
            <div className="dashboard__countdown-number">{daysUntilStart}</div>
            <div className="dashboard__countdown-label">
              {daysUntilStart === 1 ? 'day' : 'days'} until we begin!
            </div>
            <p className="dashboard__countdown-message">
              Get ready! Your learning journey starts soon.
            </p>
          </div>
          
          <div className="dashboard__divider-2" />
          
          {/* Placeholder for schedule area */}
          <div className="dashboard__schedule-placeholder">
            <p>Your schedule will appear here.</p>
          </div>
        </div>
        
        {/* Mobile View */}
        <div className="dashboard__mobile block md:hidden">
          {/* Divider at top */}
          <div className="dashboard__mobile-divider-top" />

          {/* Countdown Section */}
          <div className="dashboard__countdown-section">
            <div className="dashboard__countdown-number">{daysUntilStart}</div>
            <div className="dashboard__countdown-label">
              {daysUntilStart === 1 ? 'day' : 'days'} until we begin!
            </div>
            <p className="dashboard__countdown-message">
              Get ready! Your learning journey starts soon.
            </p>
          </div>

          {/* Divider */}
          <div className="dashboard__mobile-divider-2" />

          {/* Placeholder for schedule area */}
          <div className="dashboard__schedule-placeholder">
            <p>Your schedule will appear here once {cohortName} begins.</p>
          </div>
        </div>
      </div>
    );
  };

  // Mock data for the Figma wireframe
  const upcomingEvents = [
    {
      date: "10.15.25",
      title: "Demo Day",
      time: "8:30PM - 11:00 PM",
      location: "Blackrock"
    },
    {
      date: "10.25.25", 
      title: "Fireside Chat with David Yang",
      time: "2:30PM - 4:00 PM",
      location: "Pursuit HQ"
    },
    {
      date: "10.26.25",
      title: "Presentation", 
      time: "8:30PM - 11:00 PM",
      location: ""
    }
  ];

  // Render regular dashboard content matching the Figma wireframe
  const renderDashboardContent = () => {
    // Check if user is in external cohort (enterprise users don't use Level/Week format)
    const isExternalCohort = (user?.role === 'enterprise_builder' || user?.role === 'enterprise_admin' || hasPermission('page:cohort_admin')) && !(isStaffOrAdmin && participantMode);
    
    return (
      <div className="dashboard">
        {/* Desktop View */}
        <div className="dashboard__desktop hidden md:block">
          {/* Greeting Section */}
          <div className="dashboard__greeting">
            <h1 className="dashboard__greeting-text">
              Hey {user?.firstName || 'there'}. Good to see you!
            </h1>
            {renderModeToggle()}
            <button
              className={`dashboard__missed-assignments ${missedAssignmentsCount > 0 ? 'dashboard__missed-assignments--active' : ''}`}
              onClick={handleMissedAssignmentsClick}
            >
              <div className="dashboard__missed-icon" />
              <span>( {missedAssignmentsCount} ) missed assignments</span>
            </button>
          </div>

          {renderBuilderWeeklyView()}
        </div>

        {/* Mobile View */}
        <div className="dashboard__mobile block md:hidden">
          {/* Divider at top */}
          <div className="dashboard__mobile-divider-top" />

          {isStaffOrAdmin && (
            <div className="flex justify-center py-3">
              {renderModeToggle()}
            </div>
          )}

          {/* Today's Goal */}
          <div className="dashboard__mobile-goal">
            <h2 className="dashboard__mobile-section-title">Today's Goal</h2>
            <p className="dashboard__mobile-goal-text">
              {currentDay?.daily_goal || 'No goal set for today'}
            </p>
          </div>

          {/* Start Button */}
          <button className="dashboard__mobile-start-btn group relative overflow-hidden" onClick={handleContinueSession}>
            <span className="relative z-10">Start</span>
            <div className="absolute inset-0 bg-pursuit-purple -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
          </button>

          {/* Week Title - different for external cohorts */}
          <div className="dashboard__mobile-week-title">
            {isWorkshopParticipant ? (
              <>AI Native Workshop</>
            ) : isExternalCohort ? (
              <>{user?.cohort || 'Your Program'}</>
            ) : (
              <>{currentLevel}: Week {currentWeek} <br />
              {weeklyGoal}</>
            )}
          </div>

          {/* Divider 2 */}
          <div className="dashboard__mobile-divider-2" />

          {!isWorkshopParticipant && (
          <div className="dashboard__mobile-date-picker">
            <button
              className={`group relative overflow-hidden inline-flex items-center justify-center w-10 h-10 transition-all duration-300 ${
                hasPrevWeek
                  ? 'bg-pursuit-purple border border-pursuit-purple text-white cursor-pointer'
                  : 'bg-background border border-divider text-divider cursor-not-allowed opacity-100'
              }`}
              style={{ borderRadius: '.5rem' }}
              onClick={() => navigateToWeek('prev')}
              disabled={!hasPrevWeek || slideDirection !== null}
            >
              <ChevronLeft className={`w-10 h-10 relative z-10 transition-colors duration-300 ${hasPrevWeek ? 'group-hover:!text-pursuit-purple' : ''}`} strokeWidth={0.8} />
              {hasPrevWeek && (
                <div className="absolute inset-0 bg-[#EFEFEF] -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
              )}
            </button>
            
            {/* Week Dropdown */}
            <Select 
              value={String(currentWeek)} 
              onValueChange={(val) => {
                const targetWeek = parseInt(val);
                if (targetWeek !== currentWeek && !slideDirection) {
                  // Future week: slide out LEFT, slide in from RIGHT
                  // Past week: slide out RIGHT, slide in from LEFT
                  setSlideDirection(targetWeek > currentWeek ? 'out-left' : 'out-right');
                  setTimeout(() => {
                    setCurrentWeek(targetWeek);
                    // Update level for mobile dropdown as well
                    const newWeekData = allWeeksData.find(w => w.weekNumber === targetWeek);
                    if (newWeekData && newWeekData.days && newWeekData.days.length > 0) {
                      setCurrentLevel(newWeekData.days[0].level || 1);
                      setWeeklyGoal(newWeekData.weeklyGoal || '');
                    }
                    setSlideDirection(targetWeek > currentWeek ? 'in-from-right' : 'in-from-left');
                    setTimeout(() => setSlideDirection(null), 600);
                  }, 600);
                }
              }}
            >
              <SelectTrigger className="w-[100px] h-10 bg-white px-[10px] border-0 text-[16px] leading-[18px] font-proxima font-normal text-carbon-black" style={{ borderRadius: '7px' }}>
                <SelectValue>Week {String(currentWeek).padStart(2, '0')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {/* Only the weeks present in the payload — pre-enrollment L3+ weeks are omitted */}
                {availableWeeks.map((week) => (
                  <SelectItem key={week} value={String(week)}>
                    Week {String(week).padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <button
              className={`group relative overflow-hidden inline-flex items-center justify-center w-10 h-10 transition-all duration-300 ${
                hasNextWeek
                  ? 'bg-pursuit-purple border border-pursuit-purple text-white cursor-pointer'
                  : 'bg-background border border-divider text-divider cursor-not-allowed opacity-100'
              }`}
              style={{ borderRadius: '.5rem' }}
              onClick={() => navigateToWeek('next')}
              disabled={!hasNextWeek || slideDirection !== null}
            >
              <ChevronRight className={`w-10 h-10 relative z-10 transition-colors duration-300 ${hasNextWeek ? 'group-hover:!text-pursuit-purple' : ''}`} strokeWidth={0.8} />
              {hasNextWeek && (
                <div className="absolute inset-0 bg-[#EFEFEF] -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
              )}
            </button>
          </div>
          )}

          {/* Weekly Agenda - Mobile */}
          <div className="dashboard__mobile-agenda">
            {weekData.map((day, index) => {
              const dayIsToday = isDateToday(day.day_date);
              const dayIsPast = isDatePast(day.day_date);
              
              if (dayIsToday) {
                // Today Card - expanded
                return (
                  <div key={day.id} className="dashboard__mobile-today-card">
                    <div className="dashboard__mobile-today-header">
                      {(() => {
                        const formattedDate = formatDayDate(day.day_date, true);
                        return (
                          <>
                            {formattedDate.prefix && <strong>{formattedDate.prefix}</strong>}
                            {formattedDate.date}
                          </>
                        );
                      })()}
                    </div>
                    <div className="dashboard__mobile-today-separator" />
                    {day.tasks && day.tasks.length > 0 && (
                      <div className="dashboard__mobile-today-section">
                        <h4 className="dashboard__mobile-today-section-title">Activities</h4>
                        <div className="dashboard__mobile-today-activities">
                          {day.tasks.map((task, taskIndex) => (
                            <div key={task.id}>
                              <div className="dashboard__mobile-today-activity">{task.task_title}</div>
                              {taskIndex < day.tasks.length - 1 && (
                                <div className="dashboard__mobile-activity-divider" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
          <div className="absolute top-[13px] right-3 z-10">
            <ArrowButton
              onClick={() => handleNavigateToDayLearning(day.id)}
              borderColor="#FFFFFF"
              backgroundColor="#FFFFFF"
              arrowColor="#4242EA"
              hoverBackgroundColor="#4242EA"
              hoverArrowColor="#FFFFFF"
              size="md"
              strokeWidth={1}
            />
          </div>
                  </div>
                );
              } else {
                // Regular day card - condensed
                return (
                  <div key={day.id} className="dashboard__mobile-day">
                    <div className="dashboard__mobile-day-header">
                      {formatDayDate(day.day_date, false).full}
                    </div>
                    {dayIsPast && (
                      <div className={`dashboard__mobile-checkbox ${day.completed ? 'dashboard__mobile-checkbox--checked' : ''}`} />
                    )}
                  </div>
                );
              }
            })}
          </div>

          {/* Divider 3 */}
          <div className="dashboard__mobile-divider-3" />

          {/* Upcoming Section - Hidden until events are available */}
          <div className="dashboard__mobile-upcoming" style={{ visibility: 'hidden' }}>
            <h2 className="dashboard__mobile-section-title">Upcoming</h2>
            <div className="dashboard__mobile-upcoming-list">
              {upcomingEvents.map((event, index) => (
                <div key={index} className="dashboard__mobile-upcoming-item">
                  <div className="dashboard__mobile-upcoming-content">
                    <span className="dashboard__mobile-upcoming-date">{event.date}</span>
                    <div className="dashboard__mobile-upcoming-details">
                      <p className="dashboard__mobile-upcoming-title">{event.title}</p>
                      <p className="dashboard__mobile-upcoming-time">{event.time}</p>
                      {event.location && <p className="dashboard__mobile-upcoming-location">{event.location}</p>}
                    </div>
                  </div>
                  <button className="dashboard__mobile-signup-btn">Sign up</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout isLoading={isLoading}>
      {error && (
        <div className="p-4 mx-6 mt-6 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-destructive text-sm">{error}</p>
          </div>
        )}
      
      {/* Conditionally render based on user status and role */}
      {isStaffOrAdmin && !participantMode ? renderStaffAdminView() :
       !isActive ? renderHistoricalView() : 
       isVolunteer ? renderVolunteerView() : 
       !currentDay && cohortInfo ? renderPreCurriculumView() :
       renderDashboardContent()}

      {/* Missed Assignments Sidebar */}
      <MissedAssignmentsSidebar
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        onNavigateToDay={handleNavigateToTask}
      />
    </Layout>
  );
}

export default Dashboard; 
