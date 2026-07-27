import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/button';
import { Textarea } from '../../../../components/ui/textarea';
import { Input } from '../../../../components/ui/input';
import { Loader2, Video, ExternalLink } from 'lucide-react';

// isStreaming: a chat/coach stream is in flight — block a second concurrent stream.
function StructuredSubmission({ task, schema, currentSubmission, isSubmitting, isLocked, isStreaming = false, onSubmit, userId, taskId }) {
  const [formData, setFormData] = useState({});
  const [validationError, setValidationError] = useState('');

  // Helper function to get localStorage key
  const getLocalStorageKey = () => {
    return `deliverable_draft_${userId}_${taskId}`;
  };

  // Helper function to load draft from localStorage
  const loadDraftFromLocalStorage = () => {
    try {
      const key = getLocalStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading draft from localStorage:', e);
    }
    return null;
  };

  // Helper function to save draft to localStorage
  const saveDraftToLocalStorage = (data) => {
    try {
      const key = getLocalStorageKey();
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving draft to localStorage:', e);
    }
  };

  // Helper function to clear draft from localStorage
  const clearDraftFromLocalStorage = () => {
    try {
      const key = getLocalStorageKey();
      localStorage.removeItem(key);
    } catch (e) {
      console.error('Error clearing draft from localStorage:', e);
    }
  };

  // Initialize form data from schema, existing submission, or localStorage draft
  useEffect(() => {
    const initialData = {};
    
    // Priority 1: Try to parse existing submission if it exists
    let existingData = {};
    let plainTextContent = null;
    let hasSubmission = false;
    
    if (currentSubmission?.content) {
      hasSubmission = true;
      try {
        // If content is a JSON string, parse it
        existingData = typeof currentSubmission.content === 'string' 
          ? JSON.parse(currentSubmission.content)
          : currentSubmission.content;
      } catch (e) {
        // If parsing fails, treat as plain text (e.g., a plain URL string)
        console.log('Could not parse submission content as JSON, treating as plain text');
        plainTextContent = currentSubmission.content;
      }
    }
    
    // Priority 2: If no submission exists, try to load draft from localStorage
    let draftData = null;
    if (!hasSubmission) {
      draftData = loadDraftFromLocalStorage();
      if (draftData) {
        console.log('Loaded draft from localStorage for task', taskId);
      }
    }
    
    // Initialize each field from schema
    schema.fields.forEach(field => {
      if (existingData[field.name]) {
        // Use parsed JSON data from submission if available
        initialData[field.name] = existingData[field.name];
      } else if (plainTextContent && field.type === 'loom_url') {
        // For loom_url fields, if we have plain text content that looks like a Loom URL, use it
        initialData[field.name] = plainTextContent;
      } else if (draftData && draftData[field.name]) {
        // Use draft data from localStorage if available
        initialData[field.name] = draftData[field.name];
      } else {
        initialData[field.name] = '';
      }
    });
    
    setFormData(initialData);
  }, [schema, currentSubmission, userId, taskId]);

  const handleChange = (fieldName, value) => {
    const updatedData = {
      ...formData,
      [fieldName]: value
    };
    setFormData(updatedData);
    
    // Save to localStorage (only if no submission exists yet)
    if (!currentSubmission) {
      saveDraftToLocalStorage(updatedData);
    }
    
    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError('');
    }
  };

  // Loom URL validation functions
  const isValidLoomUrl = (url) => {
    const loomPatterns = [
      /^https:\/\/www\.loom\.com\/share\/[a-zA-Z0-9]+(\?.*)?$/,
      /^https:\/\/loom\.com\/share\/[a-zA-Z0-9]+(\?.*)?$/,
      /^https:\/\/www\.loom\.com\/embed\/[a-zA-Z0-9]+(\?.*)?$/,
      /^https:\/\/loom\.com\/embed\/[a-zA-Z0-9]+(\?.*)?$/
    ];
    
    return loomPatterns.some(pattern => pattern.test(url));
  };

  const getLoomEmbedUrl = (url) => {
    if (!isValidLoomUrl(url)) return null;
    
    // Extract video ID from various Loom URL formats
    const shareMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    const embedMatch = url.match(/loom\.com\/embed\/([a-zA-Z0-9]+)/);
    
    const videoId = shareMatch?.[1] || embedMatch?.[1];
    if (videoId) {
      return `https://www.loom.com/embed/${videoId}`;
    }
    
    return null;
  };

  const validateForm = () => {
    // Check all required fields
    for (const field of schema.fields) {
      if (field.required && !formData[field.name]?.trim()) {
        return `Please fill in the "${field.label}" field`;
      }
      
      // Special validation for Loom URLs
      if (field.type === 'loom_url' && formData[field.name]?.trim()) {
        if (!isValidLoomUrl(formData[field.name])) {
          return `Please enter a valid Loom video URL (e.g., https://www.loom.com/share/...)`;
        }
      }
    }
    return null;
  };

  const handleSubmit = () => {
    // Validate
    const error = validateForm();
    if (error) {
      setValidationError(error);
      return;
    }

    // Clear draft from localStorage before submitting
    clearDraftFromLocalStorage();
    
    // Submit as JSON object
    onSubmit(formData);
  };

  const renderField = (field) => {
    const isRequired = field.required;
    const value = formData[field.name] || '';

    switch (field.type) {
      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder || ''}
            rows={field.rows || 4}
            disabled={isLocked || isSubmitting}
            className="resize-none font-proxima"
          />
        );
      
      case 'loom_url':
        return (
          <div className="space-y-3">
            {/* Instructions for Loom URL */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <Video className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-semibold text-blue-800 font-proxima">Record Your Video</h4>
              </div>
              <p className="text-xs text-blue-700 font-proxima mb-2">
                {field.instructions || 'Record a video to share your work. No slides or preparation needed - just speak naturally about your solution.'}
              </p>
              <a 
                href="https://www.loom.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-proxima"
              >
                <ExternalLink className="w-3 h-3" />
                Need to record? Visit Loom.com
              </a>
            </div>
            
            {/* URL Input */}
            <Input
              type="url"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder || 'https://www.loom.com/share/...'}
              disabled={isLocked || isSubmitting}
              className="font-proxima"
            />
            
            {/* Validation Error */}
            {value && !isValidLoomUrl(value) && (
              <p className="text-xs text-red-600 font-proxima">
                Please enter a valid Loom video URL (e.g., https://www.loom.com/share/...)
              </p>
            )}
            
            {/* Video Preview */}
            {value && isValidLoomUrl(value) && !isLocked && (
              <div className="space-y-2">
                <label className="block text-sm font-medium font-proxima text-carbon-black">
                  Video Preview
                </label>
                <div className="relative w-full h-64 bg-gray-100 rounded-md overflow-hidden">
                  <iframe
                    src={getLoomEmbedUrl(value)}
                    frameBorder="0"
                    webkitallowfullscreen="true"
                    mozallowfullscreen="true"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
                <p className="text-xs text-carbon-black/60 font-proxima">
                  Preview of your Loom video. Make sure it plays correctly before submitting.
                </p>
              </div>
            )}
          </div>
        );
      
      case 'text':
      case 'url':
        return (
          <Input
            type={field.type === 'url' ? 'url' : 'text'}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder || ''}
            disabled={isLocked || isSubmitting}
            className="font-proxima"
          />
        );
      
      default:
        return (
          <Input
            type="text"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder || ''}
            disabled={isLocked || isSubmitting}
            className="font-proxima"
          />
        );
    }
  };

  const isFormComplete = () => {
    return schema.fields
      .filter(f => f.required)
      .every(f => {
        const value = formData[f.name];
        
        // Special validation for Loom URLs
        if (f.type === 'loom_url') {
          return value?.trim() && isValidLoomUrl(value);
        }
        
        // For text fields, check if non-empty
        return value?.trim();
      });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {schema.fields.map(field => (
          <div key={field.name} className="space-y-2">
            <label className={`block text-sm font-medium font-proxima text-carbon-black ${field.required ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}`}>
              {field.label}
            </label>
            
            {renderField(field)}
            
            {field.help && (
              <p className="text-xs text-carbon-black/60 font-proxima">
                {field.help}
              </p>
            )}
            
            {field.type === 'textarea' && (
              <p className="text-xs text-carbon-black/40 font-proxima">
                {(formData[field.name] || '').length} characters
              </p>
            )}
          </div>
        ))}

        {validationError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-xs text-red-600 font-proxima">
              {validationError}
            </p>
          </div>
        )}

        {!isFormComplete() && !isLocked && (
          <p className="text-xs text-carbon-black/60 font-proxima">
            All required fields (*) must be completed before submitting.
          </p>
        )}
      </div>

      {/* Submit Button - Fixed at bottom */}
      <div className="border-t border-divider px-6 py-4">
        <Button
          onClick={handleSubmit}
          disabled={!isFormComplete() || isSubmitting || isLocked || isStreaming}
          className="w-full bg-pursuit-purple hover:bg-pursuit-purple/90 text-white font-proxima text-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            `Submit ${task.deliverable_type || 'Deliverable'}`
          )}
        </Button>
      </div>
    </div>
  );
}

export default StructuredSubmission;
