// Compile logbook page photos into one PDF, client-side. Pages are processed ONE
// AT A TIME and downscaled before embedding, so a full 80-100 page book doesn't
// exhaust phone-browser memory. pdf-lib is lazy-imported (dynamic import) so it
// stays out of the main bundle until someone actually compiles. Rotation
// (0/90/180/270) is baked in by rotating the canvas before encoding.

export const PDF_MAX_DIM = 1600 // longest edge of each embedded page (px)
export const PDF_JPEG_QUALITY = 0.72

/** Snap any degrees to one of 0/90/180/270. Pure. */
export function normalizeRotation(deg) {
  const n = Number(deg)
  if (!Number.isFinite(n)) return 0
  return (((Math.round(n / 90) * 90) % 360) + 360) % 360
}

/** Next clockwise rotation step (for the rotate button). Pure. */
export function rotateStep(deg) {
  return normalizeRotation(normalizeRotation(deg) + 90)
}

/**
 * Renumber pages to a target order: returns the rows whose sort_order changed to
 * its new index, as [{ id, sort_order }]. Pure — the caller persists them. Lets a
 * neighbor swap on an already-numbered list write only the two that moved.
 */
export function reorderUpdates(orderedRows) {
  const out = []
  ;(orderedRows ?? []).forEach((r, i) => {
    if (r && r.sort_order !== i) out.push({ id: r.id, sort_order: i })
  })
  return out
}

// Load a (signed) URL into an ImageBitmap.
async function loadBitmap(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return await createImageBitmap(blob)
}

// Draw a bitmap to a downscaled, rotated canvas; return JPEG bytes + final dims.
async function toJpegBytes(bitmap, rotation) {
  const rot = normalizeRotation(rotation)
  const swap = rot === 90 || rot === 270
  const scale = Math.min(1, PDF_MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', PDF_JPEG_QUALITY))
  const buf = await blob.arrayBuffer()
  return { bytes: new Uint8Array(buf), width: canvas.width, height: canvas.height }
}

/**
 * Compile pages (each { url, rotation }) into a PDF Blob. Sequential + downscaled.
 * `onProgress({ done, total })` fires per page. Returns { blob, error }.
 */
export async function compileLogbookPdf(pages, { onProgress } = {}) {
  const list = (pages ?? []).filter((p) => p?.url)
  if (!list.length) return { blob: null, error: new Error('No pages to compile.') }
  try {
    const { PDFDocument } = await import('pdf-lib')
    const pdf = await PDFDocument.create()
    for (let i = 0; i < list.length; i++) {
      const bmp = await loadBitmap(list[i].url)
      const { bytes, width, height } = await toJpegBytes(bmp, list[i].rotation)
      if (bmp.close) bmp.close()
      const img = await pdf.embedJpg(bytes)
      const page = pdf.addPage([width, height])
      page.drawImage(img, { x: 0, y: 0, width, height })
      onProgress?.({ done: i + 1, total: list.length })
    }
    const out = await pdf.save()
    return { blob: new Blob([out], { type: 'application/pdf' }), error: null }
  } catch (e) {
    return { blob: null, error: e instanceof Error ? e : new Error('Could not build the PDF.') }
  }
}
