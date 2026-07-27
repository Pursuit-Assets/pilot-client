import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '../../../../lib/utils';

// isStreaming: a chat/coach stream is in flight — block a second concurrent stream.
function LinkSubmission({ currentSubmission, isSubmitting, isLocked, isStreaming = false, onSubmit, userId, taskId }) {
  const [url, setUrl] = useState('');

  const draftKey = userId && taskId ? `deliverable_draft_${userId}_${taskId}` : null;

  // Pre-fill from an existing submission; otherwise restore a typed-but-unsubmitted draft.
  useEffect(() => {
    if (currentSubmission?.content) {
      setUrl(currentSubmission.content);
      return;
    }
    if (draftKey) {
      const saved = localStorage.getItem(draftKey);
      if (saved) setUrl(saved);
    }
  }, [currentSubmission, draftKey]);

  const handleUrlChange = (value) => {
    setUrl(value);
    if (draftKey) {
      if (value.trim()) localStorage.setItem(draftKey, value);
      else localStorage.removeItem(draftKey);
    }
  };

  const isValidUrl = (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = () => {
    if (!url.trim() || !isValidUrl(url)) return;
    // Submit as plain URL string
    onSubmit(url.trim());
    if (draftKey) localStorage.removeItem(draftKey);
  };

  return (
    <div className="flex flex-col h-full bg-[#F1F1F1]">
      <div className="flex-1 overflow-y-auto px-[25px] py-[20px]">
        <div className="flex flex-col gap-[15px] w-full">
          <Input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="Copy and paste your link here..."
            disabled={isLocked || isSubmitting}
            className="w-full h-[35px] px-[11px] py-[4px] bg-white rounded-[10px] text-[18px] leading-[26px] font-proxima font-normal text-carbon-black placeholder:text-divider border-0 focus:outline-none focus:ring-2 focus:ring-pursuit-purple/20"
          />

          {url && !isValidUrl(url) && (
            <div className="flex items-start gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs font-proxima">Please enter a valid URL</p>
            </div>
          )}
          {url && isValidUrl(url) && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-pursuit-purple hover:text-pursuit-purple/80 font-proxima"
            >
              View shared document in new tab
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!url.trim() || !isValidUrl(url) || isSubmitting || isLocked || isStreaming}
            className={cn(
              'flex items-center justify-center px-[20px] py-[5px] h-[32px] bg-pursuit-purple rounded-[100px]',
              'text-[16px] leading-[18px] font-proxima font-normal text-[#F1F1F1]',
              'hover:bg-pursuit-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : currentSubmission ? (
              'Update Submission'
            ) : (
              'Submit'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LinkSubmission;
