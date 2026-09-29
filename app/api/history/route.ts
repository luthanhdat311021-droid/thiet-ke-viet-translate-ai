import { getUserId, listHistory, saveTranslation, UUID_RE } from '@/lib/history'
import type { TranslationResult } from '@/lib/translation-types'

export const runtime = 'nodejs'

const KINDS = ['text', 'documents', 'video', 'audio', 'image', 'youtube']

export async function GET() {
  try {
    return Response.json(await listHistory(await getUserId()))
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Không tải được lịch sử' }, { status: 500 })
  }
}

// Chuyển lịch sử cũ đang lưu trong trình duyệt (localStorage) lên database.
export async function POST(req: Request) {
  try {
    const userId = await getUserId()
    const body = await req.json().catch(() => null)
    const items: TranslationResult[] = Array.isArray(body?.items) ? body.items.slice(0, 50) : []
    let imported = 0
    for (const r of items) {
      if (!UUID_RE.test(r?.id) || !KINDS.includes(r.kind) || typeof r.title !== 'string' || !Array.isArray(r.segments)) continue
      await saveTranslation(userId, {
        ...r,
        sourceLanguage: String(r.sourceLanguage ?? 'Unknown'),
        model: String(r.model ?? ''),
        createdAt: isNaN(Date.parse(r.createdAt)) ? new Date().toISOString() : r.createdAt,
      })
      imported++
    }
    return Response.json({ imported })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Không lưu được lịch sử' }, { status: 500 })
  }
}
