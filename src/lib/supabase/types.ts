export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  file_hash: string;
  source: "upload" | "google_drive";
  drive_file_id: string | null;
  file_size: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BookInsert {
  title: string;
  author?: string | null;
  cover_url?: string | null;
  file_hash: string;
  source?: "upload" | "google_drive";
  drive_file_id?: string | null;
  file_size?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ReadingProgress {
  id: string;
  user_id: string;
  book_id: string;
  cfi: string;
  percentage: number;
  chapter_label: string | null;
  updated_at: string;
}

export interface ReadingProgressUpsert {
  book_id: string;
  cfi: string;
  percentage: number;
  chapter_label?: string | null;
}

export interface ReadHistory {
  id: string;
  user_id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  pages_read: number;
}

export interface Highlight {
  id: string;
  user_id: string;
  book_id: string;
  cfi_range: string;
  text_content: string;
  color: string;
  note: string | null;
  chapter_label: string | null;
  created_at: string;
}

export interface HighlightInsert {
  book_id: string;
  cfi_range: string;
  text_content: string;
  color?: string;
  note?: string | null;
  chapter_label?: string | null;
}

export interface HighlightUpdate {
  color?: string;
  note?: string | null;
}

export interface Bookmark {
  id: string;
  user_id: string;
  book_id: string;
  cfi: string;
  text_excerpt: string | null;
  label: string | null;
  chapter_label: string | null;
  created_at: string;
}

export interface BookmarkInsert {
  book_id: string;
  cfi: string;
  text_excerpt?: string | null;
  label?: string | null;
  chapter_label?: string | null;
}

export interface BookWithProgress extends Book {
  reading_progress?: ReadingProgress | null;
}

export interface ReadHistoryWithBook extends ReadHistory {
  books?: Pick<Book, "title" | "author" | "cover_url"> | null;
}

export interface ReadingStats {
  total_books: number;
  total_reading_time: number;
  books_completed: number;
  current_streak: number;
}
