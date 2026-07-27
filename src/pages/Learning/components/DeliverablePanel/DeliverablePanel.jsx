import React, { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
} from '../../../../components/ui/sheet';
import StructuredSubmission from './StructuredSubmission';
import LinkSubmission from './LinkSubmission';
import ImageSubmission from './ImageSubmission';
import FileSubmission from './FileSubmission';
import NoDeliverableConfigured from './NoDeliverableConfigured';

// Link-style deliverables (paste a URL) share the dedicated LinkSubmission panel.
const LINK_TYPES = ['link', 'document', 'url', 'presentation'];

// Pure routing decision: given a task, which panel handles its deliverable.
// Returns one of: 'structured' | 'video' | 'image' | 'file' | 'link' | 'none'.
// NOTE: 'text' is intentionally NOT a submission type — text tasks are
// conversation-only and never show a deliverable panel (they also aren't in
// the Assignment-button allowlist). 'none' is the genuine fallback, reached
// only by an unknown/unconfigured type. Exported for unit testing.
export function resolveDeliverablePanel(task) {
  if (!task) return 'none';
  // Schema-based custom forms (workshop-style) take precedence over type.
  if (task.deliverable_schema) return 'structured';
  const type = task.deliverable_type;
  if (type === 'video') return 'video';
  if (type === 'image') return 'image';
  if (type === 'file') return 'file';
  if (LINK_TYPES.includes(type)) return 'link';
  return 'none';
}

function DeliverablePanel({
  task,
  currentSubmission,
  isOpen,
  onClose,
  onSubmit,
  isLocked = false,
  userId,
  taskId,
  // True while the chat already has an AI stream in flight. Submitting then
  // would open a second concurrent stream into the same message list, so each
  // submission panel disables its submit button until the stream finishes
  // (inputs stay editable). Defaults to false so callers that don't pass it
  // behave exactly as before.
  isStreaming = false
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (submissionData) => {
    // Belt-and-suspenders: the submit buttons are disabled while streaming,
    // this stops a programmatic/in-flight call from opening a second stream.
    if (isStreaming) return;
    setIsSubmitting(true);
    try {
      await onSubmit(submissionData);
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loom video schema — StructuredSubmission renders the loom_url field with a
  // "Record Your Video" instructions card + a link to loom.com to record.
  const getVideoSchema = () => ({
    fields: [
      {
        name: 'loomUrl',
        label: 'Loom Video URL',
        type: 'loom_url',
        required: true,
        placeholder: 'https://www.loom.com/share/...',
        instructions: task.deliverable || 'Record a video to share your work. Make sure your video is set to "Anyone with the link can view".',
        help: 'Paste the share link from your Loom video.'
      }
    ]
  });

  const getSubmissionComponent = () => {
    const commonProps = {
      task,
      currentSubmission,
      isSubmitting,
      isLocked,
      isStreaming,
      onSubmit: handleSubmit,
      userId,
      taskId
    };

    // Explicit per-type routing to the dedicated panel for each deliverable
    // type. Only a genuinely unknown/unconfigured type reaches the terminal
    // fallback — no silent generic panel for real types.
    switch (resolveDeliverablePanel(task)) {
      case 'structured':
        return <StructuredSubmission {...commonProps} schema={task.deliverable_schema} />;
      // Video → rich Loom form (instructions card + record-on-loom link).
      case 'video':
        return <StructuredSubmission {...commonProps} schema={getVideoSchema()} />;
      case 'image':
        return <ImageSubmission {...commonProps} />;
      case 'file':
        return <FileSubmission {...commonProps} />;
      case 'link':
        return <LinkSubmission {...commonProps} />;
      // Genuinely no submittable deliverable configured (e.g. 'none', null,
      // 'text', or an unrecognized type).
      default:
        return <NoDeliverableConfigured deliverableType={task.deliverable_type} />;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[400px] sm:w-[460px] flex flex-col p-0 gap-0 bg-[#F1F1F1]">
        {/* Header with title and close button (close button is in SheetContent) */}
        <div className="px-[25px] py-[20px] flex flex-col gap-[6px]">
          {/* Deliverable title with submitted badge */}
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] leading-[20px] font-proxima font-bold text-carbon-black">
              Deliverable
            </h2>
            {currentSubmission && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-proxima font-semibold">
                <CheckCircle className="w-3 h-3" />
                Submitted
              </span>
            )}
          </div>
          
          {/* Separator */}
          <div className="w-full h-0 border border-carbon-black"></div>
          
          {/* Deliverable instructions instead of task title */}
          <div className="text-[16px] leading-[22px] font-proxima font-normal text-carbon-black">
            {task.deliverable 
              ? task.deliverable.charAt(0).toUpperCase() + task.deliverable.slice(1)
              : 'Please complete the deliverable for this activity.'}
          </div>
        </div>

        {/* Body - Dynamic submission form */}
        <div className="flex-1 overflow-y-auto">
          {getSubmissionComponent()}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default DeliverablePanel;


