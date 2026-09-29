'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Globe2,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  Video,
  X,
} from 'lucide-react'
import { fileExt, FORM_UPLOAD_LIMIT, MAX_FILE_BYTES, SERVER_EXTRACTED_EXTS, UNSUPPORTED_EXTS } from '@/lib/mime'
import { languageLabel, SOURCE_LANGUAGES, TARGET_LANGUAGES, type HistoryItem, type Quality, type TranslationKind, type TranslationResult } from '@/lib/translation-types'

type View = 'home' | 'documents' | 'video' | 'audio' | 'youtube' | 'image' | 'text' | 'history' | 'settings' | 'result' | 'auth'

type AuthUser = { id: string; email: string; name: string }

type UploadItem = { file: File; size: string }

type Prefs = { quality: Quality; glossary: string }

type Langs = { source: string; target: string }

type TranslateFn = (fields: Record<string, string | Blob>) => Promise<TranslationResult>

const navGroups = [
  { label: 'WORKSPACE', items: [
    { id: 'home' as View, label: 'Trang chủ', icon: LayoutDashboard },
    { id: 'documents' as View, label: 'Dịch tài liệu', icon: FileText },
    { id: 'video' as View, label: 'Dịch video', icon: Video },
    { id: 'audio' as View, label: 'Dịch audio', icon: AudioLines },
    { id: 'youtube' as View, label: 'Dịch YouTube', icon: Video },
    { id: 'image' as View, label: 'Dịch hình ảnh', icon: ImageIcon },
    { id: 'text' as View, label: 'Dịch văn bản', icon: Languages },
  ]},
  { label: 'LIBRARY', items: [
    { id: 'history' as View, label: 'Lịch sử', icon: Clock3 },
    { id: 'settings' as View, label: 'Cài đặt', icon: Settings },
  ]},
]

const kindMeta: Record<TranslationKind, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  documents: { label: 'Tài liệu', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  video: { label: 'Video', icon: FileVideo, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  youtube: { label: 'YouTube', icon: Video, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  audio: { label: 'Audio', icon: FileAudio, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  image: { label: 'Hình ảnh', icon: FileImage, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  text: { label: 'Văn bản', icon: Languages, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
}

const formats = [
  { label: 'Dịch tài liệu', detail: 'PDF, Word, TXT', icon: FileText, id: 'documents' as View, action: 'Chọn file', tone: 'blue' },
  { label: 'Dịch video', detail: 'Tạo phụ đề đa ngôn ngữ', icon: FileVideo, id: 'video' as View, action: 'Upload video', tone: 'violet' },
  { label: 'Dịch YouTube', detail: 'Dán link video để bắt đầu', icon: Video, id: 'youtube' as View, action: 'Dịch link YouTube', tone: 'red' },
  { label: 'Dịch audio', detail: 'MP3, WAV, M4A...', icon: FileAudio, id: 'audio' as View, action: 'Upload audio', tone: 'amber' },
  { label: 'Dịch hình ảnh', detail: 'OCR và dịch nội dung ảnh', icon: FileImage, id: 'image' as View, action: 'Upload ảnh', tone: 'emerald' },
  { label: 'Dịch văn bản', detail: 'Nhập hoặc paste nội dung', icon: Languages, id: 'text' as View, action: 'Bắt đầu dịch', tone: 'indigo' },
]

const qualityOptions: { value: Quality; label: string; hint: string }[] = [
  { value: 'fast', label: 'Nhanh', hint: 'Model nhẹ, phản hồi nhanh nhất' },
  { value: 'balanced', label: 'Cân bằng', hint: 'Model Flash, cân bằng tốc độ và độ chính xác' },
  { value: 'accurate', label: 'Chính xác nhất', hint: 'Model Pro + một lượt biên tập lại bản dịch (chậm hơn)' },
]

const MAX_TEXT_CHARS = 20000

function readStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
function writeStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN')
const hasTimestamps = (r: TranslationResult) => r.segments.some(s => s.start)

function toSrtTime(t = '0:00') {
  const parts = t.split(':').map(Number)
  while (parts.length < 3) parts.unshift(0)
  return `${parts.map(n => String(Math.floor(n || 0)).padStart(2, '0')).join(':')},000`
}

function exportResult(r: TranslationResult) {
  const content = hasTimestamps(r)
    ? r.segments.map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end || r.segments[i + 1]?.start || s.start)}\n${s.translation}\n`).join('\n')
    : r.segments.map(s => s.translation).join('\n\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${r.title.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_')} - ${languageLabel(r.targetLanguage)}.${hasTimestamps(r) ? 'srt' : 'txt'}`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ErrorBox({ message }: { message: string }) {
  return <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 size-4 shrink-0" /><p className="leading-5">{message}</p></div>
}

function Logo() {
  return <div className="flex items-center gap-2.5"><div className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900"><Globe2 className="size-5" /></div><span className="text-[17px] font-semibold tracking-[-0.02em]">VietTranslate</span></div>
}

const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0]).slice(-2).join('').toUpperCase() || '?'

function Avatar({ user, small }: { user: AuthUser; small?: boolean }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700 ${small ? 'size-7 text-[10px]' : 'size-8 text-xs'}`}>{initials(user.name)}</div>
}

function Sidebar({ view, setView, mobileOpen, setMobileOpen, historyCount, user, logout }: { view: View; setView: (v: View) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void; historyCount: number; user: AuthUser | null; logout: () => void }) {
  return <>
    {mobileOpen && <button aria-label="Đóng menu" className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-slate-200 bg-white px-4 py-5 transition-transform dark:border-slate-800 dark:bg-slate-950 md:relative md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-2"><Logo /></div>
      <div className="mt-10 flex flex-1 flex-col gap-7 overflow-y-auto">
        {navGroups.map(group => <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-slate-400">{group.label}</p>
          <nav className="flex flex-col gap-1">{group.items.map(item => { const Icon = item.icon; const active = view === item.id; return <button key={item.id} onClick={() => { setView(item.id); setMobileOpen(false) }} className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-[13px] transition-colors ${active ? 'bg-slate-100 font-medium text-slate-950 dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-slate-200'}`}><Icon className="size-[17px]" />{item.label}{item.id === 'history' && historyCount > 0 && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">{historyCount}</span>}</button> })}</nav>
        </div>)}
      </div>
      <div className="border-t border-slate-100 pt-4 dark:border-slate-800">{user
        ? <div className="flex items-center gap-3 rounded-lg px-2 py-2"><Avatar user={user} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{user.name}</p><p className="truncate text-[11px] text-slate-400">{user.email}</p></div><button aria-label="Đăng xuất" title="Đăng xuất" onClick={logout} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><LogOut className="size-4" /></button></div>
        : <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800"><UserRound className="size-4" /></div><div><p className="text-xs font-medium">Khách</p><p className="text-[11px] text-slate-400">Chưa đăng nhập</p></div></div><button onClick={() => { setView('auth'); setMobileOpen(false) }} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-[11px] font-medium text-white dark:bg-white dark:text-slate-900"><LogIn className="size-3.5" /> Đăng nhập / Đăng ký</button></div>}</div>
    </aside>
  </>
}

