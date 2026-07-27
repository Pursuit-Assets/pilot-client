import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaCheckCircle, FaUsers, FaUserAlt, FaBook, FaPaperPlane, FaArrowLeft, FaArrowRight, FaBars, FaLink, FaExternalLinkAlt, FaEdit, FaCheck, FaTimes, FaFileAlt, FaVideo, FaBrain, FaComments, FaClipboardList, FaLock } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import useAuthStore from '../../stores/authStore';
import { useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

// New Components
import DailyOverview from '../../components/DailyOverview';
import ActivityHeader from '../../components/ActivityHeader';
import AutoExpandTextarea from '../../components/AutoExpandTextarea';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

// Existing Components
import PeerFeedbackSheet from '../../components/PeerFeedbackSheet';
import TaskSubmission from '../../components/TaskSubmission/TaskSubmission';
import AnalysisModal from '../../components/AnalysisModal/AnalysisModal';
import SurveyInterface from '../../components/SurveyInterface/SurveyInterface';
import AssessmentInterface from '../../components/AssessmentInterface/AssessmentInterface';
import BreakInterface from '../../components/BreakInterface/BreakInterface';
import DeliverablePanel from './components/DeliverablePanel/DeliverablePanel';
import TaskCompletionBar from '../../components/TaskCompletionBar/TaskCompletionBar';
import { parseLinkedResources } from '../../components/ResourcesPopover/ResourcesPopover';
import OnboardingInterface from './components/OnboardingInterface';

import './Learning.css';
import '../../styles/smart-tasks.css';
import LoadingCurtain from '../../components/LoadingCurtain/LoadingCurtain';
import { streamLearningMessage } from '../../utils/api';
import { useStreamingText } from '../../hooks/useStreamingText';
import { createStreamBuffer, appendToMessageById } from '../../utils/streamBufferUtils';

// Component that wraps ReactMarkdown with streaming text support
// Uses useStreamingText to smooth out bursty SSE chunks into natural typing flow
const StreamingMarkdownMessage = ({ content, animateOnMount = false }) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const effectiveContent = animateOnMount && !hasMounted ? '' : (content || '');
  const displayedContent = useStreamingText(effectiveContent);
  
  // Preprocess content to convert bullet points and URLs to markdown
  let processedContent = displayedContent;

  // Safety-net: never render completion control markers in UI.
  // Backend should already strip these, but this protects against edge cases.
  processedContent = processedContent.replace(/\[TASK(?:_| )COMPLETE\]/gi, '').trim();
  
  // Step 0: Convert URLs to markdown links FIRST
  processedContent = processedContent.replace(
    /([A-Z][^\n(]+?)\s+\(([^)]+)\):\s+([^\n]+?)\s+(https?:\/\/[^\s\n]+)/g,
    '[$1 ($2)]($4): $3'
  );
  
  // Fallback: Convert any remaining bare URLs to clickable links
  processedContent = processedContent.replace(
    /(?<!\()(?<!]\()https?:\/\/[^\s)]+/g,
    (url) => `[${url}](${url})`
  );
  
  // Step 1: Handle inline "Resources:" section
  processedContent = processedContent.replace(
    /Resources:\s*-\s*(.+?)(?=\n\n|$)/gis,
    (match, resourcesText) => {
      const items = resourcesText.split(/\s+-\s+(?=\[)/);
      const formattedItems = items
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => `- ${item}`)
        .join('\n');
      return `**Resources:**\n\n${formattedItems}`;
    }
  );
  
  // Step 2: Convert bullet points to markdown
  processedContent = processedContent.replace(/^•\s+/gm, '- ');
  processedContent = processedContent.replace(/\n•\s+/g, '\n- ');
  
  // Step 3: Convert numbered lists
  processedContent = processedContent.replace(/^(\d+)\.\s+/gm, '$1. ');
  
  // Step 4: Format section headers
  processedContent = processedContent.replace(
    /\n\n(?!\*\*Resources:\*\*)([A-Z][^:\n]+:)(?!\s*\n\n-)/g,
    '\n\n## $1'
  );
  
  return (
    <div className="text-carbon-black leading-relaxed text-base">
      <ReactMarkdown
        components={{
          p: ({ node, children, ...props }) => (
            <p className="mb-4" {...props}>{children}</p>
          ),
          h1: ({ node, children, ...props }) => (
            <h1 className="text-xl font-semibold mt-6 mb-4 first:mt-0 text-carbon-black" {...props}>{children}</h1>
          ),
          h2: ({ node, children, ...props }) => (
            <h2 className="text-lg font-semibold mt-5 mb-3 first:mt-0 text-carbon-black" {...props}>{children}</h2>
          ),
          h3: ({ node, children, ...props }) => (
            <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0 text-carbon-black" {...props}>{children}</h3>
          ),
          ul: ({ node, children, ...props }) => (
            <ul className="list-disc pl-6 my-4 space-y-1 text-carbon-black" {...props}>{children}</ul>
          ),
          ol: ({ node, children, ...props }) => (
            <ol className="list-decimal pl-6 my-4 space-y-1 text-carbon-black" {...props}>{children}</ol>
          ),
          li: ({ node, children, ...props }) => (
            <li className="text-carbon-black" {...props}>{children}</li>
          ),
          a: ({ node, children, ...props }) => (
            <a className="text-blue-500 hover:underline break-all" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
          ),
          code: ({ node, inline, className, children, ...props }) => {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded text-sm font-mono bg-gray-200 text-carbon-black"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="block" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node, children, ...props }) => (
            <pre
              className="p-4 rounded-lg my-4 overflow-x-auto text-sm font-mono bg-gray-100 text-carbon-black"
              {...props}
            >
              {children}
            </pre>
          ),
          blockquote: ({ node, children, ...props }) => (
            <blockquote
              className="border-l-4 border-gray-300 pl-4 my-4 italic text-gray-700"
              {...props}
            >
              {children}
            </blockquote>
          ),
          strong: ({ node, children, ...props }) => (
            <strong className="font-semibold text-carbon-black" {...props}>{children}</strong>
          ),
          em: ({ node, children, ...props }) => (
            <em className="italic text-carbon-black" {...props}>{children}</em>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

function Learning() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [hasInitialMessage, setHasInitialMessage] = useState(false);
  
  // Model selection state - matches AutoExpandTextarea default
  const [selectedModel, setSelectedModel] = useState('anthropic/claude-sonnet-4.6');
  
  // Check if user has active status
  const isActive = user?.active !== false;
  
  // Check if user is a workshop participant
  const isWorkshopParticipant = user?.isWorkshopParticipant === true;
  
  // Add state variables for message editing
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editMessageContent, setEditMessageContent] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Current day and task data
  const [currentDay, setCurrentDay] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [workshopInfo, setWorkshopInfo] = useState(null);
  
  // New state for daily overview vs activity interface
  const [showDailyOverview, setShowDailyOverview] = useState(true);
  const [isDeliverableSidebarOpen, setIsDeliverableSidebarOpen] = useState(false);
  const [isAssessmentPanelOpen, setIsAssessmentPanelOpen] = useState(false);
  const [currentAssessmentType, setCurrentAssessmentType] = useState(null);
  const [isPeerFeedbackSheetOpen, setIsPeerFeedbackSheetOpen] = useState(false);
  
  // Submission tracking state
  const [taskSubmissions, setTaskSubmissions] = useState({});
  // Format: { [taskId]: { id, content, created_at, updated_at } }
  
  // Task completion tracking state
  const [isTaskComplete, setIsTaskComplete] = useState(false);
  
  // Task completion map from backend (for DailyOverview checkmarks)
  const [taskCompletionMap, setTaskCompletionMap] = useState({});
  
  // Input tray height for dynamic message container padding
  const [inputTrayHeight, setInputTrayHeight] = useState(180);
  
  const chatTrayRef = useRef(null);
  const handleInputTrayHeightChange = useCallback((height) => {
    setInputTrayHeight(height);
  }, []);
  
  // Get dayId from URL query parameters
  const queryParams = new URLSearchParams(location.search);
  const dayId = queryParams.get('dayId');
  const taskId = queryParams.get('taskId');
  const cohort = queryParams.get('cohort');
  
  const messagesEndRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sendMessageAbortControllerRef = useRef(null);
  const deliverableAbortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const prevMessageCountRef = useRef(0);

  // Track chat tray height changes for dynamic message padding
  useEffect(() => {
    if (!chatTrayRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.target.getBoundingClientRect().height;
        setInputTrayHeight(height + 24); // 24px for bottom-6 spacing
      }
    });

    resizeObserver.observe(chatTrayRef.current);

    // Initial height notification
    const initialHeight = chatTrayRef.current.getBoundingClientRect().height;
    setInputTrayHeight(initialHeight + 24);

    return () => {
      resizeObserver.disconnect();
    };
  }, [currentTaskIndex, isTaskComplete, taskCompletionMap]);

  // Auto-scroll to bottom only when message count changes
  useEffect(() => {
    if (messages.length !== prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Keep latest content visible when tray height/completion bar state changes
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 80);

    return () => clearTimeout(timer);
  }, [messages.length, inputTrayHeight, isTaskComplete, currentTaskIndex]);

  // Auto-focus input when initial message loads
  useEffect(() => {
    if (hasInitialMessage && textareaRef.current && !editingMessageId && isActive) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 200);
    }
  }, [hasInitialMessage, editingMessageId, isActive]);

  // Auto-focus input when AI response arrives
  useEffect(() => {
    if (messages.length > 0 && !isAiThinking && !isSending && !isStreaming) {
      const lastMessage = messages[messages.length - 1];
      // Focus when last message is from AI and input is not disabled
      if (lastMessage.sender === 'ai' && textareaRef.current && !editingMessageId && isActive) {
        // Small delay to ensure DOM is ready and user can see the response
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 300);
      }
    }
  }, [messages, isAiThinking, isSending, isStreaming, editingMessageId, isActive]);
  
  // Cleanup: abort any pending requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (sendMessageAbortControllerRef.current) {
        sendMessageAbortControllerRef.current.abort();
      }
      if (deliverableAbortControllerRef.current) {
        deliverableAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Load day and task data
  useEffect(() => {
    const loadDayData = async () => {
      try {
        setIsPageLoading(true);
        
        let endpoint;
        let data;
        
        if (dayId) {
          // Fetch day details - include cohort param if provided (for enrollment-based access)
          endpoint = `${import.meta.env.VITE_API_URL}/api/curriculum/days/${dayId}/full-details`;
          if (cohort) {
            endpoint += `?cohort=${encodeURIComponent(cohort)}`;
          }
          const response = await fetch(endpoint, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            console.error('Failed to load day data, response:', response.status);
            setError('Failed to load day data');
            return;
          }
          
          data = await response.json();
          
          // Also fetch user's task progress for this day
          const progressEndpoint = `${import.meta.env.VITE_API_URL}/api/progress/days/${dayId}/tasks`;
          const progressResponse = await fetch(progressEndpoint, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            data.taskProgress = progressData || [];
          } else {
            data.taskProgress = [];
          }
        } else {
          // Use current day endpoint which already includes progress
          endpoint = `${import.meta.env.VITE_API_URL}/api/progress/current-day`;
          const response = await fetch(endpoint, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            console.error('Failed to load day data, response:', response.status);
            setError('Failed to load day data');
            return;
          }
          
          data = await response.json();
        }
        
        if (data) {
          console.log('Learning page data loaded:', data);
          console.log('Current day data:', data.day);
          console.log('Daily goal:', data.day?.daily_goal);
          
          // Process data like Dashboard does
          if (data.message === 'No schedule for today') {
            setCurrentDay(null);
            setTasks([]);
          } else {
            setCurrentDay(data.day || {});
            
            // Extract tasks from timeBlocks like Dashboard does
            const timeBlocks = data.timeBlocks || [];
            const allTasks = [];
            
            timeBlocks.forEach(block => {
              if (block.tasks) {
                block.tasks.forEach(task => {
                  // Debug: Log raw task data to see what backend is sending
                  if (task.task_title?.includes('Feedback') || task.feedback_slot) {
                    console.log('🔍 Raw task from backend:', {
                      id: task.id,
                      title: task.task_title,
                      feedback_slot: task.feedback_slot,
                      feedback_slot_type: typeof task.feedback_slot,
                      all_keys: Object.keys(task)
                    });
                  }
                  
                  allTasks.push({
                    id: task.id,
                    task_title: task.task_title,
                    task_description: task.task_description,
                    task_type: task.task_type,
                    duration_minutes: task.duration_minutes,
                    deliverable_type: task.deliverable_type,
                    deliverable: task.deliverable,
                    deliverable_schema: task.deliverable_schema,
                    thread_id: task.thread_id,
                    intro: task.intro,
                    questions: task.questions,
                    conclusion: task.conclusion,
                    task_mode: task.task_mode,
                    conversation_model: task.conversation_model,
                    persona: task.persona,
                    feedback_slot: task.feedback_slot, // Include feedback_slot for survey detection
                    assessment_id: task.assessment_id, // Include assessment_id for assessment detection
                    linked_resources: task.linked_resources, // Include linked resources for the Resources popover
                    start_time: block.start_time,
                    end_time: block.end_time,
                    category: block.block_category // Use block_category from backend
                  });
                });
              }
            });
            
            setTasks(allTasks);
            console.log('Processed tasks:', allTasks);
            
            // Debug: Log all tasks and their feedback_slot values
            console.log('All task feedback_slot values:', allTasks.map(t => ({
              id: t.id,
              title: t.task_title,
              feedback_slot: t.feedback_slot,
              feedback_slot_type: typeof t.feedback_slot
            })));
            
            // Debug: Log survey tasks specifically
            const surveyTasks = allTasks.filter(task =>
              task.feedback_slot &&
              typeof task.feedback_slot === 'string' &&
              task.feedback_slot !== 'none'
            );
            if (surveyTasks.length > 0) {
              console.log('Valid survey tasks found:', surveyTasks.map(t => ({
                id: t.id,
                title: t.task_title,
                feedback_slot: t.feedback_slot
              })));
            } else {
              console.log('No valid survey tasks found');
            }
            
            // NEW: Fetch completion status for all tasks on this day
            if (allTasks.length > 0) {
              fetchTaskCompletionStatus(allTasks.map(t => t.id));
            }
            
            // Handle taskId navigation
            if (taskId) {
              const taskIndex = allTasks.findIndex(t => t.id === parseInt(taskId));
              if (taskIndex !== -1) {
                setCurrentTaskIndex(taskIndex);
                setShowDailyOverview(false);
                
                // Load conversation for this task
                const task = allTasks[taskIndex];
                await loadTaskConversation(task);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading day data:', error);
        setError('An error occurred loading the day');
      } finally {
        setIsPageLoading(false);
      }
    };

    if (token) {
      loadDayData();
    }
  }, [token, dayId, taskId]);

  // Function to fetch completion status for all tasks (for DailyOverview)
  const fetchTaskCompletionStatus = async (taskIds) => {
    if (!taskIds || taskIds.length === 0) return;
    
    try {
      console.log(`📊 Fetching completion status for ${taskIds.length} tasks`);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/batch-completion-status?taskIds=${taskIds.join(',')}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
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

  // Helper function to load conversation for a task
  const loadTaskConversation = async (task) => {
    // If this is a survey task, don't load conversation - survey will handle itself
    const isTaskSurvey = task?.feedback_slot &&
                        typeof task.feedback_slot === 'string' &&
                        task.feedback_slot !== 'none';
                        
    if (isTaskSurvey) {
      console.log(`Task ${task.id} is a survey (${task.feedback_slot}), skipping conversation load`);
      setIsAiThinking(false);
      return;
    }

    // If this is an assessment task, don't load conversation - assessment will handle itself
    const isTaskAssessment = task?.task_type === 'assessment';
    if (isTaskAssessment) {
      console.log(`Task ${task.id} is an assessment, skipping conversation load`);
      setIsAiThinking(false);
      return;
    }

    // If this is a break task, don't load conversation - break interface will handle itself
    const isTaskBreak = task?.task_type === 'break';
    if (isTaskBreak) {
      console.log(`Task ${task.id} is a break, skipping conversation load`);
      setIsAiThinking(false);
      return;
    }
    
    // Abort any pending conversation load request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Abort any pending message send request
    if (sendMessageAbortControllerRef.current) {
      sendMessageAbortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Clear messages immediately to prevent showing stale content
    setMessages([]);
    setIsAiThinking(true);
    
    // Reset task completion state when switching tasks
    setIsTaskComplete(false);
    setCurrentAssessmentType(null); // Reset assessment type for new task
    
    try {
      // Fetch conversation history (uses abort controller for cancel-on-switch)
      const conversationResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/task-messages/${task.id}?dayNumber=${currentDay?.day_number}&cohort=${currentDay?.cohort}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          signal: abortController.signal,
        }
      );

      // Fetch submission separately (no abort signal — lightweight GET that should always complete)
      const submissionResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/submissions/${task.id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      ).catch(() => null);
      
      // Check if this request was aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      // Handle submission data
      if (submissionResponse && submissionResponse.ok) {
        const submissionData = await submissionResponse.json();
        console.log(`📦 Loaded submission for task ${task.id}:`, submissionData);
        setTaskSubmissions(prev => ({
          ...prev,
          [task.id]: submissionData
        }));
      } else {
        // No submission exists yet - clear any old submission data
        setTaskSubmissions(prev => {
          const newSubmissions = { ...prev };
          delete newSubmissions[task.id];
          return newSubmissions;
        });
      }
      
      // Handle conversation data
      if (conversationResponse.ok) {
        const data = await conversationResponse.json();
        console.log(`📨 Loaded ${data.messages?.length || 0} messages for task ${task.id}:`, data.messages);
        
        if (data.messages && data.messages.length > 0) {
          // Has existing conversation - load it
          const formattedMessages = data.messages.map(msg => ({
            id: msg.message_id,
            content: msg.content,
            sender: msg.role === 'user' ? 'user' : 'ai',
            timestamp: msg.timestamp,
          }));
          console.log(`✅ Formatted ${formattedMessages.length} messages:`, formattedMessages);
          
          // Only set messages if this request wasn't aborted
          if (!abortController.signal.aborted) {
            setMessages(formattedMessages);
            setHasInitialMessage(true);
          }
        } else {
          // Empty messages array could mean:
          // 1. Thread exists but no messages (shouldn't happen, but possible)
          // 2. No thread exists yet
          // In BOTH cases, we should call /messages/start which will:
          // - Get or create a thread
          // - Only create the first message if none exists
          console.log('📝 No existing messages found, starting conversation');
          await startTaskConversation(task, abortController);
        }
      } else if (conversationResponse.status === 404) {
        // 404 means no thread exists - start new conversation
        console.log('📝 No thread exists, starting new conversation');
        await startTaskConversation(task, abortController);
      } else {
        console.error('❌ Failed to load task messages, status:', conversationResponse.status);
        // For other errors, try starting conversation as fallback
        await startTaskConversation(task, abortController);
      }
    } catch (error) {
      // Ignore abort errors - they're expected when switching tasks
      if (error.name === 'AbortError') {
        console.log('🚫 Request aborted - user switched tasks');
        return;
      }
      
      console.error('❌ Error loading task conversation:', error);
      // Fallback to starting conversation only if not aborted
      if (!abortController.signal.aborted) {
        await startTaskConversation(task, abortController);
      }
    } finally {
      // Only clear loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsAiThinking(false);
        // Check if task is complete after loading conversation
        checkTaskCompletion(task.id);
      }
    }
  };

  // Function to check if current task is complete
  const checkTaskCompletion = async (taskId) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/task-completion-status/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Task ${taskId} completion status:`, data);
        setIsTaskComplete(data.isComplete);
        setTaskCompletionMap(prev => ({
          ...prev,
          [taskId]: { isComplete: data.isComplete, reason: data.reason }
        }));
      }
    } catch (error) {
      console.error('Error checking task completion:', error);
    }
  };

  // Start a new conversation by calling the backend
  const startTaskConversation = async (task, abortController) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/messages/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            taskId: task.id,
            dayNumber: currentDay?.day_number,
            cohort: currentDay?.cohort,
            conversationModel: selectedModel,
          }),
          signal: abortController.signal,
        }
      );
      
      // Check if this request was aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      // Handle 409 - conversation already exists
      if (response.status === 409) {
        const data = await response.json();
        console.log('⚠️ Conversation already started:', data.message);
        // The messages should have been loaded already, so just return
        // This prevents duplicate first messages
        return;
      }

      if (response.ok) {
        const data = await response.json();
        console.log('🚀 Started conversation:', data);
        
        // Only set messages if this request wasn't aborted
        if (!abortController.signal.aborted) {
          // Add the first message from the assistant
          const firstMessage = {
            id: data.message_id,
            content: data.content,
            sender: 'ai',
            timestamp: data.timestamp,
            shouldAnimate: true,
            showAssignment: !!data.show_assignment,
          };
          setMessages([firstMessage]);
          setHasInitialMessage(true);
        }
      } else {
        console.error('Failed to start conversation, status:', response.status);
        // Fallback to loading intro locally (old behavior)
        if (!abortController.signal.aborted) {
          await loadTaskIntro(task);
        }
      }
    } catch (error) {
      // Ignore abort errors - they're expected when switching tasks
      if (error.name === 'AbortError') {
        console.log('🚫 Start conversation request aborted');
        return;
      }
      
      console.error('Error starting conversation:', error);
      // Fallback to loading intro locally (old behavior)
      if (!abortController.signal.aborted) {
        await loadTaskIntro(task);
      }
    }
  };

  // New handler functions for redesigned interface
  const handleStartActivity = async (task) => {
    setShowDailyOverview(false);
    
    // Find the task index
    const taskIndex = tasks.findIndex(t => t.id === task.id);
    if (taskIndex !== -1) {
      setCurrentTaskIndex(taskIndex);
    }
    
    // Check if this is an assessment task
    const isTaskAssessment = task?.task_type === 'assessment';
    
    if (isTaskAssessment) {
      // For assessment tasks, check completion status (AssessmentInterface will load itself)
      await checkTaskCompletion(task.id);
    } else {
      // For regular tasks, load conversation (which will check completion)
      await loadTaskConversation(task);
    }
  };

  const loadTaskIntro = async (task) => {
    try {
      // Combine intro and first question into a single message
      let combinedContent = '';
      
      if (task.intro) {
        combinedContent = task.intro;
      }
      
      if (task.questions && task.questions.length > 0) {
        if (combinedContent) {
          combinedContent += '\n\n' + task.questions[0];
        } else {
          combinedContent = task.questions[0];
        }
      }
      
      if (combinedContent) {
        const message = {
          id: Date.now(),
          content: combinedContent,
          sender: 'ai',
          timestamp: new Date().toISOString(),
          shouldAnimate: true,
        };
        setMessages([message]);
      }
      
      setHasInitialMessage(true);
    } catch (error) {
      console.error('Error loading task intro:', error);
    }
  };

  const handleTaskChange = async (newTaskIndex) => {
    if (newTaskIndex === currentTaskIndex) return;
    
    // Reset completion state when switching tasks
    setIsTaskComplete(false);
    
    setCurrentTaskIndex(newTaskIndex);
    
    const newTask = tasks[newTaskIndex];
    
    // Check if this is an assessment task
    const isTaskAssessment = newTask?.task_type === 'assessment';
    
    if (isTaskAssessment) {
      // For assessment tasks, check completion status immediately
      await checkTaskCompletion(newTask.id);
    } else {
      // For regular tasks, load conversation (which will check completion)
      await loadTaskConversation(newTask);
    }
  };

  const CONTINUE_PROMPT = 'Please continue exactly where you left off, without repeating any prior content.';

  const handleContinueGeneration = () => {
    if (isSending || isAiThinking || isStreaming || !isActive) return;
    handleSendMessage(CONTINUE_PROMPT, selectedModel);
  };

  const handleSendMessage = async (messageContent, modelFromTextarea) => {
    if (!messageContent || !messageContent.trim() || isSending || isAiThinking || isStreaming) return;

    const trimmedMessage = messageContent.trim();
    
    // Capture the current task ID at the time of sending
    // This ensures we validate against the correct task even if user switches
    const messageTask = tasks[currentTaskIndex];
    const messageTaskId = messageTask?.id;
    if (!messageTaskId) {
      console.error('No task ID available for message');
      return;
    }
    
    setIsSending(true);
    setIsAiThinking(true);
    setIsStreaming(true);
    setError('');
    
    // Update the selected model if it changed
    if (modelFromTextarea && modelFromTextarea !== selectedModel) {
      setSelectedModel(modelFromTextarea);
    }
    
    // Abort any previous message send request
    if (sendMessageAbortControllerRef.current) {
      sendMessageAbortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    sendMessageAbortControllerRef.current = abortController;

    try {
      let receivedChunk = false;
      const now = Date.now();
      const streamingMessageId = now + 1;
      const streamBuffer = createStreamBuffer();
      // This stream owns exactly one bubble at a time and only ever writes to
      // that id. A phase transition ('thinking' after text) hands ownership to
      // a freshly created bubble. `ownedHasContent` mirrors the owned bubble's
      // content so ownership decisions happen outside the state updaters.
      let activeBubbleId = streamingMessageId;
      let ownedHasContent = false;
      let bubbleSeq = 0;
      // Add user message to chat
      const userMessage = {
        id: now,
        content: trimmedMessage,
        sender: 'user',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [
        ...prev.map(msg => (msg.truncated ? { ...msg, truncated: false } : msg)),
        userMessage,
        {
          id: streamingMessageId,
          content: '',
          sender: 'ai',
          timestamp: new Date().toISOString(),
          isStreaming: true,
          isThinking: true,
          thinkingLabel: 'Thinking…'
        }
      ]);

      await streamLearningMessage(
        trimmedMessage,
        messageTaskId,
        token,
        {
          dayNumber: currentDay?.day_number,
          cohort: currentDay?.cohort,
          conversationModel: modelFromTextarea || selectedModel
        },
        (chunk) => {
          if (tasks[currentTaskIndex]?.id !== messageTaskId) {
            return;
          }

          // Target the bubble THIS stream owns, by id — never "the last AI
          // bubble still streaming", which can belong to a concurrent stream.
          const findOwnedBubbleIdx = (msgs) => msgs.findIndex(m => m.id === activeBubbleId);

          if (chunk.type === 'thinking') {
            if (ownedHasContent) {
              // Phase transition: close the bubble that already has text and
              // open a fresh one. Ownership moves with it (computed here, not
              // inside the updater, so the updater stays pure).
              const finishedBubbleId = activeBubbleId;
              const nextBubbleId = `v2-${now}-${++bubbleSeq}`;
              const nextTimestamp = new Date().toISOString();
              const nextLabel = chunk.label;
              activeBubbleId = nextBubbleId;
              ownedHasContent = false;
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === finishedBubbleId);
                if (idx === -1) return prev;
                const updated = [...prev];
                updated[idx] = { ...updated[idx], isStreaming: false, isThinking: false, thinkingLabel: null };
                updated.push({
                  id: nextBubbleId,
                  content: '',
                  sender: 'ai',
                  timestamp: nextTimestamp,
                  isStreaming: true,
                  isThinking: true,
                  thinkingLabel: nextLabel
                });
                return updated;
              });
            } else {
              setMessages(prev => {
                const idx = findOwnedBubbleIdx(prev);
                if (idx === -1) return prev;
                const updated = [...prev];
                updated[idx] = { ...updated[idx], isThinking: true, thinkingLabel: chunk.label };
                return updated;
              });
            }
          } else if (chunk.type === 'text') {
            receivedChunk = true;
            const safeText = streamBuffer.append(chunk.content);
            if (safeText.trim()) ownedHasContent = true;
            if (safeText) {
              setMessages(prev => appendToMessageById(prev, activeBubbleId, safeText, {
                isThinking: false,
                thinkingLabel: null
              }));
            }
          } else if (chunk.type === 'done' && chunk.message) {
            receivedChunk = true;
            const remaining = streamBuffer.flush();
            if (remaining) {
              setMessages(prev => appendToMessageById(prev, activeBubbleId, remaining));
            }
            setIsStreaming(false);
            setIsAiThinking(false);
            setIsSending(false);
            checkTaskCompletion(messageTaskId);

            const finalMessage = chunk.message;
            const truncated = chunk.finish_reason === 'length' || chunk.finish_reason === 'max_tokens';
            const showAssignment = !!chunk.show_assignment;
            setMessages(prev => {
              const idx = findOwnedBubbleIdx(prev);
              if (idx === -1) return prev;
              return prev.map((m, i) =>
                i === idx
                  ? {
                      ...m,
                      content: m.content || finalMessage.content,
                      sender: 'ai',
                      timestamp: finalMessage.timestamp,
                      isStreaming: false,
                      isThinking: false,
                      thinkingLabel: null,
                      truncated,
                      showAssignment
                    }
                  : m
              );
            });
          } else if (chunk.type === 'error') {
            // Flush the buffer first — a held partial-marker tail is real text
            // and would otherwise be silently dropped on the error path.
            const remaining = streamBuffer.flush();
            // Finalize THIS stream's bubble: keep partial content if there is
            // any, drop the bubble only if it never received text. Also
            // remove the optimistic user message since the backend rolls it
            // back on AI failure.
            setMessages(prev => prev
              .filter(msg => msg.id !== userMessage.id)
              .filter(msg => {
                if (msg.id !== activeBubbleId) return true;
                // Drop only the bubble if it has no content yet (still thinking)
                return !!`${msg.content || ''}${remaining}`.trim();
              })
              .map(msg => (msg.id === activeBubbleId
                ? {
                    ...msg,
                    content: `${msg.content || ''}${remaining}`,
                    isStreaming: false,
                    isThinking: false,
                    thinkingLabel: null
                  }
                : msg
              ))
            );
            setIsStreaming(false);
            setIsAiThinking(false);
            setIsSending(false);
            // Restore the user's message to the input for easy retry
            const restoreContent = chunk.userContent || trimmedMessage;
            if (restoreContent && textareaRef.current?.setValue) {
              textareaRef.current.setValue(restoreContent);
            }
            setError(chunk.error || 'Failed to send message. Please try again.');
          }
        },
        abortController.signal
      );

      if (!receivedChunk && !abortController.signal.aborted && tasks[currentTaskIndex]?.id === messageTaskId) {
        const fallbackResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/api/learning/task-messages/${messageTaskId}?dayNumber=${currentDay?.day_number}&cohort=${currentDay?.cohort}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            signal: abortController.signal,
          }
        );
        
        if (fallbackResponse.ok && !abortController.signal.aborted) {
          const fallbackData = await fallbackResponse.json();
          const fallbackMessages = (fallbackData.messages || []).map(msg => ({
            id: msg.message_id,
            content: msg.content,
            sender: msg.role === 'user' ? 'user' : 'ai',
            timestamp: msg.timestamp,
          }));

          setMessages(prev => {
            // Remove transient placeholder before reconciliation.
            const localMessages = prev.filter(
              msg => msg.id !== streamingMessageId && !msg.isStreaming
            );
            const merged = [...fallbackMessages];

            for (const localMessage of localMessages) {
              const localContent = (localMessage.content || '').trim();
              const localId = localMessage.id != null ? String(localMessage.id) : null;

              const exists = merged.some(serverMessage => {
                const serverId = serverMessage.id != null ? String(serverMessage.id) : null;
                if (serverId && localId && serverId === localId) {
                  return true;
                }

                const serverContent = (serverMessage.content || '').trim();
                if (!serverContent || !localContent) {
                  return false;
                }

                return serverMessage.sender === localMessage.sender && serverContent === localContent;
              });

              if (!exists) {
                merged.push(localMessage);
              }
            }

            // Keep chronological order stable for preserved optimistic messages.
            return merged
              .map((msg, idx) => ({ msg, idx }))
              .sort((a, b) => {
                const aTs = Date.parse(a.msg.timestamp || '');
                const bTs = Date.parse(b.msg.timestamp || '');
                const aValid = Number.isFinite(aTs);
                const bValid = Number.isFinite(bTs);
                if (aValid && bValid && aTs !== bTs) return aTs - bTs;
                if (aValid && !bValid) return -1;
                if (!aValid && bValid) return 1;
                return a.idx - b.idx;
              })
              .map(entry => entry.msg);
          });
        }
      }
    } catch (error) {
      // Ignore abort errors - they're expected when switching tasks
      if (error.name === 'AbortError') {
        console.log('🚫 Message send request aborted');
        return;
      }
      
      console.error('Error sending message:', error);
      // Restore the user's message to the input for easy retry
      if (textareaRef.current?.setValue) {
        textareaRef.current.setValue(trimmedMessage);
      }
      setError('An error occurred. Please try again.');
    } finally {
      setIsSending(false);
      setIsStreaming(false);
      if (!abortController.signal.aborted) {
        setIsAiThinking(false);
      }
    }
  };

  const handleDeliverableSubmit = async (deliverableData) => {
    const currentTask = tasks[currentTaskIndex];

    if (!currentTask?.id) {
      toast.error("Unable to submit - task not found");
      return;
    }

    // Same in-flight guard as handleSendMessage: this submit can open its own
    // SSE stream, and two streams writing to the chat at once interleave.
    if (isSending || isAiThinking || isStreaming) {
      toast.error("Hang on — the coach is still responding.");
      return;
    }

    // Abort a previous submit stream and give this one its own controller,
    // matching the send-message path.
    if (deliverableAbortControllerRef.current) {
      deliverableAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    deliverableAbortControllerRef.current = abortController;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          taskId: currentTask.id,
          content: deliverableData, // Backend expects plain string content
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit deliverable');
      }

      // V2 path: for v2 personalized deliverable tasks in the apply phase,
      // the backend switches to SSE and streams grade → complete/remediate
      // output back. We parse the stream and render the agent's review in
      // the chat. For everything else (v1 / non-v2 deliverable), the response
      // is plain JSON and we keep the existing behavior.
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        toast.success("Submitted! The coach is reviewing your work…", { duration: 3000 });
        setIsStreaming(true);
        setIsSending(true);

        // Create the AI bubble this stream owns. Like handleSendMessage, every
        // write targets that id — never "the last streaming bubble".
        const submitStartedAt = Date.now();
        const baseBubbleId = `v2-submit-${submitStartedAt}`;
        setMessages(prev => [
          ...prev,
          {
            id: baseBubbleId,
            content: '',
            sender: 'ai',
            timestamp: new Date().toISOString(),
            isStreaming: true,
            isThinking: true,
            thinkingLabel: 'Reviewing your submission…'
          }
        ]);

        let activeBubbleId = baseBubbleId;
        let ownedHasContent = false;
        let bubbleSeq = 0;
        const findOwnedBubbleIdx = (msgs) => msgs.findIndex(m => m.id === activeBubbleId);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processChunk = (data) => {
          if (data.type === 'submission' && data.submission) {
            // Sidebar state update — same as the JSON path
            setTaskSubmissions(prev => ({
              ...prev,
              [currentTask.id]: data.submission
            }));
          } else if (data.type === 'thinking') {
            if (ownedHasContent) {
              const finishedBubbleId = activeBubbleId;
              const nextBubbleId = `v2-submit-${submitStartedAt}-${++bubbleSeq}`;
              const nextTimestamp = new Date().toISOString();
              const nextLabel = data.label;
              activeBubbleId = nextBubbleId;
              ownedHasContent = false;
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === finishedBubbleId);
                if (idx === -1) return prev;
                const updated = [...prev];
                updated[idx] = { ...updated[idx], isStreaming: false, isThinking: false, thinkingLabel: null };
                updated.push({
                  id: nextBubbleId,
                  content: '',
                  sender: 'ai',
                  timestamp: nextTimestamp,
                  isStreaming: true,
                  isThinking: true,
                  thinkingLabel: nextLabel
                });
                return updated;
              });
            } else {
              setMessages(prev => {
                const idx = findOwnedBubbleIdx(prev);
                if (idx === -1) return prev;
                const updated = [...prev];
                updated[idx] = { ...updated[idx], isThinking: true, thinkingLabel: data.label };
                return updated;
              });
            }
          } else if (data.type === 'text') {
            const text = data.content || '';
            if (text.trim()) ownedHasContent = true;
            setMessages(prev => appendToMessageById(prev, activeBubbleId, text, {
              isThinking: false,
              thinkingLabel: null
            }));
          } else if (data.type === 'done') {
            setMessages(prev => {
              const idx = findOwnedBubbleIdx(prev);
              if (idx === -1) return prev;
              const finalContent = data.message?.content;
              return prev.map((m, i) =>
                i === idx
                  ? {
                      ...m,
                      content: m.content || finalContent || '',
                      sender: 'ai',
                      timestamp: data.message?.timestamp || m.timestamp,
                      isStreaming: false,
                      isThinking: false,
                      thinkingLabel: null
                    }
                  : m
              );
            });
            setIsStreaming(false);
            setIsSending(false);
          } else if (data.type === 'error') {
            // Drop this stream's own bubble only — another in-flight stream's
            // bubble is not ours to remove.
            setMessages(prev => prev.filter(m => m.id !== activeBubbleId));
            setIsStreaming(false);
            setIsSending(false);
            toast.error(data.error || "Coach failed to review the submission.");
          }
        };

        try {
          while (!abortController.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  processChunk(JSON.parse(line.slice(6)));
                } catch (parseErr) {
                  console.error('Failed to parse v2 submission SSE line:', line, parseErr);
                }
              }
            }
          }
          if (!abortController.signal.aborted && buffer.startsWith('data: ')) {
            try { processChunk(JSON.parse(buffer.slice(6))); } catch {}
          }
        } finally {
          setIsStreaming(false);
          setIsSending(false);
          if (!abortController.signal.aborted) {
            await checkTaskCompletion(currentTask.id);
          }
        }
        return;
      }

      // Standard JSON path (v1 or non-v2)
      const submission = await response.json();

      setTaskSubmissions(prev => ({
        ...prev,
        [currentTask.id]: submission
      }));

      toast.success("Good job! You just submitted your deliverable.", {
        duration: 4000,
        action: {
          label: "Edit",
          onClick: () => setIsDeliverableSidebarOpen(true)
        }
      });

      await checkTaskCompletion(currentTask.id);

    } catch (error) {
      // Ignore abort errors - they're expected when switching tasks / unmounting
      if (error.name === 'AbortError') {
        console.log('🚫 Deliverable submit request aborted');
        return;
      }
      console.error('❌ Error submitting deliverable:', error);
      toast.error(error.message || "Failed to submit deliverable. Please try again.");
    }
  };

  // Handler for Next Exercise button on completion bar
  const handleNextExercise = async () => {
    const currentTask = tasks[currentTaskIndex];
    
    if (!currentTask?.id) {
      toast.error("Unable to proceed - current task not found");
      return;
    }
    
    try {
      // Mark current task as complete
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/complete-task/${currentTask.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            notes: ''
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to mark task as complete');
      }
      
      console.log('✅ Task marked as complete');
      
      // Navigate to next task
      const nextTaskIndex = currentTaskIndex + 1;
      if (nextTaskIndex < tasks.length) {
        await handleTaskChange(nextTaskIndex);
      } else {
        toast.success("🎉 You've completed all exercises for today!");
      }
      
    } catch (error) {
      console.error('Error marking task complete:', error);
      toast.error("Failed to mark task complete. Please try again.");
    }
  };

  // Check if current task is a survey
  const isCurrentTaskSurvey = () => {
    const currentTask = tasks[currentTaskIndex];
    
    if (!currentTask) {
      return false;
    }
    
    const isSurvey = currentTask?.feedback_slot &&
                     typeof currentTask.feedback_slot === 'string' &&
                     currentTask.feedback_slot !== 'none';

    return isSurvey;
  };

  // Check if current task is an assessment
  const isCurrentTaskAssessment = () => {
    const currentTask = tasks[currentTaskIndex];
    
    if (!currentTask) {
      return false;
    }
    
    // Assessment detection based on task_type
    return currentTask?.task_type === 'assessment';
  };

  // Check if current task is a break
  const isCurrentTaskBreak = () => {
    const currentTask = tasks[currentTaskIndex];
    
    if (!currentTask) {
      return false;
    }
    
    // Break detection based on task_type
    return currentTask?.task_type === 'break';
  };

  // Check if current task is an onboarding (voice-first coach meet-and-greet)
  const isCurrentTaskOnboarding = () => tasks[currentTaskIndex]?.task_type === 'onboarding';

  // Check if current task is a retrospective (for peer feedback)
  const isRetrospectiveTask = () => {
    const currentTask = tasks[currentTaskIndex];
    
    if (!currentTask) {
      return false;
    }
    
    // Check if task title contains "retro" (case-insensitive)
    return currentTask?.task_title?.toLowerCase().includes('retro') || false;
  };

  // Normalized linked resources for the current task — feeds the Resources
  // popover in the chat tray and completion bars (empty array hides the button)
  const currentTaskResources = parseLinkedResources(tasks[currentTaskIndex]?.linked_resources);

  // Handle survey completion
  const handleSurveyComplete = async () => {
    const currentTask = tasks[currentTaskIndex];
    const isLastTask = currentTaskIndex === tasks.length - 1;
    
    if (!currentTask?.id) {
      toast.error("Unable to proceed - current task not found");
      return;
    }
    
    try {
      // Mark current task as complete
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/complete-task/${currentTask.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            notes: 'Survey completed'
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to mark task as complete');
      }
      
      console.log('✅ Survey task marked as complete');
      
      // Update local completion status
      setTaskCompletionMap(prev => ({
        ...prev,
        [currentTask.id]: {
          ...prev[currentTask.id],
          isComplete: true,
          reason: 'Survey completed'
        }
      }));
      
      // Navigate based on whether this is the last task
      if (isLastTask) {
        // If last task, navigate back to overview after delay
        setTimeout(() => {
          setShowDailyOverview(true);
        }, 2000);
      } else {
        // If not last task, navigate to next task after delay
        setTimeout(async () => {
          const nextTaskIndex = currentTaskIndex + 1;
          await handleTaskChange(nextTaskIndex);
        }, 2000);
      }
      
    } catch (error) {
      console.error('Error marking survey task complete:', error);
      toast.error("Failed to mark task complete. Please try again.");
    }
  };

  // Handle assessment completion
  const handleAssessmentComplete = async () => {
    const currentTask = tasks[currentTaskIndex];
    
    if (!currentTask?.id) {
      toast.error("Unable to proceed - current task not found");
      return;
    }
    
    try {
      // Mark current task as complete
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/complete-task/${currentTask.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            notes: 'Assessment completed'
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to mark task as complete');
      }
      
      console.log('✅ Assessment task marked as complete');
      
      // Update both local state and taskCompletionMap (single update)
      setIsTaskComplete(true);
      setTaskCompletionMap(prev => ({
        ...prev,
        [currentTask.id]: {
          ...prev[currentTask.id],
          isComplete: true,
          reason: 'Assessment completed'
        }
      }));

      // NO AUTO-NAVIGATION - let user click "Next Exercise" manually
      
    } catch (error) {
      console.error('Error marking assessment task complete:', error);
      toast.error("Failed to mark task complete. Please try again.");
    }
  };

  // Handle onboarding completion (mirrors handleSurveyComplete)
  // Onboarding completion path: mark the task complete + update the local
  // completion map. Do NOT auto-navigate — the OnboardingInterface renders
  // a TaskCompletionBar once isCompleted flips, matching the chat interface
  // pattern. The user clicks Next when they're ready (vs the previous
  // behavior that yanked them to the daily overview 2s after the marker).
  const handleOnboardingComplete = useCallback(async () => {
    const currentTask = tasks[currentTaskIndex];

    if (!currentTask?.id) {
      toast.error("Unable to proceed - current task not found");
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/complete-task/${currentTask.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            notes: 'Onboarding completed'
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to mark task as complete');
      }

      setTaskCompletionMap(prev => ({
        ...prev,
        [currentTask.id]: {
          ...prev[currentTask.id],
          isComplete: true,
          reason: 'Onboarding completed'
        }
      }));
    } catch (error) {
      console.error('Error marking onboarding task complete:', error);
      toast.error("Failed to mark task complete. Please try again.");
    }
  }, [tasks, currentTaskIndex, token]);

  // Show daily overview first
  if (showDailyOverview) {
    // Determine if this day is in the past by comparing dates
    const isPastDay = currentDay?.day_date ? (() => {
      const dayDate = new Date(currentDay.day_date);
      const today = new Date();
      
      // Set both to start of day for accurate comparison
      dayDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      return dayDate < today;
    })() : false;
    
    return (
      <>
        <DailyOverview 
          currentDay={currentDay}
          tasks={tasks}
          taskCompletionMap={taskCompletionMap}
          isPastDay={isPastDay}
          onStartActivity={handleStartActivity}
          isPageLoading={isPageLoading}
          navigate={navigate}
          isWorkshopParticipant={isWorkshopParticipant}
        />
        {/* Loading Curtain */}
        <LoadingCurtain isLoading={isPageLoading} />
      </>
    );
  }

  return (
    <>
      {/* Add a check for empty tasks */}
      {tasks.length === 0 ? (
        <div className="min-h-screen bg-bg-light flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-carbon-black mb-4">No Activities Available</h2>
            <p className="text-gray-600 mb-2">There are no activities scheduled for today.</p>
            <p className="text-gray-600 mb-6">Check back tomorrow for your next scheduled activities.</p>
            <button
              onClick={() => navigate('/calendar')}
              className="relative px-8 py-3 rounded-lg bg-pursuit-purple text-white font-proxima font-semibold overflow-hidden group active:scale-95 transition-all duration-300 hover:shadow-[0_0_0_1px_#4242EA]"
            >
              <span className="relative z-10 group-hover:text-pursuit-purple transition-colors duration-300">
                View Calendar
              </span>
              <div 
                className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-300 bg-bg-light"
              />
            </button>
          </div>
        </div>
      ) : (
        <div className="learning h-screen bg-bg-light flex flex-col">
      {/* Activity Header */}
      <ActivityHeader 
        currentDay={currentDay}
        tasks={tasks}
        currentTaskIndex={currentTaskIndex}
        onTaskChange={handleTaskChange}
        isWorkshopParticipant={isWorkshopParticipant}
      />

      {/* Main Content Area - Takes remaining height */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Survey Interface OR Assessment Interface OR Break Interface OR Chat Interface */}
        {isCurrentTaskSurvey() ? (
          // Survey Interface
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <SurveyInterface
              taskId={tasks[currentTaskIndex]?.id}
              dayNumber={currentDay?.day_number}
              cohort={currentDay?.cohort}
              surveyType={tasks[currentTaskIndex]?.feedback_slot}
              onComplete={handleSurveyComplete}
              isCompleted={taskCompletionMap[tasks[currentTaskIndex]?.id]?.isComplete || false}
              isLastTask={currentTaskIndex === tasks.length - 1}
            />
          </div>
        ) : isCurrentTaskAssessment() ? (
          // Assessment Interface
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <AssessmentInterface
              key={`assessment-${tasks[currentTaskIndex]?.id}`}
              taskId={tasks[currentTaskIndex]?.id}
              assessmentId={tasks[currentTaskIndex]?.assessment_id}
              dayNumber={currentDay?.day_number}
              cohort={currentDay?.cohort}
              onComplete={handleAssessmentComplete}
              isCompleted={taskCompletionMap[tasks[currentTaskIndex]?.id]?.isComplete || false}
              isLastTask={currentTaskIndex === tasks.length - 1}
              externalPanelOpen={isAssessmentPanelOpen}
              onExternalPanelOpenChange={setIsAssessmentPanelOpen}
              onAssessmentTypeLoaded={setCurrentAssessmentType}
            />
            
            {/* Assessment Task Completion Bar - Same as chat interface */}
            <div className="absolute bottom-6 left-0 right-0 px-6 z-10 pointer-events-none">
              <div className="max-w-2xl mx-auto pointer-events-auto">
                {(isTaskComplete || taskCompletionMap[tasks[currentTaskIndex]?.id]?.isComplete) && (
                  <TaskCompletionBar
                    onNextExercise={handleNextExercise}
                    isLastTask={currentTaskIndex === tasks.length - 1}
                    showViewSubmission={currentAssessmentType !== 'self'}
                    onViewSubmission={() => setIsAssessmentPanelOpen(true)}
                    resources={currentTaskResources}
                  />
                )}
              </div>
            </div>
          </div>
        ) : isCurrentTaskBreak() ? (
          // Break Interface
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <BreakInterface
              taskTitle={tasks[currentTaskIndex]?.task_title}
            />
          </div>
        ) : isCurrentTaskOnboarding() ? (
          // Onboarding Interface (voice-first coach meet-and-greet)
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <OnboardingInterface
              key={`onboarding-${tasks[currentTaskIndex]?.id}`}
              taskId={tasks[currentTaskIndex]?.id}
              userId={user?.id}
              isCompleted={taskCompletionMap[tasks[currentTaskIndex]?.id]?.isComplete || false}
              isLastTask={currentTaskIndex === tasks.length - 1}
              onComplete={handleOnboardingComplete}
              onNextExercise={handleNextExercise}
            />
          </div>
        ) : (
          // Chat Interface
        <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
          {/* Messages Area - Scrollable with proper spacing */}
          <div 
            className="flex-1 min-h-0 overflow-y-auto py-8 px-6" 
            style={{ paddingBottom: `${inputTrayHeight}px` }}
          >
            <div className="max-w-2xl mx-auto">
              {messages.map((message, index) => {
                const isStreamingMessage = message.isStreaming === true;
                
                return (
                  <div key={message.id || index} className="mb-6">
                    {message.sender === 'user' ? (
                      // User message with avatar inside
                      <div className="bg-stardust rounded-lg px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                            <span className="text-pursuit-purple text-sm font-proxima font-semibold">
                              {user?.firstName ? user.firstName.charAt(0).toUpperCase() : 'U'}
                            </span>
                          </div>
                          <div className="flex-1 text-carbon-black leading-relaxed text-base font-proxima">
                            {message.content}
                          </div>
                        </div>
                      </div>
                    ) : message.isStreaming && !message.content ? (
                      // Streaming AI message waiting for first chunk — show preloader inline.
                      // If a thinkingLabel is set (phase transition), show it next to the spinner.
                      <div className="flex items-center gap-3">
                        <img src="/preloader.gif" alt="Loading..." className="w-8 h-8" />
                        {message.thinkingLabel && (
                          <span className="italic text-gray-500 text-sm font-proxima">
                            {message.thinkingLabel}
                          </span>
                        )}
                      </div>
                    ) : (
                      <>
                        <StreamingMarkdownMessage
                          content={message.content}
                          animateOnMount={!!message.shouldAnimate}
                        />
                        {message.truncated && !message.isStreaming && (
                          <div className="mt-2 flex items-center gap-3 text-sm text-carbon-black/70 font-proxima">
                            <span>Response was cut off.</span>
                            <button
                              type="button"
                              onClick={handleContinueGeneration}
                              disabled={isSending || isAiThinking || isStreaming || !isActive}
                              className="inline-flex items-center gap-1 rounded-full border border-pursuit-purple px-3 py-1 text-pursuit-purple hover:bg-pursuit-purple hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <span aria-hidden="true">⏵</span>
                              Continue
                            </button>
                          </div>
                        )}
                        {/* [OPEN_ASSIGNMENT] marker → inline button opening the DeliverablePanel */}
                        {message.showAssignment && !message.isStreaming && (
                          <div className="mt-2 font-proxima">
                            <button
                              type="button"
                              onClick={() => setIsDeliverableSidebarOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-pursuit-purple px-4 py-1.5 text-sm text-stardust hover:bg-pursuit-purple/90 transition-colors"
                            >
                              <span aria-hidden="true">📋</span>
                              Open Assignment
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              
              {/* Loading indicator — only for non-streaming thinking (conversation loading) */}
              {isAiThinking && !isStreaming && (
                <div className="mb-6">
                  <img src="/preloader.gif" alt="Loading..." className="w-8 h-8" />
                </div>
              )}
              
              {/* Invisible element for auto-scroll */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Chat Input OR Task Completion Bar - Absolute positioned at bottom */}
          <div className="absolute bottom-6 left-0 right-0 px-6 z-10 pointer-events-none">
            <div className="max-w-2xl mx-auto pointer-events-auto">
              <div ref={chatTrayRef}>
              {(isTaskComplete || taskCompletionMap[tasks[currentTaskIndex]?.id]?.isComplete) ? (
                <TaskCompletionBar
                  onNextExercise={handleNextExercise}
                  isLastTask={currentTaskIndex === tasks.length - 1}
                  showViewSubmission={['video', 'document', 'link', 'structured', 'image'].includes(tasks[currentTaskIndex]?.deliverable_type)}
                  onViewSubmission={() => setIsDeliverableSidebarOpen(true)}
                  resources={currentTaskResources}
                />
              ) : (
              <AutoExpandTextarea
                ref={textareaRef}
                onSubmit={handleSendMessage}
                disabled={isSending || isAiThinking || isStreaming || !isActive}
                showAssignmentButton={['video', 'document', 'link', 'structured', 'image', 'file', 'url'].includes(tasks[currentTaskIndex]?.deliverable_type)}
                onAssignmentClick={() => setIsDeliverableSidebarOpen(true)}
                showPeerFeedbackButton={isRetrospectiveTask()}
                onPeerFeedbackClick={() => setIsPeerFeedbackSheetOpen(true)}
                showLlmDropdown={['conversation', 'personalized'].includes(tasks[currentTaskIndex]?.task_mode)}
                resources={currentTaskResources}
                onHeightChange={handleInputTrayHeightChange}
              />
              )}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Deliverable Sidebar - Only show for non-survey, non-assessment, and non-break tasks */}
        {tasks[currentTaskIndex] && !isCurrentTaskSurvey() && !isCurrentTaskAssessment() && !isCurrentTaskBreak() && !isCurrentTaskOnboarding() && (
          <DeliverablePanel
            task={tasks[currentTaskIndex]}
            currentSubmission={taskSubmissions[tasks[currentTaskIndex].id]}
            isOpen={isDeliverableSidebarOpen}
            onClose={() => setIsDeliverableSidebarOpen(false)}
            onSubmit={handleDeliverableSubmit}
            userId={user?.id}
            taskId={tasks[currentTaskIndex].id}
            isStreaming={isSending || isAiThinking || isStreaming}
          />
        )}

        {/* Peer Feedback Sheet - Show for retrospective tasks */}
        {tasks[currentTaskIndex] && isRetrospectiveTask() && (
          <PeerFeedbackSheet
            isOpen={isPeerFeedbackSheetOpen}
            onClose={() => setIsPeerFeedbackSheetOpen(false)}
            dayNumber={currentDay?.day_number}
            cohort={currentDay?.cohort}
            token={token}
          />
        )}
      </div>

          {/* Workshop Lock Banner */}
          {workshopInfo?.isLocked && (
            <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mx-6 mt-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🔒</div>
                <div>
                  <h3 className="font-bold text-yellow-800">Workshop Content Locked</h3>
                  <p className="text-yellow-700">
                    Tasks will be available on{' '}
                    <strong>
                      {new Date(workshopInfo.startDate).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        timeZone: 'America/New_York'
                      })}
                    </strong>
                    {workshopInfo.daysUntilStart > 0 && (
                      <span> ({workshopInfo.daysUntilStart} {workshopInfo.daysUntilStart === 1 ? 'day' : 'days'} from now)</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Loading Curtain */}
      <LoadingCurtain isLoading={isPageLoading} />
    </>
  );
}

export default Learning;
