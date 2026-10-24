import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  createFrameLaunch,
  frameTarget,
} from "../backend/plugins/frame_api/src/ticket";

describe("erxes ticket issuer", () => {
  const config = {
    frameOrigin: "https://slides.example.test",
    erxesOrigin: "https://school.example.test",
    secret: "test-only-key-with-more-than-32-bytes",
  };
  test("tickets use the correct audience, immutable subject and a unique nonce", () => {
    const identity = {
      id: "teacher-1",
      email: "Teacher@example.test",
      name: "Teacher",
    };
    const first = createFrameLaunch(config, "school", identity, 1_000_000);
    const second = createFrameLaunch(config, "school", identity, 1_000_000);
    expect(first.ticket).not.toBe(second.ticket);
    expect(first.url).toBe(
      "https://slides.example.test/integrations/erxes/launch",
    );
    expect(first.url).not.toContain(first.ticket);
    const [payload, signature] = first.ticket.split(".");
    expect(signature).toBe(
      createHmac("sha256", config.secret).update(payload).digest("base64url"),
    );
    expect(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    ).toMatchObject({
      v: 1,
      tenant: "school",
      sub: "teacher-1",
      email: "teacher@example.test",
      iat: 1000,
      exp: 1060,
      iss: config.erxesOrigin,
      aud: config.frameOrigin,
    });
  });
  test("configuration rejects missing tenants, weak keys and unsafe origins", () => {
    expect(frameTarget(JSON.stringify({ school: config }), "school")).toEqual(
      config,
    );
    for (const raw of [undefined, "{}", "null", "[]", "bad JSON"])
      expect(() => frameTarget(raw, "school")).toThrow();
    for (const patch of [
      { frameOrigin: "javascript:alert(1)" },
      { frameOrigin: "https://slides.example.test/path" },
      { erxesOrigin: "https://user:password@example.test" },
      { secret: "short" },
    ])
      expect(() =>
        frameTarget(
          JSON.stringify({ school: { ...config, ...patch } }),
          "school",
        ),
      ).toThrow();
  });
});