function AccountMenu({ user, setView, logout }: { user: AuthUser | null; setView: (v: View) => void; logout: () => void }) {
  const [open, setOpen] = useState(false)
  if (!user) return <button onClick={() => setView('auth')} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white dark:bg-white dark:text-slate-900"><LogIn className="size-3.5" /> Đăng nhập</button>
  return <div className="relative"><button aria-label="Tài khoản" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-900"><Avatar user={user} small /><ChevronDown className="size-3.5 text-slate-400" /></button>{open && <><button aria-label="Đóng" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} /><div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800"><p className="truncate text-xs font-medium">{user.name}</p><p className="truncate text-[11px] text-slate-400">{user.email}</p></div><button onClick={() => { setOpen(false); setView('history') }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"><Clock3 className="size-3.5" /> Lịch sử dịch</button><button onClick={() => { setOpen(false); logout() }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-red-600 hover:bg-slate-50 dark:hover:bg-slate-800"><LogOut className="size-3.5" /> Đăng xuất</button></div></>}</div>
}

function Header({ title, setMobileOpen, dark, setDark, account }: { title: string; setMobileOpen: (v: boolean) => void; dark: boolean; setDark: (v: boolean) => void; account: ReactNode }) {
  const today = useMemo(() => new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), [])
  return <header className="flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur md:px-8 dark:border-slate-800 dark:bg-slate-950/90"><div className="flex items-center gap-3"><button aria-label="Mở menu" className="rounded-lg p-2 hover:bg-slate-100 md:hidden dark:hover:bg-slate-900" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button><div><p className="text-sm font-semibold tracking-[-0.01em]">{title}</p><p className="hidden text-xs capitalize text-slate-400 sm:block" suppressHydrationWarning>{today}</p></div></div><div className="flex items-center gap-2"><button aria-label="Đổi giao diện" onClick={() => setDark(!dark)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900">{dark ? <Sun className="size-[17px]" /> : <Moon className="size-[17px]" />}</button><div className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-800" />{account}</div></header>
}

function LangSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return <label className="relative flex min-w-[180px] flex-1 items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5 text-xs shadow-sm dark:bg-slate-900"><span className="shrink-0 whitespace-nowrap text-slate-400">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-5 text-right font-medium outline-none dark:bg-slate-900">{options.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 size-3.5 text-slate-400" /></label>
}

