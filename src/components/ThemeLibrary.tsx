import { lazy, Suspense, useEffect, useState } from "react";
import { Plus, Copy, Trash2, Check } from "lucide-react";
import { uid, type FrameDocument, type Theme } from "../../shared/schema";
import type {
  BrandKit,
  SavedBrandKit,
  SavedTheme,
} from "../../shared/design-library";
import { api, json } from "../lib/api";
import { Modal, ErrorMessage, IconButton } from "./UI";
import ThemeDesigner, { ThemePreview } from "./ThemeDesigner";
import BrandKitEditor from "./BrandKitEditor";
const AIThemeBuilder = lazy(() => import("./AIThemeBuilder"));
export default function ThemeLibrary({
  doc,
  initial,
  onChoose,
  onInsertLogo,
  onClose,
}: {
  doc: FrameDocument;
  initial: Theme;
  onChoose: (t: Theme) => void;
  onInsertLogo?: (k: BrandKit) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"themes" | "brand-kits">("themes"),
    [themes, setThemes] = useState<SavedTheme[]>([]),
    [kits, setKits] = useState<SavedBrandKit[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [aiOpen, setAIOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>({
      ...initial,
      id: uid(),
      name: `${initial.name} copy`.slice(0, 80),
      custom: true,
    }),
    [kit, setKit] = useState<BrandKit>({
      name: "My brand",
      colors: initial.colors,
      headingFont: initial.headingFont,
      bodyFont: initial.bodyFont,
      rules: "",
      logo: null,
    });
  const [themeEdit, setThemeEdit] = useState<{
      id: string;
      revision: number;
    } | null>(null),
    [kitEdit, setKitEdit] = useState<{ id: string; revision: number } | null>(
      null,
    );
  const editing = tab === "themes" ? themeEdit : kitEdit,
    value = tab === "themes" ? theme : kit,
    item =
      tab === "themes"
        ? themes.find((t) => t.id === themeEdit?.id)
        : kits.find((k) => k.id === kitEdit?.id),
    canEdit = !editing || item?.canEdit;
  async function load() {
    setLoading(true);
    try {
      const result = await Promise.all([
        api<SavedTheme[]>("/themes"),
        api<SavedBrandKit[]>("/brand-kits"),
      ]);
      setThemes(result[0]);
      setKits(result[1]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const changeTheme = (t: Theme) => {
    setTheme({ ...t, id: uid(), custom: true });
    setStatus("");
  };
  const changeKit = (k: BrandKit) => {
    setKit(k);
    setStatus("");
  };
  const duplicate = () => {
    if (tab === "themes") {
      setThemeEdit(null);
      setTheme({
        ...theme,
        id: uid(),
        name: `${theme.name} copy`.slice(0, 80),
      });
    } else {
      setKitEdit(null);
      setKit({ ...kit, name: `${kit.name} copy`.slice(0, 80) });
    }
    setStatus("Copy ready to save.");
    setError("");
  };
  async function save() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await api<SavedTheme | SavedBrandKit>(
        `/${tab}${editing ? `/${editing.id}` : ""}`,
        json(editing ? "PUT" : "POST", {
          [tab === "themes" ? "theme" : "kit"]: value,
          ...(editing ? { revision: editing.revision } : {}),
        }),
      );
      if ("theme" in result) {
        setTheme(result.theme);
        setThemeEdit({ id: result.id, revision: result.revision });
      } else {
        setKit(result.kit);
        setKitEdit({ id: result.id, revision: result.revision });
      }
      await load();
      setStatus(
        "Saved to workspace. Existing presentations keep their embedded design.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api(`/${tab}/${editing.id}`, { method: "DELETE" });
      if (tab === "themes") setThemeEdit(null);
      else setKitEdit(null);
      await load();
      setStatus(
        "Removed from library. Applied designs remain in their presentations.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const preview =
    tab === "themes"
      ? theme
      : { ...initial, id: "brand-preview", ...kit, custom: true };
  return (
    <Modal title="Design library" wide onClose={onClose}>
      <div
        className="design-library-tabs"
        role="tablist"
        aria-label="Design resources"
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? "themes"
                : e.key === "End"
                  ? "brand-kits"
                  : tab === "themes"
                    ? "brand-kits"
                    : "themes";
            setTab(next);
            document
              .getElementById(next === "themes" ? "theme-tab" : "brand-tab")
              ?.focus();
          }
        }}
      >
        <button
          role="tab"
          id="theme-tab"
          aria-controls="design-resource-panel"
          aria-selected={tab === "themes"}
          tabIndex={tab === "themes" ? 0 : -1}
          onClick={() => {
            setTab("themes");
            setError("");
            setStatus("");
          }}
        >
          Saved themes
        </button>
        <button
          role="tab"
          id="brand-tab"
          aria-controls="design-resource-panel"
          aria-selected={tab === "brand-kits"}
          tabIndex={tab === "brand-kits" ? 0 : -1}
          onClick={() => {
            setTab("brand-kits");
            setError("");
            setStatus("");
          }}
        >
          Brand kits
        </button>
      </div>
      <div
        className="design-library"
        id="design-resource-panel"
        role="tabpanel"
        aria-labelledby={tab === "themes" ? "theme-tab" : "brand-tab"}
      >
        <aside className="design-resource-list">
          <p className="eyebrow">WORKSPACE LIBRARY</p>
          {tab === "themes" && (
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => setAIOpen(true)}
            >
              Describe a theme
            </button>
          )}
          <button
            type="button"
            className="button full"
            disabled={busy}
            onClick={() => {
              if (tab === "themes") {
                setThemeEdit(null);
                setTheme({
                  ...initial,
                  id: uid(),
                  name: "Untitled theme",
                  custom: true,
                });
              } else {
                setKitEdit(null);
                setKit({
                  name: "Untitled brand",
                  colors: initial.colors,
                  headingFont: initial.headingFont,
                  bodyFont: initial.bodyFont,
                  rules: "",
                  logo: null,
                });
              }
              setError("");
              setStatus("");
            }}
          >
            <Plus size={16} />
            New {tab === "themes" ? "theme" : "brand kit"}
          </button>
          {loading ? (
            <p role="status">Loading designs…</p>
          ) : (
            <>
              {(tab === "themes" ? themes : kits).length === 0 && (
                <p className="hint">Your first reusable design starts here.</p>
              )}
              {tab === "themes"
                ? themes.map((t) => (
                    <button
                      className={`design-resource ${themeEdit?.id === t.id ? "active" : ""}`}
                      key={t.id}
                      disabled={busy}
                      onClick={() => {
                        setTheme(t.theme);
                        setThemeEdit({ id: t.id, revision: t.revision });
                        setError("");
                        setStatus("");
                      }}
                    >
                      <span className="palette-dots">
                        {Object.values(t.theme.colors)
                          .slice(0, 4)
                          .map((c, i) => (
                            <i key={i} style={{ background: c }} />
                          ))}
                      </span>
                      <strong>{t.theme.name}</strong>
                      <small>
                        {t.canEdit ? "Your theme" : "Shared with workspace"}
                      </small>
                    </button>
                  ))
                : kits.map((k) => (
                    <button
                      className={`design-resource ${kitEdit?.id === k.id ? "active" : ""}`}
                      disabled={busy}
                      key={k.id}
                      onClick={() => {
                        setKit(k.kit);
                        setKitEdit({ id: k.id, revision: k.revision });
                        setError("");
                        setStatus("");
                      }}
                    >
                      <strong>{k.kit.name}</strong>
                      <small>
                        {k.canEdit ? "Your brand kit" : "Shared with workspace"}
                      </small>
                    </button>
                  ))}
            </>
          )}
          <button
            type="button"
            className="text-button"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Reload library
          </button>
          <p className="hint">
            Library updates are separate from deck revisions. Select a saved
            item to load its latest version.
          </p>
        </aside>
        <div className="design-resource-editor">
          <ThemePreview theme={preview} doc={doc} />
          <div className="design-resource-toolbar">
            <button
              className="button"
              type="button"
              onClick={duplicate}
              disabled={busy}
            >
              <Copy size={15} />
              Make a copy
            </button>
            {editing && canEdit && (
              <IconButton
                label={
                  tab === "themes" ? "Delete saved theme" : "Delete brand kit"
                }
                disabled={busy}
                onClick={remove}
              >
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={busy || !canEdit} className="design-fieldset">
              {tab === "themes" ? (
                <ThemeDesigner theme={theme} onChange={changeTheme} />
              ) : (
                <BrandKitEditor kit={kit} onChange={changeKit} />
              )}
            </fieldset>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            {status && (
              <p className="design-save-status" role="status">
                <Check size={16} />
                {status}
              </p>
            )}
            <div className="design-actions">
              <button
                className="button primary"
                disabled={busy || !canEdit || !value.name.trim()}
              >
                {busy
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : tab === "themes"
                      ? "Save theme"
                      : "Save brand kit"}
              </button>
              <button
                className="button"
                type="button"
                disabled={busy || !value.name.trim()}
                onClick={() => {
                  onChoose(
                    tab === "themes"
                      ? theme
                      : {
                          ...initial,
                          id: uid(),
                          name: kit.name,
                          colors: kit.colors,
                          headingFont: kit.headingFont,
                          bodyFont: kit.bodyFont,
                          brandRules: kit.rules,
                          custom: true,
                        },
                  );
                  onClose();
                }}
              >
                {tab === "themes" ? "Use theme" : "Use brand styling"}
              </button>
              {tab === "brand-kits" && kit.logo && onInsertLogo && (
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    onInsertLogo(kit);
                    onClose();
                  }}
                >
                  Insert brand logo
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      {aiOpen && (
        <Suspense fallback={<p role="status">Opening AI theme builder…</p>}>
          <AIThemeBuilder
            initial={theme}
            doc={doc}
            onTheme={(value) => {
              setThemeEdit(null);
              changeTheme(value);
              setStatus(
                "AI preview ready. Refine the tokens, then save this as a new theme.",
              );
            }}
            onClose={() => setAIOpen(false)}
          />
        </Suspense>
      )}
    </Modal>
  );
}
