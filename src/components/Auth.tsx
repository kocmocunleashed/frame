import { SignIn, SignUp } from "@clerk/react";
import { Check } from "lucide-react";
import { Brand } from "./UI";
import { authReturnPath } from "../lib/auth-client";

export default function Auth() {
  const signup = location.pathname === "/signup";
  const returnPath = authReturnPath();
  const query =
    returnPath === "/" ? "" : `?next=${encodeURIComponent(returnPath)}`;
  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <Brand />
        <div className="auth-content">
          <h1>{signup ? "Big ideas start here." : "Welcome back."}</h1>
          <p>Your stories are right where you left them.</p>
          {signup ? (
            <SignUp
              routing="hash"
              signInUrl={`/signin${query}`}
              forceRedirectUrl={returnPath}
            />
          ) : (
            <SignIn
              routing="hash"
              signUpUrl={`/signup${query}`}
              forceRedirectUrl={returnPath}
            />
          )}
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
