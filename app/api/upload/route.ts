import { GeminiError, startUpload } from '@/lib/gemini'
import { fileExt, MAX_FILE_BYTES, mimeFor, SERVER_EXTRACTED_EXTS, UNSUPPORTED_EXTS } from '@/lib/mime'

export const runtime = 'nodejs'

const ALLOWED_PREFIXES = ['image/', 'audio/', 'video/', 'application/pdf']

// Mở phiên upload trực tiếp lên Gemini Files API cho file lớn.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const size = Number(body.size)
  const mimeType = mimeFor(name, String(body.mimeType ?? ''))
  const ext = fileExt(name)

  if (!name || !Number.isFinite(size) || size <= 0) return Response.json({ error: 'Thông tin file không hợp lệ' }, { status: 400 })
  if (size > MAX_FILE_BYTES) return Response.json({ error: 'File vượt quá 500 MB' }, { status: 413 })
  if (UNSUPPORTED_EXTS.includes(ext)) return Response.json({ error: 'Định dạng này chưa được hỗ trợ trực tiếp. Hãy lưu file dưới dạng PDF hoặc DOCX rồi thử lại.' }, { status: 415 })
  if (SERVER_EXTRACTED_EXTS.includes(ext)) return Response.json({ error: 'File văn bản/Word quá lớn (tối đa 4 MB). Hãy chia nhỏ hoặc lưu dưới dạng PDF.' }, { status: 413 })
  if (!ALLOWED_PREFIXES.some(p => mimeType.startsWith(p))) return Response.json({ error: 'Không nhận diện được định dạng file' }, { status: 415 })

  try {
    return Response.json({ ...(await startUpload(size, mimeType, name)), mimeType })
  } catch (err) {
    if (err instanceof GeminiError) return Response.json({ error: err.message }, { status: err.status })
    console.error(err)
    return Response.json({ error: 'Không khởi tạo được phiên upload' }, { status: 500 })
  }
}
