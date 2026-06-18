'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { UploadedDoc } from '@/lib/formTypes';

/** Max upload size — the Airtable upload-attachment endpoint caps payloads at ~5MB. */
export const MAX_DOC_BYTES = 5 * 1024 * 1024;
const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png';

/** Read a File into a base64 string (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // result is "data:<type>;base64,<payload>" — keep only the payload.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** A single document upload control (PDF/image), holding the file as base64 in state. */
export function DocUpload({
  label,
  required = false,
  value,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  value?: UploadedDoc;
  error?: string;
  onChange: (doc: UploadedDoc | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState('');

  async function handleFile(file: File | undefined) {
    setLocalError('');
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      setLocalError('הקובץ גדול מדי (מקסימום 5MB).');
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      onChange({ filename: file.name, contentType: file.type || 'application/octet-stream', base64 });
    } catch {
      setLocalError('שגיאה בקריאת הקובץ.');
    }
  }

  const shownError = error || localError;

  return (
    // h-full + flex-col so that, inside a grid row, the label takes the variable
    // space and the upload control is pinned to the bottom → buttons align across
    // items regardless of how many lines each label wraps to.
    <div className="flex flex-col gap-1 h-full">
      <label className="text-label-lg text-on-surface flex-1 whitespace-pre-line">
        {label} {required && <span className="text-error">*</span>}
      </label>
      <input
        ref={inputRef}
        type="file"
        accept={DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          // Allow re-selecting the same filename after a remove.
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="mt-auto flex items-center gap-2 bg-surface-container-low rounded-lg py-3 px-3">
          <Icon name="description" className="text-primary" />
          <span className="flex-1 truncate text-body-md" title={value.filename}>
            {value.filename}
          </span>
          <button
            type="button"
            className="text-on-surface-variant hover:text-error"
            onClick={() => onChange(undefined)}
            aria-label="הסרת קובץ"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-auto flex items-center justify-center gap-2 border-2 border-dashed border-outline-variant rounded-lg py-3 px-3 text-on-surface-variant hover:border-primary hover:text-primary transition-all"
        >
          <Icon name="upload_file" className="text-[18px]" />
          <span className="text-body-md font-medium">העלאת קובץ</span>
        </button>
      )}
      {shownError && <span className="text-error text-label-sm">{shownError}</span>}
    </div>
  );
}
