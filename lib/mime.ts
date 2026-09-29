// Định dạng file dùng chung cho client và server.
export const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', html: 'text/html', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/aac', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm',
}

export const fileExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

export const mimeFor = (name: string, fallback = '') => MIME_BY_EXT[fileExt(name)] ?? fallback

// Server phải tự đọc nội dung các file này (Gemini không nhận trực tiếp) → gửi qua form.
export const SERVER_EXTRACTED_EXTS = ['docx', 'txt', 'md', 'html', 'csv']

export const UNSUPPORTED_EXTS = ['doc', 'ppt', 'pptx', 'xls', 'xlsx']

export const MAX_FILE_BYTES = 500 * 1024 * 1024

// Vercel giới hạn body mỗi request 4,5 MB — chừa chỗ cho phần đầu multipart.
export const FORM_UPLOAD_LIMIT = 4 * 1024 * 1024
