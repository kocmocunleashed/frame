# Frame: build the whole application from scratch


This is a standalone build brief for recreating the entire Frame application in a new, empty repository: the frontend, editor, renderer, backend, database, AI workflows, jobs, file handling, authentication, collaboration, publishing, exports, live audience experience, administration, erxes plugins, tests, and infrastructure. Use AWS for hosting and services, MongoDB for application data, and support both standalone and erxes-connected operation. Build the product itself, including every described screen and workflow.

Assume the builder receives only this file. The original repository, existing components, SQL database, screenshots, private environment files, and deployed services are not prerequisites. Implement missing modules from the contracts and behavior below. Existing-source paths are optional reference labels. Migration is optional and applies only if old data is supplied; a fresh installation must initialize and run without importing anything.

The expected output is a complete runnable application and deployment package. A plan, scaffold, landing page, static dashboard, architecture diagram, partial editor, or provider adapter alone does not fulfill this brief. Implement in stages for verification, but keep every required capability in scope through final delivery.

Product details were extracted from the reference application, including its erxes integration and account preferences. That reference uses React/Vite, Bun/Hono, Neon PostgreSQL, Clerk or erxes authentication, Vercel Blob, and Vercel Queues. These historical hosting choices explain migration notes; they are not dependencies of the new application. Start the new implementation directly on the AWS/MongoDB architecture described here. This document does not claim that the rebuild or deployment has already been performed.

Statements labeled **target** are decisions for the rebuild. Descriptions of the current source establish the behavior to preserve. Historical SQLite, free-model-only, ten-theme, and twenty-three-theme descriptions in older documents are not the current source inventory. Do not infer production readiness from those historical verification records.

Reading guide: sections 1–9 describe the product and its invariants; 10–13 specify AWS, MongoDB, jobs, and storage; 14 defines erxes compatibility; 15–19 cover APIs, implementation, configuration, optional migration, and operations; 20–24 define verification, delivery order, optional source references, and routes; 25–27 supply from-scratch implementation contracts, the complete theme seed data, and the final delivery checklist.

## 1. Build objective and scope

Build the complete Frame experience: turn a topic, documents, or a blank canvas into an editable deck; revise it manually or with AI; present it with private notes; run audience questions; collaborate through sharing and review; publish a stable edition; export usable files; return later and continue.

Support two deployment modes with the same presentation services:

1. **Standalone Frame:** users authenticate through Clerk and receive their own Frame workspace.
2. **erxes-connected Frame:** users open Frame from erxes through the `frame_api` and `frame_ui` source plugins. erxes authenticates and authorizes the launch; Frame issues its own short-lived session and enforces presentation permissions.

The erxes mode is a required deliverable. It is not a link to an unrelated sign-in screen, a shared administrator login, or a decorative iframe. It must open the actual editor with the correct user identity and retain work across launches.

Use Bun for dependency installation and project scripts. Build with React, TypeScript, Vite, Hono, Zod, DOM/SVG rendering, Tiptap, and Playwright. Evaluate existing libraries for rich text, geometry interaction, extraction, and export before implementing equivalents. If the reference repository is available, reuse suitable code; otherwise implement the same behavior in the new project. Use the official MongoDB driver and AWS SDK rather than inventing database or queue protocols.

AWS hosts the application, files, workers, queues, logs, and secrets. MongoDB Atlas deployed on AWS is the default database. Clerk and the configured AI provider remain external services. "AWS compatible" does not imply that every third-party service must be replaced with an AWS product. Cognito and Bedrock are possible later adapters, not prerequisites for parity.

## 2. Product rules that must survive the rebuild

- Manual creation, editing, presentation, and export work without AI credentials.
- Generated slides are typed, editable objects, not a collection of slide screenshots.
- Themes, layouts, templates, and brand kits have different responsibilities.
- Applying a theme preserves geometry and explicit overrides unless the user explicitly resets them.
- AI edits have a visible scope. Broad changes produce a preview and apply as a normal undoable operation.
- Failed requests, browser reloads, cancelled jobs, and worker restarts preserve existing work.
- Saves use revisions and conflicts. Concurrent editors never silently overwrite each other.
- Publication is an explicit snapshot. Editing the working deck does not change a published edition.
- Public viewers and audience clients never receive private notes, hidden answer keys, private source evidence, or unused private theme instructions.
- Permissions are checked on every server resource, including media, job results, exports, and live controls.
- Repeated queue messages and repeated save clicks do not duplicate decks, votes, charges, or published editions.
- UI controls perform real actions. Empty, loading, failed, offline, expired, and denied states are part of each feature.
- Describe export limits honestly: the current PowerPoint format contains slide images, not editable PowerPoint objects.
- erxes launch permissions do not make every launched user a Frame administrator or grant access to other people's decks.

## 3. Users and primary journeys

Users include students, teachers, trainers, founders, teams, speakers, and creators. Desktop is the main authoring environment. Tablet editing must support touch. Shared viewing and audience participation must work on a phone.

| Journey                      | Required result                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign in or launch from erxes | Resolve a verified identity, open the correct workspace, and show recoverable errors if authentication fails.                              |
| Start from blank             | Create a deck, edit text/shapes/images, save, reload, and present without AI.                                                              |
| Start from an idea           | Enter a brief, choose a theme, review an outline or use quick draft, generate, review previews, and explicitly save a deck.                |
| Start from sources           | Upload/paste material, inspect extraction and warnings, select included sources, generate grounded content, and retain evidence privately. |
| Refine a deck                | Edit directly, request scoped AI changes, inspect differences, apply, undo, redo, and reload.                                              |
| Apply a visual identity      | Choose a curated theme, create a custom theme, generate a theme, or apply a brand kit without destroying content.                          |
| Deliver                      | Rehearse or present fullscreen with notes, timer, next slide, reveals, media, and optional live questions.                                 |
| Collaborate                  | Grant viewer/editor access, comment, resolve/reopen comments, show presence, and preserve conflicting work.                                |
| Publish/export               | Publish a stable private/unlisted/public edition, control downloads, republish, revoke, and export PDF/PNG ZIP/HTML/PPTX.                  |
| Administer credits           | Search users, set a finite or unlimited balance, reject stale changes, and audit adjustments.                                              |

First-run standalone examples must be clearly illustrative and editable. In erxes mode, a new identity receives an empty personal workspace, matching the current integration. Do not copy another tenant's examples, files, or identities.

## 4. Screen and navigation specification

Keep these browser routes or provide explicit tested compatibility redirects:

| Route                     | Screen and behavior                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | Authentication when signed out; workspace when signed in. erxes mode instead explains how to reopen Frame from erxes when its session expires. |
| `/create/:id`             | Persistent creation draft with brief, source selection, theme, outline, job progress, review, resume, and finish.                              |
| `/deck/:id`               | Full editor for owners/editors. Viewers use the filtered review experience.                                                                    |
| `/review/:id`             | Readable slide review, comments, resolve actions according to role, and presence.                                                              |
| `/present/:id`            | Presenter/rehearsal view with private notes and optional live controls.                                                                        |
| `/view/:id`               | Published edition with access and download policy.                                                                                             |
| `/join` and `/join/:code` | Mobile audience join and current session. No Frame account required.                                                                           |
| `/explore`                | Explicitly public publications only.                                                                                                           |
| `/admin`                  | Presentation credit management for configured Frame administrator IDs.                                                                         |
| erxes `/frame`            | Host navigation entry that launches the embedded studio and provides a new-tab fallback.                                                       |

### Workspace

Use a sidebar, a compact page header, clear creation actions, and actual deck previews. Provide recent decks, search, sorting, filters, grid/list views, folders, rename, duplicate, archive, trash, restore, and permanent deletion from trash. Show ownership/access role so a shared deck is not mistaken for a personal copy. Preserve the theme library, brand kit management, reusable compositions, account settings, and sign-out.

Create actions include blank, story, pitch, and lesson templates, plus the AI creation flow. A template supplies initial content and layout; it is not a theme. Lists must have useful empty states and retain search/filter state during ordinary edits. An error loading decks must not look like an empty workspace.

### Creation studio

Progress through brief, sources, theme, outline, generation, and review. Keep the draft server-side and a local recovery copy. Permit navigation away and return without restarting a job. The brief contains topic, audience, outcome, slide count, language, tone, requirements, source IDs, optional web research, and a snapshot of `agent.md` instructions.

Allow outline title/section editing, section reorder/add/remove, and explicit quick draft. Show extraction status and source text before inclusion. Generation displays completed-slide previews, current stage, warnings, retry/cancel/resume, and an explicit finish action. Progress must come from persisted work, not a timer animation. A finish request is idempotent and returns the saved deck.

### Editor

Use a document header, insert toolbar, slide rail, canvas stage, contextual inspector, notes, and save state. The existing design uses an approximately 64px document bar and 48px toolbar. Collapse secondary panels on smaller screens. Keep the actual canvas usable when the inspector is hidden.

Support selection, double-click text editing, marquee selection, modifier multi-selection, move/resize/rotate, snapping/guides, grouping, ungrouping, locks, layer order, layer selection for occluded objects, clipboard, duplication, delete, keyboard nudging, alignment, distribution, matching dimensions, zoom, fit, undo, redo, and touch gestures. Pointer movement is transient; commit one operation at the end of a gesture. Text entry may coalesce nearby edits into a useful undo step.

Slide actions include insert, delete, duplicate, reorder, title/notes editing, layout choice, dimensions, background, and theme scope. Keep at least one slide. Offer visible overflow diagnosis and explicit repairs: expand box, reduce size, shorten, or split. Do not silently shrink manual content.

### Account settings and credits

Profile changes save through the API. Standalone account security uses Clerk controls; erxes users return to the host for host account management.

For standalone mode, retain signup/sign-in, verification, password reset, configured social providers, account controls, and sign-out through the chosen Clerk instance. Verify token signature, expiry, intended authorized party, subject, and session claims server-side. Require a verified primary email as the current resolver does. Provision Frame users/workspaces through a stable provider subject or an administrator-imported external ID; an unresolved imported identity is a migration error. Never auto-link an existing workspace by matching email. New user provisioning, membership, examples, and initial unlimited credit state must be idempotent under simultaneous first requests. Show unavailable sign-in configuration as an error, not a successful empty session.

Presentation AI settings support a selectable or typed language, editable Markdown instructions, Markdown import/download, and saving defaults. Limit custom instructions to 12,000 characters. New drafts copy the current defaults. Existing drafts and queued jobs retain their own settings. An explicit language selection overrides conflicting instructions inside `agent.md`. Preserve names and source quotations; do not translate schema keys or identifiers.

Show remaining presentation credits or unlimited status. One credit is consumed when a completed AI presentation is first saved into the workspace. Preview generation does not reserve credits. Zero blocks new slide generation and saving an uncharged result, while manual creation, editing, and exports remain available. Failure/cancellation does not charge; deleting a saved deck does not refund. A changed balance can prevent finish even if generation started earlier, so retain the result for later completion.

Admin users can search accounts and set an exact integer balance from 0 through 1,000,000 or unlimited (`null`). Every change includes the previous balance revision and records actor, old/new balances, and time. Never infer admin status from an email address, the first signup, or erxes host role.

## 5. Visual design, themes, and accessibility

Preserve Frame's warm neutral workspace, dark text, orange actions, blue focus indicators, and bold deck canvases. The user's preference is strong contrast and bold color. Use expressive color where it helps the presentation, with restrained tooling around the canvas.

Existing shell tokens:

| Token          | Value                                        |
| -------------- | -------------------------------------------- |
| Paper          | `#f9f9f6`                                    |
| White surface  | `#ffffff`                                    |
| Ink            | `#242724`                                    |
| Secondary text | `#626760`                                    |
| Separator      | `#dedfd8`                                    |
| Inset          | `#f0f1ec`                                    |
| Primary orange | `#c44120`                                    |
| Focus blue     | `#204bcf`                                    |
| Sidebar        | `244px` at desktop widths                    |
| UI fonts       | DM Sans; Manrope for selected headings/brand |

Bundle supported font files so previews, exports, and offline HTML render consistently. Current dependencies include DM Sans, Manrope, Space Grotesk, Syne, Fraunces, Nunito, and Barlow Condensed. Keep explicit system fallbacks. Custom font upload is not an existing supported capability.

A theme contains semantic background/foreground/accent/secondary/surface/muted colors; heading/body fonts; weight and type scale; spacing; radius; border; material; background treatment; shadow; motion; optional art direction/version and brand rules. The applied deck embeds immutable theme snapshots. Editing a saved library theme does not retroactively change existing decks.

Scope theme application to the current slide, selected slides, or whole deck. Explicit overrides survive. Reset-to-theme is a separate undoable operation. Layout changes preserve compatible content and are distinct from theme application. Reusable compositions store editable objects and dimensions, not raster thumbnails alone. Brand kits hold logos, palette, permitted fonts, and writing/design rules with ownership checks.

The current source exports **46 curated themes**. Preserve stable IDs on import and migration:

| IDs                                                                                                 | Names                                                                      |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `studio`, `mono`, `neon`, `glass`, `editorial`                                                      | Electric blue; In black & white; After hours; Deep water; Sunday paper     |
| `brutalist`, `playful`, `corporate`, `organic`, `retro`                                             | Loud & clear; Good company; Clear direction; Common ground; Future archive |
| `look-monochrome`, `look-rage`, `look-liquid`, `look-material`, `look-future`                       | Monochrome; Rage; Liquid glass; Material You; Retro future                 |
| `look-y2k`, `look-nostalgia`, `look-clay`, `look-terminal`, `look-bauhaus`                          | Y2K; Nostalgia; Clay; Terminal; Bauhaus                                    |
| `look-pop`, `look-blueprint`, `look-deco`, `look-memphis`, `look-editorial`                         | Pop Art; Blueprint; Art Deco; Memphis; Editorial                           |
| `look-thinking-space`, `look-limbo`, `look-sonic-wave`, `look-ransom-ink`                           | Thinking Space II; LIMBO; Sonic Wave Infinity; Ransom Ink                  |
| `look-beatmap`, `look-street-radio`, `look-save-point`, `look-warehouse`                            | Beatmap; Street Radio; Save Point; Warehouse                               |
| `look-melt-eyez`, `look-brat`, `look-hard-soft`, `look-question-mark`, `look-i-am-you`, `look-igor` | Melt My Eyez; brat; Hard & Soft; ? — XXXTENTACION; I Am You; IGOR          |
| `look-hunter`, `look-league`, `look-phoenix`, `look-viper`, `look-reyna`, `look-neon`, `look-yoru`  | Hunter × Hunter; League of Legends; Phoenix; Viper; Reyna; Neon; Yoru      |

Preserve the existing palette/composition data when source is available. For a clean implementation, recreate each direction with original editable geometry and its named visual character. Do not depend on copied album artwork, game assets, or logos. Theme previews must show real representative title, content, comparison, chart, and closing slides, not one generic card with a different color.

Use labeled icon buttons, visible focus, keyboard navigation, accessible dialogs, descriptive errors, adequate contrast, alternative text, and reduced-motion support. The canvas needs equivalent inspector/layer/keyboard controls for important editing actions. Audience controls need comfortable touch targets. Test at desktop, tablet, and narrow mobile widths; a scaled screenshot is not a mobile interface. Automated accessibility checks complement keyboard and screen-reader review.

## 6. Canonical presentation document

Use a versioned Zod schema shared by browser, API, worker, renderer, import/export, and tests. Serialize API dates as ISO-8601 UTC strings and store database dates as BSON `Date`. Preserve existing string IDs; do not require clients to understand MongoDB ObjectIds.

```ts
type FrameDocument = {
  version: 1 | 2;
  id: string;
  ownerId: string;
  workspaceId: string;
  title: string;
  width: number;
  height: number;
  themeId: string;
  themes: Theme[];
  slides: Slide[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  folderId: string | null;
  status: "active" | "archived" | "trashed";
  description: string;
  language: string;
};

type Slide = {
  id: string;
  title: string;
  layout: string;
  themeId?: string;
  background?: string;
  notes: string;
  elements: FrameElement[];
  interactions: Interaction[];
  sourceSupport?: {
    reviewRequired?: boolean;
    evidence: {
      sourceId: string;
      sourceName: string;
      url?: string;
      quote?: string;
      claim: string;
    }[];
    suggestions: string[];
  };
};
```

The declarations explain the contract; the complete validation rules belong in the shared schemas. The rebuild must accept existing valid version-1/version-2 documents through a deterministic migration layer. New incompatible data requires a new schema version and tested reader migration.

### Geometry and elements

Default scene geometry is 1280 × 720. Documents allow width/height 300–4000. Preserve slide order and element order explicitly. Every slide/element ID is unique across a document; interaction IDs are also unique. References to themes, slides, elements, groups, and assets must resolve.

Every element has ID, type, name, x/y, width/height, rotation, opacity, locked/hidden flags, optional group ID, and accessibility metadata. Existing geometry permits x/y from -4000 to 8000, width/height 5–8000, rotation -360–360, and opacity 0–1. Decorative bleed can extend beyond the slide; generated reading content must remain inside it.

| Element  | Editable data and controls                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text     | Plain text plus typed rich-text tree; font role/family/size/weight; emphasis; alignment; line height; letter spacing; semantic/literal color; safe hyperlinks.            |
| Shape    | Rectangle, rounded rectangle, circle, ellipse, triangle, polygon, star, spark, bubble, arrow, blob, line, or typed path; fill/gradient, stroke, radius, shadow, material. |
| Image    | Authorized asset or validated HTTPS URL; alt text, contain/cover, crop x/y/zoom, aspect lock, opacity, border/radius.                                                     |
| Icon     | Whitelisted icon identifier, color, size, geometry. Keep icons as vectors.                                                                                                |
| Table    | Rectangular string cell matrix, optional header; up to 30 rows × 12 columns, 1,000 characters per cell.                                                                   |
| Chart    | Bar, line, donut; up to 12 label/value records, show-values setting; finite numbers and nonnegative donut values.                                                         |
| Diagram  | Process, cycle, hierarchy; 2–8 uniquely identified nodes.                                                                                                                 |
| Video    | Media source, optional authorized poster, autoplay/loop/muted; range-capable delivery and a static export fallback.                                                       |
| Question | Multiple choice, poll, true/false; prompt, 2–8 options, optional correct index/explanation. Polls have no correct answer; true/false has exactly two options.             |
| Timeline | Horizontal, vertical, alternating; 2–8 milestones with IDs, dates, labels, descriptions.                                                                                  |

Rich text supports doc/paragraph/text/bulletList/orderedList/listItem/hardBreak and bold/italic/underline/strike/link marks. Limit total text to 30,000 characters, tree depth to 12, and nodes to 2,000. Do not store arbitrary HTML. Link protocols are restricted to supported HTTP(S), mailto, tel, and anchors; reject script URLs.

Typed vector paths support M/L/Q/C/Z, begin with M, and have at most 256 commands per path. AI scene illustration complexity is also bounded across the scene. Do not execute raw SVG scripts or model-generated JavaScript.

