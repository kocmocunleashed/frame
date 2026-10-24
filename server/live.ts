import { requestIP } from "./request-ip";
import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createHash, randomBytes, randomInt } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import {
  documentSchema,
  uid,
  type User,
  type FrameDocument,
} from "../shared/schema";
import { publicProjection, referencedAssets } from "../shared/publications";
import {
  liveCommandSchema,
  liveStateSchema,
  type LiveCommand,
  type LiveState,
  type HostSession,
  type AudienceSession,
  type LiveQuestion,
} from "../shared/live";
import { Store, ApiError } from "./store";
import { assetResponse } from "./asset-response";
type LiveRow = {
  id: string;
  deckId: string;
  ownerId: string;
  code: string;
  state: string;
  document: string;
  version: number;
  createdAt: string;
  endedAt: string | null;
  expiresAt: number;
};
type Participant = {
  id: string;
  sessionId: string;
  tokenHash: string;
  lastSeen: number;
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const initial: LiveState = {
  index: 0,
  step: 0,
  questionId: null,
  round: 0,
  open: false,
  resultsVisible: false,
  answerVisible: false,
  revealedIds: [],
};
export class LiveSessions {
  private snapshots = new Map<string, { document: string; bytes: number }>();
  private snapshotLoads = new Map<string, Promise<string>>();
  private snapshotBytes = 0;
  private async hydrate(
    row: LiveRow & { snapshotId?: string },
  ): Promise<LiveRow> {
    if (!row.snapshotId) return row;
    const id = row.snapshotId,
      cached = this.snapshots.get(id);
    if (cached) {
      this.snapshots.delete(id);
      this.snapshots.set(id, cached);
      return { ...row, document: cached.document };
    }
    let pending = this.snapshotLoads.get(id);
    if (!pending) {
      pending = (async () => {
        const document = JSON.stringify(
            documentSchema.parse(await this.store.db.snapshotRead(id)),
          ),
          bytes = Buffer.byteLength(document);
        if (bytes <= 16 * 1024 * 1024) {
          while (
            this.snapshots.size &&
            (this.snapshotBytes + bytes > 16 * 1024 * 1024 ||
              this.snapshots.size >= 8)
          ) {
            const oldest = this.snapshots.keys().next().value!;
            this.snapshotBytes -= this.snapshots.get(oldest)!.bytes;
            this.snapshots.delete(oldest);
          }
          this.snapshots.set(id, { document, bytes });
          this.snapshotBytes += bytes;
        }
        return document;
      })();
      this.snapshotLoads.set(id, pending);
    }
    try {
      return { ...row, document: await pending };
    } finally {
      if (this.snapshotLoads.get(id) === pending) this.snapshotLoads.delete(id);
    }
  }
  constructor(
    public store: Store,
    public now = () => Date.now(),
  ) {}
  async rate(key: string, limit: number, window = 60000) {
    const now = this.now(),
      windowStart = Math.floor(now / window) * window,
      windowKey = `${key}:${windowStart}`;
    const row = await this.store.db.atomic(
      "rateLimits",
      { id: windowKey },
      {
        $inc: { attempts: 1 },
        $setOnInsert: {
          key: windowKey,
          windowStart: new Date(windowStart),
          expiresAt: windowStart + window,
        },
      },
      { upsert: true },
    );
    if (row.attempts > limit)
      throw new ApiError(
        429,
        "Too many attempts. Wait a minute and try again.",
      );
  }

  async row(code: string): Promise<LiveRow> {
    if (!/^[A-Z2-9]{6}$/.test(code))
      throw new ApiError(
        404,
        "That session code is invalid. Check the six characters and try again.",
      );
    const metadata = (await this.store.db.one(
      "liveSessions",
      {
        code: code,
      },
      { hydrateSnapshot: false },
    )) as LiveRow | null;
    // State, expiry and revocation always come from MongoDB. Only immutable,
    // hash-verified snapshot bytes are cached, with bounded memory and LRU eviction.
    const row = metadata ? await this.hydrate(metadata) : null;
    if (!row || !row.document)
      throw new ApiError(
        404,
        "That session code is invalid. Check it with your presenter.",
      );
    return row;
  }
  ended(row: LiveRow) {
    return !!row.endedAt || row.expiresAt <= this.now();
  }
  private async hostRow(id: string, user: User) {
    const metadata = (await this.store.db.one(
      "liveSessions",
      {
        id: id,
      },
      { hydrateSnapshot: false },
    )) as LiveRow | null;
    const row = metadata ? await this.hydrate(metadata) : null;
    if (!row || row.ownerId !== user.id)
      throw new ApiError(404, "Live session not found.");
    await this.store.access(row.deckId, user, true);
    return row;
  }
  private decode(row: LiveRow) {
    return {
      doc: documentSchema.parse(JSON.parse(row.document)),
      state: liveStateSchema.parse(JSON.parse(row.state)),
    };
  }
  async current(deckId: string, user: User): Promise<HostSession | null> {
    await this.store.access(deckId, user, true);
    const row = (await this.store.db.one(
      "liveSessions",
      {
        $and: [
          { deckId: deckId },
          { ownerId: user.id },
          { endedAt: null },
          { expiresAt: { $gt: this.now() } },
        ],
      },
      { sort: { createdAt: -1 }, limit: 1 },
    )) as LiveRow | null;
    return row ? await this.host(row.id, user) : null;
  }
  async start(
    deckId: string,
    user: User,
    baseRevision: number,
  ): Promise<HostSession> {
    return await this.store.db.transaction(async () => {
      const doc = await this.store.access(deckId, user, true);
      if (doc.status !== "active")
        throw new ApiError(
          400,
          "Restore this presentation before starting a live session.",
        );
      if (doc.revision !== baseRevision)
        throw new ApiError(
          409,
          "Save the current presentation before starting a live session.",
        );
      const active = await this.current(deckId, user);
      if (active) return active;
      await this.store.db.update(
        "jobQuotas",
        { id: user.id },
        { $inc: { revision: 1 } },
      );
      const count = (await {
        n: await this.store.db.count("liveSessions", {
          $and: [
            { ownerId: user.id },
            { endedAt: null },
            { expiresAt: { $gt: this.now() } },
          ],
        }),
      }) as {
        n: number;
      };
      if (count.n >= 2)
        throw new ApiError(
          429,
          "End an existing live session before opening another.",
        );
      for (const id of referencedAssets(doc)) {
        const asset = (await this.store.db.one("assets", {
          $and: [{ id: id }, { workspaceId: doc.workspaceId }],
        })) as {
          mime: string;
        } | null;
        if (!asset || !/^image\/|^video\//.test(asset.mime))
          throw new ApiError(
            400,
            "Replace unavailable slide media before starting a session.",
          );
      }
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      do {
        code = Array.from(
          { length: 6 },
          () => alphabet[randomInt(alphabet.length)],
        ).join("");
      } while (await this.store.db.one("liveSessions", { code: code }));
      const id = uid();
      await this.store.db.insert("liveSessions", {
        id: id,
        ownerId: user.id,
        version: 0,
        endedAt: null,
        code: code,
        state: JSON.stringify({ ...initial, stepStartedAt: this.now() }),
        createdAt: new Date(this.now()).toISOString(),
        deckId: doc.id,
        document: JSON.stringify(doc),
        expiresAt: this.now() + 24 * 60 * 60 * 1000,
      });
      return await this.host(id, user);
    })();
  }
  private async question(
    row: LiveRow,
    host = false,
    participantId?: string,
  ): Promise<LiveQuestion | null> {
    const { doc, state } = this.decode(row);
    const el = doc.slides[state.index]?.elements.find(
      (e) => e.id === state.questionId && !e.hidden && e.type === "question",
    );
    if (!el?.question) return null;
    const q = el.question,
      result: LiveQuestion = {
        id: el.id,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        round: state.round,
        open: state.open,
        answerVisible: state.answerVisible,
      };
    if (host || state.resultsVisible) {
      const counts = q.options.map(() => 0);
      const rows = (await this.store.db.aggregate("liveResponses", [
        { $match: { sessionId: row.id, round: state.round } },
        { $group: { _id: "$optionIndex", n: { $sum: 1 } } },
        { $project: { _id: 0, optionIndex: "$_id", n: 1 } },
      ])) as {
        optionIndex: number;
        n: number;
      }[];
      for (const item of rows)
        if (item.optionIndex < counts.length) counts[item.optionIndex] = item.n;
      result.counts = counts;
      result.total = counts.reduce((a, b) => a + b, 0);
    }
    if (host || state.answerVisible) {
      result.correctIndex = q.correctIndex;
      result.explanation = q.explanation;
    }
    if (participantId) {
      const response = (await this.store.db.one("liveResponses", {
        $and: [
          { sessionId: row.id },
          { round: state.round },
          { participantId: participantId },
        ],
      })) as {
        optionIndex: number;
      } | null;
      if (response) {
        result.response = response.optionIndex;
        if (state.answerVisible)
          result.feedback =
            doc.slides[state.index].interactions
              .filter(
                (i) =>
                  i.trigger === "answer" &&
                  i.action === "feedback" &&
                  i.target === el.id,
              )
              .map((i) => i.value)
              .join("\n") || undefined;
      }
    }
    return result;
  }
  async host(id: string, user: User): Promise<HostSession> {
    const row = await this.hostRow(id, user),
      { doc, state } = this.decode(row);
    const stats = (await {
      participants: await this.store.db.count("liveParticipants", {
        sessionId: id,
      }),
      connected: await this.store.db.count("liveParticipants", {
        sessionId: id,
        lastSeen: { $gt: this.now() - 15000 },
      }),
    }) as {
      participants: number;
      connected: number | null;
    };
    return {
      id: row.id,
      code: row.code,
      version: row.version,
      ended: this.ended(row),
      expiresAt: row.expiresAt,
      serverTime: this.now(),
      document: doc,
      state,
      ...stats,
      connected: stats.connected || 0,
      question: await this.question(row, true),
    };
  }
  async command(
    id: string,
    user: User,
    expectedVersion: number,
    command: LiveCommand,
  ): Promise<HostSession> {
    return await this.store.db.transaction(async () => {
      const row = await this.hostRow(id, user);
      if (this.ended(row))
        throw new ApiError(
          410,
          "This live session has ended. Start a new session.",
        );
      if (row.version !== expectedVersion)
        throw new ApiError(
          409,
          "Session controls changed in another window. Reload the current state.",
        );
      const { doc, state } = this.decode(row);
      if (command.type === "end") {
        await this.store.db.update(
          "liveSessions",
          { id: id },
          {
            $set: { endedAt: new Date(this.now()).toISOString() },
            $inc: { version: +1 },
          },
        );
        return await this.host(id, user);
      }
      if (command.type === "navigate") {
        const slide = doc.slides[command.index];
        if (!slide) throw new ApiError(400, "Choose an existing slide.");
        const max = Math.max(
          0,
          ...slide.elements.map((e) => e.animation?.step || 0),
        );
        if (command.step > max)
          throw new ApiError(400, "Choose an existing presentation step.");
        if (state.index !== command.index) {
          state.open = false;
          state.revealedIds = [];
          state.questionId = null;
          state.resultsVisible = false;
          state.answerVisible = false;
        }
        if (state.index !== command.index || state.step !== command.step)
          state.stepStartedAt =
            command.index > state.index ||
            (command.index === state.index && command.step > state.step)
              ? this.now()
              : 0;
        state.index = command.index;
        state.step = command.step;
      }
      if (command.type === "reveal") {
        if (
          !doc.slides[state.index].interactions.some(
            (i) =>
              i.trigger === "click" &&
              i.action === "show" &&
              i.value === command.elementId,
          )
        )
          throw new ApiError(
            400,
            "Choose an explanation controlled by a click interaction.",
          );
        state.revealedIds = [
          ...new Set([...state.revealedIds, command.elementId]),
        ];
      }
      if (command.type === "open") {
        const q = doc.slides[state.index].elements.find(
          (e) =>
            e.id === command.questionId && e.type === "question" && !e.hidden,
        );
        if (!q)
          throw new ApiError(400, "Choose a question on the current slide.");
        state.questionId = q.id;
        state.round++;
        state.open = true;
        state.resultsVisible = false;
        state.answerVisible = false;
      }
      if (command.type === "close") state.open = false;
      if (command.type === "results") {
        if (!state.questionId)
          throw new ApiError(400, "Open a question first.");
        state.resultsVisible = command.visible;
      }
      if (command.type === "answer") {
        if (!state.questionId)
          throw new ApiError(400, "Open a question first.");
        if (command.visible && state.open)
          throw new ApiError(400, "Close answers before revealing feedback.");
        state.answerVisible = command.visible;
      }
      await this.store.db.update(
        "liveSessions",
        { id: id },
        { $set: { state: JSON.stringify(state) }, $inc: { version: +1 } },
      );
      return await this.host(id, user);
    })();
  }
  async join(code: string, token?: string) {
    return await this.store.db.transaction(async () => {
      const row = await this.row(code);
      if (this.ended(row))
        throw new ApiError(
          410,
          "This session has ended. Ask your presenter for a new code.",
        );
      await this.store.db.update(
        "liveSessions",
        { id: row.id },
        { $inc: { participantGuard: 1 } },
      );
      const existing = token
        ? ((await this.store.db.one("liveParticipants", {
            $and: [{ sessionId: row.id }, { tokenHash: digest(token) }],
          })) as Participant | null)
        : null;
      if (existing) {
        await this.store.db.update(
          "liveParticipants",
          { id: existing.id },
          { $set: { lastSeen: this.now() } },
        );
        return { token: token!, view: await this.audience(code, token!) };
      }
      const count = (await {
        n: await this.store.db.count("liveParticipants", { sessionId: row.id }),
      }) as {
        n: number;
      };
      if (count.n >= 200)
        throw new ApiError(
          429,
          "This session has reached its 200-participant limit.",
        );
      const fresh = randomBytes(32).toString("base64url");
      await this.store.db.insert("liveParticipants", {
        id: uid(),
        sessionId: row.id,
        tokenHash: digest(fresh),
        createdAt: this.now(),
        lastSeen: this.now(),
        expiresAt: row.expiresAt,
      });
      return { token: fresh, view: await this.audience(code, fresh) };
    })();
  }
  async participant(row: LiveRow, token?: string): Promise<Participant> {
    const result = token
      ? ((await this.store.db.one("liveParticipants", {
          $and: [{ sessionId: row.id }, { tokenHash: digest(token) }],
        })) as Participant | null)
      : null;
    if (!result || (result as any).expiresAt <= this.now())
      throw new ApiError(401, "Join this session to continue.");
    return result;
  }
  async audience(code: string, token?: string): Promise<AudienceSession> {
    const row = await this.row(code),
      p = await this.participant(row, token),
      { doc, state } = this.decode(row),
      ended = this.ended(row);
    if (!ended)
      await this.store.db.update(
        "liveParticipants",
        { id: p.id },
        { $set: { lastSeen: this.now() } },
      );
    return {
      id: row.id,
      title: doc.title,
      serverTime: this.now(),
      version: row.version,
      ended,
      state: {
        index: state.index,
        step: state.step,
        revealedIds: state.revealedIds,
        stepStartedAt: state.stepStartedAt,
      },
      document: ended
        ? null
        : publicProjection(
            { ...doc, slides: [doc.slides[state.index]] },
            (id) => `/api/audience/${row.code}/assets/${id}`,
          ),
      question: ended ? null : await this.question(row, false, p.id),
    };
  }
  async answer(
    code: string,
    token: string | undefined,
    input: {
      round: number;
      questionId: string;
      option: number;
    },
  ): Promise<AudienceSession> {
    return await this.store.db.transaction(async () => {
      const row = await this.row(code),
        p = await this.participant(row, token);
      if (this.ended(row)) throw new ApiError(410, "This session has ended.");
      const { doc, state } = this.decode(row);
      if (state.round !== input.round || state.questionId !== input.questionId)
        throw new ApiError(
          409,
          "The presenter moved to a different question. Refresh and try again.",
        );
      const previous = (await this.store.db.one("liveResponses", {
        $and: [
          { sessionId: row.id },
          { round: state.round },
          { participantId: p.id },
        ],
      })) as {
        optionIndex: number;
      } | null;
      if (previous) {
        if (previous.optionIndex !== input.option)
          throw new ApiError(
            409,
            "Your first answer was already recorded. It cannot be changed.",
          );
        return await this.audience(code, token);
      }
      if (!state.open)
        throw new ApiError(
          409,
          "This question is closed. Wait for your presenter.",
        );
      const q = doc.slides[state.index].elements.find(
        (e) => e.id === state.questionId,
      )?.question;
      if (!q || input.option >= q.options.length || input.option < 0)
        throw new ApiError(400, "Choose one of the available answers.");
      await this.store.db.update(
        "liveSessions",
        { id: row.id, version: row.version },
        { $inc: { voteEpoch: 1 } },
      );
      await this.store.db.insert("liveResponses", {
        sessionId: row.id,
        round: state.round,
        participantId: p.id,
        questionId: state.questionId,
        optionIndex: input.option,
        createdAt: this.now(),
      });
      return await this.audience(code, token);
    })();
  }
  async asset(code: string, token: string | undefined, assetId: string) {
    const row = await this.row(code);
    await this.participant(row, token);
    if (this.ended(row)) throw new ApiError(410, "This session has ended.");
    const { doc, state } = this.decode(row);
    if (
      !referencedAssets(
        publicProjection(
          { ...doc, slides: [doc.slides[state.index]] },
          (id) => `/api/assets/${id}`,
        ) as FrameDocument,
      ).includes(assetId)
    )
      throw new ApiError(404, "This image is not in the session.");
    const asset = (await this.store.db.one("assets", {
      $and: [{ id: assetId }, { workspaceId: doc.workspaceId }],
    })) as {
      storageKey: string;
      mime: string;
    } | null;
    if (!asset) throw new ApiError(404, "Media is unavailable.");
    return asset;
  }
}
export function registerAudienceRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  live: LiveSessions,
) {
  const code = (value: string) => value.toUpperCase(),
    cookieName = (value: string) => `frame_audience_${value}`;
  app.post("/api/audience/:code/join", async (c) => {
    const value = code(c.req.param("code"));
    const remote = requestIP(c.req.raw, c.env);
    // A class may share one NAT address, including a whole-room reconnect.
    await live.rate(`audience-join:${remote}`, 600);
    let result: Awaited<ReturnType<LiveSessions["join"]>>;
    try {
      result = await live.join(
        value,
        c.req.header("X-Frame-Participant") || getCookie(c, cookieName(value)),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        await live.rate(`audience-invalid-code:${remote}`, 60);
      throw error;
    }
    setCookie(c, cookieName(value), result.token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.APP_ORIGIN?.startsWith("https:") ?? false,
      path: `/api/audience/${value}`,
      maxAge: 24 * 60 * 60,
    });
    return c.json({ ...result.view, participantToken: result.token });
  });
  app.get("/api/audience/:code", async (c) => {
    const value = code(c.req.param("code"));
    return c.json(
      await live.audience(
        value,
        c.req.header("X-Frame-Participant") || getCookie(c, cookieName(value)),
      ),
    );
  });
  app.post("/api/audience/:code/answer", async (c) => {
    const value = code(c.req.param("code")),
      input = z
        .object({
          round: z.number().int().min(1),
          questionId: z.string().min(1).max(100),
          option: z.number().int().min(0).max(7).optional(),
          optionIndex: z.number().int().min(0).max(7).optional(),
        })
        .transform((v) => ({ ...v, option: v.optionIndex ?? v.option! }))
        .refine((v) => v.option !== undefined, "Choose an answer")
        .parse(await c.req.json());
    return c.json(
      await live.answer(
        value,
        c.req.header("X-Frame-Participant") || getCookie(c, cookieName(value)),
        input,
      ),
    );
  });
  app.get("/api/audience/:code/assets/:assetId", async (c) => {
    const value = code(c.req.param("code")),
      asset = await live.asset(
        value,
        c.req.header("X-Frame-Participant") || getCookie(c, cookieName(value)),
        c.req.param("assetId"),
      );
    return assetResponse(asset.storageKey, asset.mime, c.req.header("Range"));
  });
}
export function registerLiveRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  live: LiveSessions,
) {
  app.get("/api/decks/:id/live", async (c) =>
    c.json(await live.current(c.req.param("id"), c.get("user"))),
  );
  app.post("/api/decks/:id/live", async (c) => {
    const input = z
      .object({ baseRevision: z.number().int().min(0) })
      .parse(await c.req.json());
    return c.json(
      await live.start(c.req.param("id"), c.get("user"), input.baseRevision),
      201,
    );
  });
  app.get("/api/live/:id", async (c) => {
    const session = await live.host(c.req.param("id"), c.get("user"));
    if (c.req.query("state") === "1") {
      const { document, ...state } = session;
      return c.json(state);
    }
    return c.json(session);
  });
  app.post("/api/live/:id/control", async (c) => {
    const input = z
      .object({
        expectedVersion: z.number().int().min(0),
        command: liveCommandSchema,
      })
      .parse(await c.req.json());
    return c.json(
      await live.command(
        c.req.param("id"),
        c.get("user"),
        input.expectedVersion,
        input.command,
      ),
    );
  });
  app.get("/api/live/:id/qr", async (c) => {
    const session = await live.host(c.req.param("id"), c.get("user"));
    const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5174";
    const image = await QRCode.toBuffer(`${origin}/join/${session.code}`, {
      type: "png",
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    return new Response(new Uint8Array(image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  });
}
