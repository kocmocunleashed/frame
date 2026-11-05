import { hashPassword } from "better-auth/crypto";
import { Store } from "../server/store";
import { uid } from "../shared/schema";
// Administrator-only local cutover tool. Identity and password come from a protected env file.
const id = process.env.FRAME_PROVISION_USER_ID,
  password = process.env.FRAME_PROVISION_PASSWORD;
if (!id || !password || password.length < 10 || password.length > 128)
  throw new Error(
    "Set FRAME_PROVISION_USER_ID and a 10–128 character FRAME_PROVISION_PASSWORD in a private environment file.",
  );
const store = new Store();
try {
  const hashed = await hashPassword(password);
  await store.db.transaction(async () => {
    if (!(await store.user(id))) throw new Error("Unknown imported user.");
    if (
      await store.db.one("accounts", { userId: id, providerId: "credential" })
    )
      throw new Error(
        "This user already has a local password. Use the account security flow.",
      );
    await store.db.insert("accounts", {
      id: uid(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: hashed,
    });
    await store.db.remove("sessions", { userId: id });
  })();
  console.log(
    "Local sign-in provisioned for the existing user. No identity or credential values were logged.",
  );
} catch {
  console.error(
    "Provisioning did not complete. Check the imported user and existing account; no credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  await store.db.close();
}
