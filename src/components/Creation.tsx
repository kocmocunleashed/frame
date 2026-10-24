import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  type User,
  type Theme,
  type FrameDocument,
  documentSchema,
  uid,
} from "../../shared/schema";
import { type AIJob, type CreationDraft, type Outline } from "../../shared/ai";
import type { SavedTheme } from "../../shared/design-library";
import { THEMES } from "../../shared/themes";
import { makeDocument } from "../../shared/templates";
import { api, json, navigate } from "../lib/api";
import { useCreationDraft } from "../lib/useCreationDraft";
import { Brand, ErrorMessage, Loading } from "./UI";
import SourcePicker from "./SourcePicker";
import OutlineEditor from "./OutlineEditor";
const ThemeLibrary = lazy(() => import("./ThemeLibrary"));
import { DEFAULT_CREATION_THEME } from "../../shared/featured-themes";
import { themeSurface } from "../lib/theme-surface";
import Brief, { BriefDetails } from "./creation/Brief";
import ThemeStage from "./creation/ThemeStage";
import CreationJob from "./creation/Job";
import SlideReview from "./creation/SlideReview";
import ResearchSummary from "./creation/ResearchSummary";
import type { WebResearch } from "../../shared/ai-research";
import ProgressivePreviews from "./ProgressivePreviews";
import CreditBalance, { useCredits } from "./CreditBalance";
type Step = "brief" | "look" | "sources" | "outline" | "preview";
export default function Creation({ id, user }: { id: string; user: User }) {
  const creditState = useCredits();
  const state = useCreationDraft(id, user.id),
    { draft } = state;
  const [step, setStep] = useState<Step>("brief"),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState<boolean | null>(null),
    [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]),
    [jobs, setJobs] = useState<Record<string, AIJob>>({}),
    [library, setLibrary] = useState(false),
    [jobConnectionLost, setJobConnectionLost] = useState(false),
    [browsedTheme, setBrowsedTheme] = useState<Theme | null>(null);
  const primary = useRef<HTMLElement>(null);
  const initialized = useRef(false),
    previewBase = useMemo(
      () => makeDocument(user.id, user.workspaceId, "Preview", "story"),
      [user.id, user.workspaceId],
    );
  async function loadConfig() {
    try {
      const [status, themes] = await Promise.all([
        api<{ configured: boolean }>("/ai/status"),
        api<SavedTheme[]>("/themes"),
      ]);
      setConfigured(status.configured);
      setSavedThemes(themes);
    } catch (err) {
      state.setError((err as Error).message);
    }
  }
  useEffect(() => {
    void loadConfig();
  }, []);
  useEffect(() => {
    if (draft && !initialized.current) {
      initialized.current = true;
      let remembered: Step = "brief";
      try {
        const saved = sessionStorage.getItem(
          `frame:creation-step:${user.id}:${id}`,
        );
        if (
          (saved === "look" || saved === "sources") &&
          draft.data.brief.topic.trim().length >= 3
        )
          remembered = saved;
      } catch {
        /* Draft data and job recovery remain available without browser storage. */
      }
      setStep(
        draft.data.generationJobId
          ? "preview"
          : draft.data.outline || draft.data.outlineJobId
            ? "outline"
            : remembered,
      );
    }
  }, [draft]);
  useEffect(() => {
    if (!draft || !initialized.current) return;
    try {
      sessionStorage.setItem(`frame:creation-step:${user.id}:${id}`, step);
    } catch {}
  }, [step, !!draft, id, user.id]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const heading = primary.current?.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [step, !!draft]);
  const themes = useMemo(() => {
    const values = [
      ...THEMES,
      ...savedThemes.map((t) => t.theme),
      ...(draft ? [draft.data.theme] : []),
    ];
    return [...new Map(values.map((t) => [t.id, t])).values()];
  }, [savedThemes, draft?.data.theme]);
  const jobIds = [draft?.data.outlineJobId, draft?.data.generationJobId]
    .filter(Boolean)
    .join(",");
  useEffect(() => {
    if (!jobIds) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const values = await Promise.all(
          jobIds.split(",").map((jobId) => api<AIJob>(`/jobs/${jobId}`)),
        );
        if (stopped) return;
        setJobConnectionLost(false);
        setJobs(Object.fromEntries(values.map((j) => [j.id, j])));
        if (values.some((j) => j.status === "running" || j.status === "queued"))
          timer = setTimeout(() => void poll(), 1000);
      } catch (err) {
        if (stopped) return;
        setJobConnectionLost(true);
        timer = setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobIds]);
  const outlineJob = jobs[draft?.data.outlineJobId || ""],
    generationJob = jobs[draft?.data.generationJobId || ""];
  const outlineResult =
    outlineJob?.status === "succeeded"
      ? (outlineJob.result as { outline: Outline }).outline
      : null;
  const preview = useMemo(() => {
    if (generationJob?.status !== "succeeded") return null;
    const parsed = documentSchema.safeParse(
      (generationJob.result as { document: unknown }).document,
    );
    return parsed.success ? parsed.data : null;
  }, [generationJob?.result, generationJob?.status]);
  async function begin(kind: "outline" | "generate", resumeJobId?: string) {
    if (!draft) return;
    setBusy(true);
    state.setError("");
    try {
      if (kind === "generate" && outlineResult && !draft.data.quickDraft)
        state.patch({ outline: outlineResult, outlineJobId: null });
      const saved = await state.save();
      if (!saved) return;
      const result = await api<{ draft: CreationDraft; job: AIJob }>(
        `/creation/${id}/jobs`,
        json("POST", {
          revision: saved.revision,
          kind,
          key: uid(),
          designVersion: kind === "generate" ? 2 : undefined,
          resumeJobId,
        }),
      );
      state.acceptServer(result.draft);
      setJobs((old) => ({ ...old, [result.job.id]: result.job }));
      setStep(kind === "outline" ? "outline" : "preview");
    } catch (err) {
      state.setError((err as Error).message);
    } finally {
      creditState.refresh();
      setBusy(false);
    }
  }
  async function changeStep(next: Step) {
    setBusy(true);
    try {
      if (
        step === "look" &&
        browsedTheme &&
        (browsedTheme.id !== draft?.data.theme.id ||
          browsedTheme.artVersion !== draft?.data.theme.artVersion)
      )
        state.patch({ theme: browsedTheme });
      if (await state.save()) setStep(next);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(job: AIJob) {
    try {
      const result = await api<AIJob>(
        `/jobs/${job.id}/cancel`,
        json("POST", {}),
      );
      setJobs((old) => ({ ...old, [result.id]: result }));
    } catch (err) {
      state.setError((err as Error).message);
    }
  }
  async function finish() {
    if (!draft || !generationJob) return;
    setBusy(true);
    try {
      if (!(await state.save())) return;
      const doc = await api<FrameDocument>(
        `/creation/${id}/finish`,
        json("POST", { jobId: generationJob.id }),
      );
      navigate(`/deck/${doc.id}`);
    } catch (err) {
      state.setError((err as Error).message);
    } finally {
      creditState.refresh();
      setBusy(false);
    }
  }
  if (!draft)
    return (
      <main className="page-error">
        {state.status === "loading" ? (
          <Loading label="Opening creation draft…" />
        ) : (
          <>
            <ErrorMessage>{state.error}</ErrorMessage>
            <button className="button primary" onClick={state.load}>
              Try again
            </button>
          </>
        )}
      </main>
    );
  const data = draft.data,
    outline = data.outlineJobId
      ? outlineResult
      : data.outline ||
        (generationJob?.status === "succeeded"
          ? (generationJob.result as { outline: Outline }).outline
          : null),
    active = [outlineJob, generationJob].some(
      (j) => j && (j.status === "running" || j.status === "queued"),
    );
  const shellTheme =
    step === "brief"
      ? DEFAULT_CREATION_THEME
      : step === "look"
        ? browsedTheme || data.theme
        : data.theme;
  return (
    <div
      className={`creation-page creation-studio direction-${shellTheme.artDirection || "custom"} stage-${step}`}
      style={themeSurface(shellTheme)}
      data-theme={shellTheme.id}
    >
      <header className="creation-header">
        <button
          className="text-button"
          onClick={async () => {
            await state.save();
            navigate("/");
          }}
        >
          <ArrowLeft size={17} /> Workspace
        </button>
        <Brand small />
        <span className={`creation-save ${state.status}`} role="status">
          {state.status === "saved"
            ? "Draft saved"
            : state.status === "offline"
              ? "Offline · kept on this device"
              : state.status === "failed"
                ? "Save failed · draft preserved"
                : "Saving draft…"}
        </span>
      </header>
      <main className="creation-main">
        <CreditBalance {...creditState} />
        <nav className="creation-steps" aria-label="Presentation creation">
          {(
            [
              { id: "brief", label: "Idea" },
              { id: "look", label: "Look" },
              { id: "sources", label: "Context" },
              { id: "outline", label: "Story" },
              { id: "preview", label: "Slides" },
            ] as const
          ).map((item, i) => (
            <button
              key={item.id}
              aria-current={step === item.id ? "step" : undefined}
              disabled={
                busy ||
                !!state.recovery ||
                ((item.id === "look" || item.id === "sources") &&
                  data.brief.topic.trim().length < 3) ||
                (item.id === "outline" && !outline && !outlineJob) ||
                (item.id === "preview" && !generationJob)
              }
              onClick={() => {
                setBrowsedTheme(null);
                void changeStep(item.id);
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </button>
          ))}
        </nav>
        {state.recovery && (
          <div className="creation-recovery">
            <h2>There’s a device draft to recover.</h2>
            <p>
              Recover it as a separate creation draft to preserve this saved
              version.
            </p>
            <button className="button primary" onClick={state.recover}>
              Recover as a separate draft
            </button>
            <button className="button" onClick={state.discardRecovery}>
              Use saved draft
            </button>
          </div>
        )}
        {state.error && (
          <ErrorMessage>
            {state.error}
            {state.conflict ? (
              <button onClick={state.load}>Reload saved draft</button>
            ) : (
              <button onClick={() => void state.save()}>Retry save</button>
            )}
          </ErrorMessage>
        )}
        {configured === false && (
          <div className="ai-setup-state">
            <strong>AI needs a server connection.</strong>
            <p>
              Your idea and sources can be saved now. You can also start a blank
              presentation from the workspace.
            </p>
            <button className="text-button" onClick={loadConfig}>
              Check connection
            </button>
          </div>
        )}
        <fieldset
          className="creation-fieldset"
          disabled={busy || !!state.recovery}
        >
          <section className="creation-primary" key={step} ref={primary}>
            {step === "brief" ? (
              <Brief
                brief={data.brief}
                onChange={(brief) => state.patch({ brief })}
                onNext={() => void changeStep("look")}
              />
            ) : step === "look" ? (
              <ThemeStage
                doc={previewBase}
                themes={themes}
                theme={data.theme}
                topic={data.brief.topic}
                onChange={(theme) => state.patch({ theme })}
                onBrowse={setBrowsedTheme}
                onLibrary={() => setLibrary(true)}
                onNext={() => void changeStep("sources")}
              />
            ) : step === "sources" ? (
              <div className="context-stage">
                <div className="creation-stage-label">
                  A LITTLE MORE TO GO ON.
                </div>
                <h1>Give it some depth.</h1>
                <p className="creation-intro">
                  Bring your own knowledge. Documents, notes, the details that
                  matter.
                </p>
                <div className="context-layout">
                  <div className="context-material">
                    <SourcePicker
                      selected={data.brief.sourceIds}
                      onChange={(sourceIds) =>
                        state.patch({ brief: { ...data.brief, sourceIds } })
                      }
                    />
                  </div>
                  <aside className="context-brief">
                    <span className="creation-stage-label">
                      THE IDEA SO FAR
                    </span>
                    <h2>{data.brief.topic}</h2>
                    <div className="context-brief-meta">
                      <span>{data.brief.slideCount} slides</span>
                      <span>{data.theme.name}</span>
                    </div>
                    <BriefDetails
                      brief={data.brief}
                      onChange={(brief) => state.patch({ brief })}
                    />
                  </aside>
                </div>
                <label className="quick-draft-choice">
                  <input
                    type="checkbox"
                    checked={data.quickDraft}
                    onChange={(e) =>
                      state.patch({ quickDraft: e.target.checked })
                    }
                  />
                  <span>
                    <strong>Make a quick first draft</strong>
                    <small>
                      Skip outline review and go straight to slides.
                    </small>
                  </span>
                </label>
                <div className="creation-actions">
                  <button
                    className="creation-button quiet"
                    onClick={() => void changeStep("look")}
                  >
                    <ArrowLeft size={17} /> Choose a look
                  </button>
                  <button
                    className="creation-button main"
                    disabled={
                      !configured || active || data.brief.sourceIds.length > 10
                    }
                    onClick={() =>
                      void begin(data.quickDraft ? "generate" : "outline")
                    }
                  >
                    {data.quickDraft
                      ? "Generate slide preview"
                      : data.brief.sourceIds.length
                        ? "Build outline"
                        : "Continue without sources"}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ) : step === "outline" ? (
              <div className="story-stage">
                <div className="creation-stage-label">
                  GIVE THE STORY ITS SHAPE.
                </div>
                <h1>
                  {outline ? "Make the story yours." : "A story taking shape."}
                </h1>
                {outline ? (
                  <>
                    <ResearchSummary
                      research={
                        (
                          outlineJob?.result as {
                            research?: WebResearch;
                          } | null
                        )?.research
                      }
                    />
                    <OutlineEditor
                      outline={outline}
                      onChange={(value) =>
                        state.patch({
                          outline: value,
                          quickDraft: false,
                          outlineJobId: null,
                        })
                      }
                    />
                    <div className="creation-actions">
                      <button
                        className="creation-button quiet"
                        onClick={() => void changeStep("sources")}
                      >
                        <ArrowLeft size={16} /> Add context
                      </button>
                      <button
                        className="creation-button quiet"
                        disabled={!configured || active}
                        onClick={() => void begin("outline")}
                      >
                        New outline
                      </button>
                      <button
                        className="creation-button main"
                        disabled={
                          !configured ||
                          active ||
                          outline.sections.some((s) => !s.title.trim())
                        }
                        onClick={() => void begin("generate")}
                      >
                        Generate slide preview <ArrowRight size={18} />
                      </button>
                    </div>
                  </>
                ) : outlineJob ? (
                  <CreationJob
                    job={outlineJob}
                    connectionLost={jobConnectionLost}
                    hasSources={data.brief.sourceIds.length > 0}
                    onCancel={() => void cancel(outlineJob)}
                    onRetry={() =>
                      void begin(
                        "outline",
                        outlineJob.webResearch ? outlineJob.id : undefined,
                      )
                    }
                  />
                ) : (
                  <Loading label="Retrieving outline job…" />
                )}
              </div>
            ) : preview ? (
              <SlideReview
                key={generationJob?.id}
                doc={preview}
                warnings={
                  (generationJob?.result as { warnings?: string[] })
                    ?.warnings || []
                }
                research={
                  (generationJob?.result as { research?: WebResearch } | null)
                    ?.research
                }
                busy={busy}
                canGenerate={!!configured && !active}
                canOutline={!!outline}
                onOutline={() => void changeStep("outline")}
                onRegenerate={() => void begin("generate")}
                onFinish={() => void finish()}
              />
            ) : (
              <div className="story-stage">
                <div className="creation-stage-label">
                  FROM WORDS TO SOMETHING MORE.
                </div>
                <h1>Making an impression.</h1>
                {generationJob ? (
                  <CreationJob
                    job={generationJob}
                    connectionLost={jobConnectionLost}
                    onCancel={() => void cancel(generationJob)}
                    onRetry={() =>
                      void begin(
                        "generate",
                        generationJob.totalSlides !== undefined
                          ? generationJob.id
                          : undefined,
                      )
                    }
                  />
                ) : (
                  <Loading label="Retrieving generation job…" />
                )}
                {generationJob && (
                  <ProgressivePreviews
                    key={generationJob.id}
                    job={generationJob}
                    base={previewBase}
                  />
                )}
              </div>
            )}
          </section>
        </fieldset>
      </main>
      {library && (
        <Suspense fallback={<Loading label="Opening designs…" />}>
          <ThemeLibrary
            doc={previewBase}
            initial={data.theme}
            onChoose={(theme) => {
              state.patch({ theme });
              setBrowsedTheme(theme);
            }}
            onClose={() => {
              setLibrary(false);
              void loadConfig();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