function LanguageBar({ langs, setLangs }: { langs: Langs; setLangs: (l: Langs) => void }) {
  const fallbackFor = (lang: string) => lang === 'Vietnamese' ? 'English' : 'Vietnamese'
  // Chọn trùng ngôn ngữ ở hai bên thì tự đảo chiều thay vì để cặp không hợp lệ.
  const setSource = (source: string) => setLangs({ source, target: source === langs.target ? (langs.source === 'auto' ? fallbackFor(source) : langs.source) : langs.target })
  const setTarget = (target: string) => setLangs({ target, source: target === langs.source ? langs.target : langs.source })
  const swap = () => setLangs(langs.source === 'auto' ? { source: langs.target, target: fallbackFor(langs.target) } : { source: langs.target, target: langs.source })
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/50"><LangSelect label="Từ" value={langs.source} options={SOURCE_LANGUAGES} onChange={setSource} /><button type="button" aria-label="Đảo chiều ngôn ngữ" title="Đảo chiều" onClick={swap} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><ArrowLeftRight className="size-4" /></button><LangSelect label="Sang" value={langs.target} options={TARGET_LANGUAGES} onChange={setTarget} /></div>
}

function HistoryRow({ item, first, onOpen, onDelete }: { item: HistoryItem; first: boolean; onOpen: () => void; onDelete?: () => void }) {
  const meta = kindMeta[item.kind]; const Icon = meta.icon
  return <div className={`flex items-center gap-3 px-4 py-3.5 ${first ? '' : 'border-t border-slate-100 dark:border-slate-800'}`}><div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}><Icon className={`size-[17px] ${meta.color}`} /></div><button onClick={onOpen} className="min-w-0 flex-1 text-left"><p className="truncate text-xs font-medium">{item.title}</p><p className="mt-1 text-[11px] text-slate-400">{meta.label} · {languageLabel(item.sourceLanguage)} → {languageLabel(item.targetLanguage)}</p></button><span className="hidden text-[11px] text-slate-400 sm:block">{formatDate(item.createdAt)}</span><span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 sm:block dark:bg-emerald-500/10 dark:text-emerald-400">Hoàn tất</span>{onDelete && <button aria-label="Xóa" onClick={onDelete} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"><Trash2 className="size-4" /></button>}<button aria-label="Mở" onClick={onOpen} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><ArrowRight className="size-4" /></button></div>
}

function Home({ setView, history, openResult }: { setView: (v: View) => void; history: HistoryItem[]; openResult: (r: HistoryItem) => void }) {
  return <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-8 md:py-10"><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300"><Sparkles className="size-3.5" /> Dịch nhanh hơn với Gemini AI</div><h1 className="text-[28px] font-semibold tracking-[-0.04em] text-slate-950 md:text-[34px] dark:text-white">Dịch mọi nội dung,<br className="sm:hidden" /> mọi ngôn ngữ.</h1><p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Tiếng Việt ⇄ hơn 30 ngôn ngữ. File, video, audio, hình ảnh và YouTube — tất cả trong một nền tảng.</p></div><button onClick={() => setView('text')} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-900"><Plus className="size-4" /> Bản dịch mới</button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{formats.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setView(item.id)} className="group flex min-h-[174px] flex-col items-start rounded-xl border border-slate-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-black/20"><div className={`mb-5 flex size-10 items-center justify-center rounded-lg ${item.tone === 'blue' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10' : item.tone === 'violet' ? 'bg-violet-50 text-violet-600 dark:bg-violet-500/10' : item.tone === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-500/10' : item.tone === 'amber' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10' : item.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10'}`}><Icon className="size-[19px]" /></div><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-slate-400">{item.detail}</p><span className="mt-auto flex items-center gap-1.5 pt-4 text-xs font-medium text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white">{item.action}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span></button> })}</div><div className="mt-10"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-semibold">Gần đây</h2><p className="mt-1 text-xs text-slate-400">Các bản dịch mới nhất của bạn</p></div><button onClick={() => setView('history')} className="text-xs font-medium text-blue-600 hover:text-blue-700">Xem tất cả <ArrowRight className="ml-1 inline size-3.5" /></button></div><div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">{history.length ? history.slice(0, 3).map((item, i) => <HistoryRow key={item.id} item={item} first={i === 0} onOpen={() => openResult(item)} />) : <p className="px-4 py-8 text-center text-xs text-slate-400">Chưa có bản dịch nào. Hãy bắt đầu bằng một bản dịch mới.</p>}</div></div></div>
}

function Processing({ label, hint, progress }: { label: string; hint: string; progress?: number }) {
  return <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 dark:border-blue-900/40 dark:bg-blue-950/20"><div className="flex items-center justify-between gap-2 text-xs font-medium"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin text-blue-600" />{label}</span>{progress !== undefined && <span>{Math.round(progress * 100)}%</span>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/50">{progress !== undefined ? <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${Math.max(2, progress * 100)}%` }} /> : <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" />}</div><p className="mt-2 text-[11px] text-blue-700/70 dark:text-blue-300/70">{hint}</p></div>
}

