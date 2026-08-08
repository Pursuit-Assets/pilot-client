import React, { useState } from 'react';
import { FaTimes, FaClock, FaCheck, FaComments } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import './SummaryModal.css';
import { createCodeRenderers } from '../markdown/codeRenderers';

// The fenced-block styling lives on the container now, so it moves from the
// `code` element onto `pre` — same CSS class, same rendering.
const codeRenderers = createCodeRenderers({
  inlineClassName: 'summary-modal__inline-code',
  preClassName: 'summary-modal__code-block',
});

function SummaryModal({ 
  isOpen, 
  onClose, 
  summary, 
  title, 
  url, 
  cached, 
  loading, 
  error, 
  sourceInfo,
  contentType,
  isAnalysis = false 
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [isCreatingDiscussion, setIsCreatingDiscussion] = useState(false);
  
  if (!isOpen) return null;

  // Check if user has active status
  const isActive = user?.active !== false;

  // Check if we're currently on the AI Chat page
  const isOnGPTPage = location.pathname === '/ai-chat';

  // Helper function to check if URL is a YouTube video
  const isYouTubeVideo = (url) => {
    if (!url) return false;
    return url.includes('youtube.com/watch') ||
           url.includes('youtu.be/') ||
           url.includes('youtube.com/embed') ||
           url.includes('youtube.com/v/');
  };

  const isVideo = isYouTubeVideo(url);

  // Handle creating a discussion thread
  const handleDiscussWithAI = async () => {
    // Only allow discussion creation for summaries, not analysis
    if (isAnalysis) {
      alert('Discussion creation is only available for article/video summaries.');
      return;
    }
    
    if (!isActive) {
      alert('You have historical access only and cannot create new discussions.');
      return;
    }
    
    if (!url || !title) {
      alert('Missing article information for discussion.');
      return;
    }

    setIsCreatingDiscussion(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chat/articles/discuss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: url,
          title: title,
          summary: summary // Include the summary for better AI context
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to create discussion');
      }

      const data = await response.json();
      
      // Close the modal
      onClose();
      
      // Prepare summary data to pass to GPT page
      const summaryDataForUrl = {
        summary: summary,
        cached: cached
      };
      
      // Navigate to GPT page with the new thread and summary data
      const params = new URLSearchParams({
        threadId: data.threadId,
        summaryUrl: url,
        summaryTitle: title,
        summaryData: encodeURIComponent(JSON.stringify(summaryDataForUrl))
      });
      
      navigate(`/ai-chat?${params.toString()}`);
      
    } catch (error) {
      console.error('Error creating article discussion:', error);
      alert(`Failed to create discussion: ${error.message}`);
    } finally {
      setIsCreatingDiscussion(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={`summary-modal__overlay ${isOpen ? 'open' : ''}`} onClick={handleOverlayClick}>
      <div className="summary-modal__container">
        <div className="summary-modal__header">
          <div className="summary-modal__title-section">
            <h3 className="summary-modal__title">
              {isAnalysis ? 'Content Analysis' : (isVideo ? 'Video Summary' : 'Article Summary')}
            </h3>
            {cached && !isAnalysis && (
              <span className="summary-modal__cached-badge">
                <FaCheck /> Cached
              </span>
            )}
          </div>
          <button 
            className={`summary-modal__close-btn ${error ? 'summary-modal__close-btn--error' : ''}`}
            onClick={onClose}
            aria-label="Close modal"
          >
            <FaTimes />
          </button>
        </div>
        
        <div className="summary-modal__body">
          {loading ? (
            <div className="summary-modal__loading">
              <div className="summary-modal__loading-spinner"></div>
              <p>Generating summary...</p>
              <small>This may take a few moments while we analyze the {isVideo ? 'video transcript' : 'article'}.</small>
            </div>
          ) : error ? (
            <div className="summary-modal__error">
              <h4>Summary Not Available</h4>
              <p>{error}</p>
              <small>
                {error.includes('paywall') || error.includes('subscription') ? (
                  <>
                    Try these alternatives:
                    <br />• Look for a free version of the article or similar content
                    <br />• Copy the article text and discuss it directly in the AI chat
                    <br />• Search for open-access articles on the same topic
                  </>
                ) : isVideo ? (
                  'This might happen if the video does not have captions/transcripts enabled, or if the video is private/restricted.'
                ) : (
                  'This might happen if the article is behind a paywall, requires authentication, or is not accessible.'
                )}
              </small>
              <div className="summary-modal__error-actions">
                <button 
                  className="summary-modal__error-close-btn"
                  onClick={onClose}
                >
                  Got it, close
                </button>
              </div>
            </div>
          ) : summary ? (
            <>
              <div className="summary-modal__article-info">
                <h4 className="summary-modal__article-title">{title}</h4>
                {sourceInfo && isAnalysis && (
                  <p className="summary-modal__source-info">{sourceInfo}</p>
                )}
                <div className="summary-modal__article-actions">
                  {url && (
                    <a 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="summary-modal__article-link"
                    >
                      {isVideo ? 'Watch full video →' : 'View original content →'}
                    </a>
                  )}
                  {/* Only show Discuss with AI button for summaries and if we're NOT on the GPT page */}
                  {!isAnalysis && !isOnGPTPage && (
                    <button
                      onClick={handleDiscussWithAI}
                      disabled={isCreatingDiscussion || !isActive}
                      className="summary-modal__discuss-btn"
                      title={!isActive ? "Historical access only - cannot create discussions" : "Start an AI discussion about this content"}
                    >
                      <FaComments />
                      {isCreatingDiscussion ? 'Creating Discussion...' : 'Discuss with AI'}
                    </button>
                  )}
                </div>
              </div>
              
              <div className="summary-modal__content">
                <ReactMarkdown
                  components={{
                    h1: ({node, children, ...props}) => (
                      <h2 className="summary-modal__heading" {...props}>{children}</h2>
                    ),
                    h2: ({node, children, ...props}) => (
                      <h3 className="summary-modal__heading" {...props}>{children}</h3>
                    ),
                    h3: ({node, children, ...props}) => (
                      <h4 className="summary-modal__heading" {...props}>{children}</h4>
                    ),
                    p: ({node, children, ...props}) => (
                      <p className="summary-modal__paragraph" {...props}>{children}</p>
                    ),
                    ul: ({node, children, ...props}) => (
                      <ul className="summary-modal__list" {...props}>{children}</ul>
                    ),
                    ol: ({node, children, ...props}) => (
                      <ol className="summary-modal__list" {...props}>{children}</ol>
                    ),
                    li: ({node, children, ...props}) => {
                      // Check if this list item only contains bold text (section title)
                      const isOnlyBold = node.children && 
                        node.children.length === 1 && 
                        node.children[0].tagName === 'strong';
                      
                      return (
                        <li 
                          className={`summary-modal__list-item ${isOnlyBold ? 'summary-modal__list-item--section-title' : ''}`} 
                          {...props}
                        >
                          {children}
                        </li>
                      );
                    },
                    strong: ({node, children, ...props}) => (
                      <strong className="summary-modal__bold" {...props}>{children}</strong>
                    ),
                    em: ({node, children, ...props}) => (
                      <em className="summary-modal__italic" {...props}>{children}</em>
                    ),
                    code: codeRenderers.code,
                    pre: codeRenderers.pre
                  }}
                >
                  {summary}
                </ReactMarkdown>
              </div>
            </>
          ) : null}
        </div>
        
        <div className="summary-modal__footer">
          <small className="summary-modal__disclaimer">
            {isAnalysis 
              ? 'Analysis generated by AI. Use this feedback as guidance for improving your content.'
              : `Summary generated by AI. Please verify important details in the original ${isVideo ? 'video' : 'article'}.`
            }
          </small>
        </div>
      </div>
    </div>
  );
}

export default SummaryModal; 