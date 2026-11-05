import { useState } from "react";
import { Check } from "lucide-react";
import { Brand } from "./UI";
import {
  authClient,
  authReturnPath,
  useAuthCapabilities,
} from "../lib/auth-client";
import { providerName } from "../../shared/auth";

export default function Auth() {
  const signup = location.pathname === "/signup",
    forgot = location.pathname === "/forgot-password",
    reset = location.pathname === "/reset-password";
  const { config, error: configError, retry } = useAuthCapabilities();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [verify, setVerify] = useState(false),
    [complete, setComplete] = useState(false);
  const token = new URLSearchParams(location.search).get("token");
  const returnPath = authReturnPath();
  const query =
    returnPath === "/" ? "" : `?next=${encodeURIComponent(returnPath)}`;
  const verifiedCallback = `${location.origin}/signin${query}${query ? "&" : "?"}verified=1`;
  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <Brand />
        <div className="auth-content">
          <h1>
            {forgot
              ? "Reset your password."
              : reset
                ? "Choose a new password."
                : signup
                  ? "Big ideas start here."
                  : "Welcome back."}
          </h1>
          <p>
            {forgot
              ? "We'll send a link to your email address."
              : reset
                ? "Use at least 10 characters."
                : "Your stories are right where you left them."}
          </p>
          {configError && (
            <p role="alert">
              {configError}{" "}
              <button className="button" type="button" onClick={retry}>
                Retry sign-in options
              </button>
            </p>
          )}
          {!forgot &&
            !reset &&
            config?.providers.map((provider) => (
              <button
                key={provider}
                className="button"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await authClient.signIn.social({
                      provider,
                      callbackURL: location.origin + returnPath,
                      errorCallbackURL: `${location.origin}/signin${query}`,
                    });
                    if (result.error)
                      throw new Error(
                        result.error.message || "Could not start sign-in.",
                      );
                  } catch (cause) {
                    setError((cause as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Continue with {providerName(provider)}
              </button>
            ))}
          {!signup &&
            !forgot &&
            !reset &&
            new URLSearchParams(location.search).has("error") && (
              <p role="alert">
                That sign-in attempt could not finish. Try again.
              </p>
            )}
          {new URLSearchParams(location.search).get("verified") === "1" && (
            <p role="status">
              Email verification finished. Sign in to continue.
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {forgot && config && !config.email ? (
            <p>
              Password recovery email is not configured on this server. Contact
              the server owner for account recovery.
            </p>
          ) : reset && !token && !complete ? (
            <p role="alert">
              This reset link is missing or invalid. Request a new link.
            </p>
          ) : (
            !complete &&
            !(signup && verify) && (
              <form
                className="modal-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError("");
                  setBusy(true);
                  try {
                    if (forgot) {
                      const result = await authClient.requestPasswordReset({
                        email,
                        redirectTo: `${location.origin}/reset-password${query}`,
                      });
                      if (result.error)
                        throw new Error(
                          result.error.message ||
                            "Could not request password recovery.",
                        );
                      setMessage(
                        "If that address has a Frame account, check its inbox for a reset link.",
                      );
                      setComplete(true);
                      return;
                    }
                    if (reset) {
                      const result = await authClient.resetPassword({
                        token: token!,
                        newPassword: password,
                      });
                      if (result.error)
                        throw new Error(
                          result.error.message ||
                            "This reset link is invalid or expired.",
                        );
                      setPassword("");
                      setComplete(true);
                      setMessage("Password updated. Sign in to continue.");
                      history.replaceState({}, "", `/reset-password${query}`);
                      return;
                    }
                    const result = signup
                      ? await authClient.signUp.email({
                          name,
                          email,
                          password,
                          callbackURL: verifiedCallback,
                        })
                      : await authClient.signIn.email({ email, password });
                    if (result.error) {
                      if (result.error.code === "EMAIL_NOT_VERIFIED")
                        setVerify(true);
                      throw new Error(
                        result.error.message || "Sign-in failed. Try again.",
                      );
                    }
                    if (signup && !result.data?.token) {
                      setVerify(true);
                      setPassword("");
                      setMessage(
                        "Check your inbox to verify your email before signing in.",
                      );
                      return;
                    }
                    location.assign(returnPath);
                  } catch (cause) {
                    setError((cause as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {signup && (
                  <label>
                    Your name
                    <input
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={80}
                    />
                  </label>
                )}
                {!reset && (
                  <label>
                    Email address
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>
                )}
                {!forgot && (
                  <label>
                    {reset ? "New password" : "Password"}
                    <input
                      type="password"
                      autoComplete={
                        signup || reset ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={10}
                      maxLength={128}
                    />
                  </label>
                )}
                <button
                  className="button primary"
                  disabled={busy || (forgot && !config?.email)}
                >
                  {busy
                    ? "Please wait…"
                    : forgot
                      ? "Send reset link"
                      : reset
                        ? "Save new password"
                        : signup
                          ? "Create account"
                          : "Sign in"}
                </button>
              </form>
            )
          )}
          {error && <p role="alert">{error}</p>}
          {verify && config?.email && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await authClient.sendVerificationEmail({
                    email,
                    callbackURL: verifiedCallback,
                  });
                  if (result.error)
                    throw new Error(
                      result.error.message || "Could not request verification.",
                    );
                  setMessage("Check your inbox for a verification link.");
                } catch (cause) {
                  setError((cause as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resend verification email
            </button>
          )}
          {!signup && !forgot && !reset && config?.email && (
            <p className="auth-switch">
              <a href={`/forgot-password${query}`}>Forgot password?</a>
            </p>
          )}
          <p className="auth-switch">
            {forgot || reset ? (
              <a href={`/signin${query}`}>Back to sign in</a>
            ) : (
              <a href={`${signup ? "/signin" : "/signup"}${query}`}>
                {signup
                  ? "Already have an account? Sign in"
                  : "New to Frame? Create an account"}
              </a>
            )}
          </p>
        </div>
        <span className="auth-footer">
          Your ideas. Your way of telling them.
        </span>
      </section>
      <section className="auth-art" aria-label="Sample presentation">
        <div className="auth-slide">
          <span className="auth-slide-label">A fresh perspective.</span>
          <h2>
            Make your point.
            <br />
            Make it yours.
          </h2>
          <div className="auth-slide-bottom">
            <span>Made with Frame</span>
            <span>↗</span>
          </div>
          <div className="auth-orbit" />
        </div>
        <div className="auth-proof">
          <span>
            <Check size={17} />
            Every element, editable.
          </span>
          <span>
            <Check size={17} />
            Your story, in your hands.
          </span>
        </div>
      </section>
    </main>
  );
}
