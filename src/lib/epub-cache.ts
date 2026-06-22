import Dexie, { type EntityTable } from "dexie";
import type { Book } from "@/lib/supabase/types";

interface CachedEpub {
  fileHash: string;
  data: ArrayBuffer;
  fileName: string;
  addedAt: Date;
  locations?: string;
}

interface CachedCover {
  bookId: string;
  coverUrl: string;
}

export interface OutboxItem {
  id?: number;
  op: string;
  payload: unknown;
  createdAt: number;
}

const db = new Dexie("ReadiumEpubCache") as Dexie & {
  epubFiles: EntityTable<CachedEpub, "fileHash">;
  covers: EntityTable<CachedCover, "bookId">;
  books: EntityTable<Book, "id">;
  outbox: EntityTable<OutboxItem, "id">;
};

db.version(2).stores({
  epubFiles: "fileHash, fileName, addedAt",
}).upgrade((trans) => {
});

db.version(3).stores({
  epubFiles: "fileHash, fileName, addedAt",
  covers: "bookId",
});

db.version(4).stores({
  epubFiles: "fileHash, fileName, addedAt",
  covers: "bookId",
  books: "id, updated_at",
});

db.version(5).stores({
  epubFiles: "fileHash, fileName, addedAt",
  covers: "bookId",
  books: "id, updated_at",
  outbox: "++id, op",
});

async function hashFile(file: File | ArrayBuffer): Promise<string> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function storeEpub(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const fileHash = await hashFile(buffer);

  await db.epubFiles.put({
    fileHash,
    data: buffer,
    fileName: file.name,
    addedAt: new Date(),
  });

  return fileHash;
}

export async function storeEpubFromBuffer(
  buffer: ArrayBuffer,
  fileName: string
): Promise<string> {
  const fileHash = await hashFile(buffer);

  await db.epubFiles.put({
    fileHash,
    data: buffer,
    fileName,
    addedAt: new Date(),
  });

  return fileHash;
}

export async function getEpub(
  fileHash: string
): Promise<ArrayBuffer | undefined> {
  const entry = await db.epubFiles.get(fileHash);
  return entry?.data;
}

export async function getEpubLocations(
  fileHash: string
): Promise<string | undefined> {
  const entry = await db.epubFiles.get(fileHash);
  return entry?.locations;
}

export async function getEpubWithLocations(
  fileHash: string
): Promise<{ data: ArrayBuffer; locations?: string } | undefined> {
  const entry = await db.epubFiles.get(fileHash);
  if (!entry) return undefined;
  return { data: entry.data, locations: entry.locations };
}

export async function saveEpubLocations(
  fileHash: string,
  locations: string
): Promise<void> {
  await db.epubFiles.update(fileHash, { locations });
}

export async function hasEpub(fileHash: string): Promise<boolean> {
  const count = await db.epubFiles.where("fileHash").equals(fileHash).count();
  return count > 0;
}

export async function deleteEpub(fileHash: string): Promise<void> {
  await db.epubFiles.delete(fileHash);
}

export async function getCacheSize(): Promise<number> {
  const allFiles = await db.epubFiles.toArray();
  return allFiles.reduce((total, file) => total + file.data.byteLength, 0);
}

export async function clearCache(): Promise<void> {
  await db.epubFiles.clear();
}

export async function getCachedCovers(): Promise<Record<string, string>> {
  const all = await db.covers.toArray();
  const map: Record<string, string> = {};
  for (const c of all) map[c.bookId] = c.coverUrl;
  return map;
}

export async function setCachedCovers(
  covers: Record<string, string | null>
): Promise<void> {
  const toPut: CachedCover[] = [];
  const toDelete: string[] = [];
  for (const [bookId, coverUrl] of Object.entries(covers)) {
    if (coverUrl) toPut.push({ bookId, coverUrl });
    else toDelete.push(bookId);
  }
  if (toPut.length) await db.covers.bulkPut(toPut);
  if (toDelete.length) await db.covers.bulkDelete(toDelete);
}

export async function deleteCachedCover(bookId: string): Promise<void> {
  await db.covers.delete(bookId);
}

export async function cacheBook(book: Book): Promise<void> {
  await db.books.put(book);
}

export async function cacheBooks(books: Book[]): Promise<void> {
  if (books.length) await db.books.bulkPut(books);
}

export async function getCachedBook(id: string): Promise<Book | undefined> {
  return db.books.get(id);
}

export async function getAllCachedBooks(): Promise<Book[]> {
  const all = await db.books.toArray();
  return all.sort((a, b) =>
    (b.updated_at || "").localeCompare(a.updated_at || ""),
  );
}

export async function deleteCachedBook(id: string): Promise<void> {
  await db.books.delete(id);
}

export async function addOutbox(op: string, payload: unknown): Promise<void> {
  await db.outbox.add({ op, payload, createdAt: Date.now() });
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return db.outbox.orderBy("id").toArray();
}

export async function removeOutbox(id: number): Promise<void> {
  await db.outbox.delete(id);
}

export async function countOutbox(): Promise<number> {
  return db.outbox.count();
}

export { hashFile };
