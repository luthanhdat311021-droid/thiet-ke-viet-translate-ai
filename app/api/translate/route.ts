import mammoth from 'mammoth'
import { getUserId, saveTranslation } from '@/lib/history'
import { deleteFile, FILE_NAME_RE, GeminiError, generateWithFallback, modelsFor, waitForFile, type Part } from '@/lib/gemini'
import { fileExt, mimeFor, UNSUPPORTED_EXTS } from '@/lib/mime'
import { normalizeYoutubeUrl } from '@/lib/youtube'
import { buildReviewPrompt, buildSystemPrompt, buildTaskPrompt, responseSchema } from '@/lib/translate-prompt'
import { LANGUAGES, type Quality, type Segment, type TranslationKind, type TranslationResult } from '@/lib/translation-types'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_TEXT_CHARS = 20_000
// Giới hạn cho file gửi qua form (file lớn hơn được upload thẳng lên Gemini qua /api/upload).
const INLINE_LIMIT_BYTES = 20 * 1024 * 1024

type ModelOutput = { detectedLanguage: string; title: string; segments: Segment[] }

// Model đôi khi trả mốc thời gian sai định dạng — chỉ giữ dạng MM:SS / HH:MM:SS.
const TIMESTAMP_RE = /^\d{1,2}:\d{2}(:\d{2})?$/
function cleanSegments(segments: Segment[]): Segment[] {
  return segments.map(({ start, end, ...s }) => {
    const out: Segment = { ...s }
    const st = start?.trim().replace(/\.\d+$/, ''); const en = end?.trim().replace(/\.\d+$/, '')
    if (st && TIMESTAMP_RE.test(st)) out.start = st
    if (en && TIMESTAMP_RE.test(en)) out.end = en
    return out
  })
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

async function fileToParts(file: File): Promise<Part[]> {
  const ext = fileExt(file.name)
  const mimeType = mimeFor(file.name, file.type)
  const bytes = Buffer.from(await file.arrayBuffer())

  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: bytes })
    if (!value.trim()) throw new GeminiError('Không đọc được nội dung trong file Word', 422)
    return [{ text: `<document>\n${value}\n</document>` }]
  }
  if (UNSUPPORTED_EXTS.includes(ext)) {
    throw new GeminiError('Định dạng này chưa được hỗ trợ trực tiếp. Hãy lưu file dưới dạng PDF hoặc DOCX rồi thử lại.', 415)
  }
  if (!mimeType) throw new GeminiError('Không nhận diện được định dạng file', 415)
  if (mimeType.startsWith('text/')) return [{ text: `<document>\n${bytes.toString('utf8')}\n</document>` }]
  if (bytes.length > INLINE_LIMIT_BYTES) throw new GeminiError('File quá lớn để gửi trực tiếp. Vui lòng thử lại.', 413)
  return [{ inlineData: { mimeType, data: bytes.toString('base64') } }]
}

export async function POST(req: Request) {
  let uploadedFile: string | undefined
  try {
    const form = await req.formData()
    const kind = String(form.get('kind') ?? 'text') as TranslationKind
    const quality = (['fast', 'balanced', 'accurate'].includes(String(form.get('quality'))) ? form.get('quality') : 'balanced') as Quality
    const isLanguage = (v: string) => LANGUAGES.some(l => l.value === v)
    const sourceLang = isLanguage(String(form.get('sourceLang'))) ? String(form.get('sourceLang')) : 'auto'
    const targetLang = isLanguage(String(form.get('targetLang'))) ? String(form.get('targetLang')) : 'Vietnamese'
    if (sourceLang === targetLang) return fail('Ngôn ngữ nguồn và ngôn ngữ đích phải khác nhau')
    const glossary = String(form.get('glossary') ?? '').slice(0, 5000)

    let sourceParts: Part[]
    let fileName: string | undefined
    if (kind === 'text') {
      const text = String(form.get('text') ?? '').trim()
      if (!text) return fail('Vui lòng nhập văn bản cần dịch')
      if (text.length > MAX_TEXT_CHARS) return fail(`Văn bản vượt quá ${MAX_TEXT_CHARS.toLocaleString('vi-VN')} ký tự`)
      sourceParts = [{ text: `<source>\n${text}\n</source>` }]
    } else if (kind === 'youtube') {
      const url = normalizeYoutubeUrl(String(form.get('url') ?? ''))
      if (!url) return fail('Link YouTube không hợp lệ')
      sourceParts = [{ fileData: { fileUri: url } }]
    } else if (form.get('geminiFile')) {
      // File lớn đã được trình duyệt upload thẳng lên Gemini Files API.
      const geminiFile = String(form.get('geminiFile'))
      if (!FILE_NAME_RE.test(geminiFile)) return fail('Mã file không hợp lệ')
      uploadedFile = geminiFile
      fileName = String(form.get('fileName') ?? '').slice(0, 200) || undefined
      sourceParts = [{ fileData: await waitForFile(uploadedFile) }]
    } else {
      const file = form.get('file')
      if (!(file instanceof File)) return fail('Vui lòng chọn file')
      fileName = file.name
      sourceParts = await fileToParts(file)
    }

    const models = modelsFor(quality)
    const system = buildSystemPrompt(targetLang)
    const task = buildTaskPrompt({ kind, sourceLang, targetLang, glossary, fileName })
    let { data: output, model } = await generateWithFallback<ModelOutput>(models, {
      system, schema: responseSchema(kind),
      parts: [...sourceParts, { text: task }],
    })

    // Chế độ "Chính xác nhất": thêm một lượt biên tập lại bản nháp.
    if (quality === 'accurate' && output.segments.length) {
      const reviewed = await generateWithFallback<ModelOutput>(models.slice(models.indexOf(model)), {
        system, schema: responseSchema(kind),
        parts: [...sourceParts, { text: task }, { text: `${buildReviewPrompt(targetLang)}\n\n<draft>\n${JSON.stringify(output)}\n</draft>` }],
      })
      output = reviewed.data
    }

    const result: TranslationResult = {
      id: crypto.randomUUID(),
      kind,
      title: fileName ?? output.title,
      sourceLanguage: output.detectedLanguage || 'Unknown',
      targetLanguage: targetLang,
      segments: cleanSegments(output.segments),
      model,
      createdAt: new Date().toISOString(),
    }
    // Lỗi lưu lịch sử không được làm hỏng bản dịch đã có.
    try {
      await saveTranslation(await getUserId(), result)
    } catch (err) {
      console.error('Không lưu được lịch sử:', err)
    }
    return Response.json(result)
  } catch (err) {
    if (err instanceof GeminiError) return fail(err.message, err.status)
    console.error(err)
    return fail('Đã xảy ra lỗi khi dịch. Vui lòng thử lại.', 500)
  } finally {
    // Xóa file khỏi Gemini sau khi dịch xong (Google cũng tự xóa sau 48 giờ).
    if (uploadedFile) await deleteFile(uploadedFile)
  }
}
