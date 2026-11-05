import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../shared/schema";
import { authClient } from "./lib/auth-client";
import { api, navigate, RequestError } from "./lib/api";
import { Loading, ErrorMessage, Brand } from "./components/UI";
import Auth from "./components/Auth";
import Workspace from "./components/Workspace";
const Review = lazy(() => import("./components/Review"));
const Editor = lazy(() => import("./components/Editor"));
const Presenter = lazy(() => import("./components/Presenter"));
const Creation = lazy(() => import("./components/Creation"));
const PublicViewer = lazy(() => import("./components/PublicViewer"));
const Audience = lazy(() => import("./components/Audience"));
const PublicGallery = lazy(() => import("./components/PublicGallery"));
const Admin = lazy(() => import("./components/Admin"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main className="page-error">
        <Brand />
        <h1>Let’s get you back to your story.</h1>
        <ErrorMessage>
          The interface encountered an error. Saved work and local recovery
          copies are preserved.
        </ErrorMessage>
        <button className="button primary" onClick={() => location.reload()}>
          Reload Frame
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App({
  signedOut,
  fixture = false,
}: {
  signedOut?: ReactNode;
  fixture?: boolean;
}) {
  return fixture ? (
    <Studio
      isLoaded
      userId="fixture"
      signedOut={signedOut}
      endSession={() => api("/auth/signout", { method: "POST" })}
    />
  ) : (
    <StandaloneStudio />
  );
}
function StandaloneStudio() {
  const { data, isPending } = authClient.useSession();
  return (
    <Studio
      isLoaded={!isPending}
      userId={data?.user.id}
      endSession={async () => {
        const result = await authClient.signOut();
        if (result.error)
          throw new Error(result.error.message || "Could not sign out.");
      }}
    />
  );
}

function Studio({
  isLoaded,
  userId,
  endSession,
  accountControls,
  signedOut,
}: {
  isLoaded: boolean;
  userId?: string | null;
  endSession: () => Promise<unknown>;
  accountControls?: ReactNode;
  signedOut?: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [path, setPath] = useState(location.pathname);
  async function load() {
    setError("");
    try {
      const result = await api<{
        user: User;
      }>("/me");
      setUser(result.user);
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) setUser(null);
      else setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    if (!isLoaded) return;
    if (userId) {
      setReady(false);
      void load();
    } else {
      setUser(null);
      setError("");
      setReady(true);
    }
    const change = () => setPath(location.pathname);
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, [isLoaded, userId]);
  async function signout() {
    try {
      await endSession();
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith("frame:rehearsal:") || key === "frame:workspace")
          sessionStorage.removeItem(key);
      setUser(null);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  let content: ReactNode;
  const publicMatch = path.match(/^\/view\/([^/]+)$/);
  const audienceMatch = path.match(/^\/join(?:\/([^/]+))?$/);
  // Session refreshes must preserve an in-progress account form and its result.
  if (!isLoaded && !ready) content = <Loading />;
  else if (audienceMatch)
    content = (
      <Audience key={audienceMatch[1] || "join"} code={audienceMatch[1]} />
    );
  else if (publicMatch)
    content = <PublicViewer key={publicMatch[1]} id={publicMatch[1]} />;
  else if (path === "/explore") content = <PublicGallery />;
  else if (path === "/forgot-password" || path === "/reset-password")
    content = <Auth />;
  else if (!ready) content = <Loading />;
  else if (error)
    content = (
      <main className="page-error">
        <ErrorMessage>{error}</ErrorMessage>
        {accountControls}
        <button className="button primary" onClick={load}>
          Reconnect
        </button>
      </main>
    );
  else if (!user) content = signedOut || <Auth />;
  else {
    const match = path.match(/^\/(deck|present|create|review)\/([^/]+)$/);
    content =
      path === "/admin" ? (
        <Admin />
      ) : match ? (
        match[1] === "review" ? (
          <Review key={match[2]} id={match[2]} user={user} />
        ) : match[1] === "create" ? (
          <Creation key={match[2]} id={match[2]} user={user} />
        ) : match[1] === "deck" ? (
          <Editor key={match[2]} id={match[2]} user={user} />
        ) : (
          <Presenter key={match[2]} id={match[2]} />
        )
      ) : (
        <Workspace user={user} onSignout={signout} onUser={setUser} />
      );
  }
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>{content}</Suspense>
    </ErrorBoundary>
  );
}
