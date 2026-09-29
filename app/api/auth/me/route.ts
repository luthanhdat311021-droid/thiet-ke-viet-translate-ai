import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return Response.json({ user: await getSessionUser() })
  } catch (err) {
    console.error(err)
    return Response.json({ user: null })
  }
}