// Upload file lớn thẳng từ trình duyệt lên Gemini Files API theo từng phần,
// không đi qua server (tránh giới hạn 4,5 MB/request của Vercel).
async function uploadToGemini(file: File, onProgress: (p: number) => void): Promise<string> {
  let res: Response
  try { res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type }) }) } catch { throw new Error('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.') }
  const session = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(session.error || `Lỗi máy chủ (${res.status})`)
  const { name, uploadUrl, chunkSize } = session as { name: string; uploadUrl: string; chunkSize: number }
  let offset = 0
  for (;;) {
    const end = Math.min(offset + chunkSize, file.size); const last = end === file.size
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(uploadUrl, { method: 'POST', headers: { 'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload', 'X-Goog-Upload-Offset': String(offset) }, body: file.slice(offset, end) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        break
      } catch (err) {
        // Response của phần cuối không có header CORS nên trình duyệt báo lỗi mạng (TypeError)
        // dù Google đã nhận đủ file. Server sẽ kiểm tra lại file tồn tại trước khi dịch.
        if (last && err instanceof TypeError) break
        if (attempt >= 3) throw new Error('Upload bị gián đoạn. Kiểm tra mạng và thử lại.')
        await new Promise(r => setTimeout(r, 1500 * attempt))
      }
    }
    onProgress(end / file.size)
    if (last) return name
    offset = end
  }
}

function UploadPage({ kind, setView, translate, langBar }: { kind: 'documents' | 'video' | 'audio' | 'image'; setView: (v: View) => void; translate: TranslateFn; langBar: ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null); const [file, setFile] = useState<UploadItem | null>(null); const [processing, setProcessing] = useState(false); const [error, setError] = useState(''); const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const config = { documents: ['Dịch tài liệu', 'Dịch tài liệu sang ngôn ngữ bạn chọn, giữ nguyên cấu trúc đoạn văn.', FileText, 'PDF, DOCX, TXT, MD, HTML', '.pdf,.docx,.txt,.md,.html,.csv'], video: ['Dịch video', 'Upload video và nhận bản dịch kèm phụ đề.', FileVideo, 'MP4, MOV, AVI, MKV, WEBM', 'video/*'], audio: ['Dịch audio', 'Chuyển giọng nói thành văn bản và dịch sang ngôn ngữ bạn chọn.', FileAudio, 'MP3, WAV, M4A, FLAC, OGG', 'audio/*,.m4a'], image: ['Dịch hình ảnh', 'Nhận diện và dịch văn bản có trong hình ảnh.', FileImage, 'JPG, PNG, WEBP, HEIC', 'image/*,.heic'] }[kind] as [string, string, typeof FileText, string, string]; const Icon = config[2]
  const onFile = (f?: File) => {
    if (!f) return; setError('')
    if (f.size > MAX_FILE_BYTES) { setError('File vượt quá 500 MB.'); return }
    if (UNSUPPORTED_EXTS.includes(fileExt(f.name))) { setError('Định dạng này chưa được hỗ trợ trực tiếp. Hãy lưu file dưới dạng PDF hoặc DOCX rồi thử lại.'); return }
    if (f.size > FORM_UPLOAD_LIMIT && SERVER_EXTRACTED_EXTS.includes(fileExt(f.name))) { setError('File văn bản/Word tối đa 4 MB. Hãy chia nhỏ hoặc lưu dưới dạng PDF.'); return }
    setFile({ file: f, size: `${(f.size / 1024 / 1024).toFixed(1)} MB` })
  }
  const start = async () => {
    if (!file) return; setProcessing(true); setError('')
    try {
      if (file.file.size <= FORM_UPLOAD_LIMIT) { await translate({ kind, file: file.file }); return }
      setUploadProgress(0)
      const geminiFile = await uploadToGemini(file.file, setUploadProgress)
      setUploadProgress(null)
      await translate({ kind, geminiFile, fileName: file.file.name })
    } catch (e) { setError((e as Error).message); setProcessing(false); setUploadProgress(null) }
  }
  return <div className="mx-auto max-w-[860px] px-5 py-8 md:px-8 md:py-10"><div className="mb-8"><button onClick={() => setView('home')} className="mb-5 text-xs text-slate-400 hover:text-slate-700">← Về trang chủ</button><h1 className="text-2xl font-semibold tracking-[-0.03em]">{config[0]}</h1><p className="mt-2 text-sm text-slate-500">{config[1]}</p></div><div className="flex flex-col gap-5">{langBar}<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div onClick={() => !processing && inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!processing) onFile(e.dataTransfer.files[0]) }} className="flex min-h-[245px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-5 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:bg-blue-950/10"><input ref={inputRef} type="file" accept={config[4]} className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} /><div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-800"><Upload className="size-5" /></div><p className="text-sm font-medium">Kéo & thả file vào đây</p><p className="mt-1 text-xs text-slate-400">hoặc <span className="font-medium text-blue-600">chọn file từ máy</span></p><p className="mt-5 text-[11px] text-slate-400">{config[3]} · Tối đa 500 MB</p></div>{file && <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10"><Icon className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{file.file.name}</p><p className="mt-1 text-[11px] text-slate-400">{file.size} · Sẵn sàng</p></div><button aria-label="Xóa file" disabled={processing} onClick={() => setFile(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><X className="size-4" /></button></div>}</div>{processing && uploadProgress !== null && <Processing label="Đang tải file lên..." progress={uploadProgress} hint="Đang gửi từng phần file lên Google — đừng đóng trang" />}{processing && uploadProgress === null && <Processing label="Đang dịch với Gemini..." hint={kind === 'video' || kind === 'audio' ? 'Đang tải lên, nhận diện giọng nói và dịch — file dài có thể mất vài phút' : 'Đang đọc nội dung và dịch'} />}{error && <ErrorBox message={error} />}<div className="flex justify-end gap-3"><button onClick={() => setView('home')} className="h-10 rounded-lg px-4 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900">Hủy</button><button disabled={!file || processing} onClick={start} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900">{processing ? 'Đang dịch...' : 'Bắt đầu dịch'}<ArrowRight className="size-3.5" /></button></div></div></div>
}

