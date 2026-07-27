import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../lib/utils';

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.txt,.md,.js,.py,.html,.css,.json,.csv,.pptx,.xlsx,.zip';

function FileSubmission({
  task,
  currentSubmission,
  isSubmitting,
  isLocked,
  // A chat/coach stream is in flight — block a second concurrent stream.
  isStreaming = false,
  onSubmit,
  userId,
  taskId
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [validationError, setValidationError] = useState('');
  const fileInputRef = useRef(null);

  // Load existing submission to show metadata (file itself is in GCS)
  useEffect(() => {
    if (currentSubmission?.content) {
      try {
        const parsedContent = typeof currentSubmission.content === 'string'
          ? JSON.parse(currentSubmission.content)
          : currentSubmission.content;
        if (parsedContent.type === 'file') {
          setFileData(parsedContent);
          setSelectedFile({ name: parsedContent.filename, size: parsedContent.size || 0 });
        }
      } catch (e) {
        // Content is not JSON, ignore
      }
    }
  }, [currentSubmission]);

  // File validation
  const validateFile = (file) => {
    const maxSize = 25 * 1024 * 1024; // 25MB

    if (file.size > maxSize) {
      return 'File size must be less than 25MB.';
    }

    return null;
  };

  const handleFileSelect = async (file) => {
    setValidationError('');

    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      return;
    }

    setSelectedFile(file);

    // Read file as base64 data URL
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;

      const data = {
        type: 'file',
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        base64: base64String
      };
      setFileData(data);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemoveFile = () => {
    // Clear everything to allow selecting a new file
    setSelectedFile(null);
    setFileData(null);
    setValidationError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    if (!fileData || !fileData.base64) {
      setValidationError('Please select a file to upload');
      return;
    }

    const submissionString = JSON.stringify(fileData);
    onSubmit(submissionString);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col h-full bg-[#F1F1F1]">
      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Required Field Label */}
        <label className="text-[14px] font-proxima font-semibold text-carbon-black mb-2 block">
          File <span className="text-red-600">*</span>
        </label>

        {!selectedFile ? (
          <>
            {/* Upload Button */}
            <div className="w-full mb-4">
              <Button
                onClick={handleBrowseClick}
                disabled={isLocked}
                className={cn(
                  "w-full h-[120px] border-2 border-dashed rounded-[10px] transition-colors",
                  "bg-white hover:bg-[#F9F9F9] border-[#E3E3E3] hover:border-pursuit-purple/50",
                  "flex flex-col items-center justify-center gap-3",
                  isLocked && "opacity-50 cursor-not-allowed"
                )}
                variant="outline"
              >
                <div className="w-12 h-12 rounded-full bg-[#F1F1F1] flex items-center justify-center">
                  <Upload className="w-6 h-6 text-carbon-black" />
                </div>
                <div className="text-center">
                  <p className="text-[16px] font-proxima font-semibold text-carbon-black">
                    Click to browse
                  </p>
                  <p className="text-[12px] font-proxima text-carbon-black/40 mt-1">
                    PDF, DOCX, code, and more • Max 25MB
                  </p>
                </div>
              </Button>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileInputChange}
              disabled={isLocked}
              className="hidden"
            />
          </>
        ) : (
          <>
            {/* File Preview Card */}
            <div className="relative w-full bg-white rounded-[10px] p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-pursuit-purple/10 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-pursuit-purple" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-proxima font-semibold text-carbon-black truncate">
                    {selectedFile?.name || 'Submitted File'}
                  </p>
                  <p className="text-[12px] font-proxima text-carbon-black/60">
                    {selectedFile?.size ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'File ready'}
                  </p>
                </div>
                {!isLocked && (
                  <button
                    onClick={handleRemoveFile}
                    className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-[#F1F1F1] flex items-center justify-center transition-colors"
                    title="Remove file"
                  >
                    <X className="w-4 h-4 text-carbon-black/60" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-xs text-red-600 font-proxima">
              {validationError}
            </p>
          </div>
        )}

        {/* Footer Note - Shows when file not uploaded */}
        {(!fileData || !fileData.base64) && !isLocked && (
          <p className="text-xs text-carbon-black/60 font-proxima">
            All required fields (*) must be completed before submitting.
          </p>
        )}
      </div>

      {/* Submit Button - Fixed at bottom with horizontal line */}
      <div className="border-t border-divider px-6 py-4">
        <Button
          onClick={handleSubmit}
          disabled={!fileData || !fileData.base64 || isSubmitting || isLocked || isStreaming}
          className="w-full bg-pursuit-purple hover:bg-pursuit-purple/90 text-white font-proxima text-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit'
          )}
        </Button>
      </div>
    </div>
  );
}

export default FileSubmission;
