import type { FrameDocument, Slide } from "./schema";
export type PublicDocument = Pick<
  FrameDocument,
  "version" | "id" | "title" | "width" | "height" | "themeId" | "themes"
> & { slides: Omit<Slide, "notes" | "sourceSupport">[] };
export type Publication = {
  id: string;
  presentationId: string;
  visibility: "private" | "unlisted" | "public";
  allowDownload: boolean;
  revision: number;
  documentRevision: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};
export type PublishedView = {
  downloadsState: "disabled" | "preparing" | "ready" | "failed";
  publication: Omit<Publication, "presentationId" | "revokedAt">;
  document: PublicDocument;
  author: string;
  downloads: {
    format: import("./exports").ExportFormat;
    href: string;
    bytes: number;
  }[];
};
export function publicProjection(
  doc: FrameDocument,
  assetUrl: (id: string) => string,
): PublicDocument {
  const mapAsset = (value: string | undefined) =>
    value?.startsWith("/api/assets/")
      ? assetUrl(value.slice("/api/assets/".length))
      : value;
  return {
    version: doc.version,
    id: doc.id,
    title: doc.title,
    width: doc.width,
    height: doc.height,
    themeId: doc.themeId,
    themes: doc.themes
      .filter(
        (theme) =>
          theme.id === doc.themeId ||
          doc.slides.some((s) => s.themeId === theme.id),
      )
      .map(({ brandRules, ...theme }) => theme),
    slides: doc.slides.map(({ notes, sourceSupport, ...slide }) => ({
      ...slide,
      interactions: slide.interactions.filter(
        (i) => i.action !== "feedback" && i.trigger !== "answer",
      ),
      elements: slide.elements
        .filter((el) => !el.hidden)
        .map((el) => {
          const copy = { ...el, src: mapAsset(el.src) };
          if (el.media)
            copy.media = { ...el.media, poster: mapAsset(el.media.poster) };
          if (el.question) {
            const { correctIndex, explanation, ...question } = el.question;
            copy.question = question;
          }
          return copy;
        }),
    })),
  };
}
export function referencedAssets(doc: FrameDocument): string[] {
  return [
    ...new Set(
      doc.slides
        .flatMap((s) =>
          s.elements
            .filter(
              (el) =>
                !el.hidden && (el.type === "image" || el.type === "video"),
            )
            .flatMap((el) => [el.src, el.media?.poster]),
        )
        .filter((v): v is string => !!v?.startsWith("/api/assets/"))
        .map((v) => v.slice("/api/assets/".length)),
    ),
  ];
}
