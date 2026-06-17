export async function downloadDriveFile(
  fileId: string,
  accessToken: string
): Promise<ArrayBuffer> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to download file from Google Drive: ${response.status} ${errorText}`
    );
  }

  return response.arrayBuffer();
}

export async function getDriveFileMetadata(
  fileId: string,
  accessToken: string
): Promise<{ name: string; size: number; mimeType: string }> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get file metadata: ${response.status}`);
  }

  const data = await response.json();
  return {
    name: data.name,
    size: parseInt(data.size || "0", 10),
    mimeType: data.mimeType,
  };
}
