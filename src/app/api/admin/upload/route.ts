// POST /api/admin/upload — multipart image upload for admin editors (covers, hero slides, posters, gallery).
// Writes to public/uploads at runtime (dev sandbox serves /uploads/* straight from disk)
// and returns the public URL. Images only, ≤5 MB, safe random names — no path traversal.
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json } from '@/lib/server/utils'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_BYTES = 5 * 1024 * 1024

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export async function POST(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Expected multipart/form-data with a "file" field')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return apiError(400, 'VALIDATION_ERROR', 'Missing "file" field')

  const ext = MIME_EXT[file.type]
  if (!ext) return apiError(415, 'UNSUPPORTED_TYPE', `Unsupported file type: ${file.type || 'unknown'} — PNG/JPEG/WebP/GIF/AVIF only`)
  if (file.size <= 0 || file.size > MAX_BYTES) return apiError(413, 'TOO_LARGE', 'Image must be between 1 byte and 5 MB')

  const bytes = Buffer.from(await file.arrayBuffer())
  // Magic-number sniff — never trust Content-Type alone.
  // S8: AVIF/HEIC check tightened — the bare `ftyp` brand box also matches
  // MP4/MOV (ftypisom / ftypqt), which previously passed as "AVIF". AVIF is
  // `ftypavif`/`ftypavis` (still images); anything else ftyp* is rejected.
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8
  const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  const isGif = bytes.subarray(0, 3).toString('ascii') === 'GIF'
  const ftypBrand = bytes.subarray(8, 12).toString('ascii')
  const isAvif = bytes.subarray(4, 8).toString('ascii') === 'ftyp' && (ftypBrand === 'avif' || ftypBrand === 'avis')
  if (!isPng && !isJpg && !isWebp && !isGif && !isAvif) {
    return apiError(415, 'UNSUPPORTED_TYPE', 'File content is not a recognized image')
  }

  const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), bytes)
  const url = `/uploads/${name}`

  await audit(user.email, 'MEDIA_UPLOAD', 'ProductMedia', url, `Uploaded ${file.name || 'image'} (${Math.round(file.size / 1024)} KB)`)
  return json({ url })
}
