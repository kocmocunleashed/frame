import { useEffect, useState } from "react";
import { api, json, setWorkspace } from "../lib/api";
import { ErrorMessage } from "./UI";
import type { User } from "../../shared/schema";
type Workspace = { id: string; name: string; role: string; ownerId: string };
type Member = { id: string; name: string; email: string; role: string };

export default function WorkspaceManager({ user }: { user: User }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("editor"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const current = workspaces.find((w) => w.id === user.workspaceId);
  async function load() {
    const [spaces, people] = await Promise.all([
      api<Workspace[]>("/workspaces"),
      api<Member[]>(`/workspaces/${user.workspaceId}/members`),
    ]);
    setWorkspaces(spaces);
    setMembers(people);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [user.workspaceId]);
  const act = async (operation: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await operation();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-form">
      <label>
        Active workspace
        <select
          value={user.workspaceId}
          onChange={(e) => {
            setWorkspace(e.target.value);
            location.assign("/");
          }}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        New workspace name
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="button"
        disabled={busy || !name.trim()}
        onClick={() =>
          void act(async () => {
            const workspace = await api<Workspace>(
              "/workspaces",
              json("POST", { name }),
            );
            setWorkspace(workspace.id);
            location.assign("/");
          })
        }
      >
        Create workspace
      </button>
      <h3>Members</h3>
      {members.map((member) => (
        <div key={member.id} className="account-security-actions">
          <span>
            {member.name} · {member.email} · {member.role}
          </span>
          {current?.ownerId === user.id && member.id !== user.id && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api(`/workspaces/${user.workspaceId}/members/${member.id}`, {
                    method: "DELETE",
                  }),
                )
              }
            >
              Remove {member.name}
            </button>
          )}
        </div>
      ))}
      {current?.ownerId === user.id && (
        <>
          <label>
            Member email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Permission
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || !email}
            onClick={() =>
              void act(async () => {
                await api(
                  `/workspaces/${user.workspaceId}/members`,
                  json("PUT", { email, role }),
                );
                setEmail("");
              })
            }
          >
            Add or update member
          </button>
          <p className="muted">Members need an existing Frame account.</p>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
