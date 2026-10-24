import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { signup } from "./helpers";
import { layoutSlide } from "../shared/templates";
import { newElement } from "../shared/operations";
import { THEMES } from "../shared/themes";
import { documentSchema, type FrameDocument } from "../shared/schema";
test("representative slide rendering and mobile viewing match inspected visual baselines", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signup(page);
  const original = (await (
    await page.request.post("/api/decks", {
      data: { title: "Visual fixture", template: "blank", themeId: "studio" },
    })
  ).json()) as FrameDocument;
  const image = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#ea562f"/><circle cx="850" cy="280" r="320" fill="#f3e5c8"/><path d="M0 600L700 100L1000 800H0Z" fill="#2546df"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const uploaded = await (
    await page.request.post("/api/assets", {
      multipart: {
        file: {
          name: "visual-fixture.png",
          mimeType: "image/png",
          buffer: image,
        },
      },
    })
  ).json();
  const cover = layoutSlide("title", "Make a clear point.");
  const process = layoutSlide("process", "From idea to action.");
  const data = layoutSlide("blank", "A useful comparison");
  data.elements = [
    newElement("text", {
      text: "A useful comparison",
      role: "heading",
      x: 64,
      y: 55,
      width: 1150,
      height: 110,
      baseFontSize: 60,
    }),
    newElement("chart", {
      x: 64,
      y: 205,
      width: 580,
      height: 380,
      baseFontSize: 22,
      chart: {
        kind: "bar",
        data: [
          { label: "Explore", value: 20 },
          { label: "Build", value: 40 },
          { label: "Review", value: 65 },
          { label: "Deliver", value: 80 },
        ],
        showValues: true,
      },
    }),
    newElement("table", {
      x: 710,
      y: 215,
      width: 500,
      height: 340,
      baseFontSize: 23,
      table: {
        header: true,
        rows: [
          ["Step", "Purpose"],
          ["Explore", "Find the story"],
          ["Build", "Shape the ideas"],
          ["Review", "Make it clear"],
          ["Deliver", "Bring it to life"],
        ],
      },
    }),
  ];
  const rich = layoutSlide("blank", "Words with structure");
  rich.elements = [
    newElement("text", {
      text: "Words with structure",
      role: "heading",
      x: 70,
      y: 65,
      width: 1100,
      height: 100,
      baseFontSize: 62,
    }),
    newElement("text", {
      x: 75,
      y: 230,
      width: 580,
      height: 340,
      baseFontSize: 32,
      richText: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Keep the central idea " },
              {
                type: "text",
                text: "clear and memorable.",
                marks: [{ type: "bold" }],
              },
            ],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "A concise supporting point" },
                    ],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "A concrete next step",
                        marks: [{ type: "italic" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
    newElement("diagram", {
      x: 735,
      y: 210,
      width: 430,
      height: 370,
      baseFontSize: 25,
      diagram: {
        layout: "cycle",
        nodes: ["Explore", "Shape", "Share"].map((label, i) => ({
          id: `visual-node-${i}`,
          label,
        })),
      },
    }),
  ];
  const media = layoutSlide("blank", "A strong visual");
  media.themeId = THEMES[2].id;
  media.elements = [
    newElement("image", {
      src: uploaded.src,
      alt: "Coral, cream and blue abstract geometry",
      x: 610,
      y: 70,
      width: 600,
      height: 580,
      fit: "cover",
      crop: { x: 70, y: 40, zoom: 1.2 },
      radius: 36,
    }),
    newElement("shape", {
      x: 60,
      y: 150,
      width: 720,
      height: 420,
      fill: "surface",
      material: "glass",
      opacity: 0.95,
      shadow: true,
      radius: 32,
    }),
    newElement("text", {
      text: "A strong visual.\nA simple story.",
      role: "heading",
      x: 105,
      y: 205,
      width: 560,
      height: 260,
      baseFontSize: 68,
    }),
  ];
  const question = layoutSlide("questions", "What would you do next?");
  question.themeId = THEMES[3].id;
  const doc = documentSchema.parse({
    ...original,
    themes: [THEMES[0], THEMES[2], THEMES[3]],
    slides: [cover, process, data, rich, media, question],
  });
  const saved = await page.request.put(`/api/decks/${doc.id}`, {
    data: { baseRevision: doc.revision, document: doc },
  });
  expect(saved.ok()).toBe(true);
  await page.goto(`/deck/${doc.id}`);
  await expect(
    page.getByLabel("Presentation title", { exact: true }),
  ).toHaveValue("Visual fixture");
  await page.evaluate(() => document.fonts.ready);
  const names = [
    "cover",
    "process",
    "chart-table",
    "rich-diagram",
    "image-glass",
    "question",
  ];
  for (let i = 0; i < doc.slides.length; i++) {
    await page
      .getByRole("button", {
        name: `Slide ${i + 1}: ${doc.slides[i].title}`,
        exact: true,
      })
      .click();
    const canvas = page.getByRole("region", { name: "Slide canvas" });
    await canvas
      .locator("img")
      .evaluateAll(
        async (images) =>
          await Promise.all(
            images.map(async (i) =>
              (i as HTMLImageElement).decode().catch(() => {}),
            ),
          ),
      );
    await expect(canvas).toHaveScreenshot(`${names[i]}.png`, {
      animations: "disabled",
      maxDiffPixelRatio: 0.003,
      threshold: 0.15,
    });
  }
  const current = await (await page.request.get(`/api/decks/${doc.id}`)).json();
  const publication = await (
    await page.request.post(`/api/decks/${doc.id}/publication`, {
      data: {
        baseRevision: current.revision,
        expectedEdition: null,
        visibility: "unlisted",
        allowDownload: false,
      },
    })
  ).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/view/${publication.id}`);
  await expect(
    page.getByRole("button", { name: "Next slide or step", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("mobile-readonly.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.003,
    threshold: 0.15,
  });
});
