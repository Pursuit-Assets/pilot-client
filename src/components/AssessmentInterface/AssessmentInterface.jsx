import React, { useState, useEffect, useRef } from 'react';
import useAuthStore from '../../stores/authStore';
import { toast } from 'sonner';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { FaInfoCircle } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import AutoExpandTextarea from '../../components/AutoExpandTextarea';
import AssessmentDeliverablePanel from './AssessmentDeliverablePanel';
import SelfAssessmentQuestionnaire from './SelfAssessmentQuestionnaire';

import { useStreamingText } from '../../hooks/useStreamingText';
import { createCodeRenderers } from '../markdown/codeRenderers';

const codeRenderers = createCodeRenderers({
  inlineClassName: 'px-1.5 py-0.5 rounded text-sm font-mono bg-gray-200 text-carbon-black',
  preClassName: 'p-4 rounded-lg my-4 overflow-x-auto text-sm font-mono bg-gray-100 text-carbon-black',
});

// Component that wraps ReactMarkdown with streaming text support
// Uses useStreamingText to smooth out bursty SSE chunks into natural typing flow
const StreamingMarkdownMessage = ({ content }) => {
  const displayedContent = useStreamingText(content || '');
  
  // Preprocess content to convert bullet points and URLs to markdown
  let processedContent = displayedContent;
  
  // Strip all ** (bold markdown) from the content BEFORE processing
  processedContent = processedContent.replace(/\*\*/g, '');
  
  // Convert URLs to markdown links
  processedContent = processedContent.replace(
    /([A-Z][^\n(]+?)\s+\(([^)]+)\):\s+([^\n]+?)\s+(https?:\/\/[^\s\n]+)/g,
    '[$1 ($2)]($4): $3'
  );
  
  // Fallback: Convert any remaining bare URLs to clickable links
  processedContent = processedContent.replace(
    /(?<!\()(?<!]\()https?:\/\/[^\s)]+/g,
    (url) => `[${url}](${url})`
  );
  
  // Convert bullet points to markdown
  processedContent = processedContent.replace(/^•\s+/gm, '- ');
  processedContent = processedContent.replace(/\n•\s+/g, '\n- ');
  
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
          code: codeRenderers.code,
          pre: codeRenderers.pre,
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

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

function AssessmentInterface({
  taskId,
  assessmentId,
  dayNumber,
  cohort,
  onComplete,
  isCompleted = false,
  isLastTask = false,
  externalPanelOpen = false,
  onExternalPanelOpenChange = null,
  onAssessmentTypeLoaded = null,
  isPreviewMode = false
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [assessmentData, setAssessmentData] = useState(null);
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Chat state - using same pattern as Learning.jsx
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasInitialMessage, setHasInitialMessage] = useState(false);
  const [inputTrayHeight, setInputTrayHeight] = useState(180);
  const handleInputTrayHeightChange = (height) => {
    setInputTrayHeight(height);
  };
  
  // UI state
  const [showDeliverablePanel, setShowDeliverablePanel] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [hasViewedInstructions, setHasViewedInstructions] = useState(false);
  
  // Draft form data - persists when sidebar closes (cleared on successful submission)
  const [draftFormData, setDraftFormData] = useState(null);
  
  // Check localStorage for instructions viewed status on mount
  useEffect(() => {
    if (assessmentId) {
      const storageKey = `assessment_instructions_viewed_${assessmentId}`;
      const viewed = localStorage.getItem(storageKey) === 'true';
      setHasViewedInstructions(viewed);
    }
  }, [assessmentId]);
  
  // Mark instructions as viewed in localStorage
  const markInstructionsViewed = () => {
    if (assessmentId) {
      const storageKey = `assessment_instructions_viewed_${assessmentId}`;
      localStorage.setItem(storageKey, 'true');
      setHasViewedInstructions(true);
    }
  };
  
  // Auto-open instructions modal on first visit (after data loads)
  useEffect(() => {
    if (!loading && assessmentData && !hasViewedInstructions && !isCompleted) {
      // Small delay to ensure component is fully rendered
      const timer = setTimeout(() => {
        setShowInstructionsModal(true);
        markInstructionsViewed();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, assessmentData, hasViewedInstructions, isCompleted]);
  
  // Sync external panel state with internal state
  useEffect(() => {
    if (externalPanelOpen && !showDeliverablePanel) {
      setShowDeliverablePanel(true);
    }
  }, [externalPanelOpen]);
  
  // Handle panel close - notify parent if external control is used
  const handlePanelClose = () => {
    setShowDeliverablePanel(false);
    if (onExternalPanelOpenChange) {
      onExternalPanelOpenChange(false);
    }
  };
  
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sendMessageAbortControllerRef = useRef(null);
  const chatTrayRef = useRef(null);

  // Check if user has active status
  const isActive = user?.active !== false;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Cleanup: abort any pending requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (sendMessageAbortControllerRef.current) {
        sendMessageAbortControllerRef.current.abort();
      }
    };
  }, []);

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
  }, [assessmentId, isCompleted]);

  useEffect(() => {
    if (assessmentId && token && taskId) {
      console.log(`📋 AssessmentInterface mounted/updated - loading data for task ${taskId}, assessment ${assessmentId}, isPreviewMode: ${isPreviewMode}`);
      loadAssessmentDataAndConversation();
    } else {
      if (!assessmentId) {
        setError('No assessment ID provided');
        setLoading(false);
      }
    }
  }, [assessmentId, token, taskId]);

  const loadAssessmentDataAndConversation = async () => {
    try {
      setLoading(true);
      setError('');

      // Reset conversation state so stale messages from a previous assessment
      // don't bleed into the newly-selected one.
      // (currentSubmission and draftFormData are reset by the key-prop remount
      // and then set correctly from the backend response below.)
      setMessages([]);
      setHasInitialMessage(false);
      setIsAiThinking(false);
      setIsStreaming(false);
      setIsSending(false);

      // Load assessment data and task conversation in parallel
      const [assessmentResponse, conversationResponse] = await Promise.all([
        // Load assessment details — include isPreviewMode so the backend
        // returns only the correct submission (preview vs real)
        fetch(`${import.meta.env.VITE_API_URL}/api/assessments/${assessmentId}?isPreviewMode=${isPreviewMode}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        // Load task conversation — include isPreviewMode so the backend
        // queries the correct thread (is_preview = true for ContentPreview)
        fetch(
          `${import.meta.env.VITE_API_URL}/api/learning/task-messages/${taskId}?dayNumber=${dayNumber}&cohort=${cohort}&isPreviewMode=${isPreviewMode}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        ).catch(() => null)
      ]);

      // Handle assessment data
      if (!assessmentResponse.ok) {
        const errorData = await assessmentResponse.json().catch(() => ({ error: 'Unknown error' }));
        
        if (assessmentResponse.status === 401) {
          setError('Authentication required. Please refresh the page and try again.');
        } else if (assessmentResponse.status === 403) {
          setError(errorData.error || 'Assessment not available');
        } else {
          setError(`Failed to load assessment: ${errorData.error || 'Unknown error'}`);
        }
        return;
      }

      const assessmentData = await assessmentResponse.json();
      console.log('📋 Loaded assessment data:', assessmentData);

      setAssessmentData(assessmentData.assessment);
      setCurrentSubmission(assessmentData.submission);
      
      // Report assessment type to parent (for showing/hiding View Submission button)
      if (onAssessmentTypeLoaded) {
        onAssessmentTypeLoaded(assessmentData.assessment?.assessment_type);
      }

      // Handle conversation data
      // For assessments, we DON'T auto-start conversations - user sees instructions first
      // and can optionally chat with the LLM when they send a message
      if (conversationResponse && conversationResponse.ok) {
        const conversationData = await conversationResponse.json();
        console.log(`📨 Loaded ${conversationData.messages?.length || 0} messages for assessment task ${taskId}`);

        if (conversationData.messages && conversationData.messages.length > 0) {
          // Has existing conversation - load it
          const formattedMessages = conversationData.messages.map(msg => ({
            id: msg.message_id,
            content: msg.content,
            sender: msg.role === 'user' ? 'user' : 'ai',
            timestamp: msg.timestamp,
          }));

          setMessages(formattedMessages);
          setHasInitialMessage(true);
        }
        // If no messages, don't auto-start - show instructions and let user initiate
      } else if (conversationResponse) {
        console.warn(`⚠️ Conversation fetch for assessment task ${taskId} returned status ${conversationResponse.status}`);
      } else {
        console.warn(`⚠️ Conversation fetch for assessment task ${taskId} failed (network error)`);
      }

    } catch (err) {
      console.error('❌ Error loading assessment:', err);
      setError(`Failed to load assessment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Start task conversation using existing Learning page pattern
  const startTaskConversation = async () => {
    try {
      setIsAiThinking(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/messages/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            taskId: taskId,
            dayNumber: dayNumber,
            cohort: cohort,
            conversationModel: 'anthropic/claude-sonnet-4.6',
            isPreviewMode: isPreviewMode,
          }),
        }
      );
      
      if (response.status === 409) {
        // Conversation already exists - load messages instead
        const data = await response.json();
        console.log('⚠️ Conversation already started:', data.message);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        console.log('🚀 Started assessment conversation:', data);
        
        // Add the first message from the assistant
        const firstMessage = {
          id: data.message_id,
          content: data.content,
          sender: 'ai',
          timestamp: data.timestamp,
        };
        setMessages([firstMessage]);
        setHasInitialMessage(true);
      } else {
        console.error('Failed to start assessment conversation');
      }
    } catch (error) {
      console.error('Error starting assessment conversation:', error);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Send message using streaming endpoint
  const handleSendMessage = async (messageContent, modelFromTextarea) => {
    if (!messageContent || !messageContent.trim() || isSending || isAiThinking || isStreaming) return;
    
    const trimmedMessage = messageContent.trim();
    
    setIsSending(true);
    setIsAiThinking(true);
    setIsStreaming(true);
    setError('');
    
    // Abort any previous message send request
    if (sendMessageAbortControllerRef.current) {
      sendMessageAbortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    sendMessageAbortControllerRef.current = abortController;

    try {
      const now = Date.now();
      const streamingMessageId = now + 1;
      // Add user message to chat
      const userMessage = {
        id: now,
        content: trimmedMessage,
        sender: 'user',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [
        ...prev,
        userMessage,
        {
          id: streamingMessageId,
          content: '',
          sender: 'ai',
          timestamp: new Date().toISOString(),
          isStreaming: true
        }
      ]);

      // Use the dedicated assessment streaming endpoint (GPT-style, no restrictive prompt)
      const streamResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/learning/assessment/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: trimmedMessage,
            taskId: taskId,
            dayNumber: dayNumber,
            cohort: cohort,
            conversationModel: modelFromTextarea || 'anthropic/claude-sonnet-4.6',
            isPreviewMode: isPreviewMode,
          }),
          signal: abortController.signal,
        }
      );

      if (!streamResponse.ok) {
        throw new Error(`API error: ${streamResponse.status}`);
      }

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const chunk = JSON.parse(line.slice(6));

            if (chunk.type === 'text') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === streamingMessageId
                    ? { ...msg, content: `${msg.content || ''}${chunk.content}` }
                    : msg
                )
              );
            } else if (chunk.type === 'done' && chunk.message) {
              // Update content but keep id and isStreaming stable so animation continues
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === streamingMessageId
                    ? { ...msg, content: chunk.message.content }
                    : msg
                )
              );
              // Enable input immediately
              setIsStreaming(false);
              setIsAiThinking(false);
              setIsSending(false);

              // Finalize message after animation catches up
              const finalMessage = chunk.message;
              setTimeout(() => {
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === streamingMessageId
                      ? {
                          id: finalMessage.message_id,
                          content: finalMessage.content,
                          sender: 'ai',
                          timestamp: finalMessage.timestamp,
                          isStreaming: false,
                        }
                      : msg
                  )
                );
              }, 1500);
            } else if (chunk.type === 'error') {
              setMessages(prev => prev.filter(msg => msg.id !== streamingMessageId));
              setIsStreaming(false);
              setIsAiThinking(false);
              setIsSending(false);
              setError(chunk.error || 'Failed to send message. Please try again.');
            }
          } catch (parseErr) {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (error) {
      // Ignore abort errors - they're expected when switching tasks
      if (error.name === 'AbortError') {
        console.log('🚫 Message send request aborted');
        return;
      }
      
      console.error('Error sending message:', error);
      setError('An error occurred. Please try again.');
    } finally {
      // Only clear loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsSending(false);
        setIsAiThinking(false);
        setIsStreaming(false);
      }
    }
  };

  const handleAssessmentSubmit = async (submissionData) => {
    if (!assessmentId) {
      toast.error("Unable to submit - assessment not found");
      return;
    }

    try {
      console.log('📤 Submitting assessment:', assessmentId, submissionData);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/assessments/${assessmentId}/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          submission_data: submissionData,
          status: 'submitted',
          isPreviewMode: isPreviewMode
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit assessment');
      }

      const submission = await response.json();
      console.log('✅ Assessment submission successful:', submission);

      setCurrentSubmission(submission.submission);
      setDraftFormData(null); // Clear draft data after successful submission
      
      toast.success("Assessment submitted successfully!", {
        duration: 4000,
      });

      setShowDeliverablePanel(false);

      // Trigger completion callback to update parent state
      if (onComplete) {
        await onComplete();
      }

    } catch (error) {
      console.error('❌ Error submitting assessment:', error);
      toast.error(error.message || "Failed to submit assessment. Please try again.");
    }
  };

  const handleShowInstructions = () => {
    setShowInstructionsModal(true);
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-y-auto py-8 px-6" style={{ paddingBottom: `${inputTrayHeight}px` }}>
          <div className="max-w-2xl mx-auto">
            {/* Loading indicator in chat area */}
            <div className="mb-6">
              <img 
                src="/preloader.gif" 
                alt="Loading..." 
                className="w-8 h-8"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-light">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-carbon-black mb-2 font-proxima">Assessment Unavailable</h3>
          <p className="text-carbon-black/70 mb-4 font-proxima">{error}</p>
          <button
            onClick={loadAssessmentDataAndConversation}
            className="px-4 py-2 bg-pursuit-purple text-white rounded-lg hover:bg-pursuit-purple/90 transition-colors font-proxima"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!assessmentData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-light">
        <div className="text-center">
          <p className="text-carbon-black font-proxima">Assessment not found</p>
        </div>
      </div>
    );
  }

  // For self assessments, render the questionnaire component instead of chat
  if (assessmentData.assessment_type === 'self') {
    return (
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <SelfAssessmentQuestionnaire
          assessmentId={assessmentId}
          taskId={taskId}
          isPreviewMode={isPreviewMode}
          onComplete={async () => {
            // Reload submission data
            await loadAssessmentDataAndConversation();
            // Call parent completion handler
            if (onComplete) {
              await onComplete();
            }
          }}
          isCompleted={isCompleted || (currentSubmission?.status === 'submitted')}
          onShowInstructions={handleShowInstructions}
        />

        {/* Instructions Dialog for Self Assessment */}
        <Dialog open={showInstructionsModal} onOpenChange={setShowInstructionsModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-proxima text-carbon-black">
                <FaInfoCircle className="w-5 h-5 text-blue-600" />
                Self Assessment Instructions
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 text-carbon-black font-proxima">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-2">Self Assessment</h3>
                <p className="text-sm text-carbon-black/70 mb-3">
                  This 9-question assessment helps us understand your current confidence and skills across four key areas:
                </p>
                <ol className="list-decimal pl-6 space-y-1 text-sm">
                  <li>Product & Business Thinking</li>
                  <li>Professional & Learning Skills</li>
                  <li>AI Direction & Collaboration</li>
                  <li>Technical Concepts & Integration</li>
                </ol>
                <p className="text-sm text-carbon-black/70 mt-3">
                  Your honest responses will help us provide better support throughout the program.
                </p>
                <p className="text-sm text-carbon-black/70 mt-2">
                  The assessment should take about 10-15 minutes to complete.
                </p>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={() => setShowInstructionsModal(false)}
                  className="px-6 py-2 bg-pursuit-purple text-white rounded-lg hover:bg-pursuit-purple/90 transition-colors font-proxima"
                >
                  Got it!
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
      {/* Messages Area - Same as Learning.jsx */}
      <div className="flex-1 min-h-0 overflow-y-auto py-8 px-6" style={{ paddingBottom: `${inputTrayHeight}px` }}>
        <div className="max-w-2xl mx-auto">
          {/* Assessment Header - Show when no conversation exists */}
          {messages.length === 0 && (
            <div className="mb-8">
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <h1 className="text-2xl font-bold text-carbon-black font-proxima">
                    {assessmentData.assessment_name}
                  </h1>
                  {(isCompleted || currentSubmission?.status === 'submitted') ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-proxima bg-green-50 text-green-700 border border-green-200">
                      <CheckCircle className="w-4 h-4" />
                      Submitted
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-proxima bg-blue-50 text-blue-700 border border-blue-200">
                      <AlertCircle className="w-4 h-4" />
                      Assessment
                    </div>
                  )}
                </div>

                <div className="text-sm text-carbon-black/60 font-proxima">
                  {assessmentData.assessment_type?.charAt(0).toUpperCase() + assessmentData.assessment_type?.slice(1)} Assessment
                  {assessmentData.assessment_period && ` • ${assessmentData.assessment_period}`}
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages - Same format as Learning.jsx */}
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
                ) : (
                  // AI message - StreamingMarkdownMessage handles both streaming and static
                  <StreamingMarkdownMessage content={message.content} />
                )}
              </div>
            );
          })}
          
          {/* Loading indicator */}
          {(isAiThinking && !isStreaming) || (isStreaming && messages.length > 0 && messages[messages.length - 1]?.sender === 'ai' && !messages[messages.length - 1]?.content) ? (
            <div className="mb-6">
              <img 
                src="/preloader.gif" 
                alt="Loading..." 
                className="w-8 h-8"
              />
            </div>
          ) : null}
          
          {/* Invisible element for auto-scroll */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input - Same as Learning.jsx but with assessment buttons */}
      {/* Chat Input - Fixed at bottom - HIDE when task is completed */}
      {!isCompleted && (
        <div className="absolute bottom-6 left-0 right-0 px-6 z-10 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div ref={chatTrayRef}>
            <AutoExpandTextarea
              onSubmit={handleSendMessage}
              disabled={isSending || isAiThinking || isStreaming || !isActive}
              showAssignmentButton={true}
              onAssignmentClick={() => setShowDeliverablePanel(true)}
              assignmentButtonText="Submit Assessment"
              showInstructionsButton={true}
              onInstructionsClick={handleShowInstructions}
              showLlmDropdown={false}
              onHeightChange={handleInputTrayHeightChange}
            />
            </div>
          </div>
        </div>
      )}

      {/* Assessment-Specific Deliverable Panel */}
      {assessmentData && (
        <AssessmentDeliverablePanel
          assessmentType={assessmentData.assessment_type}
          assessmentName={assessmentData.assessment_name}
          assessmentData={assessmentData}
          currentSubmission={currentSubmission}
          draftFormData={draftFormData}
          onDraftUpdate={setDraftFormData}
          isOpen={showDeliverablePanel}
          onClose={handlePanelClose}
          onSubmit={handleAssessmentSubmit}
          isLocked={!isActive || (currentSubmission?.status === 'submitted' && !currentSubmission?.resubmission_allowed)}
        />
      )}

      {/* Instructions Dialog */}
      <Dialog open={showInstructionsModal} onOpenChange={setShowInstructionsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-proxima text-carbon-black">
              <FaInfoCircle className="w-5 h-5 text-blue-600" />
              Assessment Instructions
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 text-carbon-black font-proxima">
            {/* Assessment Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-carbon-black/70">
                {assessmentData?.assessment_type?.charAt(0).toUpperCase() + assessmentData?.assessment_type?.slice(1)} Assessment
                {assessmentData?.assessment_period && ` • ${assessmentData?.assessment_period}`}
              </p>
            </div>

            {/* Instructions Content */}
            <div className="prose prose-sm max-w-none text-carbon-black leading-relaxed">
              <ReactMarkdown>
                {assessmentData?.instructions || ''}
              </ReactMarkdown>
            </div>

            {/* Action Button */}
            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="px-6 py-2 bg-pursuit-purple text-white rounded-lg hover:bg-pursuit-purple/90 transition-colors font-proxima"
              >
                Got it!
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AssessmentInterface;