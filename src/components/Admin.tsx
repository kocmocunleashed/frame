import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import type {
  AdminUser,
  AdminUsers,
  CreditBalance,
} from "../../shared/credits";
import { api, json, navigate } from "../lib/api";
import { Brand, ErrorMessage, Loading } from "./UI";
import "../admin.css";

function UserCredits({
  user,
  onSaved,
}: {
  user: AdminUser;
  onSaved: (user: AdminUser) => void;
}) {
  const [unlimited, setUnlimited] = useState(user.remaining === null);
  const [amount, setAmount] = useState(String(user.remaining ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = (unlimited ? null : Number(amount)) !== user.remaining;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const remaining = unlimited ? null : Number(amount);
    if (
      !unlimited &&
      (!amount.trim() ||
        !Number.isInteger(remaining) ||
        remaining! < 0 ||
        remaining! > 1000000)
    ) {
      setError("Enter a whole number from 0 to 1,000,000.");
      return;
    }
    setBusy(true);
    try {
      const balance = await api<CreditBalance>(
        `/admin/users/${encodeURIComponent(user.id)}/credits`,
        json("PATCH", { remaining, revision: user.revision }),
      );
      onSaved({ ...user, ...balance });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="admin-user">
      <div className="admin-identity">
        <span className="admin-avatar" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
        </div>
      </div>
      <div
        className={`admin-current ${user.remaining === 0 ? "is-empty" : ""}`}
      >
        <strong>
          {user.remaining === null
            ? "Unlimited"
            : user.remaining.toLocaleString()}
        </strong>
        <span>credits left</span>
      </div>
      <form
        onSubmit={save}
        className="admin-credit-form"
        aria-label={`Credits for ${user.email}`}
      >
        <div className="admin-credit-fields">
          <label className="admin-amount">
            Remaining credits
            <input
              aria-label={`Remaining credits for ${user.email}`}
              type="number"
              min="0"
              max="1000000"
              step="1"
              required={!unlimited}
              disabled={unlimited || busy}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
            />
          </label>
          <label className="admin-unlimited">
            <input
              type="checkbox"
              checked={unlimited}
              disabled={busy}
              onChange={(e) => {
                setUnlimited(e.target.checked);
                setError("");
              }}
            />
            Unlimited
          </label>
          <button className="button primary" disabled={busy || !changed}>
            {busy ? "Saving…" : "Save balance"}
          </button>
        </div>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      </form>
    </li>
  );
}

export default function Admin() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<AdminUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNotice("");
    api<AdminUsers>(
      `/admin/users?query=${encodeURIComponent(search)}&page=${page}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, page, version]);
  function saved(user: AdminUser) {
    setResult(
      (current) =>
        current && {
          ...current,
          users: current.users.map((u) => (u.id === user.id ? user : u)),
        },
    );
    setNotice(
      `Balance saved for ${user.name}: ${user.remaining === null ? "unlimited credits" : `${user.remaining.toLocaleString()} credits remaining`}.`,
    );
  }
  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <Brand />
        <button className="button" onClick={() => navigate("/")}>
          <ArrowLeft size={17} />
          Back to workspace
        </button>
      </header>
      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <p className="admin-eyebrow">
              <ShieldCheck size={17} />
              Admin / Users
            </p>
            <h1>Presentation credits</h1>
            <p>Choose how many AI presentations each person can create.</p>
          </div>
          <p className="admin-policy">
            One credit per saved AI presentation.
            <br />
            Failed attempts and retries use no credits.
          </p>
        </div>
        <div className="admin-tools">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query.trim());
              setPage(1);
              setVersion((v) => v + 1);
            }}
          >
            <label className="admin-search">
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="Search users by name or email"
                placeholder="Search by name or email"
                maxLength={254}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
              />
            </label>
            <button className="button" type="submit">
              Search
            </button>
          </form>
          <button
            className="button"
            onClick={() => setVersion((v) => v + 1)}
            disabled={loading}
          >
            Reload users
          </button>
        </div>
        <p className="admin-notice" role="status">
          {notice ||
            (result && !loading && !error
              ? `${result.total} ${result.total === 1 ? "user" : "users"}${search ? " found" : ""}. Balances stay unlimited until you set a limit.`
              : "")}
        </p>
        {loading ? (
          <Loading label="Loading users…" />
        ) : error ? (
          <ErrorMessage>{error}</ErrorMessage>
        ) : result?.users.length ? (
          <>
            <ul className="admin-users">
              {result.users.map((user) => (
                <UserCredits
                  key={`${user.id}:${user.revision}`}
                  user={user}
                  onSaved={saved}
                />
              ))}
            </ul>
            {result.total > result.pageSize ? (
              <nav className="admin-pagination" aria-label="User pages">
                <button
                  className="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.ceil(result.total / result.pageSize)}
                </span>
                <button
                  className="button"
                  disabled={page * result.pageSize >= result.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="admin-empty">
            <h2>No users found</h2>
            <p>Try a different name or email address.</p>
          </div>
        )}
      </main>
    </div>
  );
}
