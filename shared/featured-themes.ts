import type { Theme } from "./schema";

function look(
  artDirection: NonNullable<Theme["artDirection"]>,
  name: string,
  description: string,
  colors: [string, string, string, string, string],
  extra: Partial<Theme> = {},
): Theme {
  const [background, foreground, accent, secondary, surface] = colors;
  return {
    id: `look-${artDirection}`,
    name,
    family: name,
    description,
    artDirection,
    artVersion: 2,
    colors: {
      background,
      foreground,
      accent,
      secondary,
      surface,
      muted: secondary,
    },
    headingFont: "Space Grotesk",
    bodyFont: "DM Sans",
    headingWeight: 700,
    radius: 0,
    borderWidth: 0,
    spacing: 56,
    material: "flat",
    background: "solid",
    shadow: "none",
    motion: "rise",
    ...extra,
  };
}

export const FEATURED_THEMES: Theme[] = [
  look(
    "monochrome",
    "Monochrome",
    "No extra color. Nothing holding the idea back.",
    ["#f7f7f7", "#101010", "#101010", "#595959", "#e7e7e7"],
    { headingFont: "DM Sans", headingWeight: 900 },
  ),
  look(
    "rage",
    "Rage",
    "A statement, turned all the way up. Music meets fashion.",
    ["#ff4937", "#170b09", "#170b09", "#35130d", "#ffb9aa"],
    { headingFont: "Barlow Condensed", headingWeight: 800, borderWidth: 0 },
  ),
  look(
    "liquid",
    "Liquid glass",
    "Light bends. The idea stays clear.",
    ["#071632", "#f3faff", "#a0e7ff", "#a9c5eb", "#183d71"],
    {
      headingFont: "Manrope",
      headingWeight: 500,
      material: "glass",
      background: "glow",
      radius: 30,
      shadow: "soft",
    },
  ),
  look(
    "material",
    "Material You",
    "Soft shapes. A little unexpected. Entirely yours.",
    ["#d7f96b", "#202512", "#3d4a1c", "#4b5736", "#e0c5ff"],
    { radius: 48, headingFont: "Manrope", headingWeight: 800 },
  ),
  look(
    "future",
    "Retro future",
    "Tomorrow, imagined yesterday. Precision with a pulse.",
    ["#1c201c", "#fff4d5", "#ffc773", "#c2baa3", "#34382c"],
    { borderWidth: 1, headingWeight: 700 },
  ),
  look(
    "y2k",
    "Y2K",
    "New millennium energy. Chrome, curves, and a blue sky.",
    ["#1236d5", "#f4f6ff", "#e9ff93", "#c8d6ff", "#244ddf"],
    {
      headingFont: "Syne",
      headingWeight: 800,
      radius: 24,
      background: "solid",
      shadow: "soft",
    },
  ),
  look(
    "nostalgia",
    "Nostalgia",
    "A familiar feeling. A story worth keeping.",
    ["#f0dfb8", "#431c23", "#6f2930", "#69454a", "#fffaeb"],
    {
      headingFont: "Fraunces",
      headingWeight: 600,
      material: "paper",
      radius: 4,
    },
  ),
  look(
    "clay",
    "Clay",
    "Big ideas with a softer side. Almost within reach.",
    ["#ff8a50", "#33170b", "#54250e", "#643117", "#ffdda6"],
    { radius: 60, shadow: "soft", headingFont: "Nunito", headingWeight: 900 },
  ),
  look(
    "terminal",
    "Terminal",
    "Less interface. More signal. Make every line count.",
    ["#09120e", "#bcffd1", "#bcffd1", "#80b994", "#182c20"],
    {
      headingFont: "Courier New",
      bodyFont: "Courier New",
      headingWeight: 700,
      borderWidth: 1,
      motion: "none",
    },
  ),
  look(
    "bauhaus",
    "Bauhaus",
    "Primary colors. Radical geometry. Form with a purpose.",
    ["#f5f1e7", "#151515", "#b52519", "#4b4841", "#edcf54"],
    {
      headingFont: "DM Sans",
      headingWeight: 900,
      brandRules:
        "Bauhaus poster composition: massive geometric sans type, circles, triangles and rectangular color planes. Use vermilion, cobalt and yellow as structural shapes on warm white, with near-black readable text. Compose asymmetrically around a strong grid; keep geometry flat and purposeful. No gradients, glass, rounded cards or decorative UI. Vary slides between large type, geometric process diagrams and open data layouts.",
    },
  ),
  look(
    "pop",
    "Pop Art",
    "Big ink. Bright ideas. Straight off the printing press.",
    ["#ffe94a", "#211137", "#a6004b", "#51405e", "#ffb8de"],
    {
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      borderWidth: 3,
      brandRules:
        "Pop art and comic printing: condensed impact headlines, yellow and pink color blocks, dark ink outlines, offset hard shadows and restrained halftone dot fields. Build sequential ideas as comic panels; use burst shapes only where emphasis is meaningful. Keep actual copy horizontal and readable. Charts should be bold, direct and honestly labeled. No soft shadows, glass or generic rounded dashboards.",
    },
  ),
  look(
    "blueprint",
    "Blueprint",
    "Draw the thinking. Show how everything connects.",
    ["#07399e", "#f1f9ff", "#b2f6ff", "#c2dfff", "#1248a5"],
    {
      headingFont: "Courier New",
      headingWeight: 700,
      borderWidth: 1,
      motion: "fade",
      brandRules:
        "Architectural blueprint: saturated drafting blue, white technical linework, restrained cyan highlights, monospaced headings and measurement rules. Explain systems with precise labeled diagrams, exploded geometry and clear connection paths. Use grid lines faintly so they never compete with text. Layouts should resemble technical drawings rather than a terminal or sci-fi HUD. No fake measurements or invented data.",
    },
  ),
  look(
    "deco",
    "Art Deco",
    "A little ceremony. A lasting impression.",
    ["#112a25", "#fff0cf", "#efc77b", "#c6c5ad", "#233c34"],
    {
      headingFont: "Fraunces",
      headingWeight: 500,
      borderWidth: 1,
      motion: "fade",
      brandRules:
        "Art Deco architectural elegance: deep evergreen, warm ivory serif headlines, gold linear ornaments, stepped frames, long verticals, diamonds and restrained symmetry. Keep generous negative space. Use radial or architectural compositions where they explain a relationship, with clear captions and fine rules. Content and charts must stay readable and uncluttered. No neon, glass, dashboard cards or distressed textures.",
    },
  ),
  look(
    "memphis",
    "Memphis",
    "A good kind of chaos. Shapes with something to say.",
    ["#ffd7ee", "#291442", "#6624ba", "#59376c", "#ffe568"],
    {
      headingFont: "Nunito",
      headingWeight: 900,
      radius: 18,
      brandRules:
        "Memphis postmodern graphic design: pink paper, sunny yellow shapes, purple ink, asymmetric blocks, squiggles, dots, cutout circles and triangular accents. Keep patterns at the edges and behind empty space. Explain processes through playful but ordered shapes with readable labels. Use flat fills and deliberate offset placement; no clay shading, glass or one repeated card grid. Information remains the focus.",
    },
  ),
  look(
    "editorial",
    "Editorial",
    "The headline is the invitation. The detail earns it.",
    ["#e8f0f5", "#102c4d", "#b52e17", "#3e5873", "#cadbe9"],
    {
      headingFont: "Fraunces",
      headingWeight: 700,
      brandRules:
        "Contemporary editorial magazine on cool blue-white paper: expressive large serif headlines, navy ink, small red-orange accents, a narrow masthead and strong asymmetric columns. Treat each slide as a considered spread, varying pull quotes, oversized takeaways and data-led pages. Keep fine rules meaningful and body text concise. No warm beige luxury template, generic cards, fake issue numbers or invented bylines.",
    },
  ),
  look(
    "thinking-space",
    "Thinking Space II",
    "Grayscale machinery. Lime portals. A thought in the dark.",
    ["#111413", "#f0f4ed", "#abf568", "#b4beb1", "#2b312c"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      brandRules:
        "Inspired by Geometry Dash Thinking Space II: near-black industrial ruins, layered grayscale angular machinery, skeletal gears, hanging structures and sharply limited electric lime portal accents. Use original editable vector geometry, not screenshots or game assets. Keep the main reading area calm and high contrast; put intricate machinery along the edges. Use strong condensed headlines and meaningful diagrams. Do not turn this into generic green terminal UI or add flashing effects. Vary every slide's composition; retain factual copy and readable data.",
    },
  ),
  look(
    "limbo",
    "LIMBO",
    "Eight keys. Impossible doors. Follow the thread.",
    ["#120e2c", "#f4edff", "#c1afff", "#c6b9df", "#2b234b"],
    {
      family: "Game & music",
      headingFont: "Fraunces",
      headingWeight: 600,
      brandRules:
        "Inspired by MindCap's Geometry Dash LIMBO: indigo and dark red architectural hallucinations, layered impossible doorways, chain-like circuits and multicolored key motifs. Use original geometry with a mysterious serif headline and clean sans body. Keys should encode options or steps when meaningful; decorative keys stay outside the reading area. Organize content as branching rooms, routes and choices rather than repeating cards. No copied logos or gameplay assets, no false interactivity, and no flashing or disorienting motion.",
    },
  ),
  look(
    "sonic-wave",
    "Sonic Wave Infinity",
    "Ice-blue voltage. Hard angles. Full momentum.",
    ["#07152e", "#effaff", "#87e4ff", "#b2cce5", "#12355c"],
    {
      family: "Game & music",
      headingFont: "Syne",
      headingWeight: 800,
      brandRules:
        "Inspired by APTeam's Geometry Dash Sonic Wave Infinity: icy cyan and white outlines on deep navy, nested diamond corridors, angular wave traces and a small pink counter-signal. Use large forward-leaning type, sharp vector outlines and alternating diagonal composition. Routes and waves should explain sequence or cause and effect without fabricating chart data. Use original native objects, not game screenshots or logos. Preserve clean reading zones and chart labels; no generic glowing card grid or constant animated flashing.",
    },
  ),
  look(
    "ransom-ink",
    "Ransom Ink",
    "Yellow ink on black. Crosshatched, loud, and handmade.",
    ["#141615", "#f5e86a", "#f5e86a", "#c9c3a0", "#292a20"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Inspired by the supplied Ransom Remix music-cover reference: dusty black sleeve, yellow pen outlines, crosshatched strokes, oversized condensed lettering and a restrained burgundy counter-accent. Build original wireframe illustrations, glasses-like paired lenses or subject-specific engraved line art; do not reproduce performers' portraits, lettering, logos or lyrics. Pair rough vector outlines with crisp readable body text. Use different sleeve-like compositions, paired comparisons and underlined takeaways. Keep hatching away from small text. No neon UI glow or soft pastel cards.",
    },
  ),
  look(
    "beatmap",
    "Beatmap",
    "Hit circles. Clean rhythm. Every point lands.",
    ["#fff3fa", "#361c35", "#a11962", "#61465e", "#f1d5e6"],
    {
      family: "Game & music",
      headingFont: "Manrope",
      headingWeight: 800,
      radius: 32,
      brandRules:
        "Inspired by osu! hit circles and rhythm-game approach rings: pale paper, deep plum readable text, magenta rings, clean circular nodes and smooth connecting paths. Use step numbers only for real ordered processes. Build spatial rhythms with generous whitespace and a clear reading order, rather than dashboard cards. Charts remain conventional readable data visualizations; circle graphics must not imply unsupported numerical values. Original geometry only, no osu! logos, copied beatmaps or game UI. No automatic pulse, flashing or required motion.",
    },
  ),
  look(
    "street-radio",
    "Street Radio",
    "Cel-shaded color. Street-poster attitude. Turn it up.",
    ["#ffb637", "#173535", "#235044", "#355247", "#e7f9bc"],
    {
      family: "Game & music",
      headingFont: "Syne",
      headingWeight: 800,
      borderWidth: 3,
      brandRules:
        "Inspired by Jet Set Radio's cel-shaded street-art energy: saturated orange, mint paper, dark teal ink, exaggerated speaker cones, cutout plates, speed lines and graffiti-like angular geometry. Compose with strong diagonal panels and oversized readable headlines. Illustrations should be original and subject-specific; no copyrighted characters or logos, copied graffiti tags or meaningless text. Use flat hard-edged colors, deliberate asymmetry and clean supporting copy. Avoid clay shading, translucent glass and repeated centered cards.",
    },
  ),
  look(
    "save-point",
    "Save Point",
    "Pixel worlds. Quiet magic. A place to begin again.",
    ["#201638", "#fff2d9", "#a6f0ca", "#d3c2df", "#37264f"],
    {
      family: "Game & music",
      headingFont: "Courier New",
      bodyFont: "Courier New",
      headingWeight: 700,
      motion: "none",
      brandRules:
        "Inspired by classic pixel-RPG save rooms and inventory frames: deep violet night, warm ivory monospaced text, mint crystal light, stepped pixel corners and sparse square stars. Use native blocky geometry and original crystals, maps or quest-like diagrams. Keep ordered content on a readable route; never invent game statistics or place fake actionable game controls on a slide. No copyrighted sprites, characters or logos. Avoid rounded glass cards, neon cyberpunk HUDs or blinking effects. Keep clear text areas and vary room-like compositions.",
    },
  ),
  look(
    "warehouse",
    "Warehouse",
    "Vinyl grooves. Utility type. After-hours precision.",
    ["#d5d8ce", "#171d1b", "#964218", "#49514a", "#bec5b8"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Inspired by underground techno record sleeves and warehouse flyers: industrial pale gray, heavy charcoal condensed type, restrained rust ink, concentric vinyl grooves, cut marks and barcode-like vector rhythms. Use asymmetric label/sleeve compositions, setlist-like rows for ordered processes and precise open chart layouts. Do not add fake dates, event lineups, product codes or statistics. Keep decorative grooves and barcodes separate from actual data and small text. Original graphic geometry only; no album covers, artist logos or lyrics.",
    },
  ),
  look(
    "melt-eyez",
    "Melt My Eyez",
    "Denzel Curry’s warped blues, teal echoes, and orange sleeve spine.",
    ["#102b4b", "#eef8ff", "#ffbb62", "#b5cddd", "#1a405a"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by Melt My Eyez See Your Future by Denzel Curry: an orange obi spine, distorted blue-teal silhouette, lateral analog smears and a restrained purple afterimage. Use a densely cut condensed headline against broad dark breathing room. Build original editable vector distortion bands and off-register contours. Content slides alternate spine-led columns and wide cinematic panels; keep text crisp rather than blurring it. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "brat",
    "brat",
    "Charli xcx’s acid-green sleeve. Plain type, maximum presence.",
    ["#8ace00", "#111508", "#111508", "#344309", "#b0e748"],
    {
      family: "Game & music",
      headingFont: "DM Sans",
      headingWeight: 400,
      motion: "fade",
      brandRules:
        "Heavily inspired by Brat by Charli xcx: a full acid-green field, blunt plain black sans lettering, radical negative space and deliberately unpolished restraint. Center a short headline at an oversized scale; use simple aligned columns for detail. Preserve the author’s wording and case. No ornamental shapes, gradients, glow, UI cards, fancy type or blur on reading text. The confident green field and spacing are the entire identity. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "hard-soft",
    "Hard & Soft",
    "Billie Eilish’s deep blue water and a doorway into the light.",
    ["#061d3b", "#edf7ff", "#a5daff", "#adc8e4", "#12365a"],
    {
      family: "Game & music",
      headingFont: "Manrope",
      headingWeight: 500,
      motion: "fade",
      brandRules:
        "Heavily inspired by HIT ME HARD AND SOFT by Billie Eilish: midnight underwater blues, a white tilted doorway above the water, drifting light shafts and broad empty depth. Use thin rippling contours and a small cluster of bubbles as editable geometry; let a restrained pale headline float in a calm reading zone. Alternate large open compositions and deep blue inset panels. Avoid a generic space scene or neon dashboard. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "question-mark",
    "? — XXXTENTACION",
    "Photocopied fragments. Torn edges. Black ink on white.",
    ["#eeece7", "#171717", "#252525", "#55524e", "#d7d5d0"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by The question-mark album by XXXTENTACION: black-and-white photocopy collage, staggered contact-sheet fragments, rough torn-paper edges and fine scratched marks. Use original monochrome abstract fragments and high-impact condensed type, not a reproduced photograph. Keep the collage at the periphery while content remains clean. Use offset paper comparisons and contact-sheet structures for ideas, with no fake captions or decorative words. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "i-am-you",
    "I Am You",
    "YNW Melly’s painted white room: cyan, lime, pink, and yellow.",
    ["#f3f3eb", "#18312d", "#006189", "#40574f", "#dbe9da"],
    {
      family: "Game & music",
      headingFont: "Syne",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by I Am You by YNW Melly: a bright white room covered in cyan, grassy lime, yellow and hot-pink paint, spontaneous brush strokes, drips and overlapping marks. Build original editable paint strokes around generous white reading space. Use expressive big black type; content becomes open studio-wall arrangements, paint underlines and color-coded columns. No portraits, copied graffiti phrases, meaningless tags or paint behind small text. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "igor",
    "IGOR",
    "Tyler, The Creator’s pink sleeve, black ink, and stark cutout forms.",
    ["#eea8c4", "#21171d", "#21171d", "#59414c", "#dc8fac"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by IGOR by Tyler, The Creator: dusty saturated pink, severe black-and-white cutout portrait energy, heavy condensed type, an asymmetric monochrome bust-like geometric silhouette and empty pink space. Make an original faceted silhouette without reproducing the artist’s likeness. Keep typography raw and direct, with no gradients, soft cards or fashion-magazine embellishment. Use stark pink/ink columns and cropped monochrome blocks for comparisons. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "hunter",
    "Hunter × Hunter",
    "Forest green, electric lime, red strikes, and a trail to follow.",
    ["#0e3527", "#f4f7df", "#c0f75b", "#b7d5b7", "#20513a"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by Hunter x Hunter: Gon’s forest-green and red palette, bright lime aura, intersecting hunter marks, compass circles and adventurous routes. Build original sharp crossed shapes, trail lines and map-like diagrams. Use energetic condensed headlines, clean labels and rich green negative space. The red is a sparse graphic counterpoint, not body text. Give actual steps a route and relationships a branching map; no character screenshots or invented game statistics. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "league",
    "League of Legends",
    "Deep teal, antique gold, and the geometry of a Nexus.",
    ["#092633", "#f6edcf", "#e8c46c", "#bfd0ca", "#163f48"],
    {
      family: "Game & music",
      headingFont: "Fraunces",
      headingWeight: 600,
      motion: "fade",
      brandRules:
        "Heavily inspired by League of Legends and Summoner’s Rift: deep blue-teal, antique gold linework, luminous cyan crystal facets, heroic serif titles and architectural rune circles. Build an original Nexus-like faceted core and refined angular frames, using thin gold details around calm content. Use map routes for strategy and gold-divided open comparisons. Avoid dense fake HUDs, copied logos, champion portraits or invented stats. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "phoenix",
    "Phoenix",
    "VALORANT: white-hot flare, ember orange, and charcoal.",
    ["#201815", "#fff1da", "#ffbb67", "#d8c0aa", "#463025"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by Phoenix from VALORANT: ember-orange flame tongues, golden flare orbs, bright jacket-white slashes and charcoal. Use large angular condensed type, an original rising flame silhouette, sweeping curveball arcs and hard diagonal cuts. Make warm light a bold flat graphic rather than a glow filter. Keep fire to the edges and behind empty space; readable comparisons and process steps should feel fast and confident. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "viper",
    "Viper",
    "VALORANT: poison green, black armor, and a rising veil.",
    ["#071f19", "#e9ffe8", "#a4f95d", "#a9d0b8", "#123d2c"],
    {
      family: "Game & music",
      headingFont: "Space Grotesk",
      headingWeight: 700,
      motion: "fade",
      brandRules:
        "Heavily inspired by Viper from VALORANT: almost-black green, acid-green poison, layered venom curtains and sharply cut armor geometry. Use original flowing toxic contours and a pointed shield/lens motif, contrasted with tightly aligned type. Alternate tall divided columns and wide bands to show control, flow and boundaries. No generic terminal text, fake status numbers or flashing effects; leave a quiet black-green reading zone. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "reyna",
    "Reyna",
    "VALORANT: violet-black, radiant magenta, and a watching eye.",
    ["#21112f", "#fff0ff", "#f3a1eb", "#d6b7df", "#40204f"],
    {
      family: "Game & music",
      headingFont: "Syne",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by Reyna from VALORANT: violet-black atmosphere, saturated magenta soul-orbs, a sharp iris motif and elegant predatory curves. Use original eye-shaped contour geometry with nested pink/lilac crescents and hard cropped edges. Pair wide expressive headlines with very readable body copy; organize content as asymmetrical splits and orbital relationships. Keep the eye away from small text and avoid generic cosmic gradients or repeated cards. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "neon",
    "Neon",
    "VALORANT: electric cobalt, yellow bolts, and cyan velocity.",
    ["#102887", "#f0faff", "#f8ed65", "#c1d9ff", "#1b419c"],
    {
      family: "Game & music",
      headingFont: "Barlow Condensed",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by Neon from VALORANT: saturated electric cobalt, bright yellow lightning, cyan speed trails and forward diagonals. Use original jagged energy paths and a sharply slanted composition, with oversized condensed typography and clear dark-blue reading zones. Build genuine sequences as connected angled lanes. Preserve horizontal body text and conventional chart labels. No flashing, fake speed data or copied game interfaces. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
  look(
    "yoru",
    "Yoru",
    "VALORANT: cobalt rifts, icy shards, and an oni-mask silhouette.",
    ["#0c1742", "#edf5ff", "#9ac7ff", "#bec9ec", "#202d60"],
    {
      family: "Game & music",
      headingFont: "Syne",
      headingWeight: 800,
      motion: "fade",
      brandRules:
        "Heavily inspired by Yoru from VALORANT: deep indigo, cobalt dimensional rifts, ice-white shards, a small vermilion strike and an original angular oni-mask silhouette. Make broken diamond portals and offset facets that frame a calm reading zone; wide bold type should feel cut from the same planes. Use split panels for comparisons and parallel lanes for processes. Avoid copied logos, character art, tiny HUD decoration and disorienting animation. All artwork uses editable native shapes and paths. Retain readable high-contrast text and vary the composition across the deck.",
    },
  ),
];
export const DEFAULT_CREATION_THEME = FEATURED_THEMES[0];