Animation supports none/fade/rise/slide/scale, step 0–100, delay 0–10,000ms, and duration 50–5,000ms. Current elapsed time, hover, playing state, selection, zoom, and panel positions are transient editor/presenter state, not saved document revisions.

### Operations and history

Preserve these operation names and semantics:

- `text.set`: replace plain/rich text on the specified object.
- `element.update`: apply a validated partial patch to selected IDs on one slide.
- `element.reset`: remove explicit styling overrides for selected elements.
- `element.insert`, `element.delete`, `element.order`: change elements with referential validation.
- `slide.insert`, `slide.delete`, `slide.update`, `slide.order`: change ordered slides and their metadata.
- `theme.apply`: embed/apply a theme to the stated scope.
- `document.update`: change allowed metadata, status, folder, or dimensions.

Apply an operation batch to a validated base document, validate the result, and save atomically with an expected revision. A successful save advances the revision exactly once. Reject stale revisions with HTTP 409 and keep the local changes. Server-owned IDs, ownership, timestamps, and access rights cannot be reassigned through a document payload.

Undo/redo works for manual and applied AI changes. Keep bounded durable revisions; the present revision API exposes up to 80. Restoring an old revision creates a new current revision rather than moving the revision counter backward. Local recovery is scoped to user/workspace/deck and is cleared or isolated on sign-out so another account cannot inherit it.

### Product limits and target resource limits

Preserve 1–200 slides, up to 400 elements and 200 interactions per slide, up to 100 embedded themes, 200-character deck titles, and 30,000-character notes. AI briefs request 3–30 slides; edited outlines may contain 1–30 sections. Sources are capped at ten selected uploads per brief, 10MiB per source file, and 200,000 extracted/pasted characters per source. Media uploads are capped at 50MiB; the current multipart request limit is 52MiB. Existing job payloads are limited to approximately two million serialized characters and five active root jobs per user.

Retain the current 120,000-character combined selected-source context limit, at most 100 saved designs per workspace per theme/brand-kit resource, and at most two active live sessions per host. Enforce these through shared validation and atomic quota guards where concurrent requests can race. Explain the limit in the UI before submitting expensive work.

**Target:** also measure UTF-8/BSON sizes, not only character counts. Set an initial 32MiB assembled document JSON limit and show a clear 413 error before committing. This is a new operational bound: preflight all existing decks during migration and raise or redesign it before cutover if valid data exceeds it. Never silently truncate a document. Large uploads bypass the JSON API through the authorized S3 upload flow.

## 7. AI generation and source handling

Keep a provider interface with configuration/capability flags, structured generation, optional web research, optional image inputs, and cancellation. Existing adapters include OpenRouter, OpenAI, and Token Router; the documented deployed configuration uses OpenRouter Muse Contributor. Runtime capability flags decide which features are offered. Unconfigured AI shows an actionable state while manual tools remain usable.

The current code's Muse route is `meta/muse-spark-1.3-contributor`, explicitly enabled, with Meta routing and configured ceilings of $0.10 per million input tokens and $0.20 per million output tokens. These are application policy constants found in source, not a claim about future catalog availability or pricing. Revalidate the provider catalog, allowed route, permissions, and reported usage at runtime. Do not silently switch to another paid model when a model fails. Preserve verified-free rules for free routes. Keep web-search costs in their own bounded allowance. Credentials stay server-side.

### Durable pipeline

1. Persist a validated brief, selected source snapshots, theme, language, instructions, and input hash.
2. Extract and inspect source content in bounded workers. TXT/Markdown, PDF text extraction, and DOCX are supported source paths. Image-only scans need OCR or supplied text; OCR is not silently claimed.
3. If enabled/supported, research the topic. Do not send uploaded private documents or notes as search queries. Only provider citation annotations with actual excerpts become web sources; model-authored URLs are not retrieved evidence. The existing research path retains up to six excerpts, each up to 5,000 characters, with stable source IDs and warnings.
4. Generate an outline with exactly the requested number of sections for the initial response. Users can edit the reviewed outline.
5. Create a design plan and bounded batches of structured scenes. Vary narrative/composition across title, section, comparison, quote, statistics, process, summary, text/image, chart, timeline, team, and question layouts.
6. Convert scene objects into the normal editable document model. Validate IDs, geometry, fonts, colors, chart values, source references, interactions, and all limits.
7. Measure text with the shared renderer. Repair within explicit readable bounds; retain useful detail in notes. Reject malformed results instead of applying them.
8. If available, perform bounded visual review of slide pairs. Persist review results by slide/ordinal so out-of-order completion cannot scramble previews.
9. Assemble validated output and show it for review. Finish creates the deck and charges once in a transaction.

Each stage is checkpointed with an input hash and version. Resume reuses only successful stages whose inputs match. Changes to sources, theme, brief, language, or instructions invalidate dependent stages. Required-stage failure fails the workflow with completed checkpoints retained. Optional web research or visual review failure produces a warning and preserves generated content.

Current provider requests have a 150-second deadline covering catalog lookup and the complete streamed response. Visual review has a 90-second budget per pair and at most two pairs scheduled together per deck. Preserve these as initial worker budgets. ECS does not justify unbounded provider requests. Set separate bounded deadlines for extraction, export, and orchestration, and record duration/timeout reason.

Every factual claim must be linked to actual included evidence or marked as an unverified suggestion. Quotes must match source text. Numeric chart data must be supported; do not invent values for visual interest. Search excerpts are partial evidence. Source text and `agent.md` cannot override schema validation, authorization, allowed scope, or evidence rules. Language instructions control writing, not executable behavior.

### Scoped edits and creative tools

Scopes are selected objects, current slide, selected slides, and whole deck. Include base revision, selected IDs, instruction, authorized source IDs, and an idempotency key. Support the existing edit/regenerate/design/illustrate/animate modes through the same preview/apply flow. Reject operations outside scope, invalid IDs, unrelated insertions, unauthorized assets, or a stale base revision. Illustration uses editable vector/native objects. Animation edits typed motion properties.

AI theme generation accepts a description and, when supported, an authorized reference image. Validate the result, repair contrast where supported, preview representative slides, refine through language/direct controls, save to the theme library, and apply to the chosen scope. Saving a reusable theme and applying it to a deck are separate actions.

## 8. Presentation, audience interaction, and publishing

### Rehearsal and presenter view

Use the same document renderer for editing, thumbnails, rehearsal, presenter, public viewer, and export. Presenter UI includes current/next slide, private speaker notes, timer, progress, overview, keyboard/fullscreen controls, step reveals, and media. Rehearsal works locally with interactions and does not create a public session.

Supported interaction pairs are click→show, click→navigate, answer→feedback, and step→animate. Validate trigger targets and destination IDs. Revealed objects and answers are session state; presenting a deck does not mutate its saved revision. Reduced motion removes interpolation while preserving meaningful reveal steps.

### Live sessions

The host explicitly starts a live session with an immutable deck snapshot, a short human-readable join code, link, and QR code based on `APP_ORIGIN`. Guests join without an account and receive an opaque participant token. Store token hashes. Hosts can navigate, reveal elements, open/close a question, show/hide results, show/hide the correct answer, and end the session.

Persist session version and state: slide index, step, step start time, active question, round, open flag, results visibility, answer visibility, and revealed IDs. Validate navigation against the snapshot, not just numeric ranges. A new round permits a fresh answer. Uniqueness is `(sessionId, round, participantId)`, so duplicate requests cannot add votes. The server validates the option and confirms the round is still open. Closing a question and accepting an answer must have a defined atomic order.

Audience payloads contain only projected content and the participant's own response where allowed. Omit answer keys/explanations until the host reveals them. Results appear only when enabled. Public media routes authorize each asset against that session snapshot. Reconnect uses the latest version and token rather than creating duplicate participants. Expired/ended sessions and invalid codes have clear screens.

**Target:** preserve polling/version-based synchronization first; keep state in MongoDB so multiple API instances work. WebSockets and Redis are not required for parity. Use adaptive polling, backoff, visibility awareness, and shared rate limits. A future push layer must remain a transport for persisted state, not the source of truth.

### Publications and exports

Publication visibility is private, unlisted, or public. Only public editions appear in Explore. Private access requires current authorized membership/grants. Unlisted links are capability-like view links; their IDs must be unguessable. Publishing creates an immutable edition; republishing explicitly replaces the active edition pointer and increments the edition. Revocation blocks subsequent hosted access and downloads, including stale URLs. It cannot erase files already downloaded.

Build public documents through an allowlist projection. Remove notes, sourceSupport, private owner/workspace fields, hidden elements, answer/feedback interactions, correct indices/explanations, and brand rules. Include only used themes and authorized visible assets. Do not send the private document and rely on browser CSS to hide it.

| Format | Required output and limitation                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF    | Static pages at deck aspect ratio; flatten animation, live interaction, and video.                                                                                        |
| Images | One PNG per slide inside a ZIP; appropriate final reveal state.                                                                                                           |
| HTML   | Standalone offline player with embedded fonts/media and supported local interactions; no private notes or answer keys; live participation still needs the hosted service. |
| PPTX   | Image-based slide deck with the correct slide size. Text, charts, and shapes are not editable in PowerPoint.                                                              |

Export requests pin a document revision or publication edition and use idempotency keys. Run Chromium rendering in a worker, wait for fonts/images, constrain network access, and store private files in S3. Use Playwright, Sharp, fflate, and PptxGenJS already present. A single renderer prevents editor/export layout drift. UI shows queued/running/ready/failed states, retry, warnings, and authorized download actions. Browser contexts and temporary files must be closed on success, failure, timeout, and cancellation.

## 9. Sharing and permission model

Owner/editor/viewer are server-enforced roles. Resolve the effective role from ownership, workspace membership, and explicit collaborator grants. Do not accept workspace IDs or role claims from the client as proof of access.

| Action                                       | Owner                            | Editor                               | Viewer / guest                                                           |
| -------------------------------------------- | -------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Read full working document and private notes | Yes                              | Yes                                  | Viewer gets filtered review; guests get publication/audience projection. |
| Edit and save                                | Yes                              | Yes                                  | No                                                                       |
| Request scoped AI edits / editor exports     | Yes                              | Yes, while access remains valid      | No; published downloads only if enabled.                                 |
| Read/add review comments                     | Yes                              | Yes                                  | Authenticated viewer yes; anonymous public guest no.                     |
| Resolve/reopen comments                      | Yes                              | Yes                                  | Authenticated viewer can resolve/reopen their own comment.               |
| Delete comments                              | Own comments or owner moderation | Own comments                         | Own comments                                                             |
| Manage collaborators or publication policy   | Yes                              | No                                   | No                                                                       |
| Permanently delete a deck                    | Yes, after trash                 | No                                   | No                                                                       |
| Host live presentation                       | Yes                              | Yes, with ongoing edit authorization | No                                                                       |
| Change credit balances                       | Configured Frame admin only      | Configured Frame admin only          | No                                                                       |

Retain comments anchored to a slide or element with author, body, timestamps, resolve state, and resolver. Deleting an element should not silently delete its discussion; show a missing-anchor state. Presence includes identity, role, view/edit mode, and last-seen time with expiry. Do not describe presence as collaborative character synchronization.

Optimistic concurrency is the current collaboration model. A losing editor sees a conflict and can reload or preserve their work as an owned recovery copy. Recovery copies use new identities where needed and clone authorized asset metadata. Multiple asset records may refer to the same immutable storage bytes, so garbage collection uses physical-key reachability. Do not introduce periodic whole-document replacement as fake real-time merging. If simultaneous character editing is later required, assess an established CRDT separately.

For the target, permission changes and document commits share a per-resource authorization guard (an epoch/version updated inside transactions). A worker or save that was authorized before revocation must not commit after revocation wins the guard race. Recheck access when starting work, committing results, applying results, and downloading private output.

## 10. AWS target architecture

The selected design uses container services because Frame already needs Bun, background work, Chromium, fonts, and durable job stages. Keep the API and workers separately scalable. There is no requirement to rewrite the application as Lambda functions or Next.js.

```mermaid
flowchart TD
  User[Browser or erxes iframe] --> CDN[CloudFront + TLS]
  CDN --> Static[Private S3: hashed frontend assets]
  CDN --> ALB[Application Load Balancer]
  ALB --> API[ECS Fargate: Bun + Hono API and SPA HTML]
  API --> Mongo[MongoDB Atlas on AWS]
  API --> Files[Private S3: media and exports]
  API --> Outbox[MongoDB outbox]
  Dispatcher[ECS dispatcher] --> Outbox
  Dispatcher --> SQS[SQS jobs + dead-letter queue]
  SQS --> Worker[ECS workers: AI, extraction, rendering]
  Worker --> Mongo
  Worker --> Files
  Worker --> AI[Configured AI provider]
  Schedule[EventBridge Scheduler] --> Sweep[ECS maintenance task]
  Sweep --> Mongo
  Erxes[erxes gateway + frame_api] --> Ticket[Signed single-use launch ticket]
  Ticket --> API
```

| Responsibility  | Current checkout                             | AWS/MongoDB target                                                                 |
| --------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Frontend build  | Vite static output                           | Same Vite build; hashed assets in private S3 through CloudFront.                   |
| SPA HTML        | Vercel routes and studio response            | Hono behind ALB, with runtime erxes CSP and no shared HTML cache.                  |
| API             | Vercel Bun functions / local Bun server      | Stateless ECS Fargate Bun/Hono service.                                            |
| Database        | Neon PostgreSQL; PGlite locally              | MongoDB Atlas replica set on AWS; local MongoDB replica set for tests/development. |
| Media/downloads | Private Blob; existing local/S3 alternatives | Private S3 with IAM task roles and authorization proxy routes.                     |
| Jobs            | Vercel Queue callbacks + PostgreSQL state    | SQS wakeups + MongoDB state, outbox dispatcher, ECS consumers.                     |
| Maintenance     | Hosted cron and request recovery             | Scheduled ECS maintenance plus dispatch/worker recovery.                           |
| Identity        | Clerk or erxes                               | Preserve both deployment modes.                                                    |
| Rendering       | Serverless Chromium or local Chromium        | Pinned container Chromium/Playwright/font stack.                                   |
| Operations      | SQL snapshots and object backups             | MongoDB backups + versioned S3 manifests + tested restore tooling.                 |
| erxes adapter   | Plugin service beside erxes                  | Same host plugin contract; its Frame origin points to AWS.                         |

Use one AWS region for the initial deployment and co-locate Atlas. Select the region for users, data residency, and service availability at provisioning time; do not invent a required region or fixed monthly price. Provide separate dev/staging/production resources and separate erxes tenant deployments. Share an Atlas cluster only with separate databases/users and tested isolation; do not write Frame records into erxes core collections.

AWS resources to define in version-controlled infrastructure code: VPC/subnets/routing/security groups, ALB/listeners/target groups, ECS cluster/services/task definitions, ECR repositories, frontend and private-data buckets, CloudFront origins/behaviors, DNS/certificates, SQS queues/DLQs, IAM roles, secret references, log groups, metrics/alarms, and EventBridge schedules. AWS CDK in TypeScript is the default target infrastructure tool; pin its tested version and keep resource names environment-specific.

### Network, credentials, and routing

