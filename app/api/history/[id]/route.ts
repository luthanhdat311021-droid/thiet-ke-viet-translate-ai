import { deleteTranslation, getTranslation, getUserId } from '@/lib/history'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const item = await getTranslation(await getUserId(), (await params).id)
    if (!item) return Response.json({ error: 'Không tìm thấy bản dịch' }, { status: 404 })
    return Response.json(item)
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Không tải được bản dịch' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const ok = await deleteTranslation(await getUserId(), (await params).id)
    if (!ok) return Response.json({ error: 'Không tìm thấy bản dịch' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Không xóa được bản dịch' }, { status: 500 })
  }
}
