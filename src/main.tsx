import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/syne";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/nunito";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./styles.css";
import "./creative.css";
import "./slide.css";
import "./creation.css";
import App from "./App";
const root = createRoot(document.getElementById("root")!);
root.render(
  <main className="page-error" role="status">
    Opening Frame…
  </main>,
);

async function boot() {
  try {
    const response = await fetch("/api/auth/provider", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error("Frame could not connect to its sign-in service.");
    const { provider, liveAI } = (await response.json()) as {
      provider: string;
      liveAI?: boolean;
    };
    if (import.meta.env.DEV && provider === "fixture") {
      const { default: FixtureApp } = await import("./FixtureApp");
      root.render(<FixtureApp liveAI={liveAI} />);
    } else if (provider === "better-auth") root.render(<App />);
    else
      throw new Error(
        "Frame needs its standalone sign-in configuration on the server.",
      );
  } catch (error) {
    root.render(
      <main className="page-error">
        <h1>Frame could not open</h1>
        <p>
          {error instanceof Error
            ? error.message
            : "The sign-in service is unavailable."}
        </p>
        <button className="button primary" onClick={() => void boot()}>
          Try again
        </button>
      </main>,
    );
  }
}
void boot();
