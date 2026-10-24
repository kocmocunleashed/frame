import { useState } from "react";
import App from "./App";
/** Vite's DEV guard excludes this entry from production. Its server binds loopback only. */
export default function FixtureApp({ liveAI = false }: { liveAI?: boolean }) {
  const [session, setSession] = useState(0),
    [name, setName] = useState("Local creator"),
    [email, setEmail] = useState("creator@example.test"),
    [error, setError] = useState("");
  return (
    <>
      <aside className="fixture-banner" role="status">
        {liveAI
          ? "Local development workspace · test identity · real OpenRouter AI with usage charges"
          : "Local fixture workspace · test identity and AI · no external services"}
      </aside>
      <App
        key={session}
        erxesOrigin={location.origin}
        signedOut={
          <main className="page-error">
            <h1>Open your local Frame workspace</h1>
            <p>
              This explicit development harness uses an isolated MongoDB replica
              set.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                try {
                  const r = await fetch("/api/auth/signup", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ name, email }),
                  });
                  if (!r.ok)
                    throw new Error(
                      "Could not open the fixture account. Use a new email for a new workspace.",
                    );
                  setSession((n) => n + 1);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <button className="button primary">Open local workspace</button>
            </form>
          </main>
        }
      />
    </>
  );
}
