import { authFor } from "./auth";
import type { Store } from "./store";
import type { User } from "../shared/schema";

export type SessionUser = (
  store: Store,
  headers: Headers,
) => Promise<User | null>;
export async function sessionUser(
  store: Store,
  headers: Headers,
): Promise<User | null> {
  const session = await authFor(store).api.getSession({ headers });
  if (!session) return null;
  // Bootstrap imported and newly registered users atomically, without linking by email.
  return store.ensureWorkspace(session.user.id);
}
