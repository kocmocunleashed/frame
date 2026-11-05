import { test, expect } from "@playwright/test";
import { checkA11y } from "./helpers";

test("verification, recovery, password change, connected methods, and session revocation use real account APIs", async ({
  page,
  browser,
}) => {
  const email = `security-${crypto.randomUUID()}@example.test`,
    password = "account-security-test-password";
  await page.goto("/signup");
  await expect(
    page.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill("Security owner");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("verify your email");
  await checkA11y(page);
  const mail = async (subject: string) => {
    let messages: { subject: string; text: string }[] = [];
    await expect
      .poll(async () => {
        messages = await (
          await page.request.get(
            `/__fixture/auth-mail?email=${encodeURIComponent(email)}`,
          )
        ).json();
        return messages.filter((message) => message.subject.includes(subject))
          .length;
      })
      .toBeGreaterThan(0);
    return messages
      .filter((message) => message.subject.includes(subject))
      .at(-1)!
      .text.split("\n\n")[1];
  };
  await page.goto(await mail("Verify"));
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What’s your next big idea?" }),
  ).toBeVisible();
  const peer = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const signedIn = await peer.request.post("/api/auth/sign-in/email", {
      data: { email, password },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(signedIn.ok()).toBe(true);
    await page
      .getByRole("button", { name: "Profile menu", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Account settings", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Your account",
      exact: true,
    });
    await settings
      .getByRole("button", {
        name: "Manage sign-in methods & sessions",
        exact: true,
      })
      .click();
    await expect(
      settings.getByRole("heading", { name: "Active sessions", exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "Connect Google", exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "Connect GitHub", exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole("button", {
        name: "Sign out other sessions",
        exact: true,
      }),
    ).toBeVisible();
    await settings
      .getByRole("button", { name: "Sign out other sessions", exact: true })
      .click();
    await expect(
      settings.getByRole("button", {
        name: "Sign out other sessions",
        exact: true,
      }),
    ).toHaveCount(0);
    expect((await peer.request.get("/api/me")).status()).toBe(401);
    await settings
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await settings.getByLabel("Current password").fill(password);
    await settings
      .getByLabel("New password")
      .fill("changed-security-test-password");
    await settings
      .getByRole("button", { name: "Save password", exact: true })
      .click();
    await expect(
      settings.getByRole("status").filter({ hasText: "Password changed." }),
    ).toBeVisible();
    await checkA11y(page);
    await settings
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Profile menu", exact: true })
      .click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByRole("link", { name: "Forgot password?", exact: true })
      .click();
    await page.getByLabel("Email address").fill(email);
    await page
      .getByRole("button", { name: "Send reset link", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("check its inbox");
    await page.goto(await mail("Reset"));
    await page
      .getByLabel("New password")
      .fill("recovered-security-test-password");
    await page
      .getByRole("button", { name: "Save new password", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Password updated.");
    expect(page.url()).not.toContain("token=");
    await checkA11y(page);
    await page
      .getByRole("link", { name: "Back to sign in", exact: true })
      .click();
    await page.getByLabel("Email address").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("recovered-security-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "What’s your next big idea?" }),
    ).toBeVisible();
  } finally {
    await peer.close();
  }
});
