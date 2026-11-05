import { betterAuth } from "better-auth/minimal";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { waitUntil } from "@vercel/functions";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  users,
  sessions,
  accounts,
  verifications,
  authRateLimits,
} from "./db/schema";
import type { Store } from "./store";
import { SOCIAL_PROVIDERS, type AuthCapabilities } from "../shared/auth";
import { sendAuthEmail } from "./auth-email";

export function authCapabilities(): AuthCapabilities {
  return {
    providers: SOCIAL_PROVIDERS.filter((provider) =>
      Boolean(
        process.env[`${provider.toUpperCase()}_CLIENT_ID`] &&
        process.env[`${provider.toUpperCase()}_CLIENT_SECRET`],
      ),
    ),
    email: Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM),
  };
}

const instances = new WeakMap<Store, ReturnType<typeof makeAuth>>();
function makeAuth(store: Store) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 random characters.");
  const baseURL = process.env.APP_ORIGIN || "http://127.0.0.1:5174";
  const capabilities = authCapabilities();
  const deployment = process.env.VERCEL && process.env.VERCEL_URL;
  return betterAuth({
    appName: "Frame",
    baseURL,
    secret,
    database: drizzleAdapter(store.db.orm, {
      provider: "pg",
      transaction: true,
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        authRateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: capabilities.email,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) =>
          hash.startsWith("$argon2") || hash.startsWith("$2")
            ? Bun.password.verify(password, hash)
            : verifyPassword({ hash, password }),
      },
      ...(capabilities.email
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => sendAuthEmail(user.email, "Reset your Frame password", url),
          }
        : {}),
    },
    ...(capabilities.email
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: false,
            sendVerificationEmail: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => sendAuthEmail(user.email, "Verify your Frame email", url),
          },
        }
      : {}),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
      },
    },
    socialProviders: {
      ...(capabilities.providers.includes("google")
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID!,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            },
          }
        : {}),
      ...(capabilities.providers.includes("github")
        ? {
            github: {
              clientId: process.env.GITHUB_CLIENT_ID!,
              clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            },
          }
        : {}),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    trustedOrigins: [
      baseURL,
      ...(deployment && /^[a-z0-9.-]+\.vercel\.app$/i.test(deployment)
        ? [`https://${deployment}`]
        : []),
    ],
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: "frame",
      useSecureCookies: baseURL.startsWith("https:"),
      ipAddress: { ipAddressHeaders: ["x-frame-client-ip"] },
      backgroundTasks: {
        handler: (task) => {
          const delivery = task.catch(() =>
            console.error(
              JSON.stringify({
                event: "auth_email_delivery_failed",
                level: "error",
              }),
            ),
          );
          if (process.env.VERCEL) waitUntil(delivery);
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "authRateLimits",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 20 },
        "/sign-up/email": { window: 60, max: 20 },
        "/sign-in/social": { window: 60, max: 20 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 5 },
      },
    },
    logger: {
      level: "error",
      log: () => {
        /* Never log auth bodies, tokens, or SQL parameters. */
      },
    },
  });
}
export function authFor(store: Store) {
  let auth = instances.get(store);
  if (!auth) {
    auth = makeAuth(store);
    instances.set(store, auth);
  }
  return auth;
}
