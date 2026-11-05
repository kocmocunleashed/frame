import { afterEach, expect, test } from "bun:test";
import { Store } from "./postgres";
import { createApp } from "../server/app";
import { authFor } from "../server/auth";
import { sendAuthEmail } from "../server/auth-email";
import { maintain } from "../server/maintenance";
const names = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "RESEND_API_KEY",
  "AUTH_EMAIL_FROM",
  "APP_ORIGIN",
] as const;
const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  ),
  originalFetch = globalThis.fetch;
const stores: Store[] = [];
afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
  for (const store of stores.splice(0)) await store.db.close();
});
const origin = "http://127.0.0.1:5174",
  credentials = {
    name: "Account owner",
    email: "account@example.test",
    password: "a-strong-test-password",
  };
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
async function setup() {
  process.env.APP_ORIGIN = origin;
  const store = new Store();
  stores.push(store);
  await store.testReady;
  const app = createApp(store);
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    headers: Record<string, string> = {},
  ) =>
    app.request(path.startsWith("http") ? path : origin + "/api/auth/" + path, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        cookie,
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { store, app, request };
}
function mail() {
  process.env.RESEND_API_KEY = "test-only-mail-key";
  process.env.AUTH_EMAIL_FROM = "Frame <auth@example.test>";
  const messages: { text: string; to: string[]; subject: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "https://api.resend.com/emails")
      throw new Error("Unexpected auth test network request");
    messages.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "test-message" });
  }) as typeof fetch;
  return messages;
}
async function messageURL(messages: { text: string }[], count: number) {
  for (let i = 0; messages.length < count && i < 50; i++) await Bun.sleep(10);
  expect(messages.length).toBeGreaterThanOrEqual(count);
  return messages[count - 1].text.split("\n\n")[1];
}