function YoutubePage({ setView, translate, langBar }: { setView: (v: View) => void; translate: TranslateFn; langBar: ReactNode }) {
  const [url, setUrl] = useState(''); const [info, setInfo] = useState<{ title: string; author: string; thumbnail: string } | null>(null); const [analyzing, setAnalyzing] = useState(false); const [processing, setProcessing] = useState(false); const [error, setError] = useState('')
  const analyze = async () => { setAnalyzing(true); setError(''); setInfo(null); try { const res = await fetch(`/api/youtube?url=${encodeURIComponent(url.trim())}`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setInfo(data) } catch (e) { setError((e as Error).message) } finally { setAnalyzing(false) } }
  const start = async () => { setProcessing(true); setError(''); try { await translate({ kind: 'youtube', url: url.trim() }) } catch (e) { setError((e as Error).message); setProcessing(false) } }
  return <div className="mx-auto max-w-[860px] px-5 py-8 md:px-8 md:py-10"><div className="mb-8"><button onClick={() => setView('home')} className="mb-5 text-xs text-slate-400 hover:text-slate-700">← Về trang chủ</button><h1 className="text-2xl font-semibold tracking-[-0.03em]">Dịch video YouTube</h1><p className="mt-2 text-sm text-slate-500">Dán link YouTube (video công khai) để tự động lấy nội dung và tạo phụ đề dịch.</p></div><div className="flex flex-col gap-5"><div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><label className="mb-2 block text-xs font-medium">Link YouTube</label><div className="flex flex-col gap-2 sm:flex-row"><div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 dark:border-slate-700"><Video className="size-4 shrink-0 text-red-500" /><input value={url} onChange={e => { setUrl(e.target.value); setInfo(null) }} onKeyDown={e => { if (e.key === 'Enter' && url) analyze() }} placeholder="https://youtube.com/..." className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" /></div><button disabled={!url || analyzing || processing} onClick={analyze} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">{analyzing && <Loader2 className="size-3.5 animate-spin" />}Phân tích video</button></div></div>{info && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col gap-5 p-5 sm:flex-row"><img src={info.thumbnail} alt="" className="aspect-video w-full max-w-[280px] shrink-0 rounded-lg bg-slate-900 object-cover" /><div className="flex min-w-0 flex-1 flex-col justify-center"><span className="mb-2 text-[11px] font-medium text-red-500">VIDEO YOUTUBE</span><h2 className="text-base font-semibold">{info.title}</h2><p className="mt-2 text-xs text-slate-400">{info.author}</p><div className="mt-5">{langBar}</div></div></div>{processing ? <div className="border-t border-slate-100 p-5 dark:border-slate-800"><Processing label="Đang xử lý video..." hint="Gemini đang xem video, tạo transcript và dịch — video dài có thể mất vài phút" /></div> : <div className="flex justify-end border-t border-slate-100 p-5 dark:border-slate-800"><button onClick={start} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-5 text-xs font-medium text-white dark:bg-white dark:text-slate-900">Bắt đầu dịch <ArrowRight className="size-3.5" /></button></div>}</div>}{error && <ErrorBox message={error} />}</div></div>
}

function TextPage({ setView, translate, langBar }: { setView: (v: View) => void; translate: TranslateFn; langBar: ReactNode }) {
  const [text, setText] = useState(''); const [processing, setProcessing] = useState(false); const [error, setError] = useState('')
  const start = async () => { setProcessing(true); setError(''); try { await translate({ kind: 'text', text }) } catch (e) { setError((e as Error).message); setProcessing(false) } }
  return <div className="mx-auto max-w-[1050px] px-5 py-8 md:px-8 md:py-10"><div className="mb-8"><button onClick={() => setView('home')} className="mb-5 text-xs text-slate-400 hover:text-slate-700">← Về trang chủ</button><h1 className="text-2xl font-semibold tracking-[-0.03em]">Dịch văn bản</h1><p className="mt-2 text-sm text-slate-500">Nhập văn bản và nhận bản dịch ngay lập tức.</p></div>{langBar}<div className="mt-5 flex flex-col gap-4"><div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold">Văn bản nguồn <span className={`font-normal ${text.length > MAX_TEXT_CHARS ? 'text-red-500' : 'text-slate-400'}`}>· {text.length.toLocaleString('vi-VN')} ký tự</span></span><button aria-label="Xóa văn bản" onClick={() => setText('')} className="text-slate-400 hover:text-slate-700"><Trash2 className="size-4" /></button></div><textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() && !processing) start() }} className="min-h-[250px] w-full resize-y bg-transparent text-sm leading-7 outline-none placeholder:text-slate-400" placeholder="Nhập hoặc dán văn bản cần dịch..." /><div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800"><span className="text-[11px] text-slate-400">Tối đa {MAX_TEXT_CHARS.toLocaleString('vi-VN')} ký tự · Ctrl + Enter để dịch</span><button disabled={!text.trim() || text.length > MAX_TEXT_CHARS || processing} onClick={start} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">{processing ? <><Loader2 className="size-3.5 animate-spin" /> Đang dịch...</> : <>Dịch ngay <ArrowRight className="size-3.5" /></>}</button></div></div>{error && <ErrorBox message={error} />}</div></div>
}

function AuthPage({ onAuthed, setView }: { onAuthed: (u: AuthUser) => void; setView: (v: View) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login'); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'register' ? { name, email, password } : { email, password }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Đã xảy ra lỗi. Vui lòng thử lại.')
      onAuthed(data.user)
    } catch (err) { setError(err instanceof TypeError ? 'Không kết nối được máy chủ.' : (err as Error).message) } finally { setLoading(false) }
  }
  const input = 'h-10 w-full rounded-lg border border-slate-200 bg-transparent px-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 dark:border-slate-700'
  return <div className="mx-auto max-w-[420px] px-5 py-10 md:py-16"><button onClick={() => setView('home')} className="mb-5 text-xs text-slate-400 hover:text-slate-700">← Về trang chủ</button><div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><h1 className="text-xl font-semibold tracking-[-0.03em]">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h1><p className="mt-1.5 text-xs leading-5 text-slate-500">Lưu lịch sử dịch vào tài khoản và xem lại trên mọi thiết bị. Các bản dịch bạn đã làm khi chưa đăng nhập sẽ được chuyển vào tài khoản.</p><div className="mt-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs font-medium dark:bg-slate-800">{(['login', 'register'] as const).map(m => <button key={m} type="button" onClick={() => { setMode(m); setError('') }} className={`rounded-md py-1.5 ${mode === m ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}>{m === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>)}</div><form onSubmit={submit} className="mt-5 flex flex-col gap-3">{mode === 'register' && <label className="flex flex-col gap-1.5 text-xs font-medium">Họ tên<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} placeholder="Nguyễn Văn A" className={input} /></label>}<label className="flex flex-col gap-1.5 text-xs font-medium">Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="ban@example.com" className={input} /></label><label className="flex flex-col gap-1.5 text-xs font-medium">Mật khẩu<div className="relative"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} placeholder={mode === 'register' ? 'Ít nhất 8 ký tự' : ''} className={`${input} pr-10`} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>{error && <ErrorBox message={error} />}<button type="submit" disabled={loading} className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">{loading && <Loader2 className="size-3.5 animate-spin" />}{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button></form></div></div>
}

function History({ history, openResult, deleteItem, user, setView }: { history: HistoryItem[]; openResult: (r: HistoryItem) => void; deleteItem: (id: string) => void; user: AuthUser | null; setView: (v: View) => void }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState<TranslationKind | 'all'>('all')
  const items = useMemo(() => history.filter(item => (filter === 'all' || item.kind === filter) && item.title.toLowerCase().includes(query.toLowerCase())), [history, query, filter])
  return <div className="mx-auto max-w-[1050px] px-5 py-8 md:px-8 md:py-10"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold tracking-[-0.03em]">Lịch sử dịch</h1><p className="mt-2 text-sm text-slate-500">{user ? `Các bản dịch được lưu trong tài khoản ${user.email}.` : 'Theo dõi và quản lý các bản dịch của bạn.'}</p></div><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900"><Search className="size-4 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kiếm..." className="h-9 w-40 bg-transparent text-xs outline-none placeholder:text-slate-400" /></div></div>{!user && <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center dark:border-blue-900/40 dark:bg-blue-950/20"><p className="text-xs leading-5 text-blue-800 dark:text-blue-200">Bạn đang dùng chế độ khách — lịch sử chỉ gắn với trình duyệt này. Đăng nhập để lưu vào tài khoản và xem trên mọi thiết bị.</p><button onClick={() => setView('auth')} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white dark:bg-white dark:text-slate-900"><LogIn className="size-3.5" /> Đăng nhập</button></div>}<div className="mb-4 flex gap-2 overflow-x-auto pb-1">{(['all', ...Object.keys(kindMeta)] as (TranslationKind | 'all')[]).map(k => <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] ${filter === k ? 'bg-slate-900 font-medium text-white dark:bg-white dark:text-slate-900' : 'border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'}`}>{k === 'all' ? 'Tất cả' : kindMeta[k].label}{k === 'all' && <span className="ml-1 opacity-60">{history.length}</span>}</button>)}</div><div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">{items.length ? items.map((item, i) => <HistoryRow key={item.id} item={item} first={i === 0} onOpen={() => openResult(item)} onDelete={() => deleteItem(item.id)} />) : <p className="px-4 py-8 text-center text-xs text-slate-400">Không có bản dịch nào.</p>}</div></div>
}

