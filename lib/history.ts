import { cookies } from 'next/headers'
import { getSessionUser } from './auth'
import { db } from './db'
import type { HistoryItem, TranslationResult } from './translation-types'

const USER_COOKIE = 'vt_uid'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Chủ sở hữu lịch sử: tài khoản đang đăng nhập, nếu không thì là khách ẩn danh.
export async function getUserId() {
  const user = await getSessionUser()
  return user ? user.id : getGuestId()
}

// Khách ẩn danh: mỗi trình duyệt có một mã riêng lưu trong cookie httpOnly.
export async function getGuestId() {
  const store = await cookies()
  const existing = store.get(USER_COOKIE)?.value
  if (existing && UUID_RE.test(existing)) return existing
  const id = crypto.randomUUID()
  store.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365 * 5,
  })
  return id
}

const META_COLUMNS = `id, kind, title, source_language as "sourceLanguage", target_language as "targetLanguage", model, created_at as "createdAt"`

export async function saveTranslation(userId: string, r: TranslationResult) {
  await db().query(
    `insert into translations (id, user_id, kind, title, source_language, target_language, segments, model, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (id) do nothing`,
    [r.id, userId, r.kind, r.title, r.sourceLanguage, r.targetLanguage ?? 'Vietnamese', JSON.stringify(r.segments), r.model, r.createdAt],
  )
}

export async function listHistory(userId: string, limit = 100): Promise<HistoryItem[]> {
  const { rows } = await db().query(
    `select ${META_COLUMNS} from translations where user_id = $1 order by created_at desc limit $2`,
    [userId, limit],
  )
  return rows.map(r => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }))
}

export async function getTranslation(userId: string, id: string): Promise<TranslationResult | null> {
  if (!UUID_RE.test(id)) return null
  const { rows } = await db().query(
    `select ${META_COLUMNS}, segments from translations where user_id = $1 and id = $2`,
    [userId, id],
  )
  return rows[0] ? { ...rows[0], createdAt: new Date(rows[0].createdAt).toISOString() } : null
}

export async function deleteTranslation(userId: string, id: string) {
  if (!UUID_RE.test(id)) return false
  const { rowCount } = await db().query('delete from translations where user_id = $1 and id = $2', [userId, id])
  return (rowCount ?? 0) > 0
}

// Gộp lịch sử đã dịch khi còn là khách vào tài khoản vừa đăng nhập/đăng ký.
export async function claimGuestHistory(userId: string) {
  const guestId = (await cookies()).get(USER_COOKIE)?.value
  if (!guestId || !UUID_RE.test(guestId) || guestId === userId) return
  await db().query('update translations set user_id = $1 where user_id = $2', [userId, guestId])
}

export { UUID_RE }
