import { api, json, RequestError } from "./api";
export async function directUpload<T>(
  path: string,
  body: FormData,
  signal?: AbortSignal | null,
): Promise<T> {
  const file = body.get("file") as File;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mime =
    file.type ||
    (
      {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        txt: "text/plain",
        md: "text/markdown",
        csv: "text/csv",
      } as Record<string, string>
    )[ext || ""] ||
    "application/octet-stream";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const checksum = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const policy = await api<{
    id: string;
    mode: "local" | "s3" | "blob";
    url: string;
    pathname?: string;
    fields?: Record<string, string>;
  }>(
    "/uploads/prepare",
    json("POST", {
      kind: path === "/sources" ? "source" : "media",
      name: file.name,
      bytes: file.size,
      mime,
      checksum,
      presentationId: body.get("presentationId") || null,
    }),
  );
  if (policy.mode === "blob") {
    const { upload } = await import("@vercel/blob/client");
    await upload(policy.pathname!, file, {
      access: "private",
      handleUploadUrl: "/api/uploads/blob-token",
      clientPayload: policy.id,
      contentType: mime,
      multipart: file.size > 4 * 1024 * 1024,
      abortSignal: signal || undefined,
    });
    return api<T>(`/uploads/${policy.id}/finish`, {
      ...json("POST", {}),
      signal,
    });
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(policy.fields || {}))
    form.set(key, value);
  form.set("file", file);
  if (policy.mode === "local")
    await api(policy.url.slice(4), { method: "POST", body: form, signal });
  else {
    const result = await fetch(policy.url, {
      method: "POST",
      body: form,
      signal,
    });
    if (!result.ok)
      throw new RequestError(
        result.status,
        "The file could not be uploaded. Choose it again to retry.",
      );
  }
  return api<T>(`/uploads/${policy.id}/finish`, {
    ...json("POST", {}),
    signal,
  });
}
