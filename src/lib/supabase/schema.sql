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
  -- Which provider the assistant should use. Exactly one row per user should be
  -- active; the app maintains this when a credential is saved or set active.
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
-- Migration for existing databases:
ALTER TABLE public.ai_credentials ADD COLUMN IF NOT EXISTS base_url TEXT;
ALTER TABLE public.ai_credentials ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

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
-- Migration for databases created before context_summary existed (a missing
-- column made the messages endpoint error and reopened chats look empty):
ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS context_summary TEXT;

-- Individual messages within a session.
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  citations    JSONB DEFAULT '[]',
  quote        TEXT,
  book_sources JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON public.ai_chat_messages(session_id, created_at ASC);
-- Migrations for older databases:
--   quote        — highlighted passage shown above a user message
--   book_sources — the "From this book" grounding sources (so they survive reload)
ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS quote TEXT;
ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS book_sources JSONB DEFAULT '[]';

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

-- ============================================
-- RAG: book-grounded AI (full-text search)
-- The assistant searches the book on demand via a `search_book` tool backed by
-- Postgres full-text search — no embeddings, so indexing just stores text.
-- (`vector`/`embedding` are retained from the old embeddings approach but unused.)
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- One row per (user, book): indexing status + chunk count.
CREATE TABLE IF NOT EXISTS public.book_index (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id      UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'indexing'
               CHECK (status IN ('indexing', 'ready', 'error')),
  provider     TEXT,
  model        TEXT,
  dim          INTEGER,
  chunk_count  INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

-- Book text chunks. `fts` is a generated full-text vector over `content`; the
-- 'simple' config is language-agnostic tokenization (works for Indonesian/mixed
-- text). `embedding` is unused now but kept so older DBs don't need a drop.
CREATE TABLE IF NOT EXISTS public.book_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  chapter_label TEXT,
  cfi           TEXT,
  content       TEXT NOT NULL,
  embedding     vector,
  fts           tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_book_chunks_book
  ON public.book_chunks(user_id, book_id, chunk_index);
-- Migration for DBs created under the embeddings approach:
ALTER TABLE public.book_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_book_chunks_fts
  ON public.book_chunks USING GIN (fts);

ALTER TABLE public.book_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own book index" ON public.book_index
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own book chunks" ON public.book_chunks
  FOR ALL USING (auth.uid() = user_id);

-- Cosine similarity search within a single book, scoped to the caller.
-- SECURITY INVOKER (default) + the explicit user_id filter means RLS applies.
CREATE OR REPLACE FUNCTION public.match_book_chunks(
  p_book_id UUID,
  p_query   vector,
  p_count   INTEGER DEFAULT 6
)
RETURNS TABLE (
  chunk_index   INTEGER,
  chapter_label TEXT,
  cfi           TEXT,
  content       TEXT,
  similarity    REAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    chunk_index,
    chapter_label,
    cfi,
    content,
    (1 - (embedding <=> p_query))::REAL AS similarity
  FROM public.book_chunks
  WHERE book_id = p_book_id
    AND user_id = auth.uid()
  ORDER BY embedding <=> p_query
  LIMIT p_count;
$$;

-- Full-text search within a single book, scoped to the caller. Backs the
-- `search_book` tool. Uses OR-matching (any query term) ranked by relevance,
-- NOT AND — natural-language queries ("siapa komisaris utama perusahaan ini")
-- carry stopwords/extra words that aren't in the target passage, so requiring
-- every term to match returns nothing. OR + ts_rank surfaces the best chunks.
CREATE OR REPLACE FUNCTION public.search_book_chunks(
  p_book_id UUID,
  p_query   TEXT,
  p_count   INTEGER DEFAULT 6
)
RETURNS TABLE (
  chunk_index   INTEGER,
  chapter_label TEXT,
  cfi           TEXT,
  content       TEXT,
  rank          REAL
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    -- Build an OR tsquery from the query's lexemes: "a | b | c".
    SELECT to_tsquery(
      'simple',
      array_to_string(tsvector_to_array(to_tsvector('simple', p_query)), ' | ')
    ) AS query
  )
  SELECT
    bc.chunk_index,
    bc.chapter_label,
    bc.cfi,
    bc.content,
    ts_rank(bc.fts, q.query)::REAL AS rank
  FROM public.book_chunks bc, q
  WHERE bc.book_id = p_book_id
    AND bc.user_id = auth.uid()
    AND q.query IS NOT NULL
    AND bc.fts @@ q.query
  ORDER BY rank DESC
  LIMIT p_count;
$$;

