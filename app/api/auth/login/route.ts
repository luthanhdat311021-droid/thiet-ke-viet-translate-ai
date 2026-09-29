import { createSession, dummyPasswordHash, normalizeEmail, verifyPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { claimGuestHistory } from '@/lib/history'

export const runtime = 'nodejs'

// Giới hạn đơn giản trong bộ nhớ: tối đa 10 lần đăng nhập sai / 15 phút cho mỗi email.
const failures = new Map<string, { count: number; until: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(String(body.email ?? ''))
  const password = String(body.password ?? '')
  if (!email || !password) return Response.json({ error: 'Vui lòng nhập email và mật khẩu' }, { status: 400 })

  const entry = failures.get(email)
  if (entry && entry.until > Date.now() && entry.count >= MAX_FAILURES) {
    return Response.json({ error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' }, { status: 429 })
  }

  try {
    const { rows } = await db().query('select id, email, name, password_hash from users where email = $1', [email])
    const user = rows[0]
    const ok = await verifyPassword(password, user?.password_hash ?? await dummyPasswordHash())
    if (!user || !ok) {
      const current = entry && entry.until > Date.now() ? entry : { count: 0, until: Date.now() + WINDOW_MS }
      failures.set(email, { ...current, count: current.count + 1 })
      return Response.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 })
    }
    failures.delete(email)
    await claimGuestHistory(user.id)
    await createSession(user.id)
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Không đăng nhập được. Vui lòng thử lại.' }, { status: 500 })
  }
}
