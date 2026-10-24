import type { AIJob } from "../../shared/ai";

export function creationProgress(job: AIJob, hasSources = false) {
  const researchStages = job.webResearch
    ? [
        {
          title: "Research the web",
          detail:
            "Muse is searching for public sources and gathering linked excerpts before writing. Research is saved and reused for the slides.",
        },
      ]
    : [];
  const researchOffset = researchStages.length;
  const researching = job.progress.step === "Searching the web";
  if (job.totalSlides !== undefined) {
    const visualReview = job.reviewedSlides !== undefined;
    const stages = [
      ...researchStages,
      {
        title: "Plan the visual story",
        detail:
          "The AI is choosing an independent visual direction for each slide.",
      },
      {
        title: "Compose and illustrate",
        detail:
          "Designing small batches of editable text, shapes, paths, and diagrams. Completed previews appear below as they are validated.",
      },
      ...(visualReview
        ? [
            {
              title: "Review and refine visuals",
              detail:
                "Muse inspects rendered slide images, fixes visible layout problems, then looks again. Generated slides stay saved throughout.",
            },
          ]
        : []),
      {
        title: "Ready to review",
        detail:
          "Every completed slide is saved. You can return later or resume unfinished work after a failure.",
      },
    ];
    return {
      stages,
      current:
        job.status === "succeeded"
          ? stages.length
          : job.progress.step.includes("retry")
            ? -1
            : researching
              ? 0
              : researchOffset +
                (/Reviewing visuals|Rendering slides for visual review|Rechecking visuals|Fixing layout/.test(
                  job.progress.step,
                ) ||
                (job.reviewedSlides !== undefined &&
                  job.completedSlides === job.totalSlides)
                  ? 2
                  : (job.completedSlides || 0) > 0 ||
                      /Designing slides|Drawing|Checking|Refining/.test(
                        job.progress.step,
                      )
                    ? 1
                    : 0),
      waitingForAI: job.status === "running",
    };
  }
  const preparingStory =
    job.kind !== "outline" &&
    job.progress.percent >= 30 &&
    job.progress.percent < 40;
  const stages =
    job.kind === "outline"
      ? [
          ...researchStages,
          {
            title: hasSources ? "Reading your sources" : "Reading the brief",
            detail: "Preparing your idea and the context you included.",
          },
          {
            title: "Writing the story",
            detail:
              "The AI is building the opening, key points, and conclusion. The complete outline arrives in one response.",
          },
          {
            title: "Ready for your edits",
            detail:
              "You’ll review the structure before any slides are created.",
          },
        ]
      : [
          ...researchStages,
          {
            title: preparingStory ? "Writing the story" : "Reading the story",
            detail: preparingStory
              ? "The AI is turning your brief into a story before writing the slides. The outline arrives as one response."
              : "Preparing the reviewed outline and your source material.",
          },
          {
            title: "Writing the slides",
            detail:
              "The AI is writing the slide headlines and supporting copy. The complete set arrives in one response.",
          },
          {
            title: "Styling the slides",
            detail:
              "Applying your chosen theme to editable text, shapes, and data.",
          },
          {
            title: "Checking the details",
            detail:
              "Rendering the slides to check text fits before opening your preview.",
          },
        ];
  const current =
    job.status === "succeeded"
      ? stages.length
      : job.status === "queued"
        ? -1
        : researching
          ? 0
          : researchOffset +
            (job.kind === "outline"
              ? job.progress.percent >= 95
                ? 2
                : job.progress.percent >= 30
                  ? 1
                  : 0
              : job.progress.percent >= 90
                ? 3
                : job.progress.percent >= 80
                  ? 2
                  : job.progress.percent >= 40
                    ? 1
                    : 0);

  return {
    stages,
    current,
    waitingForAI:
      job.status === "running" &&
      (researching || current === researchOffset + 1 || preparingStory),
  };
}

export function elapsedSeconds(createdAt: string, now: number) {
  const started = Date.parse(createdAt);
  return Number.isFinite(started)
    ? Math.max(0, Math.floor((now - started) / 1000))
    : 0;
}
export function elapsedLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
