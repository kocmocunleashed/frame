import { expect, test } from "bun:test";
import { Store } from "../tests/mongo";
import { createApp } from "../server/app";
import { LiveSessions } from "../server/live";
import { newElement } from "../shared/operations";
import { cpus, totalmem, release } from "node:os";
const p95 = (samples: number[]) =>
  [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
test("record 100-slide saves and state convergence for 200 participants", async () => {
  const store = new Store();
  try {
    const user = await store.createUser(
      "Capacity fixture",
      "capacity@example.test",
    );
    let doc = await store.create(
      user,
      "100-slide capacity fixture",
      "blank",
      "studio",
    );
    doc.slides = Array.from({ length: 100 }, (_, i) => ({
      ...doc.slides[0],
      id: crypto.randomUUID(),
      title: `Slide ${i + 1}`,
      elements: Array.from({ length: 10 }, (_, j) =>
        newElement("text", {
          text: `Illustrative content ${i + 1}.${j + 1}`,
          x: 64 + (j % 2) * 600,
          y: 40 + Math.floor(j / 2) * 120,
          width: 540,
          height: 100,
        }),
      ),
    }));
    doc = await store.replace(doc.id, user, doc.revision, doc);
    const app = createApp(store, undefined, async () => user),
      saves: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      const response = await app.request(`/api/decks/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: doc.revision,
          operations: [
            {
              type: "text.set",
              slideId: doc.slides[0].id,
              id: doc.slides[0].elements[0].id,
              text: `Saved change ${i}`,
              richText: null,
            },
          ],
        }),
      });
      expect(response.status).toBe(200);
      doc = await response.json();
      saves.push(performance.now() - started);
    }
    const liveDoc = await store.create(
        user,
        "Audience capacity fixture",
        "story",
        "studio",
      ),
      live = new LiveSessions(store);
    let session = await live.start(liveDoc.id, user, liveDoc.revision);
    const tokens: string[] = [];
    for (let i = 0; i < 200; i++) {
      const joined = await live.join(session.code);
      tokens.push(joined.token);
    }
    expect((await live.host(session.id, user)).participants).toBe(200);
    const convergence: number[] = [];
    for (let round = 0; round < 3; round++) {
      const start = performance.now();
      session = await live.command(session.id, user, session.version, {
        type: "navigate",
        index: round % liveDoc.slides.length,
        step: 0,
      });
      // 200 concurrent reads model one polling wave after a committed host change.
      await Promise.all(
        tokens.map(async (token) => {
          const view = await live.audience(session.code, token);
          expect(view.version).toBe(session.version);
          convergence.push(performance.now() - start);
        }),
      );
    }
    console.log(
      JSON.stringify({
        event: "capacity_measurement",
        environment: {
          cpu: cpus()[0]?.model,
          logicalCores: cpus().length,
          memoryGiB: Math.round(totalmem() / 2 ** 30),
          kernel: release(),
          bun: Bun.version,
          mongodb: "7.0.45",
          database: "single-node local replica set",
        },
        deck: {
          slides: 100,
          elementsPerSlide: 10,
          saveSamples: saves.length,
          p95SaveMs: p95(saves),
          targetMs: 1000,
        },
        audience: {
          participants: 200,
          pollingWaves: 3,
          samples: convergence.length,
          p95ConvergenceMs: p95(convergence),
          targetMs: 2000,
          transport:
            "in-process HTTP handlers for saves; service calls for audience, excludes network/poll interval",
        },
      }),
    );
  } finally {
    await store.db.close();
  }
}, 180000);
