// Normalize iPhone HEIC/HEIF stills into web-displayable JPEG at upload time.
// Browsers other than Safari can't decode HEIC in <img>/canvas, the customer
// report and thumbnails would show broken images, and neither Claude's vision API
// (logbook scans) nor the PDF compiler accepts it — so we convert on the way in.
// heic2any (libheif wasm, ~1.4MB) is lazy-imported so it stays out of the main
// bundle until someone actually uploads a HEIC.

const HEIC_RE = /\.hei[cf]$/i

/** Is this file an HEIC/HEIF still? Checks MIME and (since iOS often omits it)
 * the .heic/.heif extension. Pure. */
export function isHeic(file) {
  const type = String(file?.type ?? '').toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  return HEIC_RE.test(String(file?.name ?? ''))
}

/** Swap a .heic/.heif name for .jpg. Pure. */
export function jpegName(name) {
  const base = String(name ?? 'photo').replace(HEIC_RE, '')
  return `${base || 'photo'}.jpg`
}

/**
 * Return a web-friendly image File. HEIC/HEIF → JPEG (via lazy heic2any);
 * everything else is returned unchanged. Never throws — on a decode failure it
 * falls back to the original file so the upload still proceeds.
 */
export async function toWebImage(file) {
  if (!file || !isHeic(file)) return file
  try {
    const { default: heic2any } = await import('heic2any')
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
    const blob = Array.isArray(out) ? out[0] : out
    return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
  } catch {
    return file
  }
}
