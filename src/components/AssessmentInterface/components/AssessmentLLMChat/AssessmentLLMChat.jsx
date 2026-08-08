import React, { useState, useRef, useEffect } from 'react';
import { FaPaperPlane, FaRobot, FaUser, FaInfoCircle, FaArrowLeft } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import useAuthStore from '../../../../stores/authStore';
import './AssessmentLLMChat.css';
import { createCodeRenderers } from '../../../markdown/codeRenderers';

const codeRenderers = createCodeRenderers({
  inlineClassName: 'inline-code',
  preClassName: 'assessment-code-block',
});

function AssessmentLLMChat({ 
  assessmentId, 
  onConversationUpdate, 
  initialConversation = null, 
  disabled = false,
  onShowInstructions,
  onBackToAssessments,
  onSubmitDeliverables,
  isSubmissionPanelOpen,
  readonly = false
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [error, setError] = useState('');
  const [threadId, setThreadId] = useState(null);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const threadCreationInitiated = useRef(false);
  const currentAssessmentId = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Reset thread creation flag when assessment changes
  useEffect(() => {
    console.log('Assessment changed, resetting thread creation flag:', assessmentId);
    
    // Only reset if this is actually a different assessment
    if (currentAssessmentId.current !== assessmentId) {
      console.log('Different assessment detected, resetting state');
      currentAssessmentId.current = assessmentId;
      threadCreationInitiated.current = false;
      setThreadId(null);
      setIsCreatingThread(false);
    } else {
      console.log('Same assessment, skipping reset (React Strict Mode double execution)');
    }
    
    // Cleanup function
    return () => {
      console.log('Cleanup: Assessment effect cleanup for:', assessmentId);
    };
  }, [assessmentId]);

  // Initialize messages from initial conversation and get/create thread
  useEffect(() => {
    console.log('AssessmentLLMChat useEffect triggered:', { 
      token: !!token, 
      assessmentId, 
      isCreatingThread, 
      threadId, 
      threadCreationInitiated: threadCreationInitiated.current 
    });
    
    // Only create thread if we have a token and assessment ID, haven't initiated creation, and don't already have a thread
    if (token && assessmentId && !threadCreationInitiated.current && !threadId) {
      console.log('Calling getOrCreateAssessmentThread from useEffect');
      threadCreationInitiated.current = true;
      getOrCreateAssessmentThread();
    } else {
      console.log('Skipping thread creation:', { 
        hasToken: !!token, 
        hasAssessmentId: !!assessmentId, 
        threadCreationInitiated: threadCreationInitiated.current,
        hasThreadId: !!threadId 
      });
    }
  }, [assessmentId, token]);

  // Load initial conversation data when available
  useEffect(() => {
    if (initialConversation && initialConversation.messages && initialConversation.messages.length > 0) {
      console.log('Loading initial conversation:', initialConversation.messages.length, 'messages');
      setMessages(initialConversation.messages);
      if (initialConversation.threadId) {
        setThreadId(initialConversation.threadId);
      }
    }
  }, [initialConversation]);

  const getOrCreateAssessmentThread = async () => {
    console.log('getOrCreateAssessmentThread called:', { isCreatingThread, threadId, assessmentId });
    
    // Prevent concurrent thread creation
    if (isCreatingThread || threadId) {
      console.log('Thread creation already in progress or thread exists, skipping...', { isCreatingThread, threadId });
      return threadId;
    }

    try {
      console.log('Setting isCreatingThread to true');
      setIsCreatingThread(true);
      console.log('Creating thread for assessment:', assessmentId);
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/assessments/${assessmentId}/thread`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Thread creation response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Thread created successfully:', data);
        setThreadId(data.threadId);
        
        // Only load messages from thread if we don't already have messages from initial conversation
        if (messages.length === 0) {
          loadThreadMessages(data.threadId);
        }
        
        return data.threadId;
      } else {
        const errorData = await response.json();
        console.error('Failed to get/create assessment thread:', errorData);
        return null;
      }
    } catch (error) {
      console.error('Error getting assessment thread:', error);
      return null;
    } finally {
      setIsCreatingThread(false);
    }
  };

  const loadThreadMessages = async (threadId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chat/messages?threadId=${threadId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const formattedMessages = data.map(msg => ({
          id: msg.message_id,
          role: msg.message_role,
          content: msg.content,
          timestamp: msg.created_at
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Error loading thread messages:', error);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [newMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateConversationData = (updatedMessages) => {
    const conversationData = {
      conversation_id: threadId || `conv_${Date.now()}`,
      assessment_id: assessmentId,
      thread_id: threadId,
      threadId: threadId, // Also include threadId for easier access
      messages: updatedMessages,
      conversation_metadata: {
        total_messages: updatedMessages.length,
        user_message_count: updatedMessages.filter(m => m.role === 'user').length,
        assistant_message_count: updatedMessages.filter(m => m.role === 'assistant').length,
        last_updated: new Date().toISOString(),
        conversation_duration_minutes: Math.round(
          (new Date() - new Date(updatedMessages[0]?.timestamp || Date.now())) / (1000 * 60)
        )
      }
    };

    if (onConversationUpdate) {
      onConversationUpdate(conversationData);
    }
  };

  // Format message content similar to GPT component
  const formatMessageContent = (content) => {
    // More robust regex to handle multiple code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        // Extract language and code with better regex
        const match = part.match(/```(\w+)?\s*\n?([\s\S]*?)\s*```/);
        const language = match?.[1] || '';
        const code = match?.[2] || '';
        
        return (
          <pre key={index} className="assessment-code-block">
            {language && <div className="assessment-code-language">{language}</div>}
            <code>{code}</code>
          </pre>
        );
      }
      
      // Skip empty parts
      if (!part.trim()) {
        return null;
      }
      
      return (
        <ReactMarkdown 
          key={index}
          components={{
            // Override code handling to ensure no ReactMarkdown code blocks interfere
            code: codeRenderers.code,
            pre: codeRenderers.pre,
            p: ({node, children, ...props}) => (
              <p className="markdown-paragraph" {...props}>{children}</p>
            ),
            h1: ({node, children, ...props}) => (
              <h1 className="markdown-heading" {...props}>{children}</h1>
            ),
            h2: ({node, children, ...props}) => (
              <h2 className="markdown-heading" {...props}>{children}</h2>
            ),
            h3: ({node, children, ...props}) => (
              <h3 className="markdown-heading" {...props}>{children}</h3>
            ),
            h4: ({node, children, ...props}) => (
              <h4 className="markdown-heading" {...props}>{children}</h4>
            ),
            h5: ({node, children, ...props}) => (
              <h5 className="markdown-heading" {...props}>{children}</h5>
            ),
            h6: ({node, children, ...props}) => (
              <h6 className="markdown-heading" {...props}>{children}</h6>
            ),
            ul: ({node, children, ...props}) => (
              <ul className="markdown-list" {...props}>{children}</ul>
            ),
            ol: ({node, children, ...props}) => (
              <ol className="markdown-list" {...props}>{children}</ol>
            ),
            li: ({node, children, ...props}) => (
              <li className="markdown-list-item" {...props}>{children}</li>
            ),
            a: ({node, children, ...props}) => (
              <a className="markdown-link" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
            ),
            blockquote: ({node, children, ...props}) => (
              <blockquote className="markdown-blockquote" {...props}>{children}</blockquote>
            ),
            table: ({node, children, ...props}) => (
              <table className="markdown-table" {...props}>{children}</table>
            )
          }}
        >
          {part}
        </ReactMarkdown>
      );
    }).filter(Boolean);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending || disabled || isCreatingThread) return;
    
    // If no threadId yet, try to create one first
    let currentThreadId = threadId;
    if (!currentThreadId) {
      console.log('No threadId, attempting to create thread...');
      currentThreadId = await getOrCreateAssessmentThread();
      if (!currentThreadId) {
        console.error('Could not create thread, cannot send message');
        setError('Unable to create conversation thread. Please refresh the page.');
        return;
      }
    }

    const messageToSend = newMessage.trim();
    setNewMessage('');
    setError('');
    setIsSending(true);
    setIsAiThinking(true);

    // Add user message immediately
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageToSend,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    try {
      // Send message to GPT API
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chat/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: messageToSend,
          threadId: currentThreadId // Use the current thread ID (might be newly created)
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Add AI response
        const aiMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.reply?.content || data.content || "I'm here to help you work through this assessment task.",
          timestamp: new Date().toISOString()
        };

        const finalMessages = [...updatedMessages, aiMessage];
        setMessages(finalMessages);
        updateConversationData(finalMessages);
      } else {
        throw new Error('Failed to get AI response');
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to get AI response. Please try again.');
      
      // Add fallback AI response
      const fallbackMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try sending your message again.",
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, fallbackMessage];
      setMessages(finalMessages);
      updateConversationData(finalMessages);
    } finally {
      setIsSending(false);
      setIsAiThinking(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div className="assessment-llm-chat">
      <div className="assessment-llm-chat__header">
        <div className="assessment-llm-chat__title">
          <FaRobot className="assessment-llm-chat__icon" />
          AI Assistant
          {threadId && <span className="assessment-llm-chat__thread-status">✓ Connected</span>}
          {!threadId && <span className="assessment-llm-chat__thread-status">⏳ Connecting...</span>}
        </div>
        <div className="assessment-llm-chat__header-buttons">
          {disabled && (
            <span className="assessment-llm-chat__disabled-notice">
              View Only
            </span>
          )}
          {onBackToAssessments && (
            <button 
              onClick={onBackToAssessments}
              className="assessment-llm-chat__header-btn"
            >
              <FaArrowLeft /> Back to Assessments
            </button>
          )}
          {onShowInstructions && (
            <button 
              onClick={onShowInstructions}
              className="assessment-llm-chat__header-btn"
            >
              <FaInfoCircle /> View Instructions
            </button>
          )}
          {onSubmitDeliverables && !readonly && (
            <button 
              onClick={onSubmitDeliverables}
              className={`assessment-llm-chat__header-btn ${isSubmissionPanelOpen ? '' : 'assessment-llm-chat__header-btn--primary'}`}
            >
              {isSubmissionPanelOpen ? 'Close Deliverables' : 'Submit Deliverables'}
            </button>
          )}
          {readonly && (
            <span className="assessment-llm-chat__readonly-badge">
              Read Only
            </span>
          )}
        </div>
      </div>

      <div className="assessment-llm-chat__messages">
        {messages.length === 0 && (
          <div className="assessment-llm-chat__welcome">
            <FaRobot className="assessment-llm-chat__welcome-icon" />
            <div>
              <h3>Welcome to your AI Assistant</h3>
              <p>
                I'm here to help you work through this assessment task. 
                Ask me questions, explore ideas, or discuss your approach to the problem.
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`assessment-llm-chat__message assessment-llm-chat__message--${message.role}`}
          >
            <div className="assessment-llm-chat__message-avatar">
              {message.role === 'user' ? <FaUser /> : <FaRobot />}
            </div>
            <div className="assessment-llm-chat__message-content">
              <div className="assessment-llm-chat__message-text">
                {message.role === 'assistant' ? (
                  formatMessageContent(message.content)
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
              <div className="assessment-llm-chat__message-time">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isAiThinking && (
          <div className="assessment-llm-chat__message assessment-llm-chat__message--assistant">
            <div className="assessment-llm-chat__message-avatar">
              <FaRobot />
            </div>
            <div className="assessment-llm-chat__message-content">
              <div className="assessment-llm-chat__thinking">
                <div className="assessment-llm-chat__thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span>AI is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="assessment-llm-chat__error">
          <p>{error}</p>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {!disabled && (
        <form onSubmit={handleSendMessage} className="assessment-llm-chat__input-form">
          <div className="assessment-llm-chat__input-container">
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask questions or discuss your approach to this assessment..."
              className="assessment-llm-chat__input"
              disabled={isSending || isCreatingThread}
              rows={1}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || isSending || isCreatingThread}
              className="assessment-llm-chat__send-btn"
            >
              <FaPaperPlane />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default AssessmentLLMChat;
