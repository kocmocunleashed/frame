let identity: { id: string; workspaceId: string } | undefined;
export const recoveryIdentity = () => identity;
let tokenGetter: (() => Promise<string | null>) | undefined;
export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}
async function authHeaders(): Promise<Record<string, string>> {
  const token = await tokenGetter?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (
    (path === "/assets" || path === "/sources") &&
    options.body instanceof FormData &&
    options.body.get("file") instanceof File
  ) {
    const config = await api<{ directUploads: boolean }>("/uploads/config");
    if (config.directUploads) {
      const { directUpload } = await import("./direct-upload");
      return directUpload<T>(path, options.body, options.signal);
    }
  }
  if (
    typeof options.body === "string" &&
    /^(\/creation\/|\/themes\/|\/brand-kits\/)/.test(path)
  ) {
    const body = JSON.parse(options.body);
    if (body.revision !== undefined) {
      body.baseRevision = body.revision;
      delete body.revision;
      options = { ...options, body: JSON.stringify(body) };
    }
  }
  const audienceCode = /^\/audience\/([A-Z2-9]{6})(?:\/|$)/.exec(path)?.[1];
  let participant: string | null = null;
  try {
    if (audienceCode)
      participant = sessionStorage.getItem(`frame:participant:${audienceCode}`);
  } catch {}
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "X-Frame-Contract": "1",
      ...(await authHeaders()),
      ...(participant ? { "X-Frame-Participant": participant } : {}),
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  let result = await response
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (!response.ok)
    throw new RequestError(
      response.status,
      result.error || "The request failed. Try again.",
    );
  if (audienceCode && result.participantToken) {
    try {
      sessionStorage.setItem(
        `frame:participant:${audienceCode}`,
        result.participantToken,
      );
    } catch {}
  }
  if (path === "/me" && result.user) identity = result.user;
  if (path === "/auth/signout") identity = undefined;
  // Components consume arrays while the HTTP boundary uses cursor pages.
  if (result && Array.isArray(result.items)) {
    const items = [...result.items];
    let cursor = result.nextCursor;
    while (cursor) {
      const separator = path.includes("?") ? "&" : "?";
      const pageResponse = await fetch(
        `/api${path}${separator}cursor=${encodeURIComponent(cursor)}`,
        {
          credentials: "same-origin",
          headers: { ...(await authHeaders()), "X-Frame-Contract": "1" },
          signal: options.signal,
        },
      );
      const page = await pageResponse.json();
      if (!pageResponse.ok)
        throw new RequestError(
          pageResponse.status,
          page.error || "Could not load the next page.",
        );
      items.push(...page.items);
      cursor = page.nextCursor;
    }
    result = items;
  }
  if (/^\/creation\/[^/]+\/jobs$/.test(path) && result.draft && !result.job)
    result = { job: result, draft: result.draft };
  return result;
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export function navigate(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export async function fetchDownload(path: string): Promise<void> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const result = await response
      .json()
      .catch(() => ({ error: "This download could not be retrieved." }));
    throw new RequestError(
      response.status,
      result.error || "This download could not be retrieved.",
    );
  }
  const filename =
    /filename="([^"]+)"/.exec(
      response.headers.get("Content-Disposition") || "",
    )?.[1] || "presentation-download";
  download(await response.blob(), filename);
}
