/** Read-only account check. No prompts, generation requests, or paid model calls. */
export async function checkOpenRouterKey(
  key: string | undefined,
  fetcher: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response> = fetch,
) {
  if (!key)
    return {
      ok: false,
      message:
        "Set OPENROUTER_API_KEY in the ignored .env first. See docs/setup.md#connect-openrouter.",
    };
  try {
    const response = await fetcher("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    await response.body?.cancel();
    if (!response.ok)
      return {
        ok: false,
        message: `OpenRouter returned HTTP ${response.status}. Check the key, its expiry and account access in the OpenRouter dashboard.`,
      };
    return {
      ok: true,
      message:
        "OpenRouter accepted the key. No generation request was sent. Model access, balance and current pricing are checked when you generate.",
    };
  } catch {
    return {
      ok: false,
      message:
        "OpenRouter could not be reached within the connection deadline. Check your connection and retry.",
    };
  }
}

if (import.meta.main) {
  const result = await checkOpenRouterKey(process.env.OPENROUTER_API_KEY);
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}
