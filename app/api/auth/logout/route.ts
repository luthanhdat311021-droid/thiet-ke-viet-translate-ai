import { destroySession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST() {
  try {
    await destroySession()
    return Response.json({ ok: true })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Không đăng xuất được' }, { status: 500 })
  }
}
