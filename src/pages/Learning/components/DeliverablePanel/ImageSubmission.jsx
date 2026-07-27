import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../lib/utils';

function ImageSubmission({
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
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [validationError, setValidationError] = useState('');
  const fileInputRef = useRef(null);

  // Load existing submission to show metadata (image itself is in GCS)
  useEffect(() => {
    if (currentSubmission?.content) {
      try {
        const parsedContent = typeof currentSubmission.content === 'string' 
          ? JSON.parse(currentSubmission.content) 
          : currentSubmission.content;
        if (parsedContent.type === 'image') {
          setImageData(parsedContent);
          if (parsedContent.signedUrl) {
            setImagePreview(parsedContent.signedUrl);
            setImageFile({ name: parsedContent.filename, size: 0 });
          }
        }
      } catch (e) {
        // Content is not JSON, ignore
      }
    }
  }, [currentSubmission]);

  // File validation
  const validateFile = (file) => {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];

    if (!allowedTypes.includes(file.type)) {
      return 'Please select a PNG or JPEG image file.';
    }

    if (file.size > maxSize) {
      return 'Image size must be less than 50MB.';
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

    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setImagePreview(base64String);
      
      // Prepare image data for submission
      const data = {
        type: 'image',
        filename: file.name,
        mimeType: file.type,
        base64: base64String
      };
      setImageData(data);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemoveImage = () => {
    // Clear everything to allow selecting a new image
    setImageFile(null);
    setImagePreview(null);
    setImageData(null);
    setValidationError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    if (!imageData || !imageData.base64) {
      setValidationError('Please select an image to upload');
      return;
    }

    const submissionString = JSON.stringify(imageData);
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
          Image <span className="text-red-600">*</span>
        </label>

        {!imagePreview ? (
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
                    PNG or JPEG • Max 50MB
                  </p>
                </div>
              </Button>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              onChange={handleFileInputChange}
              disabled={isLocked}
              className="hidden"
            />
          </>
        ) : (
          <>
            {/* Image Preview Card */}
            <div className="relative w-full bg-white rounded-[10px] p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-pursuit-purple/10 rounded-lg flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-pursuit-purple" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-proxima font-semibold text-carbon-black truncate">
                    {imageFile?.name || 'Submitted Image'}
                  </p>
                  <p className="text-[12px] font-proxima text-carbon-black/60">
                    {imageFile?.size ? `${(imageFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Image ready'}
                  </p>
                </div>
                {!isLocked && (
                  <button
                    onClick={handleRemoveImage}
                    className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-[#F1F1F1] flex items-center justify-center transition-colors"
                    title="Remove image"
                  >
                    <X className="w-4 h-4 text-carbon-black/60" />
                  </button>
                )}
              </div>
              
              {/* Image Preview */}
              <div className="mt-4 rounded-lg overflow-hidden bg-[#F1F1F1]">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-full h-auto max-h-[400px] object-contain"
                />
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

        {/* Footer Note - Shows when image not uploaded */}
        {(!imageData || !imageData.base64) && !isLocked && (
          <p className="text-xs text-carbon-black/60 font-proxima">
            All required fields (*) must be completed before submitting.
          </p>
        )}
      </div>

      {/* Submit Button - Fixed at bottom with horizontal line */}
      <div className="border-t border-divider px-6 py-4">
        <Button
          onClick={handleSubmit}
          disabled={!imageData || !imageData.base64 || isSubmitting || isLocked || isStreaming}
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

export default ImageSubmission;