Run API and worker tasks in private subnets. Permit API ingress only from the ALB. Provide deliberate egress for Clerk/AI and required downloads, using NAT or appropriate endpoints. The browser has no database credentials. Atlas supports AWS private endpoints on eligible dedicated clusters; use a private-endpoint connection string where available. A restricted public TLS connection from fixed egress addresses is a documented smaller-environment alternative. Confirm cluster tier support at provisioning time. [Atlas private endpoints](https://www.mongodb.com/docs/atlas/security-private-endpoint/?cloud-provider=aws)

Use separate task roles for API, dispatcher, worker, and maintenance. Keep task execution permissions (image pulls/log setup) separate from application permissions. AWS SDK credentials should come from ECS task roles; the current S3 adapter's required static access-key configuration must be changed for this target. Do not bake AWS keys into containers. [ECS task IAM roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)

CloudFront routes `/api/*` and `/integrations/*` to the API origin with appropriate methods, forwarded authorization/cookies/query strings, and caching disabled. Serve SPA HTML through Hono so embedding headers can reflect the configured tenant. Serve only fingerprinted JS/CSS/fonts/images as public cacheable build assets. Unknown API routes return JSON 404, never `index.html`. Do not apply SPA error fallback to private media or API errors.

Private media/export responses are authorization-checked and `private, no-store` by default. Do not cache them at the edge under a URL that ignores identity or publication revocation. Public publication delivery may be optimized later with edition-aware invalidation, after revocation tests pass.

Start with modest task sizes and measured browser concurrency. Target two API tasks across availability zones for production availability; workers scale from queue backlog/age and measured memory use. A single-task staging setup is acceptable. Container storage is scratch space only. Restrict outbound browser rendering requests to trusted assets and block internal/private network destinations, including metadata services.

Amazon DocumentDB is not the default MongoDB implementation. It has documented functional differences, so a request to use it later requires a separate compatibility run against transactions, indexes, queries, and driver options. Do not label it a drop-in MongoDB deployment. [DocumentDB differences](https://docs.aws.amazon.com/documentdb/latest/devguide/functional-differences.html)

## 11. MongoDB persistence design

Use the official `mongodb` driver, shared Zod validation, typed repository methods, and explicit indexes. Avoid a SQL-string translation shim. Current SQL calls are distributed across the store, creation, collaboration, live, jobs, publications, credits, auth, operations, and erxes modules; replacing `DATABASE_URL` alone cannot migrate them.

A replica set is required in local and production environments because correctness depends on multi-document transactions. Use snapshot read concern and majority write concern for transactional invariants, with bounded retry handling. MongoDB supports transactions across documents/collections on replica sets and sharded clusters. Keep external AI, S3, SQS, and browser calls outside transaction callbacks. [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/)

### Document storage and size strategy

MongoDB's BSON document limit is 16MiB. A 200-slide Frame deck, a long revision history, or a large live snapshot must not be embedded in one database document. [MongoDB limits](https://www.mongodb.com/docs/manual/reference/limits/)

**Target:** store small mutable metadata separately from immutable content. A deck's head points to a snapshot manifest. A manifest holds bounded metadata, theme content references, and up to 200 ordered slide-content references. Each slide is stored as immutable validated JSON content. Split any content payload into binary chunks of at most 1MiB; a small content manifest records byte length, hash, encoding, and ordered chunk IDs. This also handles unusually large individual slides. Use the same content store for publication/live snapshots, large draft data, and job payloads/results.

Stage immutable content before the short metadata transaction; only committed root references make it visible. Deduplicate within an authorized workspace if useful, but never expose cross-tenant existence through hashes. Validate total reconstructed bytes, hash, schema version, and references on reads/imports. A mutation creates new content only for changed slides and reuses unchanged references. List summaries use small metadata and an authorized thumbnail, not the entire deck.

The commit transaction checks expected deck revision and access guard, inserts the revision root, and changes the head pointer. Failed commits leave unreferenced staged content for later cleanup. Garbage collection must acquire a maintenance exclusion protocol that prevents publishers from attaching candidates while they are swept, or use transactional root/refcount bookkeeping. A grace period alone is insufficient to avoid racing a commit. Reachability includes heads, retained revisions, drafts, job checkpoints/results, publications, live sessions, and backups in progress. During an initial implementation, retaining unreferenced content is safer than deleting reachable work.

### Collections and required fields

Every owned resource has `workspaceId` and/or `ownerId`, schema version where applicable, and timestamps. Store token hashes, not raw session tokens. `_id` uses the existing stable string identity when migrating.

| Collection                  | Main fields / purpose                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                     | `_id`, name, normalized email, createdAt, updatedAt. Profile data; no new local password system.                                                                                                                              |
| `authIdentities`            | provider, issuer, subject, userId. Stable external identity mapping for standalone mode.                                                                                                                                      |
| `workspaces`                | `_id`, ownerId, name, accessEpoch, createdAt.                                                                                                                                                                                 |
| `members`                   | workspaceId, userId, role; workspace permission membership.                                                                                                                                                                   |
| `folders`                   | `_id`, workspaceId, name, timestamps.                                                                                                                                                                                         |
| `decks`                     | `_id`, workspaceId, ownerId, title, folderId, status, revision, accessEpoch, headSnapshotId, dimensions, theme summary, slideCount, timestamps.                                                                               |
| `snapshots`                 | `_id`, workspaceId, schemaVersion, metadataContentId, ordered slide references, createdAt. Immutable.                                                                                                                         |
| `contentManifests`          | `_id`, workspaceId, hash, byteLength, encoding, ordered chunk IDs, createdAt. Immutable.                                                                                                                                      |
| `contentChunks`             | `_id`, manifestId, ordinal, bytes, createdAt. Bounded binary data, not base64 in JSON.                                                                                                                                        |
| `revisions`                 | deckId, revision, snapshotId, actorId, createdAt. Retained history roots.                                                                                                                                                     |
| `assets`                    | `_id`, ownerId, workspaceId, name, MIME, byteLength, storageKey, objectVersion/checksum, state, createdAt.                                                                                                                    |
| `uploadIntents`             | `_id`, ownerId, workspaceId, deckId if applicable, kind, stagingKey, expected MIME/size/checksum, status, resultAssetId/sourceId, expiresAt.                                                                                  |
| `themes`, `brandKits`       | `_id`, ownerId, workspaceId, name, validated data/content reference, revision, timestamps.                                                                                                                                    |
| `compositions`              | `_id`, ownerId, workspaceId, name, dimensions, editable content reference, timestamps.                                                                                                                                        |
| `sources`                   | `_id`, ownerId, workspaceId, assetId, jobId, name/MIME, extracted content reference, warnings, status, timestamps.                                                                                                            |
| `creationDrafts`            | `_id`, ownerId, workspaceId, revision, dataContentId, timestamps.                                                                                                                                                             |
| `agentPreferences`          | userId, language, agentMarkdown, revision, updatedAt.                                                                                                                                                                         |
| `jobs`                      | `_id`, ownerId, workspaceId, deckId, parentId, kind, status, progress, payload/result references, inputHash, idempotencyKey, attempts, availableAt, leaseOwner, leaseToken, leaseUntil, cancelRequestedAt, error, timestamps. |
| `generationSteps`           | parentJobId, stageKey, childJobId, ordinal, inputHash, stageVersion.                                                                                                                                                          |
| `jobApplications`           | jobId, deckId, userId, createdAt. Prevent repeated application/charging.                                                                                                                                                      |
| `outbox`                    | `_id`, jobId, dispatchGeneration, availableAt, attempts, dispatch lease, sentAt, timestamps.                                                                                                                                  |
| `publications`              | `_id`, deckId, ownerId, visibility, allowDownload, active, edition, documentRevision, snapshotId, revokedAt, timestamps.                                                                                                      |
| `publicationEditions`       | publicationId, edition, documentRevision, snapshotId, visibility/download policy at publication, createdAt. Immutable edition history; current access still checks the active publication.                                    |
| `publicationAssets`         | publicationId, edition, assetId, immutable storage reference.                                                                                                                                                                 |
| `exportRequests`            | jobId, deckId, documentRevision, snapshotId, publicationId/edition if applicable, format, scale, output metadata.                                                                                                             |
| `collaborators`             | deckId, userId, role, timestamps.                                                                                                                                                                                             |
| `comments`                  | `_id`, deckId, slideId/elementId, authorId, body, resolvedAt/resolvedBy, timestamps.                                                                                                                                          |
| `presence`                  | deckId, userId, mode, lastSeenAt, expiresAt.                                                                                                                                                                                  |
| `liveSessions`              | `_id`, deckId, ownerId, snapshotId, joinCode, state, version, createdAt, expiresAt, endedAt.                                                                                                                                  |
| `liveParticipants`          | `_id`, sessionId, tokenHash, createdAt, lastSeenAt, expiresAt.                                                                                                                                                                |
| `liveResponses`             | sessionId, round, participantId, questionId, optionIndex, createdAt.                                                                                                                                                          |
| `presentationCredits`       | userId, remaining (`null` means unlimited), revision, updatedAt.                                                                                                                                                              |
| `presentationCreditChanges` | `_id`, userId, actorId, previousRemaining, remaining, resultingRevision, createdAt.                                                                                                                                           |
| `rateLimits`                | key, windowStart, attempts, expiresAt. Shared across API instances.                                                                                                                                                           |
| `operationLeases`           | name, owner, fencing token, expiresAt. Maintenance/migration coordination.                                                                                                                                                    |
| `errorEvents`               | requestId, route template, method, error category, createdAt; no slide contents or secrets.                                                                                                                                   |
| `schemaMigrations`          | version, checksum, appliedAt, releaseId.                                                                                                                                                                                      |
| `erxesDeployment`           | singleton `_id`, tenant, issuer; persistent binding.                                                                                                                                                                          |
| `erxesIdentities`           | tenant, subject, userId, createdAt.                                                                                                                                                                                           |
| `erxesTickets`              | nonce, expiresAt; consumed ticket replay protection.                                                                                                                                                                          |
| `erxesSessions`             | tokenHash, userId, audience, expiresAt, createdAt.                                                                                                                                                                            |

### Index contract

Create indexes through a versioned migration command, never lazily during a user request. Build unique indexes only after migration preflight detects duplicates.

| Collection                                              | Required index / invariant                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `authIdentities`                                        | Unique `(provider, issuer, subject)`.                                                                                         |
| `users`                                                 | Unique normalized email within a dedicated deployment, preserving current collision behavior; email is not identity linking.  |
| `members`                                               | Unique `(workspaceId, userId)`; lookup by userId.                                                                             |
| `decks`                                                 | `(workspaceId, status, updatedAt desc, _id)`; `(ownerId, updatedAt desc)`; folder lookup.                                     |
| `revisions`                                             | Unique `(deckId, revision)`; `(deckId, createdAt desc)`.                                                                      |
| `contentChunks`                                         | Unique `(manifestId, ordinal)`; manifests by workspace/hash if deduplicating.                                                 |
| `assets`, `sources`                                     | `(workspaceId, ownerId, createdAt desc)`; asset storageKey lookup for reachability.                                           |
| `themes`, `brandKits`, `compositions`, `creationDrafts` | Workspace/owner + updatedAt or createdAt indexes matching list queries.                                                       |
| `jobs`                                                  | Unique `(ownerId, idempotencyKey)`; `(status, availableAt, leaseUntil, createdAt)`; `(parentId, status)`; owner/recent index. |
| `generationSteps`                                       | Unique `(parentJobId, stageKey)`; parent/ordinal index.                                                                       |
| `jobApplications`                                       | Unique jobId.                                                                                                                 |
| `outbox`                                                | Unique `(jobId, dispatchGeneration)`; pending availableAt/leaseUntil index.                                                   |
| `publications`                                          | Unique deckId with partial filter `{ active: true }`; visibility/active/createdAt index.                                      |
| `publicationEditions`                                   | Unique `(publicationId, edition)`.                                                                                            |
| `publicationAssets`                                     | Unique `(publicationId, edition, assetId)`.                                                                                   |
| `exportRequests`                                        | Unique jobId; publication/edition/format index.                                                                               |
| `collaborators`, `presence`                             | Unique `(deckId, userId)`; collaborator userId lookup.                                                                        |
| `comments`                                              | `(deckId, createdAt, _id)`.                                                                                                   |
| `liveSessions`                                          | Unique joinCode; deck/owner/endedAt lookup. Retry generated-code collisions.                                                  |
| `liveParticipants`                                      | Unique tokenHash; `(sessionId, lastSeenAt)`.                                                                                  |
| `liveResponses`                                         | Unique `(sessionId, round, participantId)`; session/round/question aggregation index.                                         |
| `presentationCredits`, `agentPreferences`               | Unique userId.                                                                                                                |
| `presentationCreditChanges`                             | `(userId, createdAt desc)` and actor/time for audit.                                                                          |
| `erxesIdentities`                                       | Unique `(tenant, subject)`; unique userId for this dedicated mapping.                                                         |
| `erxesTickets`, `erxesSessions`                         | Unique nonce / tokenHash respectively.                                                                                        |
| Expiring records                                        | Single-field TTL index on BSON Date `expiresAt`, with `expireAfterSeconds: 0`, only where automatic deletion is appropriate.  |

TTL deletion is asynchronous. Session validity, ticket expiry, lease expiry, and rate-limit windows must always be checked in application logic. Do not put TTL on shared content roots or use it as a substitute for relational cleanup. [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)

### Transactions that must be preserved

1. **Deck save:** expected revision + current authorization guard + new snapshot/revision root + head update. Return 409 on a lost revision race.
2. **Finish generation:** verify owner/job success/input match; check existing `jobApplications`; conditionally debit finite credits; create deck/revision; insert unique job application. A retry returns the same deck. Concurrent finishes cannot spend the last credit twice.
3. **Credit adjustment:** compare expected credit revision; update balance/revision; append audit record. Materialize an explicit unlimited balance row at provisioning. Every finish writes the credit guard/revision even for an unlimited account, so an unlimited-to-limited adjustment and a concurrent finish have a defined transaction order.
4. **Job enqueue:** enforce idempotency and active-root-job quota using an atomic per-user quota guard; create job and outbox together. Release quota once at terminal transition. A count followed by insert without a guard is racy.
5. **Publication change:** validate authorization/revision; create immutable edition references; update the active edition pointer and asset links together.
6. **Live vote/control:** serialize against the session version/open round; insert a unique response and update the same session guard so a close/vote race cannot accept an answer after closure.
7. **erxes exchange:** bind/check deployment, consume unique nonce, resolve/create identity and workspace, and create hashed session atomically.
8. **Destructive lifecycle:** mark deletion and revoke access first; clean related MongoDB records and S3 bytes with retryable maintenance. MongoDB has no automatic SQL foreign-key cascades.

MongoDB transaction callbacks can be retried. Keep IDs and request fingerprints stable across retries and exclude external side effects. Resolve uncertain commits through the unique request/application record before trying to repeat an operation.

## 12. SQS jobs, outbox, and recovery

MongoDB is the job source of truth. SQS messages contain a job ID and dispatch generation, not the presentation content or permission to rerun an entire deck. Standard queues can deliver a message more than once; database idempotency and fencing are mandatory. [SQS at-least-once delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)

Job states remain queued/running/succeeded/failed/cancelled. Separate worker-attempt count from queue delivery count. Default to three bounded application attempts for retryable failures, with backoff and jitter; invalid schemas, denied access, and rejected configuration are not endlessly retryable. The queue DLQ is an operational transport safety net, not the only job failure record.

Required flow:

1. The API commits a job and an outbox event together. It returns quickly with the job ID.
2. A dispatcher claims pending outbox rows with its own lease, sends SQS, and records delivery. If it crashes after send, a later send is safe.
3. A worker receives a message and atomically claims an eligible job with `findOneAndUpdate`. Increment a fencing token and attempts; set lease owner/expiry. An active lease cannot be stolen.
4. Heartbeats extend the MongoDB lease and SQS visibility. An initial 30-second job lease and heartbeat at most every five seconds match the existing job behavior; configure visibility separately to allow processing and renew it before expiry.
5. Check cancellation, access, deadlines, and lease ownership during work. Every progress, checkpoint, and terminal write predicates on job ID, lease token, running status, and nonexpired lease.
6. Persist stage outputs before acknowledging the SQS message. If acknowledgement fails, redelivery observes committed state and becomes a no-op.
7. If a worker dies, lease expiry and a scheduled sweeper make the stage eligible again. A stale worker's late result cannot commit. Resume preserves prior matching checkpoints.

SQS visibility is not an exclusive lock and does not remove duplicate-delivery handling. Use the latest receipt handle and renew while work is active. [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)

Do not occupy all worker slots with parent orchestration loops waiting for children. A parent schedules runnable children, checkpoints its orchestration state, and yields. Child completion creates a durable wakeup for the parent. Use separate AI/extraction and Chromium worker capacity or explicit per-kind concurrency limits so rendering cannot exhaust all work slots.

Cancellation is persisted before responding. Abort provider calls, stop subsequent stages, and leave completed checkpoints intact. Queued duplicate messages cannot restart a cancelled job. If access is revoked, workers must not publish or apply private results. Keep sanitized user-facing errors distinct from operational logs.

Run a scheduled sweeper at a target interval of one minute for expired leases and abandoned dispatches. Outbox dispatch should be continuous or frequently polled. Alarm on oldest pending outbox age, oldest SQS message age, DLQ count, repeated lease loss, and missing worker heartbeat. Recovery must work even when nobody is polling the UI.

## 13. Private S3 files and upload protocol

Keep separate private frontend-build and application-data storage policies. Block public access on the data bucket. Use encryption, environment-specific namespaces, restricted IAM, and object versioning for recovery. Store only immutable final objects. Database records contain keys/checksums, not permanent public URLs.

Retain the `ObjectStorage` boundary for put/stat/stream/read/delete/list/probe. Adapt S3 configuration to the default AWS credential chain and optional local-development credentials. Standard AWS S3 should not require a custom endpoint or forced path-style addressing. Local emulators may use those options explicitly. Implement pagination and Range handling; reject invalid ranges and MIME mismatches.

**Target direct upload protocol:**

1. Authenticate and authorize `/api/uploads/prepare`; validate kind, target deck/workspace, name, expected bytes, MIME, and checksum. Create an expiring upload intent with a random staging key.
2. Return a short-lived presigned POST policy restricted to that key, checksum/content type as supported, and content-length bounds. The client uploads directly to S3. Restrict bucket CORS to the exact application origin and needed headers/methods.
3. `/api/uploads/:id/finish` verifies current ownership/access, expiry, actual size, decoded content type, checksum, and image/media safety. Never trust the browser's declared MIME.
4. Promote a verified immutable object version to a fresh final key, then transactionally create asset/source metadata and complete the intent. If versioning/copy conditions are used, pin the exact verified version to prevent a concurrent overwrite between validation and promotion.
5. Repeated finish calls return the same result. Cleanup removes abandoned staging uploads after expiry and unreferenced final objects after a safe grace/reachability check.

Presigned URLs can be reused until expiry and can overwrite a matching object key. Therefore upload authorization must never point directly at an existing final asset key. Signing alone does not make an upload single-use. [S3 presigned access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

Private downloads remain proxied through authorized API routes for current revocation behavior. If a future optimization issues signed download URLs, explicitly define and test its revocation window before changing the contract. Current media must remain reachable through `/api/assets/:id` and the publication/review/audience-specific routes, without revealing an unrestricted bucket path.

Validate media before attaching it to documents. Bound decompression, image dimensions, archive expansion, extraction runtime, and browser memory. Strip or safely handle active content. For external HTTPS images, resolve through a controlled retrieval policy when exporting so a user-supplied URL cannot fetch internal services. Store/source deletion and physical-object deletion are separate operations because editions, revisions, recovery copies, and exports may still refer to bytes.

## 14. erxes compatibility contract

### Deployment boundary

Frame remains a separate presentation service on AWS. The erxes `frame_api` service participates in the host's gateway, authentication context, permission system, shared libraries, and Redis/service discovery as required by that host. The `frame_ui` remote participates in host navigation and launches the studio. Do not embed Frame's entire persistence layer inside the erxes plugin or share erxes core database credentials with the Frame browser.

Ship the plugin sources at:

```text
frame-erxes/
  backend/plugins/frame_api/
    src/main.ts
    src/ticket.ts
    project.json
    package.json
    tsconfig.json
    tsconfig.build.json
  frontend/plugins/frame_ui/
    src/Frame.tsx
    src/config.tsx
    src/main.ts
    module-federation.config.ts
    project.json
    rspack.config.ts
    tsconfig.json
    tsconfig.app.json
  scripts/build.ts
  scripts/install.ts
  tests/
  README.md
  VERIFICATION.md
```

Build against the actual erxes host revision and its installed shared dependencies. The current package is a source integration, not a marketplace listing. Native host Nx/Rspack builds and gateway discovery must be verified. erxes documents its plugin layout and standalone/custom remote configuration; pin a supported host revision rather than promising every historical host works. [Plugin development](https://erxes.io/docs/create-plugin), [standalone plugins](https://erxes.io/docs/create-plugin-standalone)

### Plugin registration and permissions

Plugin name is `frame`; API project `frame_api`; UI project `frame_ui`; navigation path `frame`; module `studio`; action `frameStudioOpen`; default group `frame:user` ("Frame User"). `frameAvailable` returns false for unauthenticated/unauthorized users. `frameLaunch` requires authenticated host context plus `canGroup(subdomain, "frameStudioOpen", user)`.

The plugin derives tenant from authenticated `context.subdomain` and user identity from `context.user._id`. It never accepts tenant, user ID, email, or permissions from browser arguments. Host email/name are display/profile claims, not account-linking keys.

GraphQL contract:

```graphql
type FrameLaunch {
  url: String!
  origin: String!
  ticket: String!
  expiresAt: Float!
}

extend type Query {
  frameAvailable: Boolean!
}

extend type Mutation {
  frameLaunch: FrameLaunch!
}
```

The module-federation remote is named `frame_ui` and exposes `./config` from `src/config.tsx` and `./frame` from `src/Frame.tsx`. Share React, React DOM, `erxes-ui`, and `@apollo/client` according to the host's compatible versions. A host-native build must verify those shared-module contracts; packaging source files alone does not verify remote execution.

Configure `FRAME_ERXES_TENANTS` on the erxes adapter as a JSON map keyed by actual authenticated tenant:

```json
{
  "school": {
    "frameOrigin": "https://slides.example.org",
    "erxesOrigin": "https://work.example.org",
    "secret": "REPLACE_WITH_A_SERVER_ONLY_RANDOM_SECRET"
  }
}
```

The secret must contain at least 32 bytes of entropy and be stored in server secret management. The string above is an illustrative configuration slot, not a usable credential. Origins are exact HTTPS origins without paths or trailing slashes; HTTP loopback is allowed for development.

### Launch ticket protocol

Preserve the current version-1 protocol so the existing host adapter can connect to the rebuilt backend. It is a two-part HMAC ticket, not a three-part JWT:

```text
payload = base64url(UTF8(JSON.stringify(claims)))
signature = base64url(HMAC_SHA256(sharedSecret, payload))
ticket = payload + "." + signature
```

Claims are `v:1`, `iss` (erxes origin), `aud` (Frame origin), `tenant`, `sub` (immutable erxes user ID), `email`, `name`, `iat`, `exp`, and `jti` (random UUID nonce). Times are integer Unix seconds. `exp = iat + 60` for issued tickets.

The browser obtains the ticket through the authenticated host GraphQL mutation and POSTs it as a form body to `/integrations/erxes/launch`. Never put tickets in URLs, logs, analytics, referrers, or local storage. Limit the exchange body to 8KiB and the token to 4,096 characters.

The Frame exchange must:

1. Require the request Origin to equal the configured erxes origin.
2. Decode only the supported format and verify HMAC with constant-time comparison.
3. Validate strict claims and exact issuer/audience/tenant matches.
4. Require unexpired `exp`, positive lifetime no greater than 60 seconds, `iat` no more than five seconds in the future and no more than 65 seconds old.
5. In one MongoDB transaction, create/check the singleton deployment binding, insert the unique nonce, resolve/create `(tenant, sub)` identity, provision its personal workspace if needed, and insert a hashed session token.
6. Reject reuse, mismatched binding, expired tickets, and email collisions with an existing unrelated account. Do not merge by email.
7. Set a one-hour host-only HttpOnly Secure SameSite=Lax cookie with Path `/`, then return HTTP 303 to `/`.

Use `__Host-frame_erxes` on HTTPS and the existing development cookie name on HTTP loopback. Generate a high-entropy opaque token; the current implementation concatenates two UUIDs and stores SHA-256 of the result. Preserve compatibility or intentionally rotate existing sessions during cutover. Session lookups check hash, expiry, audience, and bound deployment. TTL cleanup does not authorize sessions.

One dedicated Frame deployment/database/storage namespace belongs to one erxes tenant and issuer. First successful exchange binds it persistently. Changing environment variables cannot reassign that database to a different tenant. A changed Frame audience requires renewed sessions. Standalone Clerk users and erxes identities are not automatically linked or migrated.

### Browser embedding and fallback

Prefer sibling HTTPS subdomains such as `work.example.org` and `slides.example.org` so SameSite=Lax sessions can work in the embedded studio. On unrelated sites or browsers blocking embedded cookies, provide **Open in new tab**, obtain a fresh ticket, and submit the POST to that new browsing context. Do not reuse the iframe's consumed ticket.

Frame HTML sends `Content-Security-Policy: frame-ancestors 'self' https://work.example.org` with the configured origin and `Referrer-Policy: no-referrer`. The host allows the Frame origin in `frame-src` and `form-action`. Avoid an upstream `X-Frame-Options: DENY/SAMEORIGIN` or conflicting CSP that defeats embedding. API and HTML cache behavior must not reuse another tenant's policy.

On successful `/api/me`, the child sends `{ type: "frame-erxes:ready" }` only to the exact configured parent origin. The host validates message origin and source window. Show loading, launch failure, blocked-cookie/timeout guidance, retry, and new-tab actions. Do not treat any received `postMessage` as trusted identity.

`GET /api/auth/provider` selects mode at runtime. An erxes deployment does not mount ClerkProvider and needs no Clerk publishable key. All protected APIs use the same erxes session resolver. Frame sign-out deletes its session and cookie immediately. Host logout/permission removal prevents new launches; already-issued Frame sessions can persist until their one-hour expiry. Immediate host-wide revocation would require an additional verified mechanism and is not claimed by the current protocol.

### Build, install, and deploy

Keep the existing Bun commands for plugin source checks, tests, packaging, preview, and installation. The installer checks host layout and refuses to overwrite existing plugins. Native host commands run in the host checkout after its dependencies are prepared:

```bash
bun run erxes:test
bun run erxes:build
bun run erxes:install /absolute/path/to/erxes
```

```bash
cd /absolute/path/to/erxes
bunx nx build frame_api
bunx nx build frame_ui
```

Bun remains Frame's package manager. Do not replace an existing erxes host lockfile or rewrite host workspace aliases as a side effect of installation. Add `frame` to host `ENABLED_PLUGINS`; serve built UI remote assets; configure `UI_ENTRY_URL` where supported to the full `frame_ui/remoteEntry.js` URL; confirm `/get-frontend-plugins` returns the expected remote. API default port is 3319 (`FRAME_ERXES_API_PORT`); UI development default is 3019. Keep the adapter behind the trusted host gateway.

The host adapter may run in the existing erxes environment or as an ECS service on its private network. Only the configured Frame origin changes from Vercel to AWS. The Frame backend replaces PostgreSQL ticket/session/identity storage with the MongoDB collections above while preserving the launch protocol.

## 15. API conventions and compatibility

Implement the endpoint paths listed below with shared Zod request/response schemas. Section 25 defines the fresh-build wire conventions where earlier sections specify behavior rather than an exact envelope. If the reference application is supplied and old-client compatibility is needed, capture its wire contracts and add compatibility adapters. No old client is required for a fresh build. Every collection lookup includes identity/ownership or resolves an explicitly public capability. Parameters are strings with bounded length; never pass client objects directly into MongoDB filters or updates.

Use 400 for invalid state/input where applicable, 401 for missing/expired authentication, 403 for denied capability or credit policy, 404 for absent/inaccessible resources where disclosure would be inappropriate, 409 for revisions/idempotency conflicts, 413 for size limits, 429 for quotas/rate limits, and 503 for unavailable dependencies. Preserve the existing `{ error: string }` field; the target may add stable `code`, `requestId`, and structured conflict details without breaking clients. Never return raw database/provider errors or credentials.

Core mutation payloads:

```json
{
  "baseRevision": 12,
  "operations": [
    {
      "type": "text.set",
      "slideId": "slide-1",
      "id": "element-1",
      "text": "A revised headline",
      "richText": null
    }
  ]
}
```

```json
{
  "format": "pdf",
  "scale": 1,
  "baseRevision": 12,
  "key": "client-generated-unique-request-key"
}
```

The first body is `PATCH /api/decks/:id`; the second is `POST /api/decks/:id/exports`. AI edit bodies include baseRevision, scope `{ kind, slideIds, elementIds }`, instruction, sourceIds, key, mode, and optional resumeJobId. Reusing an idempotency key with different work returns 409. Keys are scoped to the authenticated owner.

Target upload authorization replaces the Vercel-specific token transport; keep prepare/finish behavior and update the client upload adapter together. `/api/uploads/token` may temporarily return the target upload policy for compatibility, but must never issue Vercel Blob credentials on AWS. Remove public queue-consumer endpoints; SQS workers authenticate through IAM, not a browser-callable worker API.

The endpoint inventory at the end of this document is generated from this checkout's route declarations. Dynamic theme/brand-kit routes and the multiline erxes exchange are included explicitly. It is a parity checklist, not proof that the target implementation already exists.

## 16. Code organization and reusable libraries

Retain a single TypeScript application with clear module boundaries. A suggested target layout follows; new paths here are deliverables, not claims about existing files:

```text
src/                       React UI, styles, client hooks
shared/                    Schemas, operations, themes, geometry, projections
server/
  app.ts                   Hono route composition
  index.ts                 API process entry
  auth/                    Clerk and erxes session resolvers
  repositories/            MongoDB persistence and transaction helpers
  services/                Decks, sources, creation, credits, sharing, live
  storage/                 S3 and explicit local adapter
  queue/                   SQS transport, outbox, lease/fencing
  workers/                 AI, extraction, render, maintenance entrypoints
  rendering/               Shared-renderer browser integration and exports
scripts/                   Index migrations, data import, backup, checks
infra/                     AWS CDK stacks and environment configuration
frame-erxes/               Host plugin sources and integration tests
tests/                     Unit, repository, API, concurrency tests
e2e/                       Playwright journeys, visual and accessibility checks
Dockerfile                 Reproducible API/worker container targets
compose.yaml               Local replica set and service dependencies
.env.example               Target configuration with no secrets
bun.lock                   Pinned dependency graph
master.md                  This specification
```

Reuse existing shared schemas, operation reducers, themes/compositions, renderer, presentation UI, extraction code, fitting, and provider boundaries before writing replacements. Rework persistence behind explicit repository interfaces such as deck/read/save, job/claim/heartbeat/finish, publication/publish/revoke, and erxes/consumeLaunch. Avoid a giant repository exposing raw mutable collections to every route.

| Existing package / module                    | Target use                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| React, Vite, TypeScript                      | Preserve SPA and typed frontend build.                                             |
| Hono, Zod                                    | Preserve HTTP boundary and shared validation.                                      |
| Tiptap, react-rnd                            | Preserve rich text and object interactions; test gestures after changes.           |
| DOM/SVG `SlideRenderer`                      | Preserve one rendering model across interactive and exported views.                |
| Lucide, QRCode, bundled fonts                | Preserve icons, join QR, and typography.                                           |
| Playwright, Sharp, fflate, PptxGenJS         | Rendering, image work, ZIP, image-based PPTX.                                      |
| Mammoth, pdfjs-dist                          | Bounded DOCX/PDF source extraction.                                                |
| Existing AI adapters                         | Preserve schema-driven provider abstraction and policy checks.                     |
| `@aws-sdk/client-s3`                         | Reuse storage code; add task-role credentials and staged uploads.                  |
| Official `mongodb` driver                    | Add repositories, transactions, indexes, and replica-set tests.                    |
| `@aws-sdk/client-sqs`, S3 presigning helpers | Add queue transport and upload authorization.                                      |
| Neon/PGlite/Kysely/Vercel Blob/Queue         | Remove from target runtime after MongoDB/S3/SQS parity and migration verification. |

Pin tested package/container versions. The current package manager declaration is Bun 1.3.14; use that baseline until a separate runtime upgrade passes tests. Do not combine the infrastructure migration with speculative framework replacement. Avoid adding Redis, CRDTs, OCR, payments, or editable PPTX simply because they could be useful later.

## 17. Configuration and local development

The following names are the target configuration contract. Some are existing variables and others must be introduced with the corresponding adapters. This block is not an instruction to point today's PostgreSQL implementation at MongoDB.

```dotenv
NODE_ENV=development
PORT=3158
APP_ORIGIN=http://127.0.0.1:5174

MONGODB_URI=mongodb://127.0.0.1:27017/frame_dev?replicaSet=rs0
MONGODB_DATABASE=frame_dev
FRAME_STORAGE=s3
AWS_REGION=us-east-1
FRAME_S3_BUCKET=frame-dev-private
FRAME_S3_REGION=us-east-1
FRAME_QUEUE_DRIVER=sqs
FRAME_SQS_QUEUE_URL=https://sqs.REGION.amazonaws.com/ACCOUNT/QUEUE
FRAME_SQS_DLQ_URL=https://sqs.REGION.amazonaws.com/ACCOUNT/DLQ
FRAME_JOB_TIMEOUT_MS=270000

VITE_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_KEY=
CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:5174
FRAME_ADMIN_USER_IDS=

FRAME_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta/muse-spark-1.3-contributor
OPENROUTER_MUSE_CONTRIBUTOR_ENABLED=true
FRAME_CHROME_PATH=

# Set these together for erxes mode; omit Clerk browser config in that mode.
FRAME_ERXES_ORIGIN=
FRAME_ERXES_TENANT=
FRAME_ERXES_SECRET=
```

`REGION`, `ACCOUNT`, `QUEUE`, and bucket/domain examples are deployment inputs, not real provisioned resources. Production uses HTTPS origins, a private/TLS Atlas URI, environment-specific queues/buckets, and IAM task credentials. Only browser-safe publishable configuration may use `VITE_`; provider keys, MongoDB URI, Clerk secret, and erxes signing secret must never enter a Vite bundle.

Support an explicit local development profile with a single-node MongoDB replica set, local file storage or a private S3 emulator, and a database-backed local queue adapter that follows the same lease/checkpoint semantics. Keep production configuration strict so missing SQS/Atlas/S3 settings cannot silently activate local persistence. SQS emulation is useful for development; AWS staging must still test real IAM and queue behavior.

Provide these scripts in the target implementation:

| Command                                                                    | Target responsibility                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                            | Reproducible dependency installation.                                  |
| `bun run dev`                                                              | API + Vite + local worker with explicit development configuration.     |
| `bun run db:migrate`                                                       | Versioned MongoDB indexes/schema migrations, with a migration lease.   |
| `bun run typecheck`                                                        | TypeScript checks.                                                     |
| `bun run test`                                                             | Credential-isolated deterministic unit/repository/API tests.           |
| `bun run test:browser`                                                     | Main Playwright journeys.                                              |
| `bun run test:visual`                                                      | Representative screenshot regression checks.                           |
| `bun run build`                                                            | Typecheck and production frontend build, no production data mutation.  |
| `bun run start`                                                            | API process only in production.                                        |
| `bun run worker`                                                           | SQS consumer entrypoint. New target script.                            |
| `bun run dispatcher`                                                       | Outbox sender. New target script.                                      |
| `bun run ops status/backup/verify/restore`                                 | MongoDB-aware operational tools, with target paths supplied as needed. |
| `bun run erxes:test`, `erxes:build`, `erxes:test:browser`, `erxes:preview` | Plugin checks, package, browser integration, local host preview.       |

Document exact Docker Compose replica-set initialization and health checks in the delivered README. A standalone `mongod` without a replica set is not an acceptable test substitute. Integration tests must use isolated databases/buckets/queue namespaces and refuse production targets. Fixture identity and AI providers must be impossible to activate accidentally in a production server.

## 18. Optional migration when an old installation is supplied

The default rebuild starts with empty MongoDB/S3 resources and new identities. Skip old-data import entirely in that mode. If an old installation is supplied and its data must be retained, use the procedure below and include tested migration tooling. Do not make the fresh build wait for unavailable old data or deploy MongoDB code over the old database before migration verification.

1. Inventory the current schema/migrations and all data-bearing tables, including legacy auth, credits, preferences, and erxes mappings. The five SQL migrations are evidence of source semantics, not scripts MongoDB can execute.
2. Produce an encrypted consistent export of PostgreSQL and a manifest of every referenced private object. Record counts, IDs, revisions, hashes, editions, identity mappings, and existing limits violations. Never put secrets in `master.md` or the repository.
3. Create an empty target database/storage namespace. Apply MongoDB collections/indexes with a migration ledger. Reject a nonempty restore destination unless a separately designed merge procedure exists.
4. Map users/workspaces/members/folders preserving string IDs. Map Clerk subjects/external IDs through the existing verified identity relationship. Treat legacy Better Auth tables as migration data, not a requirement to run a second active login system.
5. Convert presentation metadata and ordered SQL slides into immutable snapshot/content records. Convert retained revisions, theme/brand-kit JSON, compositions, source text/warnings, and draft settings through shared validation.
6. Copy Blob/S3 files to private target S3 keys and verify byte lengths and SHA-256 checksums. Rewrite storage locators while preserving logical asset IDs and API URLs. Retain objects referenced by publications, revisions, source files, recovery copies, and exports.
7. Convert publication editions/assets, export records, collaborators/comments, credits/audit history, and agent preferences. Preserve `null` unlimited credits. Do not charge migration or replay completed job applications.
8. Convert jobs and generation checkpoints. Do not restart succeeded/failed/cancelled work. For active work, stop old workers, clear obsolete leases, validate resumable input hashes, and create new outbox events only for valid unfinished stages.
9. Preserve erxes deployment binding and `(tenant, subject)` mappings. Prefer invalidating sessions/tickets at cutover and requiring a fresh launch. If sessions are retained, preserve hash/audience/expiry exactly. Never map identity by email alone.
10. End active live sessions with clear user messaging before a maintenance cutover unless a separately tested continuation transfer is used. Old participant tokens and join codes must not point to a different session.
11. Compare canonical documents, counts, permissions, revision histories, asset hashes, publication editions, credit totals, and plugin launches. Quarantine invalid rows with a report; do not silently skip them.
12. Freeze writes, stop queue consumption, perform the final consistent delta/full copy, validate, then switch DNS/origin/configuration and resume only the new workers. Prevent old and new systems from both accepting writes.

The simplest initial cutover uses a maintenance window and a full final export. Live dual-write migration is a separate project. Retain the previous deployment and backup read-only for rollback. Rolling back after new MongoDB writes requires a defined reverse import/reconciliation; switching DNS alone loses new work. State this in the runbook.

## 19. Deployment, operations, and recovery

Build reproducible Linux container images with pinned Bun, Chromium, Playwright-compatible browser binaries, system libraries, and bundled fonts. Use an unprivileged runtime where supported, no embedded secrets, bounded temporary storage, and graceful SIGTERM handling. Do not depend on Vercel-specific browser packaging in the ECS image.

Release sequence:

1. Run deterministic tests, typecheck/build, repository concurrency tests, and relevant browser suites.
2. Build/push immutable image digests to ECR and upload hashed frontend assets.
3. Provision/update environment infrastructure and secret references through reviewed IaC changes.
4. Run index/data migrations as a protected one-off task. Builds and ordinary API startup do not mutate production schemas.
5. Deploy compatible workers/API/dispatcher with readiness checks. Keep API and worker job-schema versions compatible during rolling deploys.
6. Deploy HTML/build references after their hashed assets exist. Avoid serving a frontend bundle against an incompatible API.
7. Test health, private upload/download, auth, erxes launch, a generation job, an export, publication revoke, and mobile audience join on actual HTTPS staging/production.
8. Record image/build IDs, database migration version, infra revision, browser/provider versions, and observed results.

`/api/health` reports process liveness without secrets. `/api/ready` verifies configured mode, database/index readiness, and required storage/queue configuration with bounded cached probes. AI catalog availability should not make the manual editor unavailable; expose AI readiness separately. Workers report heartbeats and queue progress.

Log structured request/job IDs, route templates, status, duration, kind, attempt, stage, lease loss, provider usage, and sanitized error class. Do not log tokens, tickets, source text, slide bodies, notes, API keys, or presigned upload URLs. Track API errors/latency, save conflicts, S3 failures, Atlas connection/pool saturation, queue age, job success/timeouts, rendering memory, and backup failures. Send operational alerts through configured monitoring, with recipients chosen by the operator.

### Backups and restore

Enable appropriate Atlas backup/point-in-time recovery and S3 versioning/retention for the chosen deployment. These are provisioning tasks, not guarantees supplied by this document. Also implement portable logical backup and verification tools that include database records, immutable content, referenced object keys/versions, hashes, schema version, and manifest metadata.

Capture a consistent backup boundary: either quiesce writes/cleanup while exporting or use a tested database snapshot plus retained immutable object versions. Never pair unrelated database and bucket dumps and call them consistent. Keep backup copies isolated from the runtime role and protect their secrets/encryption keys.

Restore only into an empty isolated database and private storage namespace. Verify manifest hashes and migrations, restore identities/content/metadata and bytes, check references and access, then run full read/edit/export/publish/erxes tests before exposing it. A backup is not accepted until a restore drill succeeds. Proposed initial operational objectives are RPO ≤24 hours for portable backups and RTO ≤4 hours for a tested restore; measure and record whether the deployed configuration meets them. Stronger objectives depend on configured managed backups and practice.

Maintenance covers expired sessions/tickets/presence/rate windows, abandoned upload intents, job dispatch/leases, bounded old revisions, orphaned content/files, and deletion tombstones. Destructive cleanup must be resumable, reference-aware, and dry-run capable. Keep audit history according to an explicit retention policy; do not TTL away credit records merely to save space.

## 20. Verification and definition of done

Implementation is complete only when feature parity and the target infrastructure behavior are demonstrated. A successful build is not evidence of working AWS delivery, MongoDB transaction correctness, or erxes compatibility.

### Automated layers

| Layer                      | Required coverage                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema/operations          | Invalid IDs/references, bounds, rich text, data elements, theme overrides/reset, layout preservation, undo/redo, public projection.                                                        |
| MongoDB repositories       | Replica-set transactions, unique indexes, lost-update rejection, staged-content roots, large-document chunk reconstruction, migrations, deletion/reachability.                             |
| Authentication/permissions | Standalone identities, erxes identities, owner/editor/viewer matrix, private assets, exports, source/job isolation, revocation during a worker/save.                                       |
| Credits                    | Two finishes competing for the last credit; repeated finish; failed generation; unlimited-to-finite admin race; stale adjustment; audit actor/balances.                                    |
| Jobs                       | Duplicate/out-of-order messages, crash before/after database commit or SQS acknowledgement, lost leases, heartbeat failure, cancel, deadlines, checkpoint resume, parent/child scheduling. |
| Uploads                    | Wrong owner, expired intent, wrong bytes/MIME/checksum, replay/overwrite race, repeated finish, abandoned staging cleanup, range requests.                                                 |
| AI                         | Fixture outputs, schema rejection, unsupported facts/numbers, source injection, scope boundaries, language precedence, preferences snapshots, optional review failure.                     |
| Live                       | Duplicate vote, simultaneous close/vote, round change, reconnect, expired/ended session, hidden answer/notes, revoked host, multi-instance state.                                          |
| Publishing/export          | Stable editions, explicit republish, revoke, download policy, correct formats, safe projection, offline HTML, font/media fidelity.                                                         |
| erxes                      | HMAC/claims/expiry/origin checks, replay across two API instances, tenant binding, email collision, session hash/expiry/logout, host permission checks, iframe/new-tab flows.              |
| Operations                 | Backup manifest verification, empty-destination restore, bad-hash failure, worker restart, deployment rollback compatibility, no secrets in client bundles/logs.                           |

Use Bun tests and Playwright. Port existing PostgreSQL-specific tests to MongoDB repositories; keep their observable assertions. Do not replace database race tests with an in-memory map. Deterministic tests remove inherited cloud/provider credentials. Live AI and real AWS checks run separately with explicit environments and bounded usage.

### Browser acceptance journeys

- Create/sign into a standalone account; verify profile and account security routing; sign out/in and retain decks.
- Open from a real erxes host with `frame:user`; confirm no extra Clerk sign-in, correct identity, and persistence after iframe/new-tab relaunch.
- Deny launch without `frameStudioOpen`; reject a second tenant and a replayed ticket.
- Create from blank; insert/edit text, image, shape, chart, table, diagram, video, question, and timeline; save/reload.
- Test desktop keyboard and tablet touch move/resize/rotate/multi-select, grouping/layers, zoom, undo/redo, and inspector controls.
- Create from a topic and from PDF/DOCX/text sources; inspect warnings, edit outline, choose a theme, generate, cancel/resume, and finish once.
- Save language and `agent.md`; create a new draft using defaults; confirm existing drafts/jobs retain their previous values.
- Apply a curated/custom/AI theme to current/selected/all slides and verify overrides and geometry remain intact.
- Preview/apply a scoped AI edit; confirm unrelated content unchanged; reject a stale revision; undo and reload.
- Interrupt connectivity while editing; recover after reload; produce a real concurrent save conflict and retain an owned recovery copy.
- Share as viewer/editor, comment/resolve/reopen, show presence, revoke, and verify private resources become inaccessible.
- Present with private notes/timer/current-next and supported interactions; exercise reduced motion and media.
- Join from a physical phone using QR/code; answer, reconnect, reveal results, end; verify unrevealed answers never appear in payloads.
- Publish private/unlisted/public editions; edit the draft without changing the edition; republish; test downloads; revoke old hosted access.
- Download/open actual PDF, PNG ZIP, HTML, and PPTX; inspect representative slides and reopen HTML offline.
- Adjust credits as admin, fail unauthorized adjustment, race the last credit, and verify one saved AI deck produces one charge.
- Replace an API/worker task during activity; verify persisted work resumes and late workers cannot overwrite newer results.
- Restore a backup into an isolated environment and repeat edit/export/erxes launch.

### Visual, accessibility, and performance gates

Inspect actual workspace, creation studio, editor, presenter, audience, public viewer, and erxes embedding at representative widths. Check text overflow, empty/error/loading states, typography, contrast, focus, dialog behavior, and offline recovery. Keep screenshot baselines for text/image/data/diagram/question/theme combinations and compare the same renderer in export.

Measure a 100-slide deck and 200 audience participants as initial capacity scenarios. Proposed targets on a recorded reference environment: p95 local pointer response under 50ms, p95 successful API save under 1 second excluding deliberate outages, and p95 audience state convergence under 2 seconds at configured polling intervals. These are targets, not current measurements. Record hardware/task size, dataset, concurrency, browser version, and observed failures. Bound mounted thumbnails and avoid rerendering the entire deck for a single selection change.

The release report must state which checks ran, which passed/failed, and which external gates remain. Do not claim physical-device, real-host erxes, actual Atlas/S3/SQS, or provider verification from fixture tests.

## 21. Implementation sequence

Start from an empty repository and deliver working vertical slices in this order, retaining the whole scope:

1. Initialize the Bun/TypeScript project, React/Vite frontend, Hono backend, shared schemas, containers, local replica set, configuration validation, and test fixtures. Use the embedded theme seed data. Capture reference tests/screenshots only if supplied.
2. Build the workspace, canvas renderer, editor panels, object editing, MongoDB repositories, indexes, user/workspace provisioning, revisions, and manual create/edit/save/reload. Prove concurrent saves and large documents.
3. Implement S3 storage and upload intents, media authorization, themes/brand kits/compositions, source extraction, and their complete UI flows.
4. Build both erxes plugins and Frame's binding/identity/ticket/session support early. Prove host launch and browser embedding against the manual editor before adding AI complexity.
5. Implement jobs/outbox/SQS worker contracts, fencing/cancellation/recovery, and parent/child orchestration. Prove fault injection before paid provider checks.
6. Implement the creation studio, generation/research/scenes/fitting/visual review, scoped AI editing, AI themes, language/preferences, and atomic finish/credits.
7. Implement collaboration/recovery copies/comments/presence, publishing editions, exports, presenter UI, live sessions/audience votes, and private projections.
8. Complete CDK deployment, secret/IAM/network policy, observability, backups/restore, migration tools, and staging release workflow.
9. Execute real AWS/Atlas/erxes/browser/provider/physical-device acceptance. Resolve failures and record evidence before cutover.

Every slice includes usable failure/recovery states. Do not defer data integrity, permissions, idempotency, or erxes tenant isolation to a final polish phase. The output includes application code, infrastructure code, plugin sources, migration/backup tools, tests, lockfile, configuration example, and operational documentation.

## 22. Source map and known boundaries

These are optional reference locations if the original repository is supplied. A builder with only this document implements their responsibilities directly; none of these files is an external prerequisite:

| Concern                           | Source paths                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI navigation and identity mode   | `src/App.tsx`, `src/main.tsx`, `src/lib/api.ts`, `server/auth-session.ts`                                                                                                                       |
| Workspace/editor/rendering        | `src/components/Workspace.tsx`, `Editor.tsx`, `Canvas.tsx`, `SlideRenderer.tsx`, `SelectionTransform.tsx`, `src/lib/useDocument.ts`                                                             |
| Document/data/operations          | `shared/schema.ts`, `shared/content.ts`, `shared/creative.ts`, `shared/operations.ts`, `shared/geometry.ts`                                                                                     |
| Theme/template/composition system | `shared/themes.ts`, `shared/featured-themes.ts`, `shared/templates.ts`, `shared/art-direction.ts`, `shared/theme-compositions.ts`, `shared/culture-compositions.ts`, `shared/design-library.ts` |
| AI creation/preferences           | `server/creation.ts`, `server/creative-workflows.ts`, `server/ai-scenes.ts`, `server/ai-fitting.ts`, `server/visual-review.ts`, `shared/agent.ts`, `shared/ai-scene.ts`                         |
| AI providers/evidence             | `server/ai-provider.ts`, `server/openrouter.ts`, `server/web-research.ts`, `server/scene-claims.ts`, `server/ai-edits.ts`, `server/ai-themes.ts`                                                |
| Extraction/files                  | `server/sources.ts`, `server/extract.ts`, `server/extract-core.ts`, `server/extract-worker.ts`, `server/storage.ts`, `server/uploads.ts`, `server/asset-response.ts`                            |
| Persistence/jobs                  | `server/store.ts`, `server/database.ts`, `server/jobs.ts`, `server/dispatch.ts`, `migrations/001_initial.sql` through `005_agent_preferences.sql`                                               |
| Credits and preferences migration | `server/credits.ts`, `shared/credits.ts`, `migrations/003_presentation_credits.sql`, `migrations/005_agent_preferences.sql`                                                                     |
| Collaboration/live/publication    | `server/collaboration.ts`, `server/live.ts`, `server/publications.ts`, shared projections and corresponding UI/hooks                                                                            |
| Export                            | `server/exports.ts`, `server/render-export.ts`, `server/static-html.tsx`, `server/browser.ts`, `shared/exports.ts`, `src/portable.ts`                                                           |
| erxes                             | `server/erxes.ts`, `server/erxes-config.ts`, `server/studio-response.ts`, `frame-erxes/README.md`, both plugin source directories                                                               |
| Operations and tests              | `server/backup.ts`, `server/maintenance.ts`, `scripts/operations.ts`, `tests/`, `e2e/`, `frame-erxes/tests/`                                                                                    |

Existing documentation such as `docs/requirements.md`, `docs/completion-audit.md`, and `docs/verification.md` contains useful product history but also earlier architecture/model/theme descriptions. Read the actual current source when it conflicts with those historical statements. This specification defines the proposed AWS/MongoDB architecture; it does not retroactively change the implementation.

Explicit boundaries: no new billing checkout, native editable PPTX, OCR service, custom font upload, unrestricted CRDT editing, automatic erxes team/role synchronization, immediate erxes global logout propagation, or marketplace publication is required for parity. Those additions need their own design and acceptance criteria. Required work is the full described Frame product, both identity modes, and a verified AWS/MongoDB deployment path.

## 23. Rebuild instruction for an implementation agent

> Build the entire Frame application from scratch in a new repository using this document as the standalone specification. Implement every screen and working flow: authentication, workspace, manual editor, structured editable slide rendering, all element types, themes/templates/brand kits, source uploads, AI creation and editing, agent/language preferences, autosave/history/recovery, collaboration/comments, presenter, audience questions, publishing, exports, and admin credits. Use Bun, React/TypeScript/Vite, Hono, shared Zod schemas, MongoDB Atlas on AWS, private S3, SQS with a transactional outbox and fenced workers, and ECS Fargate. Build the actual erxes `frame_api` and `frame_ui` plugins and the version-1 single-use launch/session integration, as well as standalone Clerk mode. Do not assume existing source files or an old database are available. Use the embedded theme seeds and implementation contracts; reuse reference code only if supplied. Deliver application code, local development setup, AWS infrastructure, configuration documentation, tests, backup/restore tooling, and verified build results. Old-data migration is conditional on supplied data. Work through all implementation stages; do not stop after a scaffold, backend swap, mock UI, or partial MVP. Report real external deployment/host/provider gates separately from completed local functionality.

## 24. Current endpoint inventory

The route list below records the source baseline. Authentication middleware, role checks, public projections, request schemas, and response schemas remain part of each endpoint's contract.

| Method   | Route                                    | Current handler           |
| -------- | ---------------------------------------- | ------------------------- |
| `ALL`    | `/api/*`                                 | `server/app.ts`           |
| `GET`    | `/api/admin/users`                       | `server/credits.ts`       |
| `PATCH`  | `/api/admin/users/:id/credits`           | `server/credits.ts`       |
| `GET`    | `/api/ai/preferences`                    | `server/creation.ts`      |
| `PUT`    | `/api/ai/preferences`                    | `server/creation.ts`      |
| `GET`    | `/api/ai/status`                         | `server/creation.ts`      |
| `POST`   | `/api/assets`                            | `server/app.ts`           |
| `GET`    | `/api/assets/:id`                        | `server/app.ts`           |
| `GET`    | `/api/audience/:code`                    | `server/live.ts`          |
| `POST`   | `/api/audience/:code/answer`             | `server/live.ts`          |
| `GET`    | `/api/audience/:code/assets/:assetId`    | `server/live.ts`          |
| `POST`   | `/api/audience/:code/join`               | `server/live.ts`          |
| `ALL`    | `/api/auth/*`                            | `server/app.ts`           |
| `GET`    | `/api/auth/provider`                     | `server/app.ts`           |
| `POST`   | `/api/auth/signout`                      | `server/erxes.ts`         |
| `GET`    | `/api/brand-kits`                        | `server/design.ts`        |
| `POST`   | `/api/brand-kits`                        | `server/design.ts`        |
| `DELETE` | `/api/brand-kits/:id`                    | `server/design.ts`        |
| `PUT`    | `/api/brand-kits/:id`                    | `server/design.ts`        |
| `GET`    | `/api/compositions`                      | `server/app.ts`           |
| `POST`   | `/api/compositions`                      | `server/app.ts`           |
| `DELETE` | `/api/compositions/:id`                  | `server/app.ts`           |
| `GET`    | `/api/creation`                          | `server/creation.ts`      |
| `POST`   | `/api/creation`                          | `server/creation.ts`      |
| `GET`    | `/api/creation/:id`                      | `server/creation.ts`      |
| `PUT`    | `/api/creation/:id`                      | `server/creation.ts`      |
| `POST`   | `/api/creation/:id/finish`               | `server/creation.ts`      |
| `POST`   | `/api/creation/:id/jobs`                 | `server/creation.ts`      |
| `GET`    | `/api/credits`                           | `server/credits.ts`       |
| `GET`    | `/api/decks`                             | `server/app.ts`           |
| `POST`   | `/api/decks`                             | `server/app.ts`           |
| `DELETE` | `/api/decks/:id`                         | `server/app.ts`           |
| `GET`    | `/api/decks/:id`                         | `server/app.ts`           |
| `PATCH`  | `/api/decks/:id`                         | `server/app.ts`           |
| `PUT`    | `/api/decks/:id`                         | `server/app.ts`           |
| `GET`    | `/api/decks/:id/access`                  | `server/collaboration.ts` |
| `POST`   | `/api/decks/:id/access`                  | `server/collaboration.ts` |
| `DELETE` | `/api/decks/:id/access/:userId`          | `server/collaboration.ts` |
| `POST`   | `/api/decks/:id/ai`                      | `server/ai-edits.ts`      |
| `GET`    | `/api/decks/:id/ai-jobs`                 | `server/ai-edits.ts`      |
| `POST`   | `/api/decks/:id/ai/:jobId/operations`    | `server/ai-edits.ts`      |
| `GET`    | `/api/decks/:id/comments`                | `server/collaboration.ts` |
| `POST`   | `/api/decks/:id/comments`                | `server/collaboration.ts` |
| `DELETE` | `/api/decks/:id/comments/:commentId`     | `server/collaboration.ts` |
| `PATCH`  | `/api/decks/:id/comments/:commentId`     | `server/collaboration.ts` |
| `POST`   | `/api/decks/:id/duplicate`               | `server/app.ts`           |
| `GET`    | `/api/decks/:id/exports`                 | `server/exports.ts`       |
| `POST`   | `/api/decks/:id/exports`                 | `server/exports.ts`       |
| `GET`    | `/api/decks/:id/live`                    | `server/live.ts`          |
| `POST`   | `/api/decks/:id/live`                    | `server/live.ts`          |
| `DELETE` | `/api/decks/:id/presence`                | `server/collaboration.ts` |
| `GET`    | `/api/decks/:id/presence`                | `server/collaboration.ts` |
| `POST`   | `/api/decks/:id/presence`                | `server/collaboration.ts` |
| `GET`    | `/api/decks/:id/publication`             | `server/publications.ts`  |
| `POST`   | `/api/decks/:id/publication`             | `server/publications.ts`  |
| `POST`   | `/api/decks/:id/publication/downloads`   | `server/publications.ts`  |
| `POST`   | `/api/decks/:id/publication/revoke`      | `server/publications.ts`  |
| `POST`   | `/api/decks/:id/recovery`                | `server/collaboration.ts` |
| `POST`   | `/api/decks/:id/restore/:revision`       | `server/app.ts`           |
| `GET`    | `/api/decks/:id/review`                  | `server/collaboration.ts` |
| `GET`    | `/api/decks/:id/review/assets/:assetId`  | `server/collaboration.ts` |
| `GET`    | `/api/decks/:id/revisions`               | `server/app.ts`           |
| `GET`    | `/api/exports/:jobId/download`           | `server/exports.ts`       |
| `GET`    | `/api/folders`                           | `server/app.ts`           |
| `POST`   | `/api/folders`                           | `server/app.ts`           |
| `GET`    | `/api/health`                            | `server/app.ts`           |
| `GET`    | `/api/jobs`                              | `server/creation.ts`      |
| `GET`    | `/api/jobs/:id`                          | `server/creation.ts`      |
| `POST`   | `/api/jobs/:id/cancel`                   | `server/creation.ts`      |
| `GET`    | `/api/jobs/:id/preview`                  | `server/creation.ts`      |
| `GET`    | `/api/live/:id`                          | `server/live.ts`          |
| `POST`   | `/api/live/:id/control`                  | `server/live.ts`          |
| `GET`    | `/api/live/:id/qr`                       | `server/live.ts`          |
| `GET`    | `/api/me`                                | `server/app.ts`           |
| `PATCH`  | `/api/me`                                | `server/app.ts`           |
| `GET`    | `/api/publications`                      | `server/publications.ts`  |
| `GET`    | `/api/publications/:id`                  | `server/publications.ts`  |
| `GET`    | `/api/publications/:id/assets/:assetId`  | `server/publications.ts`  |
| `GET`    | `/api/publications/:id/download/:format` | `server/exports.ts`       |
| `GET`    | `/api/ready`                             | `server/app.ts`           |
| `GET`    | `/api/sources`                           | `server/sources.ts`       |
| `POST`   | `/api/sources`                           | `server/sources.ts`       |
| `DELETE` | `/api/sources/:id`                       | `server/sources.ts`       |
| `GET`    | `/api/sources/:id`                       | `server/sources.ts`       |
| `GET`    | `/api/theme-jobs`                        | `server/ai-themes.ts`     |
| `POST`   | `/api/theme-jobs`                        | `server/ai-themes.ts`     |
| `GET`    | `/api/themes`                            | `server/design.ts`        |
| `POST`   | `/api/themes`                            | `server/design.ts`        |
| `DELETE` | `/api/themes/:id`                        | `server/design.ts`        |
| `PUT`    | `/api/themes/:id`                        | `server/design.ts`        |
| `POST`   | `/api/uploads/:id/finish`                | `server/uploads.ts`       |
| `GET`    | `/api/uploads/config`                    | `server/uploads.ts`       |
| `POST`   | `/api/uploads/prepare`                   | `server/uploads.ts`       |
| `POST`   | `/api/uploads/token`                     | `server/uploads.ts`       |
| `POST`   | `/integrations/erxes/launch`             | `server/erxes.ts`         |

## 25. Implementation contracts for a builder with only this file

This section supplies decisions that otherwise might require looking at the reference source. These are the fresh-build contracts. Implement the frontend and backend together against them; if legacy clients are later supplied, preserve their contracts through explicit adapters. Do not silently choose different conventions in different features.

### Application shell and complete UI inventory

At desktop widths, use the 244px workspace navigation and flexible main content. The workspace header contains Frame identity, account controls, and creation actions. Navigation exposes presentations, shared presentations, archived/trash, themes, brand kits, and settings. Present saved decks as actual rendered covers with title, updated time, slide count, and access role. A context menu exposes permitted lifecycle actions. On narrow screens use a navigation drawer, stacked controls, and readable cards.

The editor uses a full-height working surface: document actions across the top; insertion tools below; an approximately 180px slide rail; a flexible gray/neutral canvas stage; an approximately 300px contextual inspector; and an expandable notes area. Inspector sections are selection, position/size/rotation, typography/content, appearance, data/media, accessibility, and animation. Hide irrelevant sections. Clicking empty canvas clears object selection. Opening an AI, comments, sharing, publication, or export panel must preserve selected slide and unsaved edits.

Every listed feature needs a visible entry point and a working form, dialog, or panel:

| Feature             | Entry and minimum controls                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Deck creation       | Workspace buttons for blank/template and AI; title/theme/template selection; create and cancel.                             |
| Slide management    | Rail add, reorder, duplicate, delete; layout menu; active slide marker and thumbnail.                                       |
| Insert              | Text, shapes, image upload, icons, table, chart, diagram, timeline, video, question, saved composition.                     |
| Selection           | Canvas handles and a layers list; lock/hide/group/order actions; align/distribute/match-size controls for multiple objects. |
| Text                | Inline rich-text editing plus inspector font, size, weight, alignment, color, spacing, and link controls.                   |
| Data                | Editable rows/cells for charts/tables, spreadsheet paste preview, node/milestone editing for diagrams/timelines.            |
| Questions           | Kind, prompt, ordered options, optional correct answer and explanation, rehearsal preview.                                  |
| Motion/interactions | Step/delay/duration/effect timeline; readable trigger/target/action builder with validation.                                |
| Theme               | Gallery preview, current/selected/deck scope, apply, explicit reset; custom designer and AI theme builder.                  |
| Sources             | Upload/paste, extraction progress, inspection, warnings, inclusion checkboxes, remove.                                      |
| Generation          | Brief, theme, outline, progress/previews, cancel, retry/resume, review, finish.                                             |
| AI editing          | Instruction, visible selected scope, optional sources, preview summary, apply/discard.                                      |
| Recovery            | Save state, retry, local recovery choice, conflict explanation, reload or save independent recovery copy.                   |
| Review              | Slide navigation, anchor selection, comment composer, thread list, resolve/reopen/delete where allowed.                     |
| Sharing             | Current role, owner, grant by registered account email, role change, revoke, stale-state feedback.                          |
| Publishing          | Visibility, downloads, current edition, publish/update/revoke, copy link, preparation status.                               |
| Export              | Format/scale, limitations, start, progress, retry, download.                                                                |
| Presenter           | Current/next, notes, timer, overview, fullscreen, slide/step controls, live session and question controls.                  |
| Audience            | Code/QR entry, join, current slide/question, submit once, pending/confirmed response, revealed result, reconnect/end state. |
| Administration      | Search/pagination, credit balance, unlimited toggle, save, stale revision error.                                            |
| erxes host          | Frame navigation, launch loading/error/retry, embedded studio, new-tab action, expired-session return guidance.             |

Use native semantic controls where possible. Each mutation disables only its affected action while pending and retains typed input on failure. Never erase a form after an unsuccessful request. Confirmation dialogs are appropriate for permanent deletion; ordinary saving and reversible edits should remain quick.

### Renderer and coordinate rules

Implement `renderSlide(slide, documentTheme, viewport, mode)` as React DOM and SVG with a shared theme resolver. Rendering must not mutate the document. Modes can control selection chrome and disclosure projections, but they must share layout and typography. Server exports mount the same renderer with a prevalidated projected snapshot.

Render a logical stage at the document's width/height. Scale its containing transform to fit the available viewport; preserve aspect ratio. Convert pointer coordinates back to logical coordinates using the stage rectangle and zoom. Rotate each element around its center. Elements later in the array paint above earlier elements. A hidden element is absent from normal playback/public output; the editor may show it dimmed through a deliberate layer-inspection control.

For move/resize/rotate, capture the initial selection geometry, apply transient transforms while dragging, then commit a single validated operation batch on pointer release. Escape cancels the transient gesture. Snap to slide edges/center and nearby object edges/centers within a screen-space tolerance converted to logical units. Show guides only while relevant. Group transforms retain relative geometry; ungroup removes the group relationship without moving objects.

Theme resolution order is explicit element property, slide theme snapshot, then document theme snapshot. A semantic color such as `accent` resolves through the selected theme; a literal hex override remains literal. Font role selects heading/body/label scaling, then explicit object overrides apply. Background bleed and decorative paths must not affect text measurement. Glass/paper effects need a flat readable fallback in environments that cannot reproduce them.

Use safe typed SVG for shapes/icons/diagrams/charts. A chart's bars/line segments represent actual values, including an honest zero baseline where applicable. A donut uses nonnegative values and handles all-zero data with a neutral empty state. Tables keep a rectangular cell matrix. Diagrams and timelines place editable data-driven nodes inside the element's bounds, with labels that can wrap. Visual annotations must never fabricate data.

Text measurement waits for the selected font. Compare actual rendered content bounds with the element box. Manual overflow gets a visible warning and explicit repair actions. Generated content can be measured and repaired before preview, but maintain readable minimums and retain any changed content in the generation result. Avoid one layout engine for the editor and another for exports.

### Layout recipes and starter templates

All coordinates below use the default 1280 × 720 stage and scale proportionally for other document dimensions. Begin with a 64px outer margin and a 32px gap. Themes can vary decoration and type treatment while preserving usable reading areas.

| Layout     | Starting composition                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Blank      | Empty slide with inherited background; insertion remains available.                                                          |
| Title      | Large headline in the central/left reading area, short subtitle below, optional small label; no compulsory decorative image. |
| Section    | One large section title, short context sentence, generous space.                                                             |
| Comparison | Heading at x64/y48, then two equal content columns beginning near y180 with separate headings and supporting copy.           |
| Quote      | Large quoted text with ample line spacing, small attribution only when supplied; no invented source.                         |
| Statistics | Heading plus up to three large value/label groups; numeric values must be supplied or source-supported.                      |
| Process    | Heading plus three ordered nodes and directional connectors; each node has a short label and explanation.                    |
| Summary    | Main takeaway and up to three concrete conclusions or next steps.                                                            |
| Text/image | Approximately half-width text and half-width image with meaningful crop/alt text; use only available assets.                 |
| Chart      | Heading, wide chart area, short takeaway, visible units/labels where provided.                                               |
| Timeline   | Heading and four initial milestones, with editable dates/labels and clear reading order.                                     |
| Team       | Three initial name/role groups; image slots are optional and do not fabricate portraits or biographies.                      |
| Questions  | Prompt and two to four large option rows; answer metadata stays private.                                                     |

Blank deck starts with one blank slide. Story template starts with title, context, development/process, and conclusion. Pitch template starts with title, problem, approach, supporting evidence, and next step. Lesson template starts with title, learning objective, explanation, worked example, audience question, and recap. Seed example copy explicitly says it is illustrative. Use no fabricated customer logos, testimonials, business results, or external citations. All seeded content must remain editable and removable.

The theme seed appendix includes exact palette/type/material data and any specific art-direction rules. Add original editable decorative geometry consistent with those rules. A precise pixel-for-pixel clone of unavailable reference screenshots is not required; the complete functionality, visual character, theme distinctions, and documented interactions are required.

### Client state and persistence state machine

Separate three kinds of state: persisted document, transient editor/presenter state, and asynchronous request/job state. Keep a single canonical local document and a pure operation reducer. Selection, hover, pan/zoom, inspector state, current playback time, and temporary drag transforms never create saved revisions.

The editor save state is `loading | saved | saving | offline | failed | conflict`. Track server revision, local edit sequence, acknowledged edit sequence, and at most one in-flight save per deck. After a committed local edit, immediately update recovery storage and debounce a save for about 600ms. Capture the sent sequence and document. A successful response updates the known server revision but must not replace edits made after the request began. Queue the newer changes for the next save.

On network failure, keep work and expose retry with bounded backoff. On HTTP 409, stop automatic writes and enter conflict state. Never retry the same stale document against a newer revision automatically. Recovery presents a choice: use the server version, recover local work if its base still matches, or save local work as an authorized independent copy. Before publish/export/live start, flush saving and verify the exact intended revision is durable.

Prefer IndexedDB for bounded local recovery of large documents; if storage quota is exceeded, keep in-memory work and show a clear warning. Recovery keys include signed-in user ID, workspace ID, and deck/draft ID. Store schema version and base revision. Validate recovery data on load. Do not expose one account's recovery through another account's session. Undo/redo retains a bounded stack of 80 meaningful states or equivalent inverse operations, with gesture/text coalescing.

Creation drafts use the same expected-revision pattern. A generation job receives an immutable copy of inputs. Editing the draft afterward cannot alter its queued prompt. Finish rejects a result for an outdated input fingerprint while leaving that result recoverable. Job polling is independent of the editor autosave loop.

### Fresh-build API request and response conventions

For a new client/server pair, return a resource directly for single reads/mutations; return `{ items, nextCursor }` for paginated resource lists; return `{ ok: true }` for successful deletion/revocation; return a job resource with HTTP 202 when work is queued. Use `{ error, code, requestId }` for failures. Cursor pagination orders by `(updatedAt, id)` or `(createdAt, id)` and enforces a bounded page size. Admin users additionally return `{ users, total, page, pageSize }` to support the page-based admin UI.

A job resource contains ID, kind, parent ID where relevant, status, `{ step, percent }` progress, attempts, timestamps, sanitized error, completion counts, preview revision, and authorized result metadata when ready. Do not return raw storage keys, private input prompts, provider credentials, leases, or transport receipts to a public client. Only authenticated authorized users can read private job details.

| API group                   | Request contract                                                                                   | Response / invariant                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth mode                   | `GET /api/auth/provider` with no identity claims in the request                                    | `{ provider: "clerk" }` or `{ provider: "erxes", erxesOrigin }`; runtime deployment configuration decides.                                     |
| Current user                | `GET /api/me`; `PATCH` with `{ name }`                                                             | `{ user: { id, name, email, workspaceId }, integration? }`; identity/email verified by provider.                                               |
| Create deck                 | `{ title, template: "blank"                                                                        | "story"                                                                                                                                        | "pitch"                                                                                  | "lesson", themeId, theme? }`                                                              | Full canonical document with server-owned identity/revision/timestamps. |
| Read/update deck            | GET; PATCH `{ baseRevision, operations }`; PUT `{ baseRevision, document }`                        | Full canonical document; server-owned fields preserved; 409 on stale revision.                                                                 |
| Duplicate/recovery          | Duplicate POST; recovery POST `{ document }`                                                       | New owned document with new IDs as needed and independently authorized asset records.                                                          |
| Folders                     | POST `{ name }`; GET list                                                                          | Owned/workspace folder record; deck moves use document update.                                                                                 |
| Revisions                   | GET list; POST restore with `{ baseRevision }` and revision in path                                | Restore creates a new current revision after access/base checks.                                                                               |
| Themes/brand kits           | POST `{ theme }` / `{ kit }`; PUT `{ baseRevision, theme }` / `{ baseRevision, kit }`              | Saved record with id, data, revision, timestamps, and canEdit.                                                                                 |
| Compositions                | POST `{ name, width, height, elements }`                                                           | Reusable composition; insertion generates fresh element/group IDs.                                                                             |
| Sources                     | JSON `{ name, text }` or multipart `file`; GET inspection; DELETE source ID                        | Extraction source with name/MIME, status, warnings, inspected text when ready, and extraction job ID.                                          |
| Preferences                 | PUT `{ language, agentMarkdown, baseRevision }`                                                    | Saved preferences and revision. New drafts copy them; stale update returns 409.                                                                |
| Creation draft              | POST `{ data }`; PUT `{ baseRevision, data }`                                                      | `{ id, revision, data, createdAt, updatedAt }`. Data contains brief/theme/outline/quickDraft/job IDs.                                          |
| Creation job                | POST `{ kind: "outline"                                                                            | "generate", baseRevision, key, resumeJobId? }`                                                                                                 | Root job resource with the immutable draft fingerprint.                                  |
| Finish creation             | POST `{ jobId }` to draft finish                                                                   | Saved canonical document; unique application prevents duplicates and charges once.                                                             |
| Job cancel                  | POST to cancel route                                                                               | Updated cancelled/cancel-requested job state; persisted before acknowledgement.                                                                |
| AI edit                     | `{ baseRevision, scope, instruction, sourceIds, key, mode, resumeJobId? }`                         | Job; successful result supplies summary, baseRevision, scope, validated operations, preview.                                                   |
| AI operations               | POST `{ baseRevision }` to job operations route                                                    | Revalidate job/scope/current access; return operations for the normal editor reducer and undo path. Save through the normal revision endpoint. |
| AI theme                    | POST `{ description, referenceAssetId?, baseTheme?, refinement?, key }`                            | Theme job; successful result contains validated theme and warnings; explicit save/apply follows.                                               |
| Credits                     | GET current balance; admin PATCH `{ remaining, revision }`                                         | `{ remaining: number                                                                                                                           | null, revision }`; admin audit/expected revision enforced.                               |
| Access grants               | POST `{ email, role, expectedRole }`; DELETE `{ expectedRole }`                                    | Sharing record with effective role, owner, and explicit grants; no blind role overwrite.                                                       |
| Comments                    | POST `{ body, slideId: string                                                                      | null, elementId: string                                                                                                                        | null }`; PATCH `{ resolved }`                                                            | Comment with author, resolution state, canResolve/canDelete; body limit 4,000 characters. |
| Presence                    | POST `{ mode: "view"                                                                               | "edit" }`; GET; DELETE                                                                                                                         | Peers plus current revision; 10-second heartbeat, approximately 30-second active window. |
| Publication                 | POST `{ baseRevision, expectedEdition: number                                                      | null, visibility, allowDownload }`                                                                                                             | Publication with edition, documentRevision, timestamps, and policies.                    |
| Revoke publication          | POST `{ id, expectedEdition }`                                                                     | Revoked publication; stale edition rejected; subsequent access/download denied.                                                                |
| Prepare published downloads | POST `{ expectedEdition, key }`                                                                    | 202 acknowledgement; published view exposes preparing/ready/failed download state.                                                             |
| Export                      | POST `{ format, scale: 0.5                                                                         | 1                                                                                                                                              | 2, baseRevision, key }`                                                                  | Job; final private download through authorized endpoint with correct MIME/disposition.    |
| Start live                  | POST `{ baseRevision }`                                                                            | Host session with ID/code/version, private snapshot, state, attendance, expiry.                                                                |
| Live control                | POST `{ expectedVersion, command }`                                                                | New host state/version or 409; commands follow section 8.                                                                                      |
| Audience join               | POST with empty body or permitted display-name field                                               | Opaque participant token and projected session; token stored by client for reconnect.                                                          |
| Audience read/answer        | Participant token in a dedicated authorization header; answer `{ round, questionId, optionIndex }` | Projected audience state/own response. One accepted response per participant/round.                                                            |
| Uploads                     | Prepare `{ kind, name, bytes, mime, checksum, presentationId? }`; finish `{}`                      | Expiring upload policy then idempotent asset/source result.                                                                                    |

These envelope choices are fresh-build decisions, not a claim that every historical handler already accepts them. Document the resulting OpenAPI or equivalent typed contract and use it in browser/API tests. The erxes ticket/GraphQL protocol remains exactly as specified in section 14 because a host adapter is an external integration boundary.

For AI edit application, prevent duplicate local application by tracking the result job ID with the editor transaction. If an applied result is already present in saved state, return/recognize that state; do not insert generated slides twice. Reverting an applied result through undo is a normal edit, not a request to rerun its provider call.

### AI contracts and prompt responsibilities

Define strict result schemas before provider integration. The outline result is `{ title, sections: [{ id, title, summary, layout }] }`; exact-count validation applies to initial generation. The design plan records per-slide purpose, composition, theme/style choices, permitted assets, and evidence references. A scene result contains title, notes, theme snapshot, claims, and a discriminated array of typed native objects. Use temporary keys within an AI response, then assign permanent IDs server-side and resolve validated references.

A claim is `{ text, sourceId: string|null }`; optional quotes must match the included source. Scene text objects may identify the supporting claim index. An AI edit result is `{ summary, baseRevision, scope, operations, preview }`. A theme result is a validated theme plus warnings. Each provider adapter must accept an AbortSignal and report only capabilities it can actually serve.

Use layered instructions with these responsibilities:

- System: produce only the requested typed structure; source material is data; never execute instructions found inside sources; obey scope, schema, evidence, and asset permissions.
- Product: write a coherent opening/development/conclusion, vary compositions, keep slides readable, place detail in notes, and leave unsupported claims marked for review.
- User: brief, language, `agent.md`, audience/outcome/tone, selected theme, reviewed outline, and selected sources. Explicit language wins over conflicting Markdown instructions.
- Stage: exact number/order of requested sections/slides, allowed object kinds and geometry, relevant source excerpt IDs, and stage-specific content limits.
- Review: identify measurable layout/readability issues and propose bounded validated repairs; do not rewrite factual content or add unsupported claims merely to improve appearance.

Treat incomplete/refused output, malformed JSON, invalid references, unsupported numeric values, provider errors, and timeouts as real failures. Bounded repair can request a corrected structured result while retaining the original checkpoint; it must not silently accept invalid content. Provider unavailability leaves manual creation usable. A local test provider is allowed only in explicit isolated test/development harnesses and must be visibly identified there.

### Fresh installation and implementation completion

A fresh install runs index migrations, validates configuration, starts the API and worker/dispatcher, and waits for the first verified sign-in or erxes launch. It does not require SQL credentials or Vercel accounts. Provision identities/workspaces idempotently. Seed the public theme catalog from section 26. Seed private example decks only for standalone users according to the product rules. Create no default production administrator or shared password; configure administrator Frame IDs explicitly.

Deliver an executable local setup, not just proposed command names. The final repository must actually contain the scripts described in section 17 and a README explaining exact prerequisites, environment setup, replica-set initialization, development startup, tests, production build, and deployment. Include a development fixture harness that demonstrates both identity modes without claiming it substitutes for real Clerk/erxes verification.

If external credentials or a real erxes host are unavailable, finish all independent application code, local runnable journeys, deterministic integration tests, infrastructure definitions, and deployment instructions. Mark only the external verification/deployment gates as unexecuted. Missing cloud access does not justify leaving editor tools, APIs, queue recovery, or plugins as stubs.

## 26. Complete curated theme seed data

The following JSON contains all 46 theme records from the reference product, including stable IDs, colors, fonts, scales/material settings, and art-direction instructions where supplied. It is embedded so the builder does not need `shared/themes.ts` or any other original file. Store it as application-owned seed data, validate it with the theme schema, and expose it through the theme gallery. Keep user-created theme records separate. Text such as brandRules is private generation/design guidance and must be removed by public projections.

```json
[
  {
    "id": "studio",
    "name": "Electric blue",
    "family": "Swiss",
    "description": "Confident type, clean grids, an electric blue stage.",
    "colors": {
      "background": "#2347dd",
      "foreground": "#ffffff",
      "accent": "#e6ff74",
      "secondary": "#c6d2ff",
      "surface": "#3659e5",
      "muted": "#c6d2ff"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade"
  },
  {
    "id": "mono",
    "name": "In black & white",
    "family": "Monochrome",
    "description": "Restrained geometry. Let the words do the work.",
    "colors": {
      "background": "#f4f3ef",
      "foreground": "#20211e",
      "accent": "#20211e",
      "secondary": "#5e6258",
      "surface": "#e6e6df",
      "muted": "#5e6258"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 700,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade"
  },
  {
    "id": "neon",
    "name": "After hours",
    "family": "Neon",
    "description": "Midnight, electric lime, and a controlled glow.",
    "colors": {
      "background": "#14182a",
      "foreground": "#f5f8ed",
      "accent": "#c9ff65",
      "secondary": "#b3bed4",
      "surface": "#252d43",
      "muted": "#b3bed4"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 12,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "glow",
    "shadow": "soft",
    "motion": "fade"
  },
  {
    "id": "glass",
    "name": "Deep water",
    "family": "Liquid glass",
    "description": "Cyan light and translucent instrument panels.",
    "colors": {
      "background": "#102d43",
      "foreground": "#f0fcff",
      "accent": "#83f1dd",
      "secondary": "#a4ccdf",
      "surface": "#254c61",
      "muted": "#a4ccdf"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 22,
    "borderWidth": 0,
    "spacing": 56,
    "material": "glass",
    "background": "glow",
    "shadow": "soft",
    "motion": "fade"
  },
  {
    "id": "editorial",
    "name": "Sunday paper",
    "family": "Editorial",
    "description": "Paper tones, serif headlines, and decisive red.",
    "colors": {
      "background": "#f5eee1",
      "foreground": "#302d29",
      "accent": "#b63724",
      "secondary": "#716452",
      "surface": "#e7dcc9",
      "muted": "#716452"
    },
    "headingFont": "Georgia",
    "bodyFont": "Georgia",
    "headingWeight": 400,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "paper",
    "background": "solid",
    "shadow": "none",
    "motion": "fade"
  },
  {
    "id": "brutalist",
    "name": "Loud & clear",
    "family": "Brutalist",
    "description": "Heavy borders, acid yellow, unapologetic scale.",
    "colors": {
      "background": "#f1f654",
      "foreground": "#1c211a",
      "accent": "#1c211a",
      "secondary": "#4c5428",
      "surface": "#e2e6a4",
      "muted": "#4c5428"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 900,
    "radius": 0,
    "borderWidth": 4,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade"
  },
  {
    "id": "playful",
    "name": "Good company",
    "family": "Playful",
    "description": "Expressive pink, rounded shapes, a playful rhythm.",
    "colors": {
      "background": "#ffcada",
      "foreground": "#4a1745",
      "accent": "#6e2488",
      "secondary": "#8b4567",
      "surface": "#ffe7ef",
      "muted": "#8b4567"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 44,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade"
  },
  {
    "id": "corporate",
    "name": "Clear direction",
    "family": "Corporate",
    "description": "Practical information and a composed blue palette.",
    "colors": {
      "background": "#f5f8fc",
      "foreground": "#17304f",
      "accent": "#1d53b8",
      "secondary": "#526d88",
      "surface": "#e2eaf4",
      "muted": "#526d88"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 700,
    "radius": 8,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade"
  },
  {
    "id": "organic",
    "name": "Common ground",
    "family": "Warm organic",
    "description": "Soft earth colors and a natural, generous pace.",
    "colors": {
      "background": "#e5e9d9",
      "foreground": "#293f32",
      "accent": "#8c432b",
      "secondary": "#56694f",
      "surface": "#d5dcc6",
      "muted": "#56694f"
    },
    "headingFont": "Georgia",
    "bodyFont": "DM Sans",
    "headingWeight": 400,
    "radius": 40,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade"
  },
  {
    "id": "retro",
    "name": "Future archive",
    "family": "Retro digital",
    "description": "Limited colors, pixel accents, vintage precision.",
    "colors": {
      "background": "#192c35",
      "foreground": "#c9f5db",
      "accent": "#e8ff9b",
      "secondary": "#85bcab",
      "surface": "#28434c",
      "muted": "#85bcab"
    },
    "headingFont": "Courier New",
    "bodyFont": "Courier New",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 2,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "none"
  },
  {
    "id": "look-monochrome",
    "name": "Monochrome",
    "family": "Monochrome",
    "description": "No extra color. Nothing holding the idea back.",
    "artDirection": "monochrome",
    "artVersion": 2,
    "colors": {
      "background": "#f7f7f7",
      "foreground": "#101010",
      "accent": "#101010",
      "secondary": "#595959",
      "surface": "#e7e7e7",
      "muted": "#595959"
    },
    "headingFont": "DM Sans",
    "bodyFont": "DM Sans",
    "headingWeight": 900,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise"
  },
  {
    "id": "look-rage",
    "name": "Rage",
    "family": "Rage",
    "description": "A statement, turned all the way up. Music meets fashion.",
    "artDirection": "rage",
    "artVersion": 2,
    "colors": {
      "background": "#ff4937",
      "foreground": "#170b09",
      "accent": "#170b09",
      "secondary": "#35130d",
      "surface": "#ffb9aa",
      "muted": "#35130d"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise"
  },
  {
    "id": "look-liquid",
    "name": "Liquid glass",
    "family": "Liquid glass",
    "description": "Light bends. The idea stays clear.",
    "artDirection": "liquid",
    "artVersion": 2,
    "colors": {
      "background": "#071632",
      "foreground": "#f3faff",
      "accent": "#a0e7ff",
      "secondary": "#a9c5eb",
      "surface": "#183d71",
      "muted": "#a9c5eb"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 500,
    "radius": 30,
    "borderWidth": 0,
    "spacing": 56,
    "material": "glass",
    "background": "glow",
    "shadow": "soft",
    "motion": "rise"
  },
  {
    "id": "look-material",
    "name": "Material You",
    "family": "Material You",
    "description": "Soft shapes. A little unexpected. Entirely yours.",
    "artDirection": "material",
    "artVersion": 2,
    "colors": {
      "background": "#d7f96b",
      "foreground": "#202512",
      "accent": "#3d4a1c",
      "secondary": "#4b5736",
      "surface": "#e0c5ff",
      "muted": "#4b5736"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 48,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise"
  },
  {
    "id": "look-future",
    "name": "Retro future",
    "family": "Retro future",
    "description": "Tomorrow, imagined yesterday. Precision with a pulse.",
    "artDirection": "future",
    "artVersion": 2,
    "colors": {
      "background": "#1c201c",
      "foreground": "#fff4d5",
      "accent": "#ffc773",
      "secondary": "#c2baa3",
      "surface": "#34382c",
      "muted": "#c2baa3"
    },
    "headingFont": "Space Grotesk",
    "bodyFont": "DM Sans",
    "headingWeight": 700,
    "radius": 0,
    "borderWidth": 1,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise"
  },
  {
    "id": "look-y2k",
    "name": "Y2K",
    "family": "Y2K",
    "description": "New millennium energy. Chrome, curves, and a blue sky.",
    "artDirection": "y2k",
    "artVersion": 2,
    "colors": {
      "background": "#1236d5",
      "foreground": "#f4f6ff",
      "accent": "#e9ff93",
      "secondary": "#c8d6ff",
      "surface": "#244ddf",
      "muted": "#c8d6ff"
    },
    "headingFont": "Syne",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 24,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "soft",
    "motion": "rise"
  },
  {
    "id": "look-nostalgia",
    "name": "Nostalgia",
    "family": "Nostalgia",
    "description": "A familiar feeling. A story worth keeping.",
    "artDirection": "nostalgia",
    "artVersion": 2,
    "colors": {
      "background": "#f0dfb8",
      "foreground": "#431c23",
      "accent": "#6f2930",
      "secondary": "#69454a",
      "surface": "#fffaeb",
      "muted": "#69454a"
    },
    "headingFont": "Fraunces",
    "bodyFont": "DM Sans",
    "headingWeight": 600,
    "radius": 4,
    "borderWidth": 0,
    "spacing": 56,
    "material": "paper",
    "background": "solid",
    "shadow": "none",
    "motion": "rise"
  },
  {
    "id": "look-clay",
    "name": "Clay",
    "family": "Clay",
    "description": "Big ideas with a softer side. Almost within reach.",
    "artDirection": "clay",
    "artVersion": 2,
    "colors": {
      "background": "#ff8a50",
      "foreground": "#33170b",
      "accent": "#54250e",
      "secondary": "#643117",
      "surface": "#ffdda6",
      "muted": "#643117"
    },
    "headingFont": "Nunito",
    "bodyFont": "DM Sans",
    "headingWeight": 900,
    "radius": 60,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "soft",
    "motion": "rise"
  },
  {
    "id": "look-terminal",
    "name": "Terminal",
    "family": "Terminal",
    "description": "Less interface. More signal. Make every line count.",
    "artDirection": "terminal",
    "artVersion": 2,
    "colors": {
      "background": "#09120e",
      "foreground": "#bcffd1",
      "accent": "#bcffd1",
      "secondary": "#80b994",
      "surface": "#182c20",
      "muted": "#80b994"
    },
    "headingFont": "Courier New",
    "bodyFont": "Courier New",
    "headingWeight": 700,
    "radius": 0,
    "borderWidth": 1,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "none"
  },
  {
    "id": "look-bauhaus",
    "name": "Bauhaus",
    "family": "Bauhaus",
    "description": "Primary colors. Radical geometry. Form with a purpose.",
    "artDirection": "bauhaus",
    "artVersion": 2,
    "colors": {
      "background": "#f5f1e7",
      "foreground": "#151515",
      "accent": "#b52519",
      "secondary": "#4b4841",
      "surface": "#edcf54",
      "muted": "#4b4841"
    },
    "headingFont": "DM Sans",
    "bodyFont": "DM Sans",
    "headingWeight": 900,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Bauhaus poster composition: massive geometric sans type, circles, triangles and rectangular color planes. Use vermilion, cobalt and yellow as structural shapes on warm white, with near-black readable text. Compose asymmetrically around a strong grid; keep geometry flat and purposeful. No gradients, glass, rounded cards or decorative UI. Vary slides between large type, geometric process diagrams and open data layouts."
  },
  {
    "id": "look-pop",
    "name": "Pop Art",
    "family": "Pop Art",
    "description": "Big ink. Bright ideas. Straight off the printing press.",
    "artDirection": "pop",
    "artVersion": 2,
    "colors": {
      "background": "#ffe94a",
      "foreground": "#211137",
      "accent": "#a6004b",
      "secondary": "#51405e",
      "surface": "#ffb8de",
      "muted": "#51405e"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 3,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Pop art and comic printing: condensed impact headlines, yellow and pink color blocks, dark ink outlines, offset hard shadows and restrained halftone dot fields. Build sequential ideas as comic panels; use burst shapes only where emphasis is meaningful. Keep actual copy horizontal and readable. Charts should be bold, direct and honestly labeled. No soft shadows, glass or generic rounded dashboards."
  },
  {
    "id": "look-blueprint",
    "name": "Blueprint",
    "family": "Blueprint",
    "description": "Draw the thinking. Show how everything connects.",
    "artDirection": "blueprint",
    "artVersion": 2,
    "colors": {
      "background": "#07399e",
      "foreground": "#f1f9ff",
      "accent": "#b2f6ff",
      "secondary": "#c2dfff",
      "surface": "#1248a5",
      "muted": "#c2dfff"
    },
    "headingFont": "Courier New",
    "bodyFont": "DM Sans",
    "headingWeight": 700,
    "radius": 0,
    "borderWidth": 1,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Architectural blueprint: saturated drafting blue, white technical linework, restrained cyan highlights, monospaced headings and measurement rules. Explain systems with precise labeled diagrams, exploded geometry and clear connection paths. Use grid lines faintly so they never compete with text. Layouts should resemble technical drawings rather than a terminal or sci-fi HUD. No fake measurements or invented data."
  },
  {
    "id": "look-deco",
    "name": "Art Deco",
    "family": "Art Deco",
    "description": "A little ceremony. A lasting impression.",
    "artDirection": "deco",
    "artVersion": 2,
    "colors": {
      "background": "#112a25",
      "foreground": "#fff0cf",
      "accent": "#efc77b",
      "secondary": "#c6c5ad",
      "surface": "#233c34",
      "muted": "#c6c5ad"
    },
    "headingFont": "Fraunces",
    "bodyFont": "DM Sans",
    "headingWeight": 500,
    "radius": 0,
    "borderWidth": 1,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Art Deco architectural elegance: deep evergreen, warm ivory serif headlines, gold linear ornaments, stepped frames, long verticals, diamonds and restrained symmetry. Keep generous negative space. Use radial or architectural compositions where they explain a relationship, with clear captions and fine rules. Content and charts must stay readable and uncluttered. No neon, glass, dashboard cards or distressed textures."
  },
  {
    "id": "look-memphis",
    "name": "Memphis",
    "family": "Memphis",
    "description": "A good kind of chaos. Shapes with something to say.",
    "artDirection": "memphis",
    "artVersion": 2,
    "colors": {
      "background": "#ffd7ee",
      "foreground": "#291442",
      "accent": "#6624ba",
      "secondary": "#59376c",
      "surface": "#ffe568",
      "muted": "#59376c"
    },
    "headingFont": "Nunito",
    "bodyFont": "DM Sans",
    "headingWeight": 900,
    "radius": 18,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Memphis postmodern graphic design: pink paper, sunny yellow shapes, purple ink, asymmetric blocks, squiggles, dots, cutout circles and triangular accents. Keep patterns at the edges and behind empty space. Explain processes through playful but ordered shapes with readable labels. Use flat fills and deliberate offset placement; no clay shading, glass or one repeated card grid. Information remains the focus."
  },
  {
    "id": "look-editorial",
    "name": "Editorial",
    "family": "Editorial",
    "description": "The headline is the invitation. The detail earns it.",
    "artDirection": "editorial",
    "artVersion": 2,
    "colors": {
      "background": "#e8f0f5",
      "foreground": "#102c4d",
      "accent": "#b52e17",
      "secondary": "#3e5873",
      "surface": "#cadbe9",
      "muted": "#3e5873"
    },
    "headingFont": "Fraunces",
    "bodyFont": "DM Sans",
    "headingWeight": 700,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Contemporary editorial magazine on cool blue-white paper: expressive large serif headlines, navy ink, small red-orange accents, a narrow masthead and strong asymmetric columns. Treat each slide as a considered spread, varying pull quotes, oversized takeaways and data-led pages. Keep fine rules meaningful and body text concise. No warm beige luxury template, generic cards, fake issue numbers or invented bylines."
  },
  {
    "id": "look-thinking-space",
    "name": "Thinking Space II",
    "family": "Game & music",
    "description": "Grayscale machinery. Lime portals. A thought in the dark.",
    "artDirection": "thinking-space",
    "artVersion": 2,
    "colors": {
      "background": "#111413",
      "foreground": "#f0f4ed",
      "accent": "#abf568",
      "secondary": "#b4beb1",
      "surface": "#2b312c",
      "muted": "#b4beb1"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Inspired by Geometry Dash Thinking Space II: near-black industrial ruins, layered grayscale angular machinery, skeletal gears, hanging structures and sharply limited electric lime portal accents. Use original editable vector geometry, not screenshots or game assets. Keep the main reading area calm and high contrast; put intricate machinery along the edges. Use strong condensed headlines and meaningful diagrams. Do not turn this into generic green terminal UI or add flashing effects. Vary every slide's composition; retain factual copy and readable data."
  },
  {
    "id": "look-limbo",
    "name": "LIMBO",
    "family": "Game & music",
    "description": "Eight keys. Impossible doors. Follow the thread.",
    "artDirection": "limbo",
    "artVersion": 2,
    "colors": {
      "background": "#120e2c",
      "foreground": "#f4edff",
      "accent": "#c1afff",
      "secondary": "#c6b9df",
      "surface": "#2b234b",
      "muted": "#c6b9df"
    },
    "headingFont": "Fraunces",
    "bodyFont": "DM Sans",
    "headingWeight": 600,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Inspired by MindCap's Geometry Dash LIMBO: indigo and dark red architectural hallucinations, layered impossible doorways, chain-like circuits and multicolored key motifs. Use original geometry with a mysterious serif headline and clean sans body. Keys should encode options or steps when meaningful; decorative keys stay outside the reading area. Organize content as branching rooms, routes and choices rather than repeating cards. No copied logos or gameplay assets, no false interactivity, and no flashing or disorienting motion."
  },
  {
    "id": "look-sonic-wave",
    "name": "Sonic Wave Infinity",
    "family": "Game & music",
    "description": "Ice-blue voltage. Hard angles. Full momentum.",
    "artDirection": "sonic-wave",
    "artVersion": 2,
    "colors": {
      "background": "#07152e",
      "foreground": "#effaff",
      "accent": "#87e4ff",
      "secondary": "#b2cce5",
      "surface": "#12355c",
      "muted": "#b2cce5"
    },
    "headingFont": "Syne",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Inspired by APTeam's Geometry Dash Sonic Wave Infinity: icy cyan and white outlines on deep navy, nested diamond corridors, angular wave traces and a small pink counter-signal. Use large forward-leaning type, sharp vector outlines and alternating diagonal composition. Routes and waves should explain sequence or cause and effect without fabricating chart data. Use original native objects, not game screenshots or logos. Preserve clean reading zones and chart labels; no generic glowing card grid or constant animated flashing."
  },
  {
    "id": "look-ransom-ink",
    "name": "Ransom Ink",
    "family": "Game & music",
    "description": "Yellow ink on black. Crosshatched, loud, and handmade.",
    "artDirection": "ransom-ink",
    "artVersion": 2,
    "colors": {
      "background": "#141615",
      "foreground": "#f5e86a",
      "accent": "#f5e86a",
      "secondary": "#c9c3a0",
      "surface": "#292a20",
      "muted": "#c9c3a0"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Inspired by the supplied Ransom Remix music-cover reference: dusty black sleeve, yellow pen outlines, crosshatched strokes, oversized condensed lettering and a restrained burgundy counter-accent. Build original wireframe illustrations, glasses-like paired lenses or subject-specific engraved line art; do not reproduce performers' portraits, lettering, logos or lyrics. Pair rough vector outlines with crisp readable body text. Use different sleeve-like compositions, paired comparisons and underlined takeaways. Keep hatching away from small text. No neon UI glow or soft pastel cards."
  },
  {
    "id": "look-beatmap",
    "name": "Beatmap",
    "family": "Game & music",
    "description": "Hit circles. Clean rhythm. Every point lands.",
    "artDirection": "beatmap",
    "artVersion": 2,
    "colors": {
      "background": "#fff3fa",
      "foreground": "#361c35",
      "accent": "#a11962",
      "secondary": "#61465e",
      "surface": "#f1d5e6",
      "muted": "#61465e"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 32,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Inspired by osu! hit circles and rhythm-game approach rings: pale paper, deep plum readable text, magenta rings, clean circular nodes and smooth connecting paths. Use step numbers only for real ordered processes. Build spatial rhythms with generous whitespace and a clear reading order, rather than dashboard cards. Charts remain conventional readable data visualizations; circle graphics must not imply unsupported numerical values. Original geometry only, no osu! logos, copied beatmaps or game UI. No automatic pulse, flashing or required motion."
  },
  {
    "id": "look-street-radio",
    "name": "Street Radio",
    "family": "Game & music",
    "description": "Cel-shaded color. Street-poster attitude. Turn it up.",
    "artDirection": "street-radio",
    "artVersion": 2,
    "colors": {
      "background": "#ffb637",
      "foreground": "#173535",
      "accent": "#235044",
      "secondary": "#355247",
      "surface": "#e7f9bc",
      "muted": "#355247"
    },
    "headingFont": "Syne",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 3,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "rise",
    "brandRules": "Inspired by Jet Set Radio's cel-shaded street-art energy: saturated orange, mint paper, dark teal ink, exaggerated speaker cones, cutout plates, speed lines and graffiti-like angular geometry. Compose with strong diagonal panels and oversized readable headlines. Illustrations should be original and subject-specific; no copyrighted characters or logos, copied graffiti tags or meaningless text. Use flat hard-edged colors, deliberate asymmetry and clean supporting copy. Avoid clay shading, translucent glass and repeated centered cards."
  },
  {
    "id": "look-save-point",
    "name": "Save Point",
    "family": "Game & music",
    "description": "Pixel worlds. Quiet magic. A place to begin again.",
    "artDirection": "save-point",
    "artVersion": 2,
    "colors": {
      "background": "#201638",
      "foreground": "#fff2d9",
      "accent": "#a6f0ca",
      "secondary": "#d3c2df",
      "surface": "#37264f",
      "muted": "#d3c2df"
    },
    "headingFont": "Courier New",
    "bodyFont": "Courier New",
    "headingWeight": 700,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "none",
    "brandRules": "Inspired by classic pixel-RPG save rooms and inventory frames: deep violet night, warm ivory monospaced text, mint crystal light, stepped pixel corners and sparse square stars. Use native blocky geometry and original crystals, maps or quest-like diagrams. Keep ordered content on a readable route; never invent game statistics or place fake actionable game controls on a slide. No copyrighted sprites, characters or logos. Avoid rounded glass cards, neon cyberpunk HUDs or blinking effects. Keep clear text areas and vary room-like compositions."
  },
  {
    "id": "look-warehouse",
    "name": "Warehouse",
    "family": "Game & music",
    "description": "Vinyl grooves. Utility type. After-hours precision.",
    "artDirection": "warehouse",
    "artVersion": 2,
    "colors": {
      "background": "#d5d8ce",
      "foreground": "#171d1b",
      "accent": "#964218",
      "secondary": "#49514a",
      "surface": "#bec5b8",
      "muted": "#49514a"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Inspired by underground techno record sleeves and warehouse flyers: industrial pale gray, heavy charcoal condensed type, restrained rust ink, concentric vinyl grooves, cut marks and barcode-like vector rhythms. Use asymmetric label/sleeve compositions, setlist-like rows for ordered processes and precise open chart layouts. Do not add fake dates, event lineups, product codes or statistics. Keep decorative grooves and barcodes separate from actual data and small text. Original graphic geometry only; no album covers, artist logos or lyrics."
  },
  {
    "id": "look-melt-eyez",
    "name": "Melt My Eyez",
    "family": "Game & music",
    "description": "Denzel Curry’s warped blues, teal echoes, and orange sleeve spine.",
    "artDirection": "melt-eyez",
    "artVersion": 2,
    "colors": {
      "background": "#102b4b",
      "foreground": "#eef8ff",
      "accent": "#ffbb62",
      "secondary": "#b5cddd",
      "surface": "#1a405a",
      "muted": "#b5cddd"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Melt My Eyez See Your Future by Denzel Curry: an orange obi spine, distorted blue-teal silhouette, lateral analog smears and a restrained purple afterimage. Use a densely cut condensed headline against broad dark breathing room. Build original editable vector distortion bands and off-register contours. Content slides alternate spine-led columns and wide cinematic panels; keep text crisp rather than blurring it. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-brat",
    "name": "brat",
    "family": "Game & music",
    "description": "Charli xcx’s acid-green sleeve. Plain type, maximum presence.",
    "artDirection": "brat",
    "artVersion": 2,
    "colors": {
      "background": "#8ace00",
      "foreground": "#111508",
      "accent": "#111508",
      "secondary": "#344309",
      "surface": "#b0e748",
      "muted": "#344309"
    },
    "headingFont": "DM Sans",
    "bodyFont": "DM Sans",
    "headingWeight": 400,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Brat by Charli xcx: a full acid-green field, blunt plain black sans lettering, radical negative space and deliberately unpolished restraint. Center a short headline at an oversized scale; use simple aligned columns for detail. Preserve the author’s wording and case. No ornamental shapes, gradients, glow, UI cards, fancy type or blur on reading text. The confident green field and spacing are the entire identity. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-hard-soft",
    "name": "Hard & Soft",
    "family": "Game & music",
    "description": "Billie Eilish’s deep blue water and a doorway into the light.",
    "artDirection": "hard-soft",
    "artVersion": 2,
    "colors": {
      "background": "#061d3b",
      "foreground": "#edf7ff",
      "accent": "#a5daff",
      "secondary": "#adc8e4",
      "surface": "#12365a",
      "muted": "#adc8e4"
    },
    "headingFont": "Manrope",
    "bodyFont": "DM Sans",
    "headingWeight": 500,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by HIT ME HARD AND SOFT by Billie Eilish: midnight underwater blues, a white tilted doorway above the water, drifting light shafts and broad empty depth. Use thin rippling contours and a small cluster of bubbles as editable geometry; let a restrained pale headline float in a calm reading zone. Alternate large open compositions and deep blue inset panels. Avoid a generic space scene or neon dashboard. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-question-mark",
    "name": "? — XXXTENTACION",
    "family": "Game & music",
    "description": "Photocopied fragments. Torn edges. Black ink on white.",
    "artDirection": "question-mark",
    "artVersion": 2,
    "colors": {
      "background": "#eeece7",
      "foreground": "#171717",
      "accent": "#252525",
      "secondary": "#55524e",
      "surface": "#d7d5d0",
      "muted": "#55524e"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by The question-mark album by XXXTENTACION: black-and-white photocopy collage, staggered contact-sheet fragments, rough torn-paper edges and fine scratched marks. Use original monochrome abstract fragments and high-impact condensed type, not a reproduced photograph. Keep the collage at the periphery while content remains clean. Use offset paper comparisons and contact-sheet structures for ideas, with no fake captions or decorative words. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-i-am-you",
    "name": "I Am You",
    "family": "Game & music",
    "description": "YNW Melly’s painted white room: cyan, lime, pink, and yellow.",
    "artDirection": "i-am-you",
    "artVersion": 2,
    "colors": {
      "background": "#f3f3eb",
      "foreground": "#18312d",
      "accent": "#006189",
      "secondary": "#40574f",
      "surface": "#dbe9da",
      "muted": "#40574f"
    },
    "headingFont": "Syne",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by I Am You by YNW Melly: a bright white room covered in cyan, grassy lime, yellow and hot-pink paint, spontaneous brush strokes, drips and overlapping marks. Build original editable paint strokes around generous white reading space. Use expressive big black type; content becomes open studio-wall arrangements, paint underlines and color-coded columns. No portraits, copied graffiti phrases, meaningless tags or paint behind small text. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-igor",
    "name": "IGOR",
    "family": "Game & music",
    "description": "Tyler, The Creator’s pink sleeve, black ink, and stark cutout forms.",
    "artDirection": "igor",
    "artVersion": 2,
    "colors": {
      "background": "#eea8c4",
      "foreground": "#21171d",
      "accent": "#21171d",
      "secondary": "#59414c",
      "surface": "#dc8fac",
      "muted": "#59414c"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by IGOR by Tyler, The Creator: dusty saturated pink, severe black-and-white cutout portrait energy, heavy condensed type, an asymmetric monochrome bust-like geometric silhouette and empty pink space. Make an original faceted silhouette without reproducing the artist’s likeness. Keep typography raw and direct, with no gradients, soft cards or fashion-magazine embellishment. Use stark pink/ink columns and cropped monochrome blocks for comparisons. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-hunter",
    "name": "Hunter × Hunter",
    "family": "Game & music",
    "description": "Forest green, electric lime, red strikes, and a trail to follow.",
    "artDirection": "hunter",
    "artVersion": 2,
    "colors": {
      "background": "#0e3527",
      "foreground": "#f4f7df",
      "accent": "#c0f75b",
      "secondary": "#b7d5b7",
      "surface": "#20513a",
      "muted": "#b7d5b7"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Hunter x Hunter: Gon’s forest-green and red palette, bright lime aura, intersecting hunter marks, compass circles and adventurous routes. Build original sharp crossed shapes, trail lines and map-like diagrams. Use energetic condensed headlines, clean labels and rich green negative space. The red is a sparse graphic counterpoint, not body text. Give actual steps a route and relationships a branching map; no character screenshots or invented game statistics. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-league",
    "name": "League of Legends",
    "family": "Game & music",
    "description": "Deep teal, antique gold, and the geometry of a Nexus.",
    "artDirection": "league",
    "artVersion": 2,
    "colors": {
      "background": "#092633",
      "foreground": "#f6edcf",
      "accent": "#e8c46c",
      "secondary": "#bfd0ca",
      "surface": "#163f48",
      "muted": "#bfd0ca"
    },
    "headingFont": "Fraunces",
    "bodyFont": "DM Sans",
    "headingWeight": 600,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by League of Legends and Summoner’s Rift: deep blue-teal, antique gold linework, luminous cyan crystal facets, heroic serif titles and architectural rune circles. Build an original Nexus-like faceted core and refined angular frames, using thin gold details around calm content. Use map routes for strategy and gold-divided open comparisons. Avoid dense fake HUDs, copied logos, champion portraits or invented stats. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-phoenix",
    "name": "Phoenix",
    "family": "Game & music",
    "description": "VALORANT: white-hot flare, ember orange, and charcoal.",
    "artDirection": "phoenix",
    "artVersion": 2,
    "colors": {
      "background": "#201815",
      "foreground": "#fff1da",
      "accent": "#ffbb67",
      "secondary": "#d8c0aa",
      "surface": "#463025",
      "muted": "#d8c0aa"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Phoenix from VALORANT: ember-orange flame tongues, golden flare orbs, bright jacket-white slashes and charcoal. Use large angular condensed type, an original rising flame silhouette, sweeping curveball arcs and hard diagonal cuts. Make warm light a bold flat graphic rather than a glow filter. Keep fire to the edges and behind empty space; readable comparisons and process steps should feel fast and confident. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-viper",
    "name": "Viper",
    "family": "Game & music",
    "description": "VALORANT: poison green, black armor, and a rising veil.",
    "artDirection": "viper",
    "artVersion": 2,
    "colors": {
      "background": "#071f19",
      "foreground": "#e9ffe8",
      "accent": "#a4f95d",
      "secondary": "#a9d0b8",
      "surface": "#123d2c",
      "muted": "#a9d0b8"
    },
    "headingFont": "Space Grotesk",
    "bodyFont": "DM Sans",
    "headingWeight": 700,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Viper from VALORANT: almost-black green, acid-green poison, layered venom curtains and sharply cut armor geometry. Use original flowing toxic contours and a pointed shield/lens motif, contrasted with tightly aligned type. Alternate tall divided columns and wide bands to show control, flow and boundaries. No generic terminal text, fake status numbers or flashing effects; leave a quiet black-green reading zone. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-reyna",
    "name": "Reyna",
    "family": "Game & music",
    "description": "VALORANT: violet-black, radiant magenta, and a watching eye.",
    "artDirection": "reyna",
    "artVersion": 2,
    "colors": {
      "background": "#21112f",
      "foreground": "#fff0ff",
      "accent": "#f3a1eb",
      "secondary": "#d6b7df",
      "surface": "#40204f",
      "muted": "#d6b7df"
    },
    "headingFont": "Syne",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Reyna from VALORANT: violet-black atmosphere, saturated magenta soul-orbs, a sharp iris motif and elegant predatory curves. Use original eye-shaped contour geometry with nested pink/lilac crescents and hard cropped edges. Pair wide expressive headlines with very readable body copy; organize content as asymmetrical splits and orbital relationships. Keep the eye away from small text and avoid generic cosmic gradients or repeated cards. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-neon",
    "name": "Neon",
    "family": "Game & music",
    "description": "VALORANT: electric cobalt, yellow bolts, and cyan velocity.",
    "artDirection": "neon",
    "artVersion": 2,
    "colors": {
      "background": "#102887",
      "foreground": "#f0faff",
      "accent": "#f8ed65",
      "secondary": "#c1d9ff",
      "surface": "#1b419c",
      "muted": "#c1d9ff"
    },
    "headingFont": "Barlow Condensed",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Neon from VALORANT: saturated electric cobalt, bright yellow lightning, cyan speed trails and forward diagonals. Use original jagged energy paths and a sharply slanted composition, with oversized condensed typography and clear dark-blue reading zones. Build genuine sequences as connected angled lanes. Preserve horizontal body text and conventional chart labels. No flashing, fake speed data or copied game interfaces. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  },
  {
    "id": "look-yoru",
    "name": "Yoru",
    "family": "Game & music",
    "description": "VALORANT: cobalt rifts, icy shards, and an oni-mask silhouette.",
    "artDirection": "yoru",
    "artVersion": 2,
    "colors": {
      "background": "#0c1742",
      "foreground": "#edf5ff",
      "accent": "#9ac7ff",
      "secondary": "#bec9ec",
      "surface": "#202d60",
      "muted": "#bec9ec"
    },
    "headingFont": "Syne",
    "bodyFont": "DM Sans",
    "headingWeight": 800,
    "radius": 0,
    "borderWidth": 0,
    "spacing": 56,
    "material": "flat",
    "background": "solid",
    "shadow": "none",
    "motion": "fade",
    "brandRules": "Heavily inspired by Yoru from VALORANT: deep indigo, cobalt dimensional rifts, ice-white shards, a small vermilion strike and an original angular oni-mask silhouette. Make broken diamond portals and offset facets that frame a calm reading zone; wide bold type should feel cut from the same planes. Use split panels for comparisons and parallel lanes for processes. Avoid copied logos, character art, tiny HUD decoration and disorienting animation. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck."
  }
]
```

## 27. Whole-application delivery checklist

The build is complete only when the delivered repository includes all of the following working pieces:

- React workspace, creation studio, editor, review, presenter, audience, public viewer, Explore, account settings, and admin screens with real data and failure/recovery states.
- The shared versioned model, validation, operation reducer, renderer, all ten element types, layouts/templates, all curated themes, theme designer, brand kits, compositions, interactions, motion, and accessibility controls.
- MongoDB-backed users/workspaces/permissions, decks and immutable content, revisions, recovery, sources, drafts, jobs/checkpoints, preferences, credits/audits, publications/editions, exports, live participation, comments, presence, and erxes state.
- Real standalone authentication integration and both erxes source plugins with verified single-use ticket exchanges, tenant binding, sessions, embedded operation, and new-tab fallback.
- Source extraction, configurable real AI provider integration, research/evidence handling, outline and scene generation, fitting/review, scoped AI editing, AI themes, cancel/retry/resume, and exactly-once finish/charging semantics.
- Private S3 upload/download delivery, authorization, Range support, immutable asset promotion, safe cleanup, export rendering, and actual PDF/PNG ZIP/HTML/image-based PPTX output.
- SQS consumers, transactional outbox, dispatcher, job fencing/heartbeats, cancellation, bounded retries, parent/child progression, maintenance, and restart recovery.
- Reproducible Bun setup, development replica set, API and worker containers, pinned dependencies, environment validation, AWS infrastructure definitions, operational logs/health/alarms, and backup/restore tools.
- Tests for domain rules, API contracts, MongoDB races, permission boundaries, provider failures, job failures, editor journeys, erxes integration, visual rendering, exports, and accessibility.
- A release report with the commands actually run, results, local launch instructions, deployed links when deployment was authorized and executed, and any remaining external verification requirements.

No original code checkout, old database, undocumented proprietary layout service, or manually precreated production records may be necessary to start a fresh installation. Optional migration support is evaluated separately when legacy data is provided. The application must remain useful for manual presentations when AI is unavailable, and the same full editor must work in standalone and erxes-connected modes.
