import { afterEach, expect, test } from "bun:test";
import { Store } from "./mongo";
import { LiveSessions } from "../server/live";
import { createApp } from "./support/legacy-app";
import { newElement } from "../shared/operations";
import { uid, type User } from "../shared/schema";
const stores: Store[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
});
const request = (method: string, cookie = "", body?: unknown): RequestInit => ({
  method,
  headers: { cookie, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const owner = await store.createUser(
      "Presenter",
      `${uid()}@example.test`,
      "test-hash",
    ),
    other = await store.createUser("Other", `${uid()}@example.test`, "hash"),
    doc = await store.create(owner, "Audience story", "blank", "studio");
  doc.slides[0].notes = "PRIVATE_LIVE_NOTE";
  const question = newElement("question", {
    question: {
      kind: "multiple-choice",
      prompt: "Pick the strongest idea",
      options: ["Keep it clear", "Add more noise"],
      correctIndex: 0,
      explanation: "PRIVATE_LIVE_EXPLANATION",
    },
  });
  doc.slides[0].elements.push(question);
  doc.slides[0].interactions = [
    {
      id: uid(),
      trigger: "answer",
      target: question.id,
      action: "feedback",
      value: "PRIVATE_LIVE_CUSTOM_FEEDBACK",
    },
  ];
  const saved = await store.replace(doc.id, owner, 0, doc);
  // Keep TTL-backed participant records in the real clock's future; advance
  // the injected service clock to exercise expiry without waiting a day.
  let now = Date.now();
  const live = new LiveSessions(store, () => now);
  return {
    store,
    owner,
    other,
    doc: saved,
    question,
    live,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test("presenter controls are authorized, versioned and frozen independently of draft edits", async () => {
  const { store, owner, other, doc, live, question } = await setup();
  let session = await live.start(doc.id, owner, doc.revision);
  expect((await live.start(doc.id, owner, doc.revision)).id).toBe(session.id);
  await expect(
    (async () => await live.host(session.id, other))(),
  ).rejects.toThrow("not found");
  await store.db.insert("members", {workspaceId:owner.workspaceId,userId:other.id,role:"viewer"});
  await expect(
    (async () =>
      await live.start(
        doc.id,
        { ...other, workspaceId: owner.workspaceId },
        doc.revision,
      ))(),
  ).rejects.toThrow("view-only");
  await expect(
    (async () =>
      await live.command(session.id, owner, 99, {
        type: "open",
        questionId: question.id,
      }))(),
  ).rejects.toThrow("another window");
  session = await live.command(session.id, owner, session.version, {
    type: "open",
    questionId: question.id,
  });
  expect(session.question?.correctIndex).toBe(0);
  await expect(
    (async () =>
      await live.command(session.id, owner, session.version, {
        type: "answer",
        visible: true,
      }))(),
  ).rejects.toThrow("Close answers");
  await store.mutate(doc.id, owner, doc.revision, [
    {
      type: "document.update",
      patch: { title: "An unpublished different title" },
    },
  ]);
  expect((await live.host(session.id, owner)).document.title).toBe(
    "Audience story",
  );
});
test("audience receives no notes, answer keys, feedback or results until each explicit reveal", async () => {
  const { owner, doc, live, question } = await setup();
  let session = await live.start(doc.id, owner, doc.revision);
  session = await live.command(session.id, owner, session.version, {
    type: "open",
    questionId: question.id,
  });
  const guest = await live.join(session.code);
  let serialized = JSON.stringify(guest.view);
  expect(serialized).not.toContain("PRIVATE_LIVE");
  expect(serialized).not.toContain("correctIndex");
  expect(guest.view.question?.counts).toBeUndefined();
  const answer = await live.answer(session.code, guest.token, {
    round: 1,
    questionId: question.id,
    option: 0,
  });
  expect(answer.question?.response).toBe(0);
  expect(answer.question?.feedback).toBeUndefined();
  expect(answer.question?.counts).toBeUndefined();
  session = await live.command(session.id, owner, session.version, {
    type: "results",
    visible: true,
  });
  let view = await live.audience(session.code, guest.token);
  expect(view.question?.counts).toEqual([1, 0]);
  expect(JSON.stringify(view)).not.toContain("PRIVATE_LIVE");
  session = await live.command(session.id, owner, session.version, {
    type: "close",
  });
  session = await live.command(session.id, owner, session.version, {
    type: "answer",
    visible: true,
  });
  view = await live.audience(session.code, guest.token);
  expect(view.question?.correctIndex).toBe(0);
  expect(view.question?.explanation).toBe("PRIVATE_LIVE_EXPLANATION");
  expect(view.question?.feedback).toBe("PRIVATE_LIVE_CUSTOM_FEEDBACK");
  expect(JSON.stringify(view.document)).not.toContain("PRIVATE_LIVE");
  session = await live.command(session.id, owner, session.version, {
    type: "answer",
    visible: false,
  });
  expect(
    (await live.audience(session.code, guest.token)).question?.correctIndex,
  ).toBeUndefined();
});
test("reconnect reuses anonymous identity and duplicate submissions stay idempotent across database-backed service instances", async () => {
  const { store, owner, doc, live, question } = await setup();
  let session = await live.start(doc.id, owner, doc.revision);
  session = await live.command(session.id, owner, 0, {
    type: "open",
    questionId: question.id,
  });
  const guest = await live.join(session.code),
    second = new LiveSessions(store, live.now);
  const input = { round: 1, questionId: question.id, option: 1 };
  await live.answer(session.code, guest.token, input);
  expect(
    (await second.answer(session.code, guest.token, input)).question?.response,
  ).toBe(1);
  await expect(
    (async () =>
      await second.answer(session.code, guest.token, {
        ...input,
        option: 0,
      }))(),
  ).rejects.toThrow("first answer");
  expect((await second.join(session.code, guest.token)).token).toBe(
    guest.token,
  );
  expect((await live.host(session.id, owner)).participants).toBe(1);
  expect((await live.host(session.id, owner)).question?.total).toBe(1);
  session = await live.command(session.id, owner, session.version, {
    type: "close",
  });
  expect(
    (await second.answer(session.code, guest.token, input)).question?.response,
  ).toBe(1);
  const newGuest = await second.join(session.code);
  await expect(
    (async () => await second.answer(session.code, newGuest.token, input))(),
  ).rejects.toThrow("closed");
  session = await live.command(session.id, owner, session.version, {
    type: "open",
    questionId: question.id,
  });
  expect(session.state.round).toBe(2);
  expect(
    (await live.audience(session.code, guest.token)).question?.response,
  ).toBeUndefined();
  expect(session.question?.counts).toEqual([0, 0]);
  await expect(
    (async () => await live.answer(session.code, guest.token, input))(),
  ).rejects.toThrow("different question");
});
test("ended, expired and invalid sessions have clear outcomes; stored tokens are hashes and capacity is bounded", async () => {
  const { store, owner, doc, live, advance } = await setup();
  let session = await live.start(doc.id, owner, doc.revision),
    guest = await live.join(session.code);
  const row = (await store.db.one("liveParticipants",{})) as {
    tokenHash: string;
  };
  expect(row.tokenHash).not.toBe(guest.token);
  expect(row.tokenHash).toHaveLength(64);
  await expect((async () => await live.join("ABC"))()).rejects.toThrow(
    "invalid",
  );
  await expect((async () => await live.join("ZZZZZZ"))()).rejects.toThrow(
    "invalid",
  );
  await expect(
    (async () => await live.audience(session.code))(),
  ).rejects.toThrow("Join");
  for (let i = 1; i < 200; i++) await live.join(session.code);
  await expect((async () => await live.join(session.code))()).rejects.toThrow(
    "200-participant",
  );
  expect((await live.join(session.code, guest.token)).view.ended).toBe(false);
  advance(16000);
  expect((await live.host(session.id, owner)).connected).toBe(0);
  await live.audience(session.code, guest.token);
  expect((await live.host(session.id, owner)).connected).toBe(1);
  session = await live.command(session.id, owner, session.version, {
    type: "end",
  });
  expect(await live.audience(session.code, guest.token)).toMatchObject({
    ended: true,
    document: null,
    question: null,
  });
  await expect((async () => await live.join(session.code))()).rejects.toThrow(
    "ended",
  );
  await expect(
    (async () =>
      await live.command(session.id, owner, session.version, {
        type: "close",
      }))(),
  ).rejects.toThrow("ended");
  const next = await live.start(doc.id, owner, doc.revision);
  expect(next.code).not.toBe(session.code);
  advance(24 * 60 * 60 * 1000 + 1);
  await expect((async () => await live.join(next.code))()).rejects.toThrow(
    "ended",
  );
});
test("polling never sends future slides or unrelated media; step and click reveals synchronize through typed commands", async () => {
  const { store, owner, doc, live } = await setup();
  const trigger = newElement("text", { text: "Show why" }),
    explanation = newElement("text", { text: "A clear reason" });
  doc.slides[0].elements.push(trigger, explanation);
  doc.slides[0].interactions.push({
    id: uid(),
    trigger: "click",
    action: "show",
    target: trigger.id,
    value: explanation.id,
  });
  const copy = structuredClone(doc.slides[0]);
  copy.id = uid();
  copy.title = "PRIVATE_FUTURE_SLIDE";
  copy.elements = [];
  copy.interactions = [];
  doc.slides.push(copy);
  const saved = await store.replace(doc.id, owner, doc.revision, doc);
  let session = await live.start(doc.id, owner, saved.revision);
  const guest = await live.join(session.code);
  expect(guest.view.document?.slides).toHaveLength(1);
  expect(JSON.stringify(guest.view)).not.toContain("PRIVATE_FUTURE_SLIDE");
  await expect(
    (async () =>
      await live.command(session.id, owner, session.version, {
        type: "navigate",
        index: 2,
        step: 0,
      }))(),
  ).rejects.toThrow("existing slide");
  await expect(
    (async () =>
      await live.command(session.id, owner, session.version, {
        type: "navigate",
        index: 0,
        step: 99,
      }))(),
  ).rejects.toThrow("existing presentation step");
  session = await live.command(session.id, owner, session.version, {
    type: "reveal",
    elementId: explanation.id,
  });
  expect(
    (await live.audience(session.code, guest.token)).state.revealedIds,
  ).toEqual([explanation.id]);
  session = await live.command(session.id, owner, session.version, {
    type: "navigate",
    index: 1,
    step: 0,
  });
  expect(session.state.revealedIds).toEqual([]);
  expect(
    (await live.audience(session.code, guest.token)).document?.slides[0].title,
  ).toBe("PRIVATE_FUTURE_SLIDE");
  await expect(
    (async () => await live.asset(session.code, guest.token, uid()))(),
  ).rejects.toThrow("not in the session");
});
test("guest HTTP cookies cannot grant presenter access; QR is authenticated and code attempts are bounded", async () => {
  const store = new Store(":memory:");
  stores.push(store);
  const app = createApp(store);
  const signup = await app.request(
      "/api/auth/signup",
      request("POST", "", {
        name: "Host",
        email: `${uid()}@example.test`,
        password: "live-browser-test-password",
      }),
    ),
    { user } = (await signup.json()) as {
      user: User;
    },
    cookie = signup.headers.get("set-cookie")!.split(";")[0],
    doc = await store.create(user, "API live deck", "blank", "studio");
  const created = await app.request(
    `/api/decks/${doc.id}/live`,
    request("POST", cookie, { baseRevision: 0 }),
  );
  expect(created.status).toBe(201);
  const host = await created.json();
  const join = await app.request(
    `/api/audience/${host.code}/join`,
    request("POST"),
  );
  expect(join.status).toBe(200);
  const guestCookie = join.headers.get("set-cookie")!;
  expect(guestCookie).toContain("HttpOnly");
  expect(guestCookie).toContain(`Path=/api/audience/${host.code}`);
  expect(guestCookie).not.toContain("frame_session=");
  expect(
    (
      await app.request(
        `/api/live/${host.id}/control`,
        request("POST", guestCookie.split(";")[0], {
          expectedVersion: 0,
          command: { type: "end" },
        }),
      )
    ).status,
  ).toBe(401);
  expect((await app.request(`/api/live/${host.id}/qr`)).status).toBe(401);
  const qr = await app.request(
    `/api/live/${host.id}/qr`,
    request("GET", cookie),
  );
  expect(qr.status).toBe(200);
  expect(qr.headers.get("content-type")).toBe("image/png");
  expect((await qr.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  const live = new LiveSessions(store);
  for (let i = 0; i < 3; i++) await live.rate("bounded-test", 3);
  await expect(
    (async () => await live.rate("bounded-test", 3))(),
  ).rejects.toThrow("Too many attempts");
});
test("polls and true/false rounds keep their own response counts and optional answer semantics", async () => {
  const { store, owner, doc, live } = await setup();
  const poll = newElement("question", {
      question: {
        kind: "poll",
        prompt: "Which topic next?",
        options: ["Design", "Delivery"],
        explanation: "The audience chooses the direction.",
      },
    }),
    tf = newElement("question", {
      question: {
        kind: "true-false",
        prompt: "Can we rehearse without AI?",
        options: ["True", "False"],
        correctIndex: 0,
      },
    });
  doc.slides[0].elements.push(poll, tf);
  const saved = await store.replace(doc.id, owner, doc.revision, doc);
  let session = await live.start(doc.id, owner, saved.revision);
  const guest = await live.join(session.code);
  session = await live.command(session.id, owner, session.version, {
    type: "open",
    questionId: poll.id,
  });
  await live.answer(session.code, guest.token, {
    round: session.state.round,
    questionId: poll.id,
    option: 1,
  });
  session = await live.command(session.id, owner, session.version, {
    type: "close",
  });
  session = await live.command(session.id, owner, session.version, {
    type: "answer",
    visible: true,
  });
  expect(
    (await live.audience(session.code, guest.token)).question?.correctIndex,
  ).toBeUndefined();
  expect(
    (await live.audience(session.code, guest.token)).question?.explanation,
  ).toBe(poll.question!.explanation);
  session = await live.command(session.id, owner, session.version, {
    type: "open",
    questionId: tf.id,
  });
  expect((await live.audience(session.code, guest.token)).question?.kind).toBe(
    "true-false",
  );
  expect(session.question?.counts).toEqual([0, 0]);
  await live.answer(session.code, guest.token, {
    round: session.state.round,
    questionId: tf.id,
    option: 0,
  });
  expect((await live.host(session.id, owner)).question?.total).toBe(1);
});
test("a shared classroom network can join and reconnect 200 guests while invalid-code attempts remain bounded", async () => {
  const { store, owner, doc } = await setup(),
    live = new LiveSessions(store);
  const session = await live.start(doc.id, owner, doc.revision),
    app = createApp(store);
  let firstCookie = "";
  for (let i = 0; i < 200; i++) {
    const response = await app.request(
      `/api/audience/${session.code}/join`,
      request("POST"),
    );
    expect(response.status).toBe(200);
    if (!i) firstCookie = response.headers.get("set-cookie")!.split(";")[0];
  }
  const full = await app.request(
    `/api/audience/${session.code}/join`,
    request("POST"),
  );
  expect(full.status).toBe(429);
  expect((await full.json()).error).toContain("200-participant");
  for (let i = 0; i < 200; i++) {
    expect(
      (
        await app.request(
          `/api/audience/${session.code}/join`,
          request("POST", firstCookie),
        )
      ).status,
    ).toBe(200);
  }
  expect((await live.host(session.id, owner)).participants).toBe(200);
  for (let i = 0; i < 60; i++) {
    expect(
      (await app.request("/api/audience/ZZZZZZ/join", request("POST"))).status,
    ).toBe(404);
  }
  expect(
    (await app.request("/api/audience/ZZZZZZ/join", request("POST"))).status,
  ).toBe(429);
  expect(
    (
      await app.request(
        `/api/audience/${session.code}/join`,
        request("POST", firstCookie),
      )
    ).status,
  ).toBe(200);
});
