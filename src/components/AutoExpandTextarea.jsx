import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import ArrowButton from './ArrowButton/ArrowButton';
import ResourcesPopover from './ResourcesPopover/ResourcesPopover';
import { Mic, MicOff } from 'lucide-react';
import { LLM_MODELS } from '../constants/llmModels';

const AutoExpandTextarea = forwardRef(({ 
  onSubmit, 
  placeholder = "Reply to coach...", 
  disabled = false,
  showAssignmentButton = false,
  onAssignmentClick,
  assignmentButtonText = "Assignment",
  showInstructionsButton = false,
  onInstructionsClick,
  showPeerFeedbackButton = false,
  onPeerFeedbackClick,
  peerFeedbackButtonText = "Peer Feedback",
  resources = [],
  showLlmDropdown = false,
  showMicButton = false,
  shouldFocus = false,
  onHeightChange
}, ref) => {
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const recognitionRef = useRef(null);
  // Snapshot of the textarea value at the moment dictation began. The
  // SpeechRecognition event handler rebuilds the textarea content as
  // `baseValueAtStart + dictationFinals + dictationInterim`, so anything the
  // user already typed before clicking the mic is preserved as a prefix.
  const dictationBaseRef = useRef('');
  const [localModel, setLocalModel] = useState(LLM_MODELS[0].value);
  const [hasContent, setHasContent] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Browser SpeechRecognition feature-detect. Falls through to false on
  // browsers without it (Firefox, some mobile) — the mic button just doesn't
  // render in that case.
  const speechSupported = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const startDictation = () => {
    if (!speechSupported || isListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US';
    // Live streaming: interim results stream in as the user speaks, getting
    // progressively refined and finalized into the textarea each chunk.
    recognition.interimResults = true;
    recognition.continuous = true;

    // Capture the prefix the user already typed so we can append, not replace.
    const textarea = textareaRef.current;
    const prefix = textarea?.value || '';
    const sep = prefix.length > 0 && !/\s$/.test(prefix) ? ' ' : '';
    dictationBaseRef.current = prefix + sep;

    recognition.onresult = (event) => {
      // Stale-session guard: stop()/abort() can still deliver an already-
      // queued (or flushed) onresult AFTER clearAfterSubmit ran — without
      // this check that late event resurrects the just-sent message into
      // the cleared textarea (voice-send bug, 2026-08-06).
      if (recognitionRef.current !== recognition) return;
      // Rebuild the dictation tail from scratch each event — the
      // SpeechRecognition spec says results[].isFinal can transition from
      // false to true between events, so we can't just append. Walking all
      // results and re-rendering keeps the textarea in sync with the
      // engine's current best guess.
      let finals = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finals += transcript;
        else interim += transcript;
      }
      const ta = textareaRef.current;
      if (!ta) return;
      ta.value = dictationBaseRef.current + finals + interim;
      setHasContent(ta.value.trim().length > 0);
      handleResize();
    };

    recognition.onend = () => {
      setIsListening(false);
      // On end, locked-in finals are already in the textarea. Bake the
      // current value as the new base in case the user starts dictating
      // again without typing.
      const ta = textareaRef.current;
      if (ta) {
        const trimmed = ta.value;
        dictationBaseRef.current = trimmed + (trimmed.length > 0 && !/\s$/.test(trimmed) ? ' ' : '');
      }
    };
    recognition.onerror = (event) => {
      console.error('SpeechRecognition error:', event.error);
      setIsListening(false);
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start dictation:', err);
      setIsListening(false);
    }
  };

  const stopDictation = () => {
    try { recognitionRef.current?.stop(); } catch { /* not started */ }
    setIsListening(false);
  };

  const toggleDictation = () => {
    if (isListening) stopDictation();
    else startDictation();
  };

  // Stop dictation on unmount.
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  // Auto-resize textarea based on content
  const handleResize = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      
      // Calculate new height (min 2 rows, max 5 rows)
      const lineHeight = 26; // 18px font + 8px line spacing
      const minHeight = lineHeight * 2; // 2 rows minimum
      const maxHeight = lineHeight * 5; // 5 rows maximum
      
      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
      
      // Notify parent of height change after textarea resizes
      if (containerRef.current && onHeightChange) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          const height = containerRef.current.getBoundingClientRect().height;
          onHeightChange(height + 24);
        });
      }
    }
  };

  // Handle input changes for auto-resize and content tracking
  const handleInput = () => {
    handleResize();
    const value = textareaRef.current?.value || '';
    setHasContent(value.trim().length > 0);
  };

  // Initial resize on mount
  useEffect(() => {
    handleResize();
  }, []);

  // Expose focus method to parent components
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (textareaRef.current && !disabled) {
        textareaRef.current.focus();
      }
    },
    setValue: (value) => {
      if (textareaRef.current) {
        textareaRef.current.value = value;
        setHasContent(value.trim().length > 0);
        handleResize();
      }
    }
  }));

  // Handle shouldFocus prop changes
  useEffect(() => {
    if (shouldFocus && !disabled && textareaRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [shouldFocus, disabled]);

  // Track container height and notify parent of changes
  useEffect(() => {
    if (!containerRef.current || !onHeightChange) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.target.getBoundingClientRect().height;
        onHeightChange(height + 24);
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial height notification
    const initialHeight = containerRef.current.getBoundingClientRect().height;
    onHeightChange(initialHeight + 24);

    return () => {
      resizeObserver.disconnect();
    };
  }, [onHeightChange]);

  // Clear the input after a send. If a dictation session is still live,
  // abort() it — not stop() — because the engine rebuilds the textarea from
  // ALL results accumulated since recognition.start(), so a session left
  // running (or stop()'s final onresult flush) would resurrect the just-sent
  // message the next time the user speaks. Resetting the dictation base
  // guards the same way.
  const clearAfterSubmit = () => {
    if (recognitionRef.current) {
      // Disarm BEFORE abort: stop()/abort() can still deliver an already-
      // queued onresult after this function returns (Chrome flushes a final
      // result asynchronously on stop). Nulling the handlers + the ref (the
      // onresult stale-session guard checks the ref) makes a late event a
      // no-op instead of resurrecting the just-sent message.
      const recognition = recognitionRef.current;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognitionRef.current = null;
      try { recognition.abort(); } catch { /* not started */ }
      setIsListening(false);
    }
    dictationBaseRef.current = '';
    if (textareaRef.current) textareaRef.current.value = '';
    setHasContent(false);
    handleResize(); // Reset height after clearing
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = textareaRef.current?.value || '';
      if (message.trim() && onSubmit) {
        onSubmit(message, localModel);
        clearAfterSubmit();
      }
    }
  };

  const handleSubmit = () => {
    const message = textareaRef.current?.value || '';
    if (message.trim() && onSubmit) {
      onSubmit(message, localModel);
      clearAfterSubmit();
    }
  };

  return (
    <div ref={containerRef} className="bg-stardust shadow-lg rounded-t-[20px] p-4">
      <div className="flex flex-col gap-2">
        {/* Main input area */}
        <div className="bg-white rounded-md p-3 mb-2">
          <Textarea
            ref={textareaRef}
            onInput={handleInput}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            className="border-0 resize-none bg-transparent text-carbon-black placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 min-h-[26px] text-[18px] md:text-[18px] placeholder:text-[18px] md:placeholder:text-[18px] font-proxima leading-[26px] w-full"
            style={{ height: 'auto', minHeight: '26px' }}
          />
        </div>

        {/* Bottom row with buttons */}
        <div className="flex justify-between items-center">
          {/* Left side - Mic + Assignment + Instructions + Peer Feedback + Resources buttons */}
          <div className="flex gap-2 items-center">
            {showMicButton && speechSupported && (
              <Button
                onClick={toggleDictation}
                disabled={disabled}
                size="sm"
                title={isListening ? 'Stop dictation' : 'Start voice dictation'}
                className={`text-xs px-3 py-1 h-6 rounded-full flex items-center gap-1 ${
                  isListening
                    ? 'bg-mastery-pink hover:bg-mastery-pink/90 text-white'
                    : 'bg-pursuit-purple hover:bg-pursuit-purple/90 text-stardust'
                }`}
              >
                {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                {isListening ? 'Listening' : 'Voice'}
              </Button>
            )}
            {showInstructionsButton && (
              <Button
                onClick={onInstructionsClick}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 h-6 rounded-full"
              >
                Instructions
              </Button>
            )}
            {showAssignmentButton && (
              <Button
                onClick={onAssignmentClick}
                size="sm"
                className="bg-pursuit-purple hover:bg-pursuit-purple/90 text-stardust text-xs px-3 py-1 h-6 rounded-full"
              >
                {assignmentButtonText}
              </Button>
            )}
            {showPeerFeedbackButton && (
              <Button
                onClick={onPeerFeedbackClick}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 h-6 rounded-full"
              >
                {peerFeedbackButtonText}
              </Button>
            )}
            <ResourcesPopover resources={resources} />
          </div>

          {/* Right side - LLM dropdown and send button */}
          <div className="flex items-center gap-2">
            {/* LLM Selector - Only show for conversation mode */}
            {showLlmDropdown && (
              <Select value={localModel} onValueChange={setLocalModel}>
                <SelectTrigger className="bg-bg-light border-0 rounded-md px-3 py-1.5 text-xs h-auto w-auto font-proxima focus:ring-0 focus:ring-offset-0">
                  <SelectValue>
                    {LLM_MODELS.find(model => model.value === localModel)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LLM_MODELS.map(model => (
                    <SelectItem key={model.value} value={model.value} className="text-xs font-proxima">
                      <div className="flex flex-col">
                        <span>{model.label}</span>
                        <span className="text-xs text-gray-500">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Send button - ArrowButton with left-to-right fill animation */}
            <ArrowButton
              onClick={handleSubmit}
              disabled={disabled || !hasContent}
              size="lg"
              rotation={-90}
              borderColor="#4242EA"
              backgroundColor="#4242EA"
              arrowColor="white"
              hoverBackgroundColor="#EFEFEF"
              hoverArrowColor="#4242EA"
              className="w-[30px] h-[30px] disabled:opacity-50"
              strokeWidth={1}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

AutoExpandTextarea.displayName = 'AutoExpandTextarea';

export default AutoExpandTextarea;
