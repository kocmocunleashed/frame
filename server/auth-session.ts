import { erxesConfig, erxesSessionUser } from "./erxes";
import { createClerkClient, verifyToken } from "@clerk/backend";
import type { Store } from "./store";
import { ApiError } from "./store";
import type { User } from "../shared/schema";

export type SessionUser = (
  store: Store,
  headers: Headers,
) => Promise<User | null>;

/** Each deployment selects one verified identity provider; cookies never choose the mode. */
export async function sessionUser(
  store: Store,
  headers: Headers,
): Promise<User | null> {
  const erxes = erxesConfig();
  if (erxes) return erxesSessionUser(store, headers, erxes);
  const authorization = headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("__session="))
        ?.slice(10);
  if (!token) return null;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey)
    throw new ApiError(503, "Sign-in is not configured on this server.");
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5174";
  let subject: string;
  let issuer: string;
  try {
    const claims = await verifyToken(token, {
      secretKey,
      ...(process.env.CLERK_JWT_KEY
        ? { jwtKey: process.env.CLERK_JWT_KEY }
        : {}),
      authorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES || origin)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
    if (!claims.sub || !claims.sid) return null;
    subject = claims.sub;
    issuer = claims.iss;
  } catch {
    return null;
  }
  const identity = await createClerkClient({ secretKey }).users.getUser(
    subject,
  );
  const email = identity.emailAddresses.find(
    (e) => e.id === identity.primaryEmailAddressId,
  );
  if (!email || email.verification?.status !== "verified")
    throw new ApiError(403, "Verify your email address before opening Frame.");
  const id = identity.externalId || identity.id;
  // Never associate accounts by email. Imported identities have a server-owned external ID.
  if (identity.externalId && !(await store.user(id)))
    throw new ApiError(
      409,
      "This account's workspace migration is incomplete.",
    );
  return store.ensureAuthUser({
    id, issuer, subject, imported: !!identity.externalId,
    email: email.emailAddress,
    name:
      [identity.firstName, identity.lastName].filter(Boolean).join(" ") ||
      identity.username ||
      email.emailAddress.split("@")[0],
  });
}
