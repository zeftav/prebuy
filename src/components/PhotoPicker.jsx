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
  takeLabel = 'Take photo',
  uploadLabel = 'Choose photo',
  busyLabel = 'Uploading…',
  takeIcon: TakeIcon = Camera,
  className = 'insp__capturebtn',
}) {
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
            accept="image/*"
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
          accept="image/*"
          multiple={multiple}
          hidden
          disabled={disabled}
          onChange={(e) => onPick(e.target.files)}
        />
      </label>
    </span>
  )
}
