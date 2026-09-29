import { createSession, hashPassword, isValidEmail, normalizeEmail } from '@/lib/auth'
import { db } from '@/lib/db'
import { claimGuestHistory } from '@/lib/history'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim().slice(0, 80)
  const email = normalizeEmail(String(body.email ?? ''))
  const password = String(body.password ?? '')

  if (!name) return Response.json({ error: 'Vui lòng nhập họ tên' }, { status: 400 })
  if (!isValidEmail(email)) return Response.json({ error: 'Email không hợp lệ' }, { status: 400 })
  if (password.length < 8) return Response.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' }, { status: 400 })
  if (password.length > 200) return Response.json({ error: 'Mật khẩu quá dài' }, { status: 400 })

  try {
    const { rows } = await db().query(
      'insert into users (email, name, password_hash) values ($1, $2, $3) on conflict (email) do nothing returning id, email, name',
      [email, name, await hashPassword(password)],
    )
    if (!rows[0]) return Response.json({ error: 'Email này đã được đăng ký. Hãy đăng nhập.' }, { status: 409 })
    await claimGuestHistory(rows[0].id)
    await createSession(rows[0].id)
    return Response.json({ user: rows[0] })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Không tạo được tài khoản. Vui lòng thử lại.' }, { status: 500 })
  }
}
