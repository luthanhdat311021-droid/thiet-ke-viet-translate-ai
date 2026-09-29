export type TranslationKind = 'text' | 'documents' | 'video' | 'audio' | 'image' | 'youtube'

export type Quality = 'fast' | 'balanced' | 'accurate'

export type Segment = {
  start?: string
  end?: string
  speaker?: string
  original: string
  translation: string
}

export type TranslationResult = {
  id: string
  kind: TranslationKind
  title: string
  sourceLanguage: string
  targetLanguage?: string
  segments: Segment[]
  model: string
  createdAt: string
}

// Bản ghi lịch sử không kèm nội dung (segments) — tải nội dung khi mở.
export type HistoryItem = Omit<TranslationResult, 'segments'> & { segments?: TranslationResult['segments'] }

// value = tên tiếng Anh (gửi cho model), label = tên hiển thị.
export const LANGUAGES = [
  { value: 'Vietnamese', label: 'Tiếng Việt' },
  { value: 'English', label: 'Tiếng Anh' },
  { value: 'Chinese (Simplified)', label: 'Tiếng Trung (Giản thể)' },
  { value: 'Chinese (Traditional)', label: 'Tiếng Trung (Phồn thể)' },
  { value: 'Japanese', label: 'Tiếng Nhật' },
  { value: 'Korean', label: 'Tiếng Hàn' },
  { value: 'French', label: 'Tiếng Pháp' },
  { value: 'German', label: 'Tiếng Đức' },
  { value: 'Spanish', label: 'Tiếng Tây Ban Nha' },
  { value: 'Portuguese', label: 'Tiếng Bồ Đào Nha' },
  { value: 'Italian', label: 'Tiếng Ý' },
  { value: 'Russian', label: 'Tiếng Nga' },
  { value: 'Ukrainian', label: 'Tiếng Ukraina' },
  { value: 'Polish', label: 'Tiếng Ba Lan' },
  { value: 'Dutch', label: 'Tiếng Hà Lan' },
  { value: 'Swedish', label: 'Tiếng Thụy Điển' },
  { value: 'Czech', label: 'Tiếng Séc' },
  { value: 'Greek', label: 'Tiếng Hy Lạp' },
  { value: 'Turkish', label: 'Tiếng Thổ Nhĩ Kỳ' },
  { value: 'Arabic', label: 'Tiếng Ả Rập' },
  { value: 'Hebrew', label: 'Tiếng Do Thái' },
  { value: 'Persian', label: 'Tiếng Ba Tư' },
  { value: 'Hindi', label: 'Tiếng Hindi' },
  { value: 'Bengali', label: 'Tiếng Bengal' },
  { value: 'Thai', label: 'Tiếng Thái' },
  { value: 'Lao', label: 'Tiếng Lào' },
  { value: 'Khmer', label: 'Tiếng Khmer' },
  { value: 'Burmese', label: 'Tiếng Miến Điện' },
  { value: 'Indonesian', label: 'Tiếng Indonesia' },
  { value: 'Malay', label: 'Tiếng Mã Lai' },
  { value: 'Filipino', label: 'Tiếng Philippines' },
]

export const SOURCE_LANGUAGES = [{ value: 'auto', label: 'Tự động phát hiện' }, ...LANGUAGES]
export const TARGET_LANGUAGES = LANGUAGES

export const languageLabel = (value?: string) =>
  LANGUAGES.find(l => l.value === value)?.label ?? value ?? 'Tiếng Việt'
