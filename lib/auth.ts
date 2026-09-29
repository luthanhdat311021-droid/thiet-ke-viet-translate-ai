import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from './db'

export type User = { id: string; email: string; name: string }

const SESSION_COOKIE = 'vt_session'
const SESSION_DAYS = 30
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))))

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, N, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt') return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p })
  return timingSafeEqual(key, expected)
}

// Dùng khi email không tồn tại, để thời gian phản hồi giống như khi sai mật khẩu.
let dummyHash: Promise<string> | undefined
export const dummyPasswordHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'))

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db().query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [sha256(token), userId, expires])
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  })
}

export async function getSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const { rows } = await db().query(
    `select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  )
  return rows[0] ?? null
}

export async function destroySession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await db().query('delete from sessions where token_hash = $1', [sha256(token)])
  store.delete(SESSION_COOKIE)
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
