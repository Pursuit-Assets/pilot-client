import React, { useState, useEffect } from 'react';
import { FaSpinner, FaCheckCircle } from 'react-icons/fa';
import useAuthStore from '../../stores/authStore';
import { toast } from 'sonner';
import ArrowButton from '../ArrowButton/ArrowButton';
import './SurveyInterface.css';

// Staff can edit a survey template at any time, including shortening it. A
// builder who was mid-way through the longer version has their position saved
// in localStorage, which outlives a hard refresh — so a restored index can
// point past the end of the current question list. Keep every index in range.
export const clampQuestionIndex = (index, questionCount) => {
  const maxIndex = Math.max(questionCount - 1, 0);
  const parsed = Math.trunc(Number(index));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, maxIndex);
};

const SurveyInterface = ({ taskId, dayNumber, cohort, surveyType = 'weekly', onComplete, isCompleted = false, isLastTask = false, isPreviewMode = false }) => {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const isActive = user?.active !== false;

  // Survey state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [existingFeedback, setExistingFeedback] = useState(null);
  const [dbQuestions, setDbQuestions] = useState(null);

  // Get localStorage key for this specific survey (includes preview mode to keep them separate)
  const getStorageKey = () => `survey_progress_${taskId}_${surveyType}${isPreviewMode ? '_preview' : ''}`;

  // Track whether template fetch has completed (success or failure)
  const [templateLoaded, setTemplateLoaded] = useState(false);

  // Fetch survey questions from DB on mount
  useEffect(() => {
    const fetchSurveyTemplate = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/admin/templates/surveys/by-type/${surveyType}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.template?.questions && Array.isArray(data.template.questions) && data.template.questions.length > 0) {
            setDbQuestions(data.template.questions);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch survey template from DB, using hardcoded fallback');
      } finally {
        setTemplateLoaded(true);
      }
    };
    if (token && surveyType) {
      setTemplateLoaded(false);
      fetchSurveyTemplate();
    }
  }, [token, surveyType]);

  // Hardcoded fallback questions (used if DB fetch fails)
  const getHardcodedQuestions = () => {
    if (surveyType === 'l1_final') {
      return [
        { id: 'ai_experience_before', type: 'scale', scale: [1, 2, 3, 4, 5], question: 'On a scale of 1\u20135, please rate your experience with AI prior to starting the program.', leftLabel: 'Little to no experience with AI', rightLabel: 'AI expert', required: true },
        { id: 'ai_literacy_agreement', type: 'options', question: 'One of the goals of L1 was to help participants build AI literacy skills. To what extent do you agree that you developed these skills?', options: [{ value: 'strongly_agree', label: 'I strongly agree' }, { value: 'agree', label: 'I agree' }, { value: 'disagree', label: 'I disagree' }, { value: 'strongly_disagree', label: 'I strongly disagree' }, { value: 'not_sure', label: "I'm not sure" }], required: false },
        { id: 'explain_ai_confidence', type: 'scale', scale: [1, 2, 3, 4, 5], question: 'On a scale of 1\u20135, how confident are you now in your ability to explain how AI systems work (e.g. LLMs, prompts)?', leftLabel: 'Not confident', rightLabel: 'Very confident', required: true },
        { id: 'build_ai_confidence', type: 'scale', scale: [1, 2, 3, 4, 5], question: 'I can now confidently build an AI-powered app or product idea using the tools and/or methods introduced in this program?', leftLabel: 'Not confident', rightLabel: 'Very confident', required: true },
        { id: 'ai_literate_meaning', type: 'textarea', question: 'In your own words, what does it mean to be "AI literate"? Do you feel that you are now? Why or why not?', placeholder: 'Share your thoughts on AI literacy and your development...', required: true },
        { id: 'referral_likelihood', type: 'scale', scale: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], question: 'How likely are you to refer this program to someone you know?', leftLabel: 'Not at all likely', rightLabel: 'Very likely', required: true }
      ];
    }
    return [
      { id: 'referral_likelihood', type: 'scale', scale: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], question: 'How likely are you to refer this pilot to someone you know?', leftLabel: 'Not likely', rightLabel: 'Very likely', required: true },
      { id: 'what_we_did_well', type: 'textarea', question: 'What did we do well?', placeholder: 'Share what you found valuable or enjoyed...', required: false },
      { id: 'what_to_improve', type: 'textarea', question: 'What do we need to improve on?', placeholder: 'Share areas where we could do better...', required: false },
      { id: 'tools_used', type: 'textarea', question: 'What tools did you use this week?', placeholder: 'List the tools, software, or platforms you worked with...', required: false },
      { id: 'programming_languages', type: 'textarea', question: 'What programming languages did you work with this week?', placeholder: 'List the programming languages you used...', required: false }
    ];
  };

  const questions = dbQuestions || getHardcodedQuestions();
  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;

  // Safety net for every path that can leave the cursor out of range without
  // going through the localStorage restore above — e.g. a surveyType change
  // swaps in a shorter question set while the index stays in component state.
  useEffect(() => {
    const safeIndex = clampQuestionIndex(currentQuestionIndex, totalQuestions);
    if (safeIndex !== currentQuestionIndex) {
      setCurrentQuestionIndex(safeIndex);
    }
  }, [currentQuestionIndex, totalQuestions]);

  // Load existing feedback and localStorage progress (waits for template to resolve first)
  useEffect(() => {
    if (!taskId || !token || !templateLoaded) return;

    const loadSurveyData = async () => {
      try {
        setIsLoading(true);

        // Try to load existing feedback from backend
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/builder-feedback/${taskId}?isPreviewMode=${isPreviewMode}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.feedback) {
            setExistingFeedback(data.feedback);

            // If feedback exists, populate responses
            const existingResponses = {};
            const genericResponses = data.feedback.survey_responses || {};
            questions.forEach(q => {
              // Check top-level fields first (weekly/L1 surveys), then generic survey_responses
              if (data.feedback[q.id] !== undefined && data.feedback[q.id] !== null) {
                existingResponses[q.id] = data.feedback[q.id].toString();
              } else if (genericResponses[q.id] !== undefined && genericResponses[q.id] !== null) {
                existingResponses[q.id] = genericResponses[q.id].toString();
              }
            });
            setResponses(existingResponses);

            // If survey is already complete, populate responses for read-only view
            if (Object.keys(existingResponses).length > 0) {
              // Don't call onComplete here - just show the survey in read-only mode
              return;
            }
          }
        }

        // Load progress from localStorage if no existing feedback
        if (!existingFeedback) {
          const savedProgress = localStorage.getItem(getStorageKey());
          if (savedProgress) {
            try {
              const { responses: savedResponses, currentIndex } = JSON.parse(savedProgress);
              // A saved index past the end means this progress was recorded
              // against a longer version of the template — its answers are keyed
              // to questions that no longer exist, so start clean rather than
              // restoring a position the current survey can't render.
              if (Number(currentIndex) > questions.length - 1) {
                console.warn('Discarding survey progress saved against an older template version');
                localStorage.removeItem(getStorageKey());
                setResponses({});
                setCurrentQuestionIndex(0);
              } else {
                setResponses(savedResponses || {});
                setCurrentQuestionIndex(clampQuestionIndex(currentIndex, questions.length));
              }
            } catch (e) {
              console.warn('Failed to parse saved survey progress');
            }
          }
        }
      } catch (error) {
        console.error('Error loading survey data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSurveyData();
  }, [taskId, token, surveyType, templateLoaded]);

  // Save progress to localStorage
  const saveProgress = (newResponses, questionIndex) => {
    const progressData = {
      responses: newResponses,
      currentIndex: questionIndex,
      timestamp: Date.now()
    };
    localStorage.setItem(getStorageKey(), JSON.stringify(progressData));
  };

  // Handle response change
  const handleResponseChange = (value) => {
    const newResponses = {
      ...responses,
      [currentQuestion.id]: value
    };
    setResponses(newResponses);
    saveProgress(newResponses, currentQuestionIndex);
    setError(null);
  };

  // Navigate to next question
  const handleNext = () => {
    // Validate current question if required
    if (currentQuestion.required && !responses[currentQuestion.id]) {
      setError('This question is required. Please provide an answer.');
      return;
    }

    if (currentQuestionIndex < totalQuestions - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      saveProgress(responses, nextIndex);
    } else {
      // Last question - submit survey
      handleSubmit();
    }
  };

  // Navigate to previous question
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      const prevIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIndex);
      saveProgress(responses, prevIndex);
    }
    setError(null);
  };

  // Submit survey
  const handleSubmit = async () => {
    if (!isActive) {
      setError('You have historical access only and cannot submit feedback.');
      return;
    }

    // Prevent submission if already completed
    if (isCompleted) {
      toast.info('This survey has already been submitted.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const submitData = {
        taskId: parseInt(taskId),
        dayNumber,
        cohort,
        isPreviewMode
      };

      // Map responses to expected backend format
      questions.forEach(q => {
        if (responses[q.id] !== undefined) {
          if (q.type === 'scale') {
            submitData[q.id] = parseInt(responses[q.id]);
          } else if (q.type === 'textarea') {
            submitData[q.id] = responses[q.id]?.trim() || null;
          } else {
            submitData[q.id] = responses[q.id];
          }
        } else {
          submitData[q.id] = null;
        }
      });

      const url = existingFeedback 
        ? `${import.meta.env.VITE_API_URL}/api/builder-feedback/${taskId}`
        : `${import.meta.env.VITE_API_URL}/api/builder-feedback/submit`;
      
      const method = existingFeedback ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        // Clear localStorage progress
        localStorage.removeItem(getStorageKey());
        
        // Show thank you message
        toast.success('Thank you for completing the survey! 🎉', {
          duration: 3000
        });
        
        // Call onComplete to mark task as complete and handle navigation
        if (onComplete) {
          setTimeout(() => onComplete(), 1500);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to submit survey');
        toast.error('Failed to submit survey. Please try again.');
      }
    } catch (err) {
      console.error('Error submitting survey:', err);
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render scale question
  const renderScaleQuestion = () => {
    const scaleValues = currentQuestion.scale;
    
    return (
      <div className="survey-interface__question-content">
        <div className="survey-interface__scale-container">
          <div className="survey-interface__scale-options">
            {currentQuestion.scale.map((value, index) => {
              const isFirst = index === 0;
              const isLast = index === scaleValues.length - 1;
              const showLabel = (isFirst && currentQuestion.leftLabel) || (isLast && currentQuestion.rightLabel);
              const labelText = isFirst ? currentQuestion.leftLabel : (isLast ? currentQuestion.rightLabel : '');
              
              return (
                <div 
                  key={value}
                  className="survey-interface__scale-option-wrapper"
                >
                  <button
                    type="button"
                    className={`survey-interface__scale-button ${
                      responses[currentQuestion.id] === value.toString() ? 'survey-interface__scale-button--selected' : ''
                    }`}
                    onClick={() => handleResponseChange(value.toString())}
                    disabled={isSubmitting || isCompleted}
                  >
                    <span>{value}</span>
                  </button>
                  {showLabel && (
                    <span className="survey-interface__scale-label">
                      {labelText}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Normalize option to { value, label } — handles plain strings and objects
  const normalizeOption = (option) => {
    if (typeof option === 'string') return { value: option, label: option };
    return { value: option.value ?? option.label ?? '', label: option.label ?? option.value ?? '' };
  };

  // Render options question
  const renderOptionsQuestion = () => {
    return (
      <div className="survey-interface__question-content">
        <div className="survey-interface__options-container">
          {currentQuestion.options.map((rawOption) => {
            const option = normalizeOption(rawOption);
            return (
              <button
                key={option.value}
                type="button"
                className={`survey-interface__option-button ${
                  responses[currentQuestion.id] === option.value ? 'survey-interface__option-button--selected' : ''
                }`}
                onClick={() => handleResponseChange(option.value)}
                disabled={isSubmitting || isCompleted}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Render textarea question
  const renderTextareaQuestion = () => {
    return (
      <div className="survey-interface__question-content">
        <textarea
          className="survey-interface__textarea"
          rows="6"
          value={responses[currentQuestion.id] || ''}
          onChange={(e) => handleResponseChange(e.target.value)}
          placeholder={currentQuestion.placeholder}
          disabled={isSubmitting || isCompleted}
        />
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="survey-interface survey-interface--loading">
        <div className="survey-interface__loading">
          <FaSpinner className="survey-interface__loading-icon" />
          <p>Loading survey...</p>
        </div>
      </div>
    );
  }

  // Belt-and-suspenders: never deref an out-of-range question. There is no
  // ErrorBoundary above this component, so a throw here blanks the whole
  // Learning page. The clamping effect re-renders us in range next tick.
  if (!currentQuestion) {
    return (
      <div className="survey-interface survey-interface--loading">
        <div className="survey-interface__loading">
          <FaSpinner className="survey-interface__loading-icon" />
          <p>Loading survey...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="survey-interface">
      {/* Read-Only Banner */}
      {isCompleted && (
        <div className="survey-interface__completed-banner">
          <FaCheckCircle className="survey-interface__completed-icon" />
          <span>Survey Completed - Read Only</span>
        </div>
      )}

      {/* Survey Header */}
      <div className="survey-interface__header">
        <div className="survey-interface__progress">
          <span className="survey-interface__progress-text">
            Question {String(currentQuestionIndex + 1).padStart(2, '0')} of {String(totalQuestions).padStart(2, '0')}
          </span>
        </div>
        
        <h2 className="survey-interface__question">
          {currentQuestion.question}
        </h2>
      </div>

      {/* Question Content */}
      <div className="survey-interface__content">
        {currentQuestion.type === 'scale' && renderScaleQuestion()}
        {currentQuestion.type === 'options' && renderOptionsQuestion()}
        {currentQuestion.type === 'textarea' && renderTextareaQuestion()}
        
        {/* Error Message */}
        {error && (
          <div className="survey-interface__error">
            {error}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="survey-interface__navigation">
        <ArrowButton
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0 || isSubmitting}
          borderColor="#4242EA"
          backgroundColor="var(--color-bg-light)"
          arrowColor="#4242EA"
          hoverBackgroundColor="#4242EA"
          hoverArrowColor="white"
          size="lg"
          rotation={180}
          useChevron={true}
          strokeWidth={1}
          className="survey-interface__nav-button"
        />
        
        {currentQuestionIndex === totalQuestions - 1 ? (
          <button
            type="button"
            className="survey-interface__nav-button survey-interface__nav-button--submit"
            onClick={handleNext}
            disabled={isSubmitting || isCompleted}
          >
            {isSubmitting ? (
              <FaSpinner className="survey-interface__nav-button-icon--spinning" />
            ) : (
              <FaCheckCircle />
            )}
          </button>
        ) : (
          <ArrowButton
            onClick={handleNext}
            disabled={isSubmitting}
            borderColor="#4242EA"
            backgroundColor="var(--color-bg-light)"
            arrowColor="#4242EA"
            hoverBackgroundColor="#4242EA"
            hoverArrowColor="white"
            size="lg"
            useChevron={true}
            strokeWidth={1}
            className="survey-interface__nav-button"
          />
        )}
      </div>
    </div>
  );
};

export default SurveyInterface;
