import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../shared/schema";
import { useAuth, useClerk, UserButton } from "@clerk/react";
import { api, navigate, RequestError, setTokenGetter } from "./lib/api";
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
  erxesOrigin,
  signedOut,
}: {
  erxesOrigin?: string | null;
  signedOut?: ReactNode;
}) {
  return erxesOrigin ? (
    <Studio
      isLoaded
      userId="erxes"
      erxesOrigin={erxesOrigin}
      signedOut={signedOut}
      endSession={() => api("/auth/signout", { method: "POST" })}
    />
  ) : (
    <ClerkStudio />
  );
}

function ClerkStudio() {
  const { isLoaded, userId, getToken } = useAuth();
  const clerk = useClerk();
  setTokenGetter(getToken);
  return (
    <Studio
      isLoaded={isLoaded}
      userId={userId}
      endSession={() => clerk.signOut()}
      accountControls={
        userId ? (
          <>
            <button className="button" onClick={() => clerk.openUserProfile()}>
              Manage account & verify email
            </button>
            <UserButton />
          </>
        ) : null
      }
    />
  );
}

function Studio({
  isLoaded,
  userId,
  erxesOrigin,
  endSession,
  accountControls,
  signedOut,
}: {
  isLoaded: boolean;
  userId?: string | null;
  erxesOrigin?: string;
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
        integration?: { erxesOrigin: string };
      }>("/me");
      setUser(result.user);
      if (
        erxesOrigin &&
        result.integration?.erxesOrigin === erxesOrigin &&
        window.parent !== window
      )
        window.parent.postMessage({ type: "frame-erxes:ready" }, erxesOrigin);
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
  }, [isLoaded, userId, erxesOrigin]);
  async function signout() {
    try {
      await endSession();
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith("frame:rehearsal:")) sessionStorage.removeItem(key);
      setUser(null);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  let content: ReactNode;
  const publicMatch = path.match(/^\/view\/([^/]+)$/);
  const audienceMatch = path.match(/^\/join(?:\/([^/]+))?$/);
  if (!isLoaded) content = <Loading />;
  else if (audienceMatch)
    content = (
      <Audience key={audienceMatch[1] || "join"} code={audienceMatch[1]} />
    );
  else if (publicMatch)
    content = <PublicViewer key={publicMatch[1]} id={publicMatch[1]} />;
  else if (path === "/explore") content = <PublicGallery />;
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
  else if (!user)
    content =
      signedOut ||
      (erxesOrigin ? (
        <main className="page-error">
          <Brand />
          <h1>Open Frame from erxes</h1>
          <p>
            Your session has ended. Return to your workspace and choose Frame to
            reconnect.
          </p>
          <a className="button primary" href={erxesOrigin} target="_top">
            Return to erxes
          </a>
        </main>
      ) : (
        <Auth />
      ));
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
        <Workspace
          user={user}
          onSignout={signout}
          onUser={setUser}
          externalAccountUrl={erxesOrigin}
        />
      );
  }
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>{content}</Suspense>
    </ErrorBoundary>
  );
}