function Result({ result, setView }: { result: TranslationResult | null; setView: (v: View) => void }) {
  const [copied, setCopied] = useState(false)
  if (!result) return <div className="mx-auto max-w-[1050px] px-5 py-16 text-center text-sm text-slate-400">Chưa có kết quả. <button onClick={() => setView('text')} className="text-blue-600">Bắt đầu dịch</button></div>
  const timed = hasTimestamps(result)
  const copy = async () => { try { await navigator.clipboard.writeText(result.segments.map(s => s.translation).join('\n\n')); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch {} }
  return <div className="mx-auto max-w-[1050px] px-5 py-8 md:px-8 md:py-10"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="min-w-0"><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"><Check className="size-3.5" /> Dịch hoàn tất</div><h1 className="break-words text-2xl font-semibold tracking-[-0.03em]">{result.title}</h1><p className="mt-2 text-sm text-slate-500">{languageLabel(result.sourceLanguage)} → {languageLabel(result.targetLanguage)} · {formatDate(result.createdAt)} · {result.model}</p></div><div className="flex shrink-0 gap-2"><button onClick={copy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"><Copy className="size-3.5" /> {copied ? 'Đã copy' : 'Copy'}</button><button onClick={() => exportResult(result)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white dark:bg-white dark:text-slate-900"><Download className="size-3.5" /> {timed ? 'Tải phụ đề .srt' : 'Tải .txt'}</button></div></div>{result.segments.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">Không tìm thấy nội dung nào để dịch.</p> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="hidden grid-cols-2 border-b border-slate-100 text-xs font-semibold md:grid dark:border-slate-800"><div className="flex justify-between px-5 py-3"><span>Bản gốc</span><span className="font-normal text-slate-400">{languageLabel(result.sourceLanguage)}</span></div><div className="flex justify-between border-l border-slate-100 bg-blue-50/40 px-5 py-3 dark:border-slate-800 dark:bg-blue-950/20"><span>Bản dịch</span><span className="font-normal text-blue-600 dark:text-blue-400">{languageLabel(result.targetLanguage)}</span></div></div>{result.segments.map((s, i) => <div key={i} className={`grid md:grid-cols-2 ${i ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}><div className="px-5 py-4">{(s.start || s.speaker) && <p className="mb-1 font-mono text-[11px] text-slate-400">{s.start}{s.end ? ` → ${s.end}` : ''}{s.speaker ? ` · ${s.speaker}` : ''}</p>}<p className="whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-slate-300">{s.original}</p></div><div className="border-slate-100 bg-blue-50/40 px-5 py-4 md:border-l dark:border-slate-800 dark:bg-blue-950/20"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-100">{s.translation}</p></div></div>)}</div>}</div>
}

function SettingsPage({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  return <div className="mx-auto max-w-[860px] px-5 py-8 md:px-8 md:py-10"><h1 className="text-2xl font-semibold tracking-[-0.03em]">Cài đặt</h1><p className="mt-2 text-sm text-slate-500">Tùy chỉnh trải nghiệm VietTranslate của bạn.</p><div className="mt-8 flex flex-col gap-4"><section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-semibold">Chất lượng bản dịch</h2><p className="mt-1 text-[11px] text-slate-400">Chọn cân bằng giữa tốc độ và độ chính xác.</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{qualityOptions.map(o => <button key={o.value} onClick={() => setPrefs({ ...prefs, quality: o.value })} className={`rounded-lg border p-3 text-left transition-colors ${prefs.quality === o.value ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}><p className="flex items-center justify-between text-xs font-medium">{o.label}{prefs.quality === o.value && <Check className="size-3.5 text-blue-600" />}</p><p className="mt-1 text-[11px] leading-4 text-slate-400">{o.hint}</p></button>)}</div></section><section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-semibold">Bảng thuật ngữ riêng</h2><p className="mt-1 text-[11px] leading-4 text-slate-400">AI sẽ luôn dịch các thuật ngữ này đúng như bạn quy định. Mỗi dòng một thuật ngữ theo dạng <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">từ gốc = bản dịch</code>.</p><textarea value={prefs.glossary} onChange={e => setPrefs({ ...prefs, glossary: e.target.value })} placeholder={'machine learning = học máy\nprompt = câu lệnh\nVietTranslate = VietTranslate'} className="mt-4 min-h-[160px] w-full resize-y rounded-lg border border-slate-200 bg-transparent p-3 font-mono text-xs leading-6 outline-none placeholder:text-slate-400 focus:border-blue-400 dark:border-slate-700" /></section></div></div>
}

function App() {
  const [view, setView] = useState<View>('home'); const [mobileOpen, setMobileOpen] = useState(false); const [dark, setDark] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([]); const [current, setCurrent] = useState<TranslationResult | null>(null); const [prefs, setPrefsState] = useState<Prefs>({ quality: 'balanced', glossary: '' }); const [langs, setLangsState] = useState<Langs>({ source: 'auto', target: 'Vietnamese' })
  useEffect(() => {
    setPrefsState(readStorage('vt-prefs', { quality: 'balanced', glossary: '' })); setLangsState(readStorage('vt-langs', { source: 'auto', target: 'Vietnamese' }))
    ;(async () => {
      // Chuyển lịch sử cũ trong localStorage lên Supabase (một lần), rồi tải lịch sử từ server.
      const legacy = readStorage<TranslationResult[]>('vt-history', [])
      if (legacy.length) { const res = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: legacy }) }).catch(() => null); if (res?.ok) try { localStorage.removeItem('vt-history') } catch {} }
      const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => null)
      setUser(me?.user ?? null)
      await loadHistory()
    })()
  }, [])
  const loadHistory = async () => {
    const res = await fetch('/api/history').catch(() => null)
    setHistory(res?.ok ? await res.json() : [])
  }
  const onAuthed = async (u: AuthUser) => { setUser(u); setCurrent(null); await loadHistory(); setView('history') }
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    setUser(null); setCurrent(null); setHistory([]); setView('home'); await loadHistory()
  }
  const setPrefs = (p: Prefs) => { setPrefsState(p); writeStorage('vt-prefs', p) }
  const setLangs = (l: Langs) => { setLangsState(l); writeStorage('vt-langs', l) }
  const langBar = <LanguageBar langs={langs} setLangs={setLangs} />
  const openResult = async (item: HistoryItem) => {
    if (item.segments) { setCurrent(item as TranslationResult); setView('result'); return }
    const res = await fetch(`/api/history/${item.id}`).catch(() => null)
    if (!res?.ok) { window.alert('Không tải được bản dịch. Vui lòng thử lại.'); return }
    setCurrent(await res.json()); setView('result')
  }
  const deleteItem = async (id: string) => {
    if (!window.confirm('Xóa bản dịch này khỏi lịch sử?')) return
    const res = await fetch(`/api/history/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok && res?.status !== 404) { window.alert('Không xóa được bản dịch. Vui lòng thử lại.'); return }
    setHistory(prev => prev.filter(h => h.id !== id))
  }
  const translate: TranslateFn = async fields => {
    const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); fd.append('sourceLang', langs.source); fd.append('targetLang', langs.target); fd.append('quality', prefs.quality); fd.append('glossary', prefs.glossary)
    let res: Response
    try { res = await fetch('/api/translate', { method: 'POST', body: fd }) } catch { throw new Error('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.') }
    const data = await res.json().catch(() => ({ error: `Lỗi máy chủ (${res.status})` }))
    if (!res.ok) throw new Error(data.error || `Lỗi máy chủ (${res.status})`)
    const { segments: _segments, ...meta } = data as TranslationResult
    setHistory(prev => [meta, ...prev]); setCurrent(data); setView('result'); return data
  }
  const titles: Record<View, string> = { home: 'Trang chủ', documents: 'Dịch tài liệu', video: 'Dịch video', audio: 'Dịch audio', youtube: 'Dịch YouTube', image: 'Dịch hình ảnh', text: 'Dịch văn bản', history: 'Lịch sử', settings: 'Cài đặt', result: 'Kết quả dịch', auth: 'Tài khoản' }
  return <div className={dark ? 'dark' : ''}><div className="flex min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-slate-950 dark:text-slate-100"><Sidebar view={view} setView={setView} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} historyCount={history.length} user={user} logout={logout} /><div className="min-w-0 flex-1"><Header title={titles[view]} setMobileOpen={setMobileOpen} dark={dark} setDark={setDark} account={<AccountMenu user={user} setView={setView} logout={logout} />} /><main>{view === 'home' && <Home setView={setView} history={history} openResult={openResult} />}{(view === 'documents' || view === 'video' || view === 'audio' || view === 'image') && <UploadPage key={view} kind={view} setView={setView} translate={translate} langBar={langBar} />}{view === 'youtube' && <YoutubePage setView={setView} translate={translate} langBar={langBar} />}{view === 'text' && <TextPage setView={setView} translate={translate} langBar={langBar} />}{view === 'history' && <History history={history} openResult={openResult} deleteItem={deleteItem} user={user} setView={setView} />}{view === 'auth' && <AuthPage onAuthed={onAuthed} setView={setView} />}{view === 'settings' && <SettingsPage prefs={prefs} setPrefs={setPrefs} />}{view === 'result' && <Result result={current} setView={setView} />}</main></div></div></div>
}

export default function Page() { return <App /> }
