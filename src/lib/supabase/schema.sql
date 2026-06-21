-- ============================================
-- Readium EPUB Reader — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Books table
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  file_hash TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  format TEXT NOT NULL DEFAULT 'epub',
  drive_file_id TEXT,
  storage_key TEXT,
  shelf TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  file_size BIGINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, file_hash)
);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);
-- Migration for existing databases:
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'epub';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS shelf TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_books_tags ON public.books USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_books_shelf ON public.books(user_id, shelf);

-- Reading progress
CREATE TABLE IF NOT EXISTS public.reading_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  cfi TEXT NOT NULL,
  percentage REAL DEFAULT 0,
  chapter_label TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user_book ON public.reading_progress(user_id, book_id);

-- Read history
CREATE TABLE IF NOT EXISTS public.read_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  pages_read INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_history_user ON public.read_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_book ON public.read_history(book_id);

-- Highlights
CREATE TABLE IF NOT EXISTS public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  cfi_range TEXT NOT NULL,
  text_content TEXT NOT NULL,
  color TEXT DEFAULT '#3ECF8E',
  note TEXT,
  chapter_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_highlights_user_book ON public.highlights(user_id, book_id);

-- Bookmarks
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  cfi TEXT NOT NULL,
  text_excerpt TEXT,
  label TEXT,
  chapter_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book ON public.bookmarks(user_id, book_id);

-- AI provider credentials (BYOK) — API key stored AES-GCM encrypted; the
-- encryption key is a server-side secret, so the ciphertext is useless without it.
CREATE TABLE IF NOT EXISTS public.ai_credentials (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  model TEXT,
  base_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
-- Migration for existing databases:
ALTER TABLE public.ai_credentials ADD COLUMN IF NOT EXISTS base_url TEXT;

-- Google OAuth credentials (Drive refresh token, captured at sign-in)
CREATE TABLE IF NOT EXISTS public.google_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.read_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own books" ON public.books
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own progress" ON public.reading_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own history" ON public.read_history
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own highlights" ON public.highlights
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own bookmarks" ON public.bookmarks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own google credentials" ON public.google_credentials
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own ai credentials" ON public.ai_credentials
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- AI Chat Sessions (persistent per-book chat)
-- ============================================

-- One row per conversation thread, tied to a book.
-- context_summary holds a rolling AI-generated summary of turns older than
-- the last 20, so the full conversation context is preserved without blowing
-- the token budget.
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id          UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'New chat',
  context_summary  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_book ON public.ai_chat_sessions(user_id, book_id, updated_at DESC);

-- Individual messages within a session.
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  citations   JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON public.ai_chat_messages(session_id, created_at ASC);

ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai sessions" ON public.ai_chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Messages are owned transitively — user must own the parent session.
CREATE POLICY "Users manage own ai messages" ON public.ai_chat_messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.ai_chat_sessions WHERE user_id = auth.uid()
    )
  );

