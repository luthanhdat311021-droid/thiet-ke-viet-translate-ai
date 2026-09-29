// Chuẩn hóa mọi dạng link YouTube về https://www.youtube.com/watch?v=ID.
// Gemini từ chối link có tham số thừa (vd. &list=... của playlist).
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function normalizeYoutubeUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/')
    if (first === 'watch') id = url.searchParams.get('v')
    else if (['shorts', 'live', 'embed', 'v'].includes(first)) id = second ?? null
  }
  return id && VIDEO_ID_RE.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
}
