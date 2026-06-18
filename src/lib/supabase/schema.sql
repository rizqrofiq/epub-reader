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
  drive_file_id TEXT,
  file_size BIGINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, file_hash)
);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);

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
