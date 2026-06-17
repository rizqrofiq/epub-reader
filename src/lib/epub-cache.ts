import Dexie, { type EntityTable } from "dexie";

interface CachedEpub {
  fileHash: string;
  data: ArrayBuffer;
  fileName: string;
  addedAt: Date;
  locations?: string;
}

const db = new Dexie("ReadiumEpubCache") as Dexie & {
  epubFiles: EntityTable<CachedEpub, "fileHash">;
};

db.version(2).stores({
  epubFiles: "fileHash, fileName, addedAt",
}).upgrade((trans) => {
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

export { hashFile };
