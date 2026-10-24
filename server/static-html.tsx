import { renderToStaticMarkup } from "react-dom/server";
import type { PublicDocument } from "../shared/publications";
import { SlideRenderer } from "../src/components/SlideRenderer";
import { uid } from "../shared/schema";
import { JobFailure } from "./jobs";
import { resolve } from "node:path";
let fontsPromise: Promise<string> | undefined,
  playerSource = "",
  playerCode: string | undefined;
const playerTranspiler = new Bun.Transpiler({
  loader: "ts",
  target: "browser",
  minifyWhitespace: true,
});
async function embeddedFonts(): Promise<string> {
  if (!fontsPromise)
    fontsPromise = (async () => {
      const styles = [];
      for (const [family, file] of [
        ["@fontsource-variable/dm-sans", "index.css"],
        ["@fontsource-variable/manrope", "index.css"],
        ["@fontsource-variable/space-grotesk", "index.css"],
        ["@fontsource-variable/syne", "index.css"],
        ["@fontsource-variable/fraunces", "index.css"],
        ["@fontsource-variable/nunito", "index.css"],
        ["@fontsource/barlow-condensed", "700.css"],
        ["@fontsource/barlow-condensed", "800.css"],
      ]) {
        const root = resolve(`node_modules/${family}`);
        let css = await Bun.file(`${root}/${file}`).text();
        const matches = [...css.matchAll(/url\(\.\/files\/([^\)]+)\)/g)];
        for (const match of matches) {
          const bytes = await Bun.file(
            `${root}/files/${match[1]}`,
          ).arrayBuffer();
          css = css.replace(
            match[0],
            `url(data:${match[1].endsWith(".woff2") ? "font/woff2" : "font/woff"};base64,${Buffer.from(bytes).toString("base64")})`,
          );
        }
        styles.push(css);
      }
      return styles.join("\n");
    })();
  return fontsPromise;
}
async function playerBundle(): Promise<string> {
  if (process.env.NODE_ENV === "production" && playerCode) return playerCode;
  const source = await Bun.file(
    new URL("../src/portable.ts", import.meta.url),
  ).text();
  if (!playerCode || source !== playerSource) {
    // This fixed player is deliberately self-contained. Transpiling one file
    // avoids starting the runtime bundler for every fit/export in development.
    const scanned = playerTranspiler.scan(source);
    if (scanned.imports.length || scanned.exports.length)
      throw new JobFailure("The portable player must remain self-contained.");
    playerCode = `(()=>{${playerTranspiler.transformSync(source)}})();`;
    playerSource = source;
  }
  return playerCode;
}
const safeJSON = (value: unknown) =>
  JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
export async function staticHTML(
  doc: PublicDocument,
  assets: Record<string, string>,
  portable = false,
): Promise<string> {
  const fonts = await embeddedFonts(),
    css = await Bun.file(new URL("../src/slide.css", import.meta.url)).text(),
    nonce = uid();
  const prepared: PublicDocument = {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((el) => ({
        ...el,
        src: el.src?.startsWith("/api/assets/")
          ? el.src.replace("/api/assets/", "/__frame_assets/")
          : el.src,
        media: el.media
          ? {
              ...el.media,
              autoplay: false,
              poster: el.media.poster?.replace(
                "/api/assets/",
                "/__frame_assets/",
              ),
            }
          : undefined,
      })),
    })),
  };
  let slides = doc.slides
    .map(
      (slide, i) =>
        `<section data-export-slide="${i}"${portable && i ? " hidden" : ""} style="width:${doc.width}px;height:${doc.height}px">${renderToStaticMarkup(<SlideRenderer doc={prepared} slide={prepared.slides[i]} staticMedia={!portable} playing={portable} />)}</section>`,
    )
    .join("");
  slides = slides
    .replace(/<link\b[^>]*rel="preload"[^>]*>/g, "")
    .replace(
      /(src|poster)="\/__frame_assets\/([a-zA-Z0-9-]+)"/g,
      (_match, kind, id) => `data-frame-${kind}="${id}"`,
    );
  const model = {
    width: doc.width,
    height: doc.height,
    portable,
    slides: doc.slides.map((s) => ({
      id: s.id,
      title: s.title,
      steps: Object.fromEntries(
        s.elements
          .filter((e) => e.animation)
          .map((e) => [e.id, e.animation!.step]),
      ),
      animations: Object.fromEntries(
        s.elements.filter((e) => e.animation).map((e) => [e.id, e.animation]),
      ),
      autoplay: s.elements
        .filter((e) => e.type === "video" && e.media?.autoplay)
        .map((e) => e.id),
      interactions: s.interactions.filter(
        (i) => i.action !== "feedback" && i.trigger !== "answer",
      ),
    })),
  };
  const title = doc.title
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const player = await playerBundle();
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>${fonts}\n*{box-sizing:border-box}body{margin:0;font-family:'DM Sans Variable',sans-serif}h1,h2,h3,p{margin:0}${css}\n[data-export-slide]{position:relative;overflow:hidden;break-after:page;break-inside:avoid}[data-export-slide]:last-of-type{break-after:auto}[data-export-slide][hidden]{display:none!important}.portable{background:#181b17;color:#edf1e8;overflow:hidden}.portable:not([data-ready]) [data-export-slide]{visibility:hidden}.portable [data-export-slide]{position:absolute;left:50%;top:calc(50% - 15px);transform-origin:center}.portable-nav{position:fixed;bottom:0;left:0;right:0;padding:12px;display:flex;justify-content:center;align-items:center;gap:12px;background:#181b17;flex-wrap:wrap;font-size:12px}.portable-nav button,#frame-overview button{font:inherit;min-height:44px;padding:10px 13px;border:1px solid #697164;border-radius:5px;background:#293325;color:#fff;cursor:pointer}.portable-nav button:disabled{opacity:.45}button:focus-visible,a:focus-visible{outline:3px solid #a7c5ff;outline-offset:3px}#frame-overview{max-width:85vw;max-height:85vh;background:#f9f9f6;border:0;border-radius:10px;padding:20px}#frame-overview button{display:block;width:100%;text-align:left;margin:6px 0}#frame-progress{position:fixed;left:0;bottom:0;height:3px;background:#c9ff65}.portable-note{position:fixed;top:12px;left:16px;right:16px;text-align:center;font-size:11px;color:#c2c9c3}@page{size:${doc.width}px ${doc.height}px;margin:0}@media print{.portable-nav,.portable-note,#frame-progress{display:none!important}}\n</style></head><body class="${portable ? "portable" : "print"}">${portable ? `<div class="portable-note">${title} · Standalone copy · Live audience features require a hosted session</div>` : ""}${slides}${portable ? '<nav class="portable-nav" aria-label="Presentation controls"><button id="frame-previous">Previous</button><span id="frame-counter" aria-live="polite"></span><button id="frame-next">Next</button><button id="frame-open-overview">Slides</button><button id="frame-fullscreen">Full screen</button></nav><dialog id="frame-overview" aria-label="Slide overview"></dialog><div id="frame-progress"></div><noscript>This presentation needs JavaScript for navigation. Use PDF for a static copy.</noscript>' : ""}<script type="application/json" nonce="${nonce}" id="frame-model">${safeJSON(model)}</script><script type="application/json" nonce="${nonce}" id="frame-assets">${safeJSON(assets)}</script><script nonce="${nonce}">${player}</script></body></html>`;
  if (Buffer.byteLength(html) > 70 * 1024 * 1024)
    throw new JobFailure(
      "This standalone document exceeds 70 MB. Reduce media sizes before exporting.",
    );
  return html;
}
