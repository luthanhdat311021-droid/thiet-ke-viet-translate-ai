import { normalizeYoutubeUrl } from '@/lib/youtube'

// Lấy tiêu đề / kênh / thumbnail của video YouTube qua oEmbed (không cần API key).
export async function GET(req: Request) {
  const url = normalizeYoutubeUrl(new URL(req.url).searchParams.get('url') ?? '')
  if (!url) return Response.json({ error: 'Link YouTube không hợp lệ' }, { status: 400 })
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
  if (!res.ok) return Response.json({ error: 'Không tìm thấy video hoặc video ở chế độ riêng tư' }, { status: 404 })
  const data = await res.json()
  return Response.json({ title: data.title, author: data.author_name, thumbnail: data.thumbnail_url })
}
