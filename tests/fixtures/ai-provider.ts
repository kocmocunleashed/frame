import type { AIProvider } from "../../server/ai-provider";
import type { z } from "zod";
import { THEMES } from "../../shared/themes";
export class FixtureAIProvider implements AIProvider {
  configured = true;
  calls: string[] = [];
  async generate(
    name: string,
    _schema: z.ZodType,
    _instructions: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (signal.aborted) throw new Error("aborted");
    this.calls.push(name);
    if (name === "creative_design_plan") {
      const value = input as {
        outline: {
          title: string;
          sections: {
            title: string;
          }[];
        };
      };
      return {
        title: value.outline.title,
        slides: value.outline.sections.map((s, i) => ({
          title: s.title,
          direction:
            i % 2
              ? "An expressive editorial composition"
              : "A crisp illustrated explanation",
          illustration: "An editable leaf growing from a curved stem",
          reveal: "Supporting copy follows the heading",
        })),
      };
    }
    if (name === "creative_scene_batch") {
      const value = input as {
        mode: string;
        slideOffset?: number;
        outline: {
          sections: {
            title: string;
            layout?: string;
          }[];
        };
        sources: {
          id: string;
          text: string;
        }[];
      };
      return {
        slides: value.outline.sections.map((section, index) => {
          const i = (value.slideOffset || 0) + index;
          const { id, custom, brandRules, artDirection, artVersion, ...theme } =
            THEMES[i % THEMES.length];
          const common = {
            rotation: 0,
            opacity: 1,
            decorative: false,
            animation: null,
            group: null,
          };
          const claim = {
            text: value.sources[0]?.text
              ? value.sources[0].text.slice(0, 1000)
              : i === 0
                ? "An editable, source-aware introduction."
                : `A useful idea for section ${i + 1}.`,
            sourceId: value.sources[0]?.id || null,
          };
          const illustration = [
            {
              ...common,
              type: "shape",
              key: "leaf",
              name: "Illustrated leaf",
              group: "Botanical illustration",
              x: i % 2 ? 90 : 900,
              y: 260,
              width: 220,
              height: 220,
              shape: "path",
              fill: "accent",
              stroke: "foreground",
              strokeWidth: 2,
              radius: 0,
              path: [
                { op: "M", x: 10, y: 90 },
                { op: "C", x1: 0, y1: 30, x2: 70, y2: 0, x: 90, y: 10 },
                { op: "C", x1: 100, y1: 70, x2: 30, y2: 100, x: 10, y: 90 },
                { op: "Z" },
              ],
            },
            {
              ...common,
              type: "shape",
              key: "stem",
              name: "Illustrated stem",
              group: "Botanical illustration",
              x: i % 2 ? 90 : 900,
              y: 260,
              width: 220,
              height: 220,
              shape: "path",
              fill: "transparent",
              stroke: "foreground",
              strokeWidth: 3,
              radius: 0,
              path: [
                { op: "M", x: 10, y: 90 },
                { op: "Q", x1: 40, y1: 60, x: 65, y: 35 },
              ],
            },
          ];
          return {
            title: section.title,
            notes: "Private speaking guidance.",
            theme: { ...theme, typeScale: { heading: 1, body: 1, label: 1 } },
            claims: value.mode === "illustrate" ? [] : [claim],
            objects:
              value.mode === "illustrate"
                ? illustration
                : section.layout === "questions"
                  ? [
                      {
                        ...common,
                        type: "text",
                        key: "claim",
                        name: "Supporting point",
                        x: 80,
                        y: 40,
                        width: 1120,
                        height: 90,
                        text: claim.text,
                        claimIndex: 0,
                        role: "body",
                        fontSize: 30,
                        fontWeight: 400,
                        color: "foreground",
                        textAlign: "left",
                      },
                      {
                        ...common,
                        type: "question",
                        key: "question",
                        name: "Audience question",
                        x: 80,
                        y: 160,
                        width: 1120,
                        height: 480,
                        fontSize: 32,
                        color: "foreground",
                        question: {
                          kind: "multiple-choice",
                          prompt: "What makes feedback useful?",
                          options: [
                            "A vague opinion",
                            "A specific observation",
                          ],
                          correctIndex: 1,
                          explanation:
                            "A specific observation gives someone a practical starting point.",
                        },
                      },
                    ]
                  : [
                      {
                        ...common,
                        type: "text",
                        key: "heading",
                        name: "Heading",
                        x: i % 2 ? 400 : 80,
                        y: 70,
                        width: 750,
                        height: 180,
                        text: section.title,
                        claimIndex: null,
                        role: "heading",
                        fontSize: 72,
                        fontWeight: 800,
                        color: "foreground",
                        textAlign: "left",
                      },
                      {
                        ...common,
                        type: "text",
                        key: "claim",
                        name: "Supporting point",
                        x: i % 2 ? 400 : 80,
                        y: 300,
                        width: 650,
                        height: 160,
                        text: claim.text,
                        claimIndex: 0,
                        role: "body",
                        fontSize: 30,
                        fontWeight: 400,
                        color: "foreground",
                        textAlign: "left",
                        animation: {
                          type: "rise",
                          step: 1,
                          delay: 150,
                          duration: 400,
                        },
                      },
                      ...illustration,
                    ],
          };
        }),
      };
    }
    if (name === "creative_motion") {
      const value = input as {
        slides: {
          id: string;
          elements: {
            id: string;
          }[];
        }[];
      };
      return {
        summary: "A deliberate reveal sequence.",
        animations: value.slides.flatMap((s) =>
          s.elements.map((e, i) => ({
            slideId: s.id,
            elementId: e.id,
            animation: {
              type: "rise",
              step: i ? 1 : 0,
              delay: i * 80,
              duration: 400,
            },
          })),
        ),
      };
    }
    if (name === "presentation_theme") {
      const { id, custom, brandRules, ...theme } = THEMES[2];
      const request = input as {
        description: string;
        baseTheme?: {
          name: string;
        };
      };
      return {
        ...theme,
        name:
          request.baseTheme?.name === "Midnight signal"
            ? "Midnight signal refined"
            : "Midnight signal",
        description:
          "A dark stage, bright lime accents, and deliberate contrast.",
        typeScale: { heading: 1.05, body: 1, label: 1 },
        radius: /round/i.test(request.description) ? 36 : theme.radius,
      };
    }
    if (name === "presentation_edits") {
      const value = input as {
        mode: string;
        document: {
          slides: {
            id: string;
            title: string;
            elements: {
              id: string;
              type: string;
            }[];
          }[];
        };
      };
      const slide = value.document.slides[0],
        el = slide.elements.find((e) => e.type === "text") || slide.elements[0];
      if (value.mode === "regenerate")
        return {
          summary: "A refreshed current slide.",
          updates: [],
          insertions: [],
          replacements: [
            {
              slideId: slide.id,
              slide: {
                title: slide.title + " refreshed",
                layout: "two-column",
                headline: "A refreshed point of view.",
                claims: [
                  {
                    text: "Editable regenerated content.",
                    sourceId: null,
                  },
                  {
                    text: "A practical next step stays easy to recognize.",
                    sourceId: null,
                  },
                ],
                labels: ["Consider", "Apply"],
                visual: {
                  kind: "comparison",
                  arrangement: "process",
                  items: [
                    {
                      label: "Consider",
                      claimIndex: 0,
                      icon: "lightbulb",
                      shape: "circle",
                    },
                    {
                      label: "Apply",
                      claimIndex: 1,
                      icon: "target",
                      shape: "rounded",
                    },
                  ],
                },
                data: [],
                notes: "Private notes for the refreshed slide.",
                question: null,
              },
            },
          ],
        };
      return {
        summary: "Clarified the selected content.",
        updates: [
          {
            slideId: slide.id,
            elementId: el.id,
            text:
              el.type === "text" ? "Clearer words for your audience." : null,
            fill: el.type === "shape" ? "accent" : null,
            color: null,
            x: null,
            y: null,
            width: null,
            height: null,
            fontSize: null,
            radius: null,
            opacity: null,
            material: null,
          },
        ],
        replacements: [],
        insertions: [],
      };
    }
    const context = input as {
      brief: {
        topic: string;
        slideCount: number;
      };
      outline?: {
        sections: {
          title: string;
          summary: string;
          layout: string;
        }[];
      };
      sources: {
        id: string;
        name: string;
        text: string;
      }[];
    };
    if (name === "presentation_outline")
      return {
        title: context.brief.topic,
        sections: Array.from({ length: context.brief.slideCount }, (_, i) => ({
          title:
            i === 0
              ? "A clear beginning"
              : i === context.brief.slideCount - 1
                ? "A useful next step"
                : `Idea ${i}`,
          summary: `Develop section ${i + 1}`,
          layout:
            i === 0
              ? "title"
              : i === context.brief.slideCount - 1
                ? "summary"
                : "two-column",
        })),
      };
    const source = context.sources[0];
    return {
      title: context.brief.topic,
      slides: context.outline!.sections.map((section, i) => ({
        title: section.title,
        layout: section.layout,
        headline: section.title,
        claims: [
          {
            text:
              i === 0
                ? "An editable, source-aware introduction."
                : `A useful idea for section ${i + 1}.`,
            sourceId: source?.id || null,
          },
        ],
        labels: ["Explore", "Act", "Reflect"],
        data: [],
        notes: `Private speaking guidance for section ${i + 1}.`,
        question:
          section.layout === "questions"
            ? {
                kind: "multiple-choice",
                prompt: "Which feedback helps someone act?",
                options: ["A vague opinion", "A specific observation"],
                correctIndex: 1,
                explanation:
                  "A specific observation gives someone a practical starting point.",
              }
            : null,
      })),
    };
  }
}
