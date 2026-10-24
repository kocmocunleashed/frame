import { createHmac, randomUUID } from "node:crypto";

export type FrameTarget = {
  frameOrigin: string;
  erxesOrigin: string;
  secret: string;
};

export type FrameIdentity = {
  id: string;
  email: string;
  name: string;
};

function validOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

export function frameTarget(
  raw: string | undefined,
  tenant: string,
): FrameTarget {
  if (!raw)
    throw new Error(
      "Frame is not configured. Ask your administrator to set FRAME_ERXES_TENANTS.",
    );
  let targets: unknown;
  try {
    targets = JSON.parse(raw);
  } catch {
    throw new Error("FRAME_ERXES_TENANTS is not valid JSON.");
  }
  if (
    !targets ||
    typeof targets !== "object" ||
    Array.isArray(targets) ||
    !Object.hasOwn(targets, tenant)
  )
    throw new Error("Frame is not enabled for this erxes tenant.");
  const target: unknown = (targets as Record<string, unknown>)[tenant];
  if (!target || typeof target !== "object" || Array.isArray(target))
    throw new Error("Invalid Frame tenant configuration.");
  const values = target as Record<string, unknown>;
  if (
    !validOrigin(values.frameOrigin) ||
    !validOrigin(values.erxesOrigin) ||
    typeof values.secret !== "string" ||
    Buffer.byteLength(values.secret) < 32
  )
    throw new Error(
      "Frame requires exact HTTPS origins and a secret of at least 32 bytes.",
    );
  return {
    frameOrigin: values.frameOrigin,
    erxesOrigin: values.erxesOrigin,
    secret: values.secret,
  };
}

export function createFrameLaunch(
  target: FrameTarget,
  tenant: string,
  identity: FrameIdentity,
  now = Date.now(),
) {
  if (
    !tenant ||
    tenant.length > 200 ||
    !identity.id ||
    identity.id.length > 200 ||
    !identity.email ||
    identity.email.length > 254 ||
    !identity.name.trim()
  )
    throw new Error(
      "Your erxes account needs a name and email before opening Frame.",
    );
  const iat = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      iss: target.erxesOrigin,
      aud: target.frameOrigin,
      tenant,
      sub: identity.id,
      email: identity.email.toLowerCase(),
      name: identity.name.trim().slice(0, 80),
      iat,
      exp: iat + 60,
      jti: randomUUID(),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", target.secret)
    .update(payload)
    .digest("base64url");
  return {
    url: `${target.frameOrigin}/integrations/erxes/launch`,
    origin: target.frameOrigin,
    ticket: `${payload}.${signature}`,
    expiresAt: (iat + 60) * 1000,
  };
}
