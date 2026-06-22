// Shared RAG types used by both client (extraction/indexing) and server
// (embedding/retrieval). No server-only imports here so the client can use it.

export interface RagChunk {
  chunkIndex: number;
  chapterLabel: string;
  cfi: string;
  content: string;
}

export interface IndexStatus {
  status: "none" | "indexing" | "ready" | "error";
  chunkCount: number;
}
