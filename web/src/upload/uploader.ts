import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { problemMessage } from "@/auth/session";

export type Upload = components["schemas"]["Upload"];

export const MAX_BYTES = 250 * 1024 * 1024;

/** Why a file should not even be offered to the server, or null if it looks fine. */
export function rejectionReason(file: { name: string; size: number }): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_BYTES) return "Files can be at most 250 MB.";
  return null;
}

/** PUT one part straight to the object store and resolve with its ETag. XHR, because fetch cannot report upload progress. */
function putPart(url: string, part: Blob, onLoaded: (bytes: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onLoaded(event.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(`The storage server refused part of the file (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Lost the connection while uploading."));
    xhr.send(part);
  });
}

/**
 * Uploads one file the way the API expects: ask for presigned part URLs, send each part directly to
 * storage, then say it is complete so ingest can start. Progress is reported as 0..1.
 */
export async function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<Upload> {
  const { data: ticket, error } = await api.POST("/api/v1/uploads", { body: { filename: file.name, sizeBytes: file.size } });
  if (!ticket) throw problemMessage(error, "Could not start the upload.");

  const completed: { partNumber: number; etag: string }[] = [];
  let sent = 0;
  for (const part of ticket.parts) {
    const start = (part.partNumber - 1) * ticket.partSizeBytes;
    const blob = file.slice(start, Math.min(file.size, start + ticket.partSizeBytes));
    const etag = await putPart(part.url, blob, (loaded) => onProgress(Math.min(1, (sent + loaded) / file.size)));
    sent += blob.size;
    onProgress(sent / file.size);
    completed.push({ partNumber: part.partNumber, etag });
  }

  const { data: upload, error: completeError } = await api.POST("/api/v1/uploads/{id}/complete", {
    params: { path: { id: ticket.upload.id } },
    body: { parts: completed },
  });
  if (!upload) throw problemMessage(completeError, "The upload could not be finished.");
  return upload;
}
