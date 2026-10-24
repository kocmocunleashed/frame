// Render the actual host and remote with a browser-only identity fixture. This
// grants no API access and performs no mutations; real sign-in is checked by
// the operator separately. Run with Node, matching Frame's browser driver.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.argv[2] || "http://localhost:3001";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let launchAttempts = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/graphql", async route => {
    const request = route.request();
    let body;
    try { body = request.postDataJSON(); } catch { /* GET or websocket request */ }
    if (body?.operationName === "FrameStudioLaunch") launchAttempts += 1;
    if (/^\s*mutation\b/.test(body?.query || ""))
      return route.fulfill({ json: { errors: [{ message: "Render-only test refuses mutations." }] } });
    if (body?.operationName === "currentUser") {
      const details = Object.fromEntries(["avatar", "firstName", "lastName", "birthDate", "shortName", "workStartedDate", "position", "description", "location"].map(name => [name, null]));
      return route.fulfill({ json: { data: { currentUser: {
        __typename: "User", _id: "frame-render-fixture", createdAt: "2026-01-01T00:00:00Z",
        username: "render-fixture", email: "render-fixture@example.test", isOwner: true,
        details: { ...details, fullName: "Local rendering fixture" }, links: null,
        emailSignatures: [], getNotificationByEmail: false, configs: null,
        isOnboarded: true, hasPassword: true, isShowNotification: false,
      } } } });
    }
    if (body?.operationName === "CurrentUserPermissions")
      return route.fulfill({ json: { data: { currentUserPermissions: { permissions: [], pluginsWithPermissions: ["frame"] } } } });
    const response = await route.fetch();
    const result = await response.json();
    // The shell reloads on this exact authentication message. This fixture has
    // no server session, so keep denied unrelated queries denied without an
    // endless reload obscuring the remote's actual rendering errors.
    if (result.errors?.some(error => error.message === "Login required")) {
      result.errors = result.errors.map(error => error.message === "Login required"
        ? { ...error, message: "No API session in this render-only fixture." }
        : error);
      return route.fulfill({ response, json: result });
    }
    return route.fulfill({ response });
  });
  await page.goto(new URL("/frame", origin).href, { waitUntil: "domcontentloaded", timeout: 60000 });
  try {
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor({ timeout: 60000 });
  } catch (error) {
    console.error(JSON.stringify({ url: page.url(), runtimeErrors: errors, screen: (await page.locator("body").innerText({ timeout: 5000 })).slice(-3000) }));
    throw error;
  }
  await page.getByRole("button", { name: "Open in new tab", exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("alert").filter({ hasText: "Render-only test refuses mutations." }).waitFor();
  assert.equal(launchAttempts, 1, "Entering the actual host plugin must request one automatic launch.");
  assert.deepEqual(errors, [], "The actual host/remote React tree must render without runtime errors.");
  console.log("Actual erxes shell and Frame remote automatically attempted one launch and showed retry without runtime errors (browser-only identity fixture, no authenticated API access).");
} finally {
  await browser.close();
}
