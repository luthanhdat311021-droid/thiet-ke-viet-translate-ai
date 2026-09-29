import type { Quality } from './translation-types'

const API_BASE = 'https://generativelanguage.googleapis.com'

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType?: string; fileUri: string } }

export class GeminiError extends Error {
  constructor(message: string, public status = 500) {
    super(message)
  }
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiError('Chưa cấu hình GEMINI_API_KEY trong file .env.local', 500)
  return key
}

// Model ưu tiên trước, các model sau là dự phòng khi model trước quá tải / hết quota.
export function modelsFor(quality: Quality) {
  const fast = process.env.GEMINI_MODEL_FAST || 'gemini-flash-lite-latest'
  const balanced = process.env.GEMINI_MODEL_BALANCED || 'gemini-flash-latest'
  const accurate = process.env.GEMINI_MODEL_ACCURATE || 'gemini-pro-latest'
  return { fast: [fast], balanced: [balanced, fast], accurate: [accurate, balanced, fast] }[quality]
}

const RETRYABLE = new Set([500, 503, 504])
const FALLBACK = new Set([404, 429, 500, 503, 504])

export async function generateWithFallback<T>(models: string[], opts: Omit<Parameters<typeof generateJson>[0], 'model'>) {
  let lastError: unknown
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { data: await generateJson<T>({ ...opts, model }), model }
      } catch (err) {
        lastError = err
        if (!(err instanceof GeminiError)) throw err
        if (RETRYABLE.has(err.status) && attempt === 0) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        if (!FALLBACK.has(err.status)) throw err
        break
      }
    }
  }
  throw lastError
}

async function readError(res: Response) {
  const body = await res.text()
  let message = body
  try {
    message = JSON.parse(body).error?.message ?? body
  } catch {}
  if (res.status === 403) message = `Google từ chối truy cập API (403): ${message}`
  if (res.status === 429) message = 'Đã vượt hạn mức miễn phí của Gemini. Vui lòng đợi khoảng 1 phút rồi thử lại.'
  if (res.status === 503) message = 'Gemini đang quá tải. Vui lòng thử lại sau ít phút.'
  return new GeminiError(message, res.status)
}

export async function generateJson<T>(opts: {
  model: string
  system: string
  parts: Part[]
  schema: object
}): Promise<T> {
  const res = await fetch(`${API_BASE}/v1beta/models/${opts.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: opts.parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: opts.schema,
        maxOutputTokens: 65536,
      },
    }),
  })
  if (!res.ok) throw await readError(res)
  const data = await res.json()
  const candidate = data.candidates?.[0]
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason
    throw new GeminiError(reason ? `Nội dung bị chặn bởi bộ lọc an toàn (${reason})` : 'Gemini không trả về kết quả', 502)
  }
  const text = (candidate.content?.parts ?? [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new GeminiError('Nội dung quá dài để dịch trong một lần. Hãy chia nhỏ file/văn bản.', 413)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new GeminiError('Không đọc được phản hồi từ Gemini. Hãy thử lại.', 502)
  }
}

// Files API — file lớn được trình duyệt upload thẳng lên Google (không đi qua server,
// tránh giới hạn 4,5 MB/request của Vercel). Server chỉ mở phiên upload bằng API key;
// link upload trả về chỉ dùng được cho đúng file đó và không chứa key.
export async function startUpload(size: number, mimeType: string, displayName: string) {
  // Tự đặt tên file: response cuối của Google thiếu header CORS nên trình duyệt
  // không đọc được tên file do Google sinh ra.
  const name = `files/vt-${crypto.randomUUID()}`
  const res = await fetch(`${API_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey(),
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { name, display_name: displayName.slice(0, 200) } }),
  })
  if (!res.ok) throw await readError(res)
  const uploadUrl = res.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new GeminiError('Không khởi tạo được phiên upload file', 502)
  // Google yêu cầu mỗi phần (trừ phần cuối) là bội số của kích thước này (thường 8 MB).
  const chunkSize = Number(res.headers.get('x-goog-upload-chunk-granularity')) || 8 * 1024 * 1024
  return { name, uploadUrl, chunkSize }
}

export const FILE_NAME_RE = /^files\/[a-z0-9-]{1,64}$/

// Chờ Google xử lý xong file (video cần vài chục giây đến vài phút).
export async function waitForFile(name: string) {
  const deadline = Date.now() + 4 * 60_000
  for (;;) {
    const res = await fetch(`${API_BASE}/v1beta/${name}`, { headers: { 'x-goog-api-key': apiKey() } })
    if (res.status === 404 || res.status === 403) throw new GeminiError('Upload chưa hoàn tất hoặc file đã hết hạn. Vui lòng upload lại.', 404)
    if (!res.ok) throw await readError(res)
    const file = (await res.json()) as { uri: string; mimeType: string; state: string }
    if (file.state === 'ACTIVE') return { fileUri: file.uri, mimeType: file.mimeType }
    if (file.state === 'FAILED') throw new GeminiError('Google không xử lý được file này', 422)
    if (Date.now() > deadline) throw new GeminiError('Xử lý file quá lâu, hãy thử file nhỏ hơn', 504)
    await new Promise(r => setTimeout(r, 3000))
  }
}

export async function deleteFile(name: string) {
  await fetch(`${API_BASE}/v1beta/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': apiKey() } }).catch(() => {})
}

