import AccountSettings from "./AccountSettings";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Plus,
  FileText,
  Search,
  LayoutGrid,
  List,
  Folder,
  FolderPlus,
  Archive,
  Trash2,
  MoreHorizontal,
  Copy,
  Pencil,
  ArrowUpRight,
  PanelsTopLeft,
  Palette,
  LogOut,
  Settings,
  ArrowRight,
  Presentation,
  BookOpen,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  DeckSummary,
  Folder as FolderType,
  FrameDocument,
  User,
  Theme,
} from "../../shared/schema";
import type { SavedTheme } from "../../shared/design-library";
import type { CreationDraft } from "../../shared/ai";
import { THEMES } from "../../shared/themes";
import { makeDocument } from "../../shared/templates";
import { api, json, navigate, dateLabel } from "../lib/api";
import { Brand, IconButton, Modal, Loading, ErrorMessage } from "./UI";
import { AutoSlide } from "./SlideRenderer";
import CreateFeature from "./CreateFeature";
import CreditBalance, { useCredits } from "./CreditBalance";
const ThemeLibrary = lazy(() => import("./ThemeLibrary"));
type Section = "all" | "templates" | "themes" | "archived" | "trashed" | string;
const templateChoices = [
  {
    id: "blank",
    name: "A clean slate",
    description: "Start from an empty slide.",
    icon: Plus,
    theme: "mono",
  },
  {
    id: "story",
    name: "Tell a story",
    description: "A clear, expressive narrative.",
    icon: Presentation,
    theme: "studio",
  },
  {
    id: "pitch",
    name: "Make your pitch",
    description: "A problem, a possibility, a plan.",
    icon: ArrowUpRight,
    theme: "editorial",
  },
  {
    id: "lesson",
    name: "Teach something",
    description: "Build understanding, together.",
    icon: BookOpen,
    theme: "organic",
  },
];
export default function Workspace({
  user,
  onSignout,
  onUser,
  externalAccountUrl,
}: {
  user: User;
  onSignout: () => void;
  onUser: (u: User) => void;
  externalAccountUrl?: string;
}) {
  const creditState = useCredits();
  const profileMenuId = useId();
  const profileMenu = useRef<HTMLDivElement>(null);
  const profileButton = useRef<HTMLButtonElement>(null);
  const [settingsTab, setSettingsTab] = useState<"profile" | "ai">("profile");
  const [decks, setDecks] = useState<DeckSummary[]>([]),
    [folders, setFolders] = useState<FolderType[]>([]),
    [section, setSection] = useState<Section>("all"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("modified"),
    [view, setView] = useState<"grid" | "list">("grid"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [menu, setMenu] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [sidebar, setSidebar] = useState(false);
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]),
    [designLibrary, setDesignLibrary] = useState(false),
    [creationTheme, setCreationTheme] = useState<Theme | null>(null);
  const [creationDrafts, setCreationDrafts] = useState<CreationDraft[]>([]);
  const designPreview = useMemo(
    () => makeDocument(user.id, user.workspaceId, "Theme preview", "story"),
    [user.id, user.workspaceId],
  );
  const [modal, setModal] = useState<
      null | "new" | "folder" | "rename" | "delete" | "settings"
    >(() =>
      new URLSearchParams(location.search).has("account") ? "settings" : null,
    ),
    [target, setTarget] = useState<DeckSummary | null>(null),
    [template, setTemplate] = useState("blank"),
    [newTheme, setNewTheme] = useState("studio");
  async function load() {
    setError("");
    try {
      const [d, f, t, drafts] = await Promise.all([
        api<DeckSummary[]>("/decks"),
        api<FolderType[]>("/folders"),
        api<SavedTheme[]>("/themes"),
        api<CreationDraft[]>("/creation"),
      ]);
      setDecks(d);
      setFolders(f);
      setSavedThemes(t);
      setCreationDrafts(drafts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  const go = (s: Section) => {
    setSection(s);
    setQuery("");
    setSidebar(false);
  };
  const openSettings = (tab: "profile" | "ai") => {
    profileMenu.current?.hidePopover();
    profileButton.current?.focus();
    setSettingsTab(tab);
    setModal("settings");
  };
  const create = (id = "blank", theme = "studio") => {
    setCreationTheme(null);
    setTemplate(id);
    setNewTheme(theme);
    setModal("new");
  };
  async function act(deck: DeckSummary, action: string) {
    setMenu(null);
    setError("");
    try {
      if (action === "duplicate") {
        await api(`/decks/${deck.id}/duplicate`, json("POST", {}));
      } else if (action === "rename" || action === "delete") {
        setTarget(deck);
        setModal(action);
        return;
      } else {
        await api(
          `/decks/${deck.id}`,
          json("PATCH", {
            baseRevision: deck.revision,
            operations: [
              {
                type: "document.update",
                patch: {
                  status:
                    action === "archive"
                      ? "archived"
                      : action === "trash"
                        ? "trashed"
                        : "active",
                },
              },
            ],
          }),
        );
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function formSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (modal === "new") {
        const doc = await api<FrameDocument>(
          "/decks",
          json("POST", {
            title: data.get("title"),
            template,
            themeId: newTheme,
            ...(creationTheme ? { theme: creationTheme } : {}),
          }),
        );
        if (section.startsWith("folder:"))
          await api(
            `/decks/${doc.id}`,
            json("PATCH", {
              baseRevision: doc.revision,
              operations: [
                {
                  type: "document.update",
                  patch: { folderId: section.slice(7) },
                },
              ],
            }),
          );
        navigate(`/deck/${doc.id}`);
        return;
      }
      if (modal === "folder") {
        await api("/folders", json("POST", { name: data.get("name") }));
      }
      if (modal === "rename" && target)
        await api(
          `/decks/${target.id}`,
          json("PATCH", {
            baseRevision: target.revision,
            operations: [
              { type: "document.update", patch: { title: data.get("title") } },
            ],
          }),
        );
      if (modal === "delete" && target)
        await api(`/decks/${target.id}`, { method: "DELETE" });
      setModal(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = decks
    .filter(
      (d) =>
        d.status ===
          (section === "archived"
            ? "archived"
            : section === "trashed"
              ? "trashed"
              : "active") &&
        (!section.startsWith("folder:") || d.folderId === section.slice(7)) &&
        d.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const title =
    section === "all"
      ? "Your presentations"
      : section === "archived"
        ? "Archive"
        : section === "trashed"
          ? "Trash"
          : ["templates", "themes"].includes(section)
            ? "Themes"
            : folders.find((f) => `folder:${f.id}` === section)?.name ||
              "Presentations";
  return (
    <div className={`workspace ${sidebar ? "sidebar-open" : ""}`}>
      <aside className="workspace-sidebar">
        <Brand />
        <button
          className="workspace-switch"
          onClick={() => openSettings("profile")}
        >
          <span className="workspace-avatar">{user.name[0].toUpperCase()}</span>
          <span>
            {user.name.split(" ")[0]}’s workspace
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <button
          className="button primary sidebar-create"
          onClick={() => create()}
        >
          <Plus size={19} />
          New presentation
        </button>
        <nav aria-label="Workspace">
          <button
            className={section === "all" ? "active" : ""}
            onClick={() => go("all")}
          >
            <PanelsTopLeft size={18} />
            Presentations
            <span>{decks.filter((d) => d.status === "active").length}</span>
          </button>
          <button
            className={
              ["themes", "templates"].includes(section) ? "active" : ""
            }
            onClick={() => go("themes")}
          >
            <Palette size={18} />
            Themes
          </button>
          <div className="sidebar-label">
            <span>Folders</span>
            <IconButton label="New folder" onClick={() => setModal("folder")}>
              <Plus size={16} />
            </IconButton>
          </div>
          {folders.length ? (
            folders.map((f) => (
              <button
                key={f.id}
                className={section === `folder:${f.id}` ? "active" : ""}
                onClick={() => go(`folder:${f.id}`)}
              >
                <Folder size={17} />
                {f.name}
              </button>
            ))
          ) : (
            <button className="folder-empty" onClick={() => setModal("folder")}>
              <FolderPlus size={17} />
              Create your first folder
            </button>
          )}
          <div className="nav-spacer" />
          <button
            className={section === "archived" ? "active" : ""}
            onClick={() => go("archived")}
          >
            <Archive size={18} />
            Archive
          </button>
          <button
            className={section === "trashed" ? "active" : ""}
            onClick={() => go("trashed")}
          >
            <Trash2 size={18} />
            Trash
          </button>
        </nav>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="mobile-only">
            <IconButton
              label={sidebar ? "Close navigation" : "Open navigation"}
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? (
                <PanelLeftClose size={20} />
              ) : (
                <PanelLeftOpen size={20} />
              )}
            </IconButton>
          </div>
          <span className="workspace-breadcrumb">
            Workspace <span className="breadcrumb-slash">/</span>{" "}
            {section === "all" ? "Presentations" : title}
          </span>
          <div className="workspace-account">
            <CreditBalance {...creditState} compact />
            <button
              ref={profileButton}
              className="profile-button"
              aria-label="Profile menu"
              popoverTarget={profileMenuId}
              title={user.name}
            >
              {user.name[0].toUpperCase()}
            </button>
            <div
              ref={profileMenu}
              id={profileMenuId}
              popover="auto"
              className="profile-menu"
              onToggle={(event) => {
                if (!event.currentTarget.matches(":popover-open")) return;
                const anchor = profileButton.current?.getBoundingClientRect();
                if (anchor)
                  event.currentTarget.style.top = `${anchor.bottom + 8}px`;
              }}
            >
              <div className="profile-menu-identity">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <button onClick={() => openSettings("profile")}>
                <Settings size={17} /> Account settings
              </button>
              <button onClick={() => openSettings("ai")}>
                <Sparkles size={17} /> AI settings
              </button>
              {creditState.credits?.isAdmin && (
                <button onClick={() => navigate("/admin")}>
                  <ShieldCheck size={17} /> Admin · Users
                </button>
              )}
              <button className="profile-signout" onClick={onSignout}>
                <LogOut size={17} /> Sign out
              </button>
            </div>
          </div>
        </header>
        <main className="workspace-main">
          {section === "all" && !query && (
            <CreateFeature
              busy={busy}
              onCreate={async () => {
                setBusy(true);
                try {
                  const draft = await api<CreationDraft>(
                    "/creation",
                    json("POST", {}),
                  );
                  navigate(`/create/${draft.id}`);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              onBlank={() => void create()}
              onTemplates={() => go("templates")}
            />
          )}
          {section === "all" && !query && creationDrafts.length > 0 && (
            <section
              className="creation-draft-list"
              aria-label="Creation drafts"
            >
              <h2>Continue creating</h2>
              {creationDrafts.slice(0, 4).map((d) => (
                <button key={d.id} onClick={() => navigate(`/create/${d.id}`)}>
                  <FileText size={18} />
                  <span>
                    <strong>{d.data.brief.topic || "Untitled idea"}</strong>
                    <small>{dateLabel(d.updatedAt)}</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </section>
          )}
          <div className="section-heading">
            <div>
              <h2>{title}</h2>
              {["themes", "templates"].includes(section) && (
                <p>
                  Find your visual style or start with a ready-to-edit
                  structure.
                </p>
              )}
              {section === "trashed" && (
                <p>Restore a presentation or delete it permanently.</p>
              )}
            </div>
            {section === "themes" && (
              <button
                className="button primary"
                onClick={() => setDesignLibrary(true)}
              >
                Design library & brand kits
              </button>
            )}
            {!["themes", "templates"].includes(section) && (
              <div className="library-tools">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Search presentations"
                    placeholder="Search presentations"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <select
                  aria-label="Sort presentations"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="modified">Last modified</option>
                  <option value="created">Date created</option>
                  <option value="name">Name A–Z</option>
                </select>
                <div className="segmented">
                  <IconButton
                    label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <LayoutGrid size={17} />
                  </IconButton>
                  <IconButton
                    label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List size={18} />
                  </IconButton>
                </div>
              </div>
            )}
          </div>
          {["themes", "templates"].includes(section) && (
            <div
              className="design-library-tabs"
              role="tablist"
              aria-label="Themes and templates"
            >
              {(["themes", "templates"] as const).map((item) => (
                <button
                  key={item}
                  id={`library-${item}-tab`}
                  role="tab"
                  aria-selected={section === item}
                  aria-controls={`library-${item}-panel`}
                  tabIndex={section === item ? 0 : -1}
                  onClick={() => go(item)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "themes"
                        : event.key === "End"
                          ? "templates"
                          : item === "themes"
                            ? "templates"
                            : "themes";
                    go(next);
                    document.getElementById(`library-${next}-tab`)?.focus();
                  }}
                >
                  {item === "themes" ? (
                    <Palette size={16} />
                  ) : (
                    <LayoutGrid size={16} />
                  )}
                  {item === "themes" ? "Themes" : "Templates"}
                </button>
              ))}
            </div>
          )}
          {error && !modal && (
            <ErrorMessage>
              {error} <button onClick={load}>Try again</button>
            </ErrorMessage>
          )}
          {section === "templates" ? (
            <div
              className="template-grid"
              id="library-templates-panel"
              role="tabpanel"
              aria-labelledby="library-templates-tab"
            >
              {templateChoices.map((t) => {
                const doc = makeDocument(
                  "preview",
                  "preview",
                  t.name,
                  t.id,
                  t.theme,
                );
                return (
                  <button
                    className="template-card"
                    key={t.id}
                    onClick={() => create(t.id, t.theme)}
                  >
                    <div
                      className={`template-preview ${t.id === "blank" ? "blank-preview" : ""}`}
                    >
                      {t.id === "blank" ? (
                        <Plus size={38} />
                      ) : (
                        <AutoSlide doc={doc} slide={doc.slides[0]} />
                      )}
                    </div>
                    <div>
                      <h3>
                        {t.name}
                        <ArrowUpRight size={18} />
                      </h3>
                      <p>{t.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : section === "themes" ? (
            <div
              className="theme-library"
              id="library-themes-panel"
              role="tabpanel"
              aria-labelledby="library-themes-tab"
            >
              {savedThemes.map((item) => {
                const theme = item.theme,
                  doc = {
                    ...designPreview,
                    themeId: theme.id,
                    themes: [theme],
                  };
                return (
                  <button
                    key={item.id}
                    className="theme-library-card"
                    onClick={() => {
                      setCreationTheme(theme);
                      setNewTheme(theme.id);
                      setTemplate("story");
                      setModal("new");
                    }}
                  >
                    <AutoSlide doc={doc} slide={doc.slides[0]} />
                    <h3>
                      {theme.name}
                      <span>
                        {item.canEdit
                          ? "Your saved theme"
                          : "Shared with workspace"}
                      </span>
                    </h3>
                    <p>{theme.description}</p>
                    <span className="text-link">
                      Create with this theme <ArrowRight size={15} />
                    </span>
                  </button>
                );
              })}
              {THEMES.map((t) => {
                const doc = makeDocument(
                  "preview",
                  "preview",
                  "",
                  "story",
                  t.id,
                );
                return (
                  <button
                    key={t.id}
                    className="theme-library-card"
                    onClick={() => create("story", t.id)}
                  >
                    <AutoSlide doc={doc} slide={doc.slides[0]} />
                    <h3>
                      {t.name}
                      <span>{t.family}</span>
                    </h3>
                    <p>{t.description}</p>
                    <span className="text-link">
                      Create with this theme <ArrowRight size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : loading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Presentation size={40} strokeWidth={1.2} />
              <h3>
                {query
                  ? "No matching presentations."
                  : section === "trashed"
                    ? "A clean slate."
                    : section === "archived"
                      ? "Nothing in the archive."
                      : "Make room for your first idea."}
              </h3>
              <p>
                {query
                  ? "Try a different title."
                  : section === "trashed"
                    ? "Presentations you move to trash will appear here."
                    : section === "archived"
                      ? "Archive work you want to keep for later."
                      : "Start from scratch, or borrow a little structure."}
              </p>
              {!query && !["trashed", "archived"].includes(section) && (
                <button className="button primary" onClick={() => create()}>
                  <Plus size={18} />
                  New presentation
                </button>
              )}
            </div>
          ) : (
            <div className={`deck-library ${view}`}>
              {filtered.map((deck) => (
                <article className="deck-card" key={deck.id}>
                  <button
                    className="deck-cover"
                    onClick={() =>
                      navigate(
                        `/${deck.accessRole === "viewer" ? "review" : "deck"}/${deck.id}`,
                      )
                    }
                    aria-label={`Open ${deck.title}`}
                  >
                    <div className="deck-cover-inner">
                      <AutoSlide doc={deck} slide={deck.cover} />
                    </div>
                    <span className="cover-open">
                      <ArrowUpRight size={22} />
                    </span>
                  </button>
                  <div className="deck-info">
                    <button
                      className="deck-name"
                      onClick={() =>
                        navigate(
                          `/${deck.accessRole === "viewer" ? "review" : "deck"}/${deck.id}`,
                        )
                      }
                    >
                      {deck.title}
                    </button>
                    <span className="deck-meta">
                      {deck.slideCount} slides
                      {deck.accessRole && deck.accessRole !== "owner" && (
                        <span className="shared-role">
                          {" "}
                          · {deck.accessRole}
                        </span>
                      )}{" "}
                      <span>·</span> {dateLabel(deck.updatedAt)}
                    </span>
                    <span className="deck-created">
                      Created {dateLabel(deck.createdAt)}
                    </span>
                  </div>
                  <div className="deck-menu-wrap">
                    <IconButton
                      disabled={
                        deck.accessRole !== undefined &&
                        deck.accessRole !== "owner"
                      }
                      label={`Actions for ${deck.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(menu === deck.id ? null : deck.id);
                      }}
                    >
                      <MoreHorizontal size={21} />
                    </IconButton>
                    {menu === deck.id && (
                      <div
                        className="dropdown"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {deck.status === "trashed" ? (
                          <>
                            <button onClick={() => act(deck, "restore")}>
                              <Archive size={16} />
                              Restore presentation
                            </button>
                            <button
                              className="danger"
                              onClick={() => act(deck, "delete")}
                            >
                              <Trash2 size={16} />
                              Delete permanently
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => act(deck, "rename")}>
                              <Pencil size={16} />
                              Rename
                            </button>
                            <button onClick={() => act(deck, "duplicate")}>
                              <Copy size={16} />
                              Duplicate
                            </button>
                            <button
                              onClick={() =>
                                act(
                                  deck,
                                  deck.status === "archived"
                                    ? "restore"
                                    : "archive",
                                )
                              }
                            >
                              <Archive size={16} />
                              {deck.status === "archived"
                                ? "Restore to workspace"
                                : "Archive"}
                            </button>
                            <button
                              className="danger"
                              onClick={() => act(deck, "trash")}
                            >
                              <Trash2 size={16} />
                              Move to trash
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {section === "all" && !query && filtered.length > 0 && (
            <div className="workspace-footnote">
              <span className="status-dot" />
              All yours. Every element in the sample presentations is editable.
            </div>
          )}
        </main>
      </div>
      {designLibrary && (
        <Suspense fallback={<Loading label="Opening design library…" />}>
          <ThemeLibrary
            doc={designPreview}
            initial={THEMES[0]}
            onChoose={(theme) => {
              setCreationTheme(theme);
              setNewTheme(theme.id);
              setTemplate("story");
              setModal("new");
            }}
            onClose={() => {
              setDesignLibrary(false);
              void load();
            }}
          />
        </Suspense>
      )}
      {modal && (
        <Modal
          title={
            modal === "new"
              ? "A new presentation."
              : modal === "folder"
                ? "Make a little room."
                : modal === "rename"
                  ? "Rename presentation"
                  : modal === "delete"
                    ? "Delete this presentation?"
                    : "Your account"
          }
          onClose={() => {
            if (!busy) {
              setModal(null);
              setError("");
            }
          }}
        >
          {modal === "settings" ? (
            <AccountSettings
              initialTab={settingsTab}
              user={user}
              onUser={onUser}
              externalAccountUrl={externalAccountUrl}
              onBusyChange={setBusy}
            />
          ) : (
            <form onSubmit={formSubmit} className="modal-form">
              {modal === "new" && (
                <>
                  <label>
                    Presentation name
                    <input
                      autoFocus
                      name="title"
                      defaultValue={
                        template === "blank"
                          ? "Untitled presentation"
                          : templateChoices.find((t) => t.id === template)?.name
                      }
                      required
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Starting point
                    <select
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                    >
                      {templateChoices.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Theme
                    <select
                      value={newTheme}
                      onChange={(e) => {
                        setNewTheme(e.target.value);
                        setCreationTheme(
                          savedThemes.find((t) => t.theme.id === e.target.value)
                            ?.theme || null,
                        );
                      }}
                    >
                      {THEMES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · {t.family}
                        </option>
                      ))}
                      {savedThemes.map((t) => (
                        <option key={t.id} value={t.theme.id}>
                          {t.theme.name} · Saved theme
                        </option>
                      ))}
                      {creationTheme &&
                        !savedThemes.some(
                          (t) => t.theme.id === creationTheme.id,
                        ) && (
                          <option value={creationTheme.id}>
                            {creationTheme.name} · Custom theme
                          </option>
                        )}
                    </select>
                  </label>
                  <p className="muted">
                    You can change the theme and add slides at any time.
                  </p>
                </>
              )}
              {modal === "folder" && (
                <label>
                  Folder name
                  <input
                    autoFocus
                    name="name"
                    placeholder="e.g. My next semester"
                    required
                    maxLength={80}
                  />
                </label>
              )}
              {modal === "rename" && (
                <label>
                  Presentation name
                  <input
                    autoFocus
                    name="title"
                    defaultValue={target?.title}
                    required
                    maxLength={200}
                  />
                </label>
              )}
              {modal === "delete" && (
                <p>
                  “{target?.title}” and its revision history will be permanently
                  deleted. This cannot be undone.
                </p>
              )}
              {error && <ErrorMessage>{error}</ErrorMessage>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setModal(null);
                    setError("");
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className={`button ${modal === "delete" ? "destructive" : "primary"}`}
                  disabled={busy}
                >
                  {busy
                    ? "Saving…"
                    : modal === "new"
                      ? "Create presentation"
                      : modal === "delete"
                        ? "Delete permanently"
                        : modal === "folder"
                          ? "Create folder"
                          : "Save changes"}
                  {modal === "new" && <ArrowRight size={17} />}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
