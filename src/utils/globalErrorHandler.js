// Global error handler that overrides fetch to handle auth errors automatically
// This ensures all API calls get proper auth error handling without component changes

import { toast } from 'sonner';

let hasTriggeredAuthModal = false; // One-time flag to prevent any further modals

// Store original fetch
const originalFetch = window.fetch;

// Create enhanced fetch with global auth error handling
const enhancedFetch = async (...args) => {
  try {
    const response = await originalFetch(...args);
    
    // Check if this is an API call to our backend
    const url = args[0];
    const isApiCall = typeof url === 'string' && url.includes(import.meta.env.VITE_API_URL);
    
    // Only handle auth errors for our API calls
    if (isApiCall && (response.status === 401 || response.status === 403)) {
      
      // First, check if this is an email verification error that should be handled by Login component
      try {
        const errorData = await response.clone().json().catch(() => ({}));
        
        // Skip global handling for email verification errors - let Login component handle it
        if (response.status === 403 && errorData.needsVerification) {
          console.log('📧 Email verification error detected, skipping global handler...');
          return response;
        }
        
        // Skip global handling for assessment API errors - let component handle it
        if (url.includes('/api/assessments/')) {
          console.log('🎯 Assessment API error detected, letting component handle it...');
          localStorage.setItem('lastGlobalErrorBypass', JSON.stringify({
            timestamp: new Date().toISOString(),
            url,
            status: response.status,
            reason: 'assessment_api_bypass'
          }));
          return response;
        }

        // Skip global handling for cohort access denied (enterprise admin viewing unassigned cohort)
        if (response.status === 403 && errorData.cohortAccessDenied) {
          console.log('🏢 Cohort access denied, letting component handle it...');
          return response;
        }

        // Skip global handling for permission denied on specific page access (not an auth issue)
        if (response.status === 403 && errorData.error === 'Access denied') {
          console.log('🔒 Permission denied, letting component handle it...');
          return response;
        }

        // Skip global handling for read-only accounts (interview candidates). The server
        // refuses every state-changing request from those roles
        // (test-pilot-server middleware/readOnlyRole.js) — that's a standing property of
        // the account, NOT an expired session, so it must never trigger the auth modal or
        // the logout redirect. Explain it once per attempt and hand the response back.
        if (response.status === 403 && errorData.readOnly) {
          console.log('👀 Read-only account attempted a write, letting component handle it...');
          toast.info('This account has read-only access — changes are disabled.');
          return response;
        }

        // Skip global handling for permissions API 403s (authorization, not authentication)
        if (response.status === 403 && typeof url === 'string' && url.includes('/api/permissions/')) {
          console.log('🔒 Permissions API access denied, letting component handle it...');
          return response;
        }

        // Skip global handling for coaching API 403s (authorization, not authentication).
        // A coach who was reassigned away from a builder keeps read-only access to
        // their shared session history, but every write (schedule/log/transcript)
        // 403s server-side. That's an authorization boundary — surface it to the
        // component, don't treat it as an expired session and log the user out.
        if (response.status === 403 && typeof url === 'string' && url.includes('/api/coaching/')) {
          console.log('🔒 Coaching API access denied (not the assigned coach), letting component handle it...');
          return response;
        }
      } catch (parseError) {
        // If we can't parse the error, continue with normal global handling
        console.log('⚠️ Could not parse error data for verification check');
      }
      
      // Prevent multiple auth error modals - only trigger once per session
      if (hasTriggeredAuthModal) {
        console.log('🚫 Auth modal already triggered this session, skipping...');
        return response;
      }
      
      hasTriggeredAuthModal = true;
      console.log('🚨 First auth error detected, triggering modal...');
      
      try {
        const errorData = await response.clone().json().catch(() => ({}));
        
        console.log('🚨 Auth error detected:', { status: response.status, errorData });
        
        // Handle different types of auth errors
        if (response.status === 401 && errorData.tokenExpired) {
          // Token expired - show simple alert and redirect immediately
          console.log('🚨 Token expired, redirecting to login...');
          
          // Show brief user-friendly message
          const message = errorData.message || 'Your session has expired. Redirecting to login...';
          
          // Emit event for modal (but also do immediate redirect as backup)
          const event = new CustomEvent('authError', {
            detail: {
              type: 'token_expired',
              message: message
            }
          });
          window.dispatchEvent(event);
          
          // Clear auth data and redirect immediately (don't wait for modal)
          setTimeout(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('auth-storage');
            localStorage.removeItem('applicantToken');
            window.location.href = '/login';
          }, 2000); // 2 second delay to show modal briefly

        } else if (response.status === 403 && errorData.userInactive) {
          // User is inactive - only show modal, no redirect
          const event = new CustomEvent('authError', {
            detail: {
              type: 'user_inactive',
              message: errorData.message || 'Your account now has view-only access. You can browse historical content but cannot make new submissions or access active features.'
            }
          });
          window.dispatchEvent(event);
          
        } else {
          // Generic auth error - show message and redirect immediately
          console.log('🚨 Auth error, redirecting to login...');
          
          const event = new CustomEvent('authError', {
            detail: {
              type: 'generic_auth_error',
              message: 'Authentication error. Redirecting to login...'
            }
          });
          window.dispatchEvent(event);
          
          // Clear auth data and redirect immediately
          setTimeout(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('auth-storage');
            localStorage.removeItem('applicantToken');
            window.location.href = '/login';
          }, 2000);
        }

      } catch (parseError) {
        console.error('Error parsing auth error response:', parseError);
        
        // Fallback for unparseable errors - immediate redirect
        console.log('🚨 Unparseable auth error, redirecting immediately...');
        
        const event = new CustomEvent('authError', {
          detail: {
            type: 'generic_auth_error',
            message: 'Authentication error. Redirecting to login...'
          }
        });
        window.dispatchEvent(event);
        
        // Immediate redirect for fallback case
        setTimeout(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('auth-storage');
          localStorage.removeItem('applicantToken');
          window.location.href = '/login';
        }, 1500);
      }
      
      // No need to reset flag - we only want one modal per session
    }
    
    return response;
  } catch (error) {
    // Network errors, etc. - just pass through
    throw error;
  }
};

// Reset auth modal state (useful for page refreshes)
export const resetAuthModalState = () => {
  hasTriggeredAuthModal = false;
  console.log('🔄 Auth modal state reset');
};

// Install the global error handler
export const installGlobalErrorHandler = () => {
  if (window.fetch === enhancedFetch) {
    console.log('⚠️ Global error handler already installed');
    return;
  }
  
  window.fetch = enhancedFetch;
  console.log('🔧 Global auth error handler installed');
};

// Uninstall the global error handler
export const uninstallGlobalErrorHandler = () => {
  window.fetch = originalFetch;
  console.log('🔧 Global auth error handler removed');
};

// Auto-install when this module is imported
installGlobalErrorHandler(); 