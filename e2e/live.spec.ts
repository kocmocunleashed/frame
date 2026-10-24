import { test, expect, type Page } from "@playwright/test";
import { signup, newBlank, checkA11y } from "./helpers";
async function questionDeck(page: Page) {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page
    .getByLabel("Question prompt", { exact: true })
    .fill("Which direction makes the story clearer?");
  await page.getByLabel("Question prompt", { exact: true }).press("Tab");
  await page
    .getByLabel("Answer option 1", { exact: true })
    .fill("One clear idea");
  await page.getByLabel("Answer option 1", { exact: true }).press("Tab");
  await page.getByLabel("Correct answer", { exact: true }).selectOption("0");
  await page
    .getByLabel("Answer explanation", { exact: true })
    .fill("PRIVATE_BROWSER_EXPLANATION: one idea gives the audience a focus.");
  await page.getByLabel("Answer explanation", { exact: true }).press("Tab");
  await page
    .getByLabel("Speaker notes", { exact: true })
    .fill("PRIVATE_BROWSER_SPEAKER_NOTE");
  await page.getByLabel("Speaker notes", { exact: true }).press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}
async function present(page: Page) {
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await page
    .getByRole("button", { name: "Open presenter view", exact: true })
    .click();
}
test("local question rehearsal and live mobile joining, permissions, results, feedback, reconnect and ending work together", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await questionDeck(page);
  const deckId = new URL(page.url()).pathname.split("/").at(-1)!;
  await present(page);
  await page
    .getByRole("button", { name: "Open rehearsal question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "One clear idea", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close rehearsal question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show rehearsal results", exact: true })
    .click();
  await expect(page.getByText("1 response", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Reveal rehearsal feedback", exact: true })
    .click();
  await expect(page.locator(".answer-feedback")).toContainText(
    "PRIVATE_BROWSER_EXPLANATION",
  );
  expect(
    await (await page.request.get(`/api/decks/${deckId}/live`)).json(),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Start live session", exact: true })
    .click();
  await expect(page.locator(".live-code")).toBeVisible();
  const code = await page.locator(".live-code").innerText(),
    host = await (await page.request.get(`/api/decks/${deckId}/live`)).json();
  await expect
    .poll(async () =>
      page
        .locator(".live-qr")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  const guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    audience = await guest.newPage();
  try {
    await audience.goto("/join");
    await audience.getByLabel("Session code", { exact: true }).fill("ZZZZZZ");
    await audience
      .getByRole("button", { name: "Join session", exact: true })
      .click();
    await expect(audience.getByRole("alert")).toContainText("invalid");
    await audience.getByLabel("Session code", { exact: true }).fill(code);
    await audience
      .getByRole("button", { name: "Join session", exact: true })
      .click();
    await expect(
      audience.getByRole("heading", { name: "You’re in.", exact: true }),
    ).toBeVisible();
    const before = await (
      await audience.request.get(`/api/audience/${code}`)
    ).json();
    expect(JSON.stringify(before)).not.toContain("PRIVATE_BROWSER");
    expect(
      (
        await audience.request.post(`/api/live/${host.id}/control`, {
          data: { expectedVersion: 0, command: { type: "end" } },
        })
      ).status(),
    ).toBe(401);
    const qid = host.document.slides[0].elements.find(
      (e: { type: string }) => e.type === "question",
    ).id;
    await page.getByLabel("Live question", { exact: true }).selectOption(qid);
    await expect(
      audience.getByRole("heading", {
        name: "Which direction makes the story clearer?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      audience.getByRole("button", { name: "Submit answer", exact: true }),
    ).toBeDisabled();
    const choices = audience.getByRole("radio");
    await choices.first().check();
    await audience
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      audience.getByText("Your answer is recorded.", { exact: true }),
    ).toBeVisible();
    expect(
      JSON.stringify(
        await (await audience.request.get(`/api/audience/${code}`)).json(),
      ),
    ).not.toContain("PRIVATE_BROWSER");
    await expect(audience.locator(".question-results")).not.toContainText(
      "response",
    );
    await page
      .getByRole("button", { name: "Reveal audience results", exact: true })
      .click();
    await expect(
      audience.getByText("1 response", { exact: true }),
    ).toBeVisible();
    await expect(audience.locator(".answer-feedback")).toHaveCount(0);
    await guest.setOffline(true);
    await expect(
      audience.getByText("Reconnecting…", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await guest.setOffline(false);
    await expect(
      audience.getByText("Connected", { exact: true }),
    ).toBeVisible();
    await audience.reload();
    await expect(
      audience.getByText("Your answer is recorded.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".live-connection")).toContainText("1 joined");
    await page
      .getByRole("button", { name: "Close question", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reveal answer & feedback", exact: true })
      .click();
    await expect(audience.locator(".answer-feedback")).toContainText(
      "PRIVATE_BROWSER_EXPLANATION",
    );
    await expect(audience.locator(".answer-feedback")).toContainText(
      "Correct answer: One clear idea",
    );
    await checkA11y(audience);
    expect(
      await audience.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await audience.screenshot({ path: "/tmp/frame-live-audience-mobile.png" });
    await checkA11y(page);
    await page.screenshot({ path: "/tmp/frame-live-presenter.png" });
    await page
      .getByRole("button", { name: "Reopen as new round", exact: true })
      .click();
    await expect(
      audience.getByText("Answers are open. Choose one option.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(audience.locator(".answer-feedback")).toHaveCount(0);
    await expect(
      audience.getByRole("button", { name: "Submit answer", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "End live session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "End for everyone", exact: true })
      .click();
    await expect(
      audience.getByRole("heading", { name: "That’s a wrap.", exact: true }),
    ).toBeVisible();
    await audience.reload();
    await expect(audience.getByRole("alert")).toContainText("ended");
  } finally {
    await guest.close();
  }
});
test("readable interaction builder supports keyboard explanations and private rehearsal feedback", async ({
  page,
}) => {
  await questionDeck(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("Show the explanation");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("A clear explanation appears here.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const deckId = new URL(page.url()).pathname.split("/").at(-1)!,
    doc = await (await page.request.get(`/api/decks/${deckId}`)).json(),
    texts = doc.slides[0].elements.filter(
      (e: { type: string }) => e.type === "text",
    );
  await page
    .getByRole("button", { name: "Slide interactions", exact: true })
    .click();
  const builder = page.getByRole("dialog", {
    name: "Slide interactions",
    exact: true,
  });
  await builder
    .getByLabel("Interaction source object", { exact: true })
    .selectOption(texts[0].id);
  await builder
    .getByLabel("Interaction explanation object", { exact: true })
    .selectOption(texts[1].id);
  await builder
    .getByRole("button", { name: "Add behavior", exact: true })
    .click();
  await expect(builder.locator(".interaction-list article")).toHaveCount(1);
  await builder
    .getByLabel("Interaction behavior", { exact: true })
    .selectOption("feedback");
  await builder
    .getByLabel("Interaction source object", { exact: true })
    .selectOption(
      doc.slides[0].elements.find(
        (e: { type: string }) => e.type === "question",
      ).id,
    );
  await builder
    .getByLabel("Interaction feedback", { exact: true })
    .fill("PRIVATE_INTERACTION_FEEDBACK");
  await builder
    .getByRole("button", { name: "Add behavior", exact: true })
    .click();
  await checkA11y(page);
  await builder
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await present(page);
  const stage = page.locator(".present-stage-host");
  await expect(
    stage.locator(`[data-element-id="${texts[1].id}"]`),
  ).toBeHidden();
  await stage.getByRole("button", { name: "Text", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    stage.locator(`[data-element-id="${texts[1].id}"]`),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open rehearsal question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "One clear idea", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close rehearsal question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal rehearsal feedback", exact: true })
    .click();
  await expect(page.locator(".answer-feedback")).toContainText(
    "PRIVATE_INTERACTION_FEEDBACK",
  );
});
test("step animation and slide navigation rehearse correctly and share undo history", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Content", { exact: true }).fill("Go to the next idea");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("This arrives at step one.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Slide", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Title & subtitle slide", exact: true })
    .click();
  await page.getByRole("button", { name: /^Slide 1:/ }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!,
    doc = await (await page.request.get(`/api/decks/${id}`)).json(),
    texts = doc.slides[0].elements;
  await page
    .getByRole("button", { name: "Slide interactions", exact: true })
    .click();
  const builder = page.getByRole("dialog", {
    name: "Slide interactions",
    exact: true,
  });
  await builder
    .getByLabel("Interaction behavior", { exact: true })
    .selectOption("navigate");
  await builder
    .getByLabel("Interaction source object", { exact: true })
    .selectOption(texts[0].id);
  await builder
    .getByLabel("Interaction destination slide", { exact: true })
    .selectOption(doc.slides[1].id);
  await builder
    .getByRole("button", { name: "Add behavior", exact: true })
    .click();
  await builder
    .getByLabel("Interaction behavior", { exact: true })
    .selectOption("animate");
  await builder
    .getByLabel("Interaction source object", { exact: true })
    .selectOption(texts[1].id);
  await builder
    .getByLabel("Interaction presentation step", { exact: true })
    .fill("1");
  await builder
    .getByLabel("Interaction animation", { exact: true })
    .selectOption("fade");
  await builder
    .getByRole("button", { name: "Add behavior", exact: true })
    .click();
  await expect(builder.locator(".interaction-list article")).toHaveCount(2);
  await builder
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => {
      const value = await (await page.request.get(`/api/decks/${id}`)).json();
      return value.slides[0].interactions.length;
    })
    .toBe(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  const stage = page.locator(".present-stage-host");
  await expect(
    stage.locator(`[data-element-id="${texts[1].id}"]`),
  ).toBeHidden();
  await stage.getByRole("button", { name: "Text", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".slide-counter")).toContainText("2");
  await page.keyboard.press("Home");
  await expect(
    stage.locator(`[data-element-id="${texts[1].id}"]`),
  ).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("ArrowRight");
  await expect(
    stage.locator(`[data-element-id="${texts[1].id}"]`),
  ).toBeVisible();
  await expect(stage.locator(`[data-element-id="${texts[1].id}"]`)).toHaveCSS(
    "animation-name",
    "none",
  );
  await checkA11y(page);
});
