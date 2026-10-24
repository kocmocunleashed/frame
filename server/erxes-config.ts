export type ErxesConfig = {
  origin: string;
  audience: string;
  tenant: string;
  secret: string;
};

function origin(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error(
      "erxes origins must be HTTPS origins (HTTP loopback is allowed for development).",
    );
  return value;
}

export function erxesConfig(): ErxesConfig | undefined {
  const {
    FRAME_ERXES_ORIGIN,
    FRAME_ERXES_TENANT,
    FRAME_ERXES_SECRET,
    APP_ORIGIN,
  } = process.env;
  if (!FRAME_ERXES_ORIGIN && !FRAME_ERXES_TENANT && !FRAME_ERXES_SECRET) return;
  if (
    !FRAME_ERXES_ORIGIN ||
    !FRAME_ERXES_TENANT ||
    !FRAME_ERXES_SECRET ||
    !APP_ORIGIN
  )
    throw new Error(
      "Set FRAME_ERXES_ORIGIN, FRAME_ERXES_TENANT, FRAME_ERXES_SECRET and APP_ORIGIN together.",
    );
  if (Buffer.byteLength(FRAME_ERXES_SECRET) < 32)
    throw new Error("FRAME_ERXES_SECRET must contain at least 32 bytes.");
  return {
    origin: origin(FRAME_ERXES_ORIGIN),
    audience: origin(APP_ORIGIN),
    tenant: FRAME_ERXES_TENANT,
    secret: FRAME_ERXES_SECRET,
  };
}

export function erxesCookie(config: ErxesConfig) {
  return config.audience.startsWith("https:")
    ? "__Host-frame_erxes"
    : "frame_erxes";
}

export function embeddingPolicy(config = erxesConfig()) {
  return config ? `frame-ancestors 'self' ${config.origin}` : undefined;
}
