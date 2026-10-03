"use client";
/**
 * Browser upload helper — XHR, not fetch.
 *
 * Same reasoning as the roster importer: a phone on a bad connection uploading
 * a scanned homework sheet needs progress feedback, and fetch() cannot report
 * upload progress. Every caller therefore gets (a) a progress callback and
 * (b) the same CSRF/credentials behaviour as lib/client.ts, so an upload is
 * authenticated exactly like every other call.
 */
import { API_BASE } from "./base-path";
import { fileUrl, humanBytes } from "./files";

/* Re-exported so a client component can import everything file-related from
   one module; the definitions live in lib/files.ts because server components
   need them too (see the note there). */
export { fileUrl, humanBytes };

function csrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export interface UploadedFile {
  id: string; filename: string; mimeType: string; bytes: number; sha256: string;
}

export class UploadError extends Error {
  code: string;
  constructor(message: string, code = "upload_failed") { super(message); this.code = code; }
}

/**
 * Upload one file. Rejects with UploadError whose message is safe to show —
 * "That file is 30 MB; the limit is 25 MB" rather than a status code.
 */
export function uploadFile(
  file: File,
  onProgress?: (percent: number | null) => void,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    /* API_BASE already carries /portal (lib/base-path.ts). Deriving the path
       any other way — e.g. "/api/v1/files" — silently 404s behind the site
       proxy, which is exactly the bug this comment exists to prevent. */
    xhr.open("POST", `${API_BASE}/files`);
    xhr.setRequestHeader("x-csrf", csrf());
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (onProgress) onProgress(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null);
    };
    xhr.onload = () => {
      onProgress?.(null);
      let body: any = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 400) {
        reject(new UploadError(
          body?.detail ?? body?.title ?? `Upload failed (${xhr.status}).`, body?.code ?? "upload_failed"));
        return;
      }
      resolve(body as UploadedFile);
    };
    xhr.onerror = () => { onProgress?.(null); reject(new UploadError("Network error during upload.")); };
    xhr.onabort = () => { onProgress?.(null); reject(new UploadError("Upload cancelled.")); };
    xhr.send(form);
  });
}