test("capabilities expose only configured providers and no secrets, and legacy cookies are rejected", async () => {
  process.env.GOOGLE_CLIENT_ID = "test-google-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.GITHUB_CLIENT_ID = "incomplete";
  const { request, app } = await setup();
  const response = await request("config"),
    text = await response.text();
  expect(JSON.parse(text)).toEqual({ providers: ["google"], email: false });
  expect(text).not.toContain("test-google");
  expect(
    (
      await app.request(origin + "/api/me", {
        headers: { cookie: "__session=old-clerk; frame_erxes=old-host" },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await request("link-social", "POST", {
        provider: "google",
        callbackURL: "/",
      })
    ).status,
  ).toBe(401);
});

test("verification and password recovery use real tokens, revoke sessions, and reject replay and untrusted redirects", async () => {
  const messages = mail(),
    { request, app, store } = await setup();
  const signup = await request("sign-up/email", "POST", {
    ...credentials,
    callbackURL: "/signin",
  });
  expect(signup.status).toBe(200);
  expect((await signup.json()).token).toBeNull();
  expect((await request("sign-in/email", "POST", credentials)).status).toBe(
    403,
  );
  expect((await request(await messageURL(messages, 1))).status).toBe(302);
  const login = await request("sign-in/email", "POST", credentials);
  expect(login.status).toBe(200);
  const oldCookie = cookies(login);
  const before = await (
    await app.request(origin + "/api/me", { headers: { cookie: oldCookie } })
  ).json();
  expect(
    (
      await request("request-password-reset", "POST", {
        email: credentials.email,
        redirectTo: "https://untrusted.example/reset",
      })
    ).status,
  ).toBe(403);
  const count = messages.length;
  expect(
    (
      await request("request-password-reset", "POST", {
        email: credentials.email,
        redirectTo: "/reset-password",
      })
    ).status,
  ).toBe(200);
  const redirect = await request(await messageURL(messages, count + 1));
  const token = new URL(redirect.headers.get("location")!).searchParams.get(
    "token",
  );
  expect(token).toBeTruthy();
  const replacement = "a-different-strong-password";
  expect(
    (
      await request("reset-password", "POST", {
        token,
        newPassword: replacement,
      })
    ).status,
  ).toBe(200);
  expect(
    (await app.request(origin + "/api/me", { headers: { cookie: oldCookie } }))
      .status,
  ).toBe(401);
  expect(
    (
      await request("reset-password", "POST", {
        token,
        newPassword: replacement,
      })
    ).status,
  ).toBe(400);
  expect((await request("sign-in/email", "POST", credentials)).status).toBe(
    401,
  );
  const returning = await request("sign-in/email", "POST", {
    email: credentials.email,
    password: replacement,
  });
  expect(returning.status).toBe(200);
  const after = await (
    await app.request(origin + "/api/me", {
      headers: { cookie: cookies(returning) },
    })
  ).json();
  expect(after.user).toEqual(before.user);
  expect(await store.db.count("workspaces")).toBe(1);
});

test("social sign-in rejects forged callbacks and implicit email linking; explicit linking preserves the user and workspace", async () => {
  process.env.GITHUB_CLIENT_ID = "test-github-id";
  process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
  let email = "github-new@example.test",
    providerId = 1001;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json({
        access_token: "test-access-token",
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    if (url === "https://api.github.com/user")
      return Response.json({
        id: providerId,
        login: "frame-tester",
        name: "GitHub member",
        email,
        avatar_url: null,
      });
    if (url === "https://api.github.com/user/emails")
      return Response.json([{ email, primary: true, verified: true }]);
    throw new Error("Unexpected OAuth test request");
  }) as typeof fetch;
  const { request, app, store } = await setup();
  const forged = await request("callback/github?code=forged&state=forged");
  expect(forged.status).toBe(302);
  expect(cookies(forged)).not.toContain("frame.session_token=");
  expect(
    (
      await request("sign-in/social", "POST", {
        provider: "github",
        callbackURL: "https://untrusted.example/steal",
        disableRedirect: true,
      })
    ).status,
  ).toBe(403);
  async function complete(path: string, cookie = "") {
    const start = await request(
      path,
      "POST",
      { provider: "github", callbackURL: "/", disableRedirect: true },
      cookie,
    );
    expect(start.status).toBe(200);
    const url = new URL((await start.json()).url);
    expect(url.searchParams.get("redirect_uri")).toBe(
      origin + "/api/auth/callback/github",
    );
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    return request(
      `callback/github?code=test-code&state=${state}`,
      "GET",
      undefined,
      [cookie, cookies(start)].filter(Boolean).join("; "),
    );
  }
  const first = await complete("sign-in/social");
  expect(first.status).toBe(302);
  expect(
    (
      await app.request(origin + "/api/me", {
        headers: { cookie: cookies(first) },
      })
    ).status,
  ).toBe(200);
  const firstAccount = (
    await store.db.find("accounts", { providerId: "github" })
  )[0];
  expect(
    (
      await request(
        "unlink-account",
        "POST",
        { accountId: firstAccount.id },
        cookies(first),
      )
    ).status,
  ).toBe(400);
  const signup = await request("sign-up/email", "POST", credentials),
    existingCookie = cookies(signup);
  const user = (
    await (
      await app.request(origin + "/api/me", {
        headers: { cookie: existingCookie },
      })
    ).json()
  ).user;
  email = credentials.email;
  providerId = 1002;
  expect((await complete("sign-in/social")).headers.get("location")).toContain(
    "error=",
  );
  const linked = await complete("link-social", existingCookie);
  expect(linked.status).toBe(302);
  expect(linked.headers.get("location")).not.toContain("error=");
  const accounts = await store.db.find("accounts", { userId: user.id });
  expect(accounts.map((account) => account.providerId).sort()).toEqual([
    "credential",
    "github",
  ]);
  expect(
    accounts.find((account) => account.providerId === "github").accessToken,
  ).not.toBe("test-access-token");
  expect(
    (
      await request(
        "unlink-account",
        "POST",
        { accountId: firstAccount.id },
        existingCookie,
      )
    ).status,
  ).toBe(400);
  await request("sign-out", "POST", {}, existingCookie);
  const returning = await complete("sign-in/social");
  const me = await app.request(origin + "/api/me", {
    headers: { cookie: cookies(returning) },
  });
  expect((await me.json()).user).toEqual(user);
  expect(await store.db.count("workspaces")).toBe(2);
  expect(
    (
      await request(
        "unlink-account",
        "POST",
        {
          accountId: accounts.find((account) => account.providerId === "github")
            .id,
        },
        cookies(returning),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        "unlink-account",
        "POST",
        {
          accountId: accounts.find(
            (account) => account.providerId === "credential",
          ).id,
        },
        cookies(returning),
      )
    ).status,
  ).toBe(400);
  expect(await store.db.count("accounts", { userId: user.id })).toBe(1);
  expect(
    authFor(store).options.account.accountLinking.disableImplicitLinking,
  ).toBe(true);
});

test("sessions can be revoked individually and together without revoking the current session; rate limit IPs cannot be spoofed", async () => {
  const { request, store } = await setup();
  const first = await request("sign-up/email", "POST", credentials),
    firstCookie = cookies(first);
  const second = await request("sign-in/email", "POST", credentials),
    secondCookie = cookies(second);
  const sessions = await (
    await request("list-sessions", "GET", undefined, secondCookie)
  ).json();
  expect(sessions).toHaveLength(2);
  const current = (
    await (await request("get-session", "GET", undefined, secondCookie)).json()
  ).session;
  const other = sessions.find((session: any) => session.id !== current.id);
  expect(
    (
      await request(
        "revoke-session",
        "POST",
        { token: other.token },
        secondCookie,
      )
    ).status,
  ).toBe(200);
  expect(
    await (await request("get-session", "GET", undefined, firstCookie)).json(),
  ).toBeNull();
  await request("sign-in/email", "POST", credentials);
  expect(
    (await request("revoke-other-sessions", "POST", {}, secondCookie)).status,
  ).toBe(200);
  expect(await store.db.count("sessions")).toBe(1);
  expect(
    (
      await (
        await request("get-session", "GET", undefined, secondCookie)
      ).json()
    ).user.email,
  ).toBe(credentials.email);
  const records = await store.db.find("authRateLimits");
  const signIn = records.find((row) => row.key.includes("/sign-in/email"));
  expect(signIn).toBeTruthy();
  await store.db.update(
    "authRateLimits",
    { id: signIn.id },
    { set: { count: 20, lastRequest: Date.now() } },
  );
  expect(
    (
      await request("sign-in/email", "POST", credentials, "", {
        "x-frame-client-ip": "198.51.100.99",
        "x-forwarded-for": "198.51.100.99",
      })
    ).status,
  ).toBe(429);
});

test("mail failures redact provider responses, and maintenance prunes only expired authentication records", async () => {
  mail();
  globalThis.fetch = (async () =>
    new Response("PRIVATE_PROVIDER_RESPONSE", {
      status: 503,
    })) as unknown as typeof fetch;
  await expect(
    sendAuthEmail(
      "member@example.test",
      "Verify",
      "https://example.test/private-token",
    ),
  ).rejects.toThrow("Authentication email could not be delivered.");
  const { store } = await setup(),
    user = await store.createUser("Owner", "cleanup@example.test");
  await store.db.insert("sessions", {
    userId: user.id,
    token: "expired",
    expiresAt: new Date(Date.now() - 1000),
  });
  await store.db.insert("sessions", {
    userId: user.id,
    token: "active",
    expiresAt: new Date(Date.now() + 60000),
  });
  await store.db.insert("verifications", {
    identifier: "expired",
    value: "expired-secret",
    expiresAt: new Date(Date.now() - 1000),
  });
  await maintain(store);
  expect(await store.db.count("sessions")).toBe(2);
  await maintain(store, { dryRun: false });
  expect(await store.db.count("sessions")).toBe(1);
  expect(await store.db.count("verifications")).toBe(0);
});
