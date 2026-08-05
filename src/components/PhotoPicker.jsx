// PhotoPicker — two ways to add images, working on desktop AND mobile:
//   • "Take"  → file input with capture="environment" → opens the camera on a phone.
//   • "Upload" → file input WITHOUT capture → opens the photo library / file picker.
// On desktop both just open the OS file dialog. Same handler for both inputs.
//
// onPick receives the raw FileList — single-file callers take files?.[0]; multi
// callers use the whole list. While `busy`, both buttons collapse to one disabled
// label so we don't show two spinners.

import { Camera, Upload } from 'lucide-react'

export default function PhotoPicker({
  onPick,
  multiple = false,
  busy = false,
  disabled = false,
  uploadOnly = false,
  video = false, // when true, also accept video files (photo capture points only)
  pdf = false, // when true, the Upload picker also accepts PDFs (records scans)
  takeLabel = 'Take photo',
  uploadLabel = 'Choose photo',
  busyLabel = 'Uploading…',
  takeIcon: TakeIcon = Camera,
  className = 'insp__capturebtn',
}) {
  // Scan/OCR callers keep images only (they feed Claude vision); capture callers
  // opt into video too. The camera (capture) input stays image-only — you can't
  // photograph a PDF — so PDFs are offered on the Upload picker only.
  const accept = video ? 'image/*,video/*' : 'image/*'
  const uploadAccept = pdf ? `${accept},application/pdf` : accept
  if (busy) {
    return (
      <span className="photopick">
        <span className={className} aria-disabled="true">
          <TakeIcon size={15} aria-hidden="true" /> {busyLabel}
        </span>
      </span>
    )
  }
  return (
    <span className="photopick">
      {!uploadOnly && (
        <label className={className}>
          <TakeIcon size={15} aria-hidden="true" /> {takeLabel}
          <input
            type="file"
            accept={accept}
            capture="environment"
            multiple={multiple}
            hidden
            disabled={disabled}
            onChange={(e) => onPick(e.target.files)}
          />
        </label>
      )}
      <label className={className}>
        <Upload size={15} aria-hidden="true" /> {uploadLabel}
        <input
          type="file"
          accept={uploadAccept}
          multiple={multiple}
          hidden
          disabled={disabled}
          onChange={(e) => onPick(e.target.files)}
        />
      </label>
    </span>
  )
}
