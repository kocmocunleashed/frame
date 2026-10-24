import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { signup, newBlank, checkA11y } from "./helpers";
async function saved(page: Page) {
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}
async function data(page: Page) {
  await saved(page);
  return page.evaluate(
    async () =>
      await (
        await fetch("/api/decks/" + location.pathname.split("/").at(-1))
      ).json(),
  );
}
async function insert(page: Page, type: string) {
  await page.getByRole("button", { name: "Add " + type, exact: true }).click();
}
test("rich text marks, lists and safe links persist through reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.locator(".canvas-element").dblclick();
  const edit = page.getByRole("textbox", {
    name: "Edit slide text",
    exact: true,
  });
  await expect(edit).toBeVisible();
  await edit.fill("A bold idea");
  await edit.press("Control+a");
  await page
    .getByRole("button", { name: "Bold selection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Link selection", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Link destination", exact: true })
    .fill("https://example.com");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish text editing", exact: true })
    .click();
  await saved(page);
  let doc = await data(page);
  expect(
    doc.slides[0].elements[0].richText.content[0].content[0].marks,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "bold" }),
      expect.objectContaining({ type: "link" }),
    ]),
  );
  await page.reload();
  await expect(page.locator(".editable-stage strong")).toHaveText(
    "A bold idea",
  );
  await expect(page.locator(".editable-stage a")).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await page.locator(".canvas-element").dblclick();
  await page
    .getByRole("button", { name: "Bulleted list", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish text editing", exact: true })
    .click();
  await saved(page);
  doc = await data(page);
  expect(doc.slides[0].elements[0].richText.content[0].type).toBe("bulletList");
  expect(errors).toEqual([]);
});
test("tables, charts, diagrams, icons and questions expose editable data", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await insert(page, "table");
  await page
    .getByLabel("Row 2, column 2", { exact: true })
    .fill("A real table value");
  await page.getByLabel("Row 2, column 2", { exact: true }).press("Tab");
  await expect(page.locator(".editable-stage table")).toContainText(
    "A real table value",
  );
  await insert(page, "chart");
  await page.getByLabel("Data value 1", { exact: true }).fill("44");
  await page.getByLabel("Data value 1", { exact: true }).press("Tab");
  await page
    .getByRole("combobox", { name: "Chart type", exact: true })
    .selectOption("line");
  await expect(page.locator(".editable-stage polyline")).toHaveCount(1);
  await expect(
    page.getByText("Content overflows — resize or shorten", { exact: true }),
  ).not.toBeVisible();
  await insert(page, "diagram");
  await page.getByLabel("Node 1", { exact: true }).fill("Start here");
  await page.getByLabel("Node 1", { exact: true }).press("Tab");
  await expect(page.locator(".editable-stage")).toContainText("Start here");
  await expect(
    page.getByText("Content overflows — resize or shorten", { exact: true }),
  ).not.toBeVisible();
  await insert(page, "icon");
  await page
    .getByRole("combobox", { name: "Icon symbol", exact: true })
    .selectOption("rocket");
  await insert(page, "question");
  await page
    .getByRole("textbox", { name: "Question prompt", exact: true })
    .fill("What should we explore next?");
  await page
    .getByRole("textbox", { name: "Question prompt", exact: true })
    .press("Tab");
  const doc = await data(page);
  expect(doc.slides[0].elements.map((e: { type: string }) => e.type)).toEqual([
    "table",
    "chart",
    "diagram",
    "icon",
    "question",
  ]);
  expect(doc.slides[0].elements[1].chart.data[0].value).toBe(44);
  await page.screenshot({ path: "/tmp/frame-rich-editor.png" });
});
test("drag commits at gesture end, pointer rotation and group resizing keep objects editable", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const before = await data(page),
    id = before.slides[0].elements[0].id;
  const object = page.locator('[data-canvas-element="' + id + '"]');
  const box = (await object.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 70,
    box.y + box.height / 2 + 40,
    { steps: 12 },
  );
  const during = await page.evaluate(
    async () =>
      await (
        await fetch("/api/decks/" + location.pathname.split("/").at(-1))
      ).json(),
  );
  expect(during.revision).toBe(before.revision);
  await page.mouse.up();
  const after = await data(page);
  expect(after.slides[0].elements[0].x).toBeGreaterThan(
    before.slides[0].elements[0].x,
  );
  await page
    .getByRole("button", { name: "Rotate selection", exact: true })
    .focus();
  await page
    .getByRole("button", { name: "Rotate selection", exact: true })
    .press("Shift+ArrowRight");
  const rotated = await data(page);
  expect(rotated.slides[0].elements[0].rotation).toBe(15);
  const rotationBox = (await page
      .getByRole("button", { name: "Rotate selection", exact: true })
      .boundingBox())!,
    objectBox = (await object.boundingBox())!,
    cx = objectBox.x + objectBox.width / 2,
    cy = objectBox.y + objectBox.height / 2,
    dx = rotationBox.x + rotationBox.width / 2 - cx,
    dy = rotationBox.y + rotationBox.height / 2 - cy;
  await page.mouse.move(cx + dx, cy + dy);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(
    cx + (dx - dy) / Math.sqrt(2),
    cy + (dx + dy) / Math.sqrt(2),
    { steps: 10 },
  );
  await page.mouse.up();
  await page.keyboard.up("Shift");
  expect((await data(page)).slides[0].elements[0].rotation).toBe(60);
  await page
    .getByRole("button", { name: "Duplicate selected objects", exact: true })
    .click();
  await page.keyboard.press("Control+a");
  await expect(page.locator(".selection-transform-group")).toBeVisible();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  const grouped = await data(page);
  expect(grouped.slides[0].elements[0].groupId).toBe(
    grouped.slides[0].elements[1].groupId,
  );
  const corner = (await page
    .locator('.selection-transform-group [style*="se-resize"]')
    .boundingBox())!;
  await page.mouse.move(
    corner.x + corner.width / 2,
    corner.y + corner.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    corner.x + corner.width / 2 + 60,
    corner.y + corner.height / 2 + 40,
    { steps: 10 },
  );
  await page.mouse.up();
  const resized = await data(page);
  expect(resized.slides[0].elements[0].width).toBeGreaterThan(
    grouped.slides[0].elements[0].width,
  );
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await saved(page);
  await page
    .getByRole("button", { name: "Layers", exact: true })
    .first()
    .click();
  await expect(page.locator(".layer-row")).toHaveCount(2);
});
test("image upload, crop, alt text and a saved composition survive reload", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  const png = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#ed9e37" },
  })
    .png()
    .toBuffer();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "example.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("slider", { name: "Image crop zoom", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("slider", { name: "Image crop zoom", exact: true })
    .fill("2");
  await page
    .getByRole("textbox", { name: "Alternative text", exact: true })
    .fill("An illustrative orange field");
  await page
    .getByRole("textbox", { name: "Alternative text", exact: true })
    .press("Tab");
  await page.getByRole("button", { name: /Saved compositions/ }).click();
  await page
    .getByLabel("Composition name", { exact: true })
    .fill("Orange field");
  await page
    .getByRole("button", { name: "Save selection", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Insert composition Orange field",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Insert composition Orange field",
      exact: true,
    })
    .click();
  let doc = await data(page);
  expect(doc.slides[0].elements).toHaveLength(2);
  expect(doc.slides[0].elements[0].crop.zoom).toBe(2);
  await page.reload();
  await expect(page.locator(".editable-stage img")).toHaveCount(2);
  await expect(page.locator(".editable-stage img").first()).toHaveAttribute(
    "alt",
    "An illustrative orange field",
  );
  await checkA11y(page);
});
test("new layouts honor dimensions and text splitting preserves content", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const text = "An important thought. ".repeat(50);
  await page.getByRole("textbox", { name: "Content", exact: true }).fill(text);
  await page
    .getByRole("textbox", { name: "Content", exact: true })
    .press("Tab");
  await expect(page.locator(".overflow-label")).toBeVisible();
  await page
    .getByRole("button", { name: "Split text across slides", exact: false })
    .click();
  let doc = await data(page);
  expect(doc.slides.length).toBeGreaterThan(1);
  expect(
    doc.slides
      .flatMap(
        (s: {
          elements: {
            text?: string;
          }[];
        }) => s.elements.map((e) => e.text || ""),
      )
      .join(""),
  ).toBe(text);
  await page.getByRole("button", { name: "Slide", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Chart & insight slide", exact: true })
    .click();
  await expect(page.locator(".editable-stage svg[role=img]")).toBeVisible();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await page
    .locator(".present-stage-host .slide-frame")
    .screenshot({ path: "/tmp/frame-renderer-export-prototype.png" });
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Slide", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Timeline slide", exact: true })
    .click();
  await expect(page.locator(".editable-stage")).toContainText("Milestone 1");
});
test("uploaded video has usable byte ranges and plays in rehearsal", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await page
    .locator("input[type=file]")
    .setInputFiles("e2e/fixtures/sample.webm");
  await expect(
    page.getByRole("textbox", { name: "Video URL", exact: true }),
  ).toBeVisible();
  const doc = await data(page);
  expect(doc.slides[0].elements[0].type).toBe("video");
  const response = await page.request.get(doc.slides[0].elements[0].src, {
    headers: { Range: "bytes=0-31" },
  });
  expect(response.status()).toBe(206);
  await page.getByRole("button", { name: "Present", exact: true }).click();
  const video = page.locator(".present-stage-host video");
  await expect(video).toBeVisible();
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await video.evaluate(async (v: HTMLVideoElement) => v.play());
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
});
test("marquee selection, alignment, distribution, locking and layer order work together", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Shape", exact: true }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    for (const [label, value] of [
      ["X", String(100 + i * 350)],
      ["Y", String(200 + i * 100)],
      ["Width", "100"],
      ["Height", "100"],
    ]) {
      await page
        .getByRole("spinbutton", { name: label, exact: true })
        .fill(value);
      await page
        .getByRole("spinbutton", { name: label, exact: true })
        .press("Tab");
    }
  }
  let doc = await data(page);
  const box = (await page
      .getByRole("region", { name: "Slide canvas", exact: true })
      .boundingBox())!,
    scale = box.width / doc.width;
  await page.mouse.move(box.x + 50 * scale, box.y + 150 * scale);
  await page.mouse.down();
  await page.mouse.move(box.x + 1000 * scale, box.y + 580 * scale, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.locator(".selection-transform-group")).toBeVisible();
  await page.getByRole("button", { name: "Align top", exact: true }).click();
  await page
    .getByRole("button", { name: "Distribute horizontally", exact: true })
    .click();
  doc = await data(page);
  expect(doc.slides[0].elements.map((e: { y: number }) => e.y)).toEqual([
    200, 200, 200,
  ]);
  const xs = doc.slides[0].elements.map((e: { x: number }) => e.x);
  expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1]);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unlock selection", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Unlock selection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Layers", exact: true })
    .first()
    .click();
  const rows = page.locator(".layer-row");
  await rows.first().dragTo(rows.last());
  const reordered = await data(page);
  expect(
    reordered.slides[0].elements.map((e: { id: string }) => e.id),
  ).not.toEqual(doc.slides[0].elements.map((e: { id: string }) => e.id));
  const revision = reordered.revision;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page
    .getByRole("button", { name: "Fit to screen", exact: true })
    .click();
  await page.locator(".canvas-heading").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".selection-transform-group")).toHaveCount(0);
  expect((await data(page)).revision).toBe(revision);
});
test("tablet touch dragging and resizing commit once and preserve the page position", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await signup(page);
    await newBlank(page);
    await page.getByRole("button", { name: "Shape", exact: true }).tap();
    await page.getByRole("button", { name: "Rectangle", exact: true }).tap();
    const before = await data(page),
      id = before.slides[0].elements[0].id,
      rect = (await page
        .locator('[data-canvas-element="' + id + '"]')
        .boundingBox())!,
      x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2,
      cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + i * 7, y: y + i * 3, id: 1 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const after = await data(page);
    expect(after.slides[0].elements[0].x).toBeGreaterThan(
      before.slides[0].elements[0].x,
    );
    expect(after.revision).toBe(before.revision + 1);
    const handle = (await page
        .locator('[data-canvas-element="' + id + '"]')
        .locator("..")
        .locator('[style*="se-resize"]')
        .boundingBox())!,
      hx = handle.x + handle.width / 2,
      hy = handle.y + handle.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: hx, y: hy, id: 2 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: hx + i * 5, y: hy + i * 3, id: 2 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () =>
        page
          .getByRole("spinbutton", { name: "Width", exact: true })
          .inputValue(),
      )
      .not.toBe("260");
    const resized = await data(page);
    expect(resized.slides[0].elements[0].width).toBeGreaterThan(
      after.slides[0].elements[0].width,
    );
    expect(resized.revision).toBe(after.revision + 1);
    expect(resized.slides[0].elements[0].x).toBeCloseTo(
      after.slides[0].elements[0].x,
      6,
    );
    expect(resized.slides[0].elements[0].y).toBeCloseTo(
      after.slides[0].elements[0].y,
      6,
    );
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } finally {
    await context.close();
  }
});
test("text and image layout reflows an uploaded image without replacing its identity", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  const png = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#275acf" },
  })
    .png()
    .toBuffer();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "picture.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("slider", { name: "Image crop zoom", exact: true }),
  ).toBeVisible();
  const before = await data(page),
    image = before.slides[0].elements[0];
  await page.locator(".canvas-heading").click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("text-image");
  const after = await data(page),
    images = after.slides[0].elements.filter(
      (e: { type: string }) => e.type === "image",
    );
  expect(images).toHaveLength(1);
  expect(images[0].id).toBe(image.id);
  expect(images[0].src).toBe(image.src);
  expect(images[0].x).toBe(680);
  expect(images[0].y).toBe(70);
});
test("table overflow is visible and can be resolved with explicit size controls", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await insert(page, "table");
  for (let i = 0; i < 9; i++)
    await page.getByRole("button", { name: "Row", exact: true }).click();
  await expect(page.locator(".overflow-label")).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Table text size", exact: true })
    .fill("18");
  await page
    .getByRole("spinbutton", { name: "Table text size", exact: true })
    .press("Tab");
  await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("60");
  await page.getByRole("spinbutton", { name: "Y", exact: true }).press("Tab");
  await page
    .getByRole("spinbutton", { name: "Height", exact: true })
    .fill("600");
  await page
    .getByRole("spinbutton", { name: "Height", exact: true })
    .press("Tab");
  await expect(page.locator(".overflow-label")).toHaveCount(0);
  expect((await data(page)).slides[0].elements[0].table.rows).toHaveLength(12);
});
