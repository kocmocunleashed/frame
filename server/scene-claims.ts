import type { SceneSlide } from "../shared/ai-scene";
import { JobFailure } from "./jobs";
type ClaimIssue = {
  claimIndex: number;
  reason: "missing-text" | "ambiguous-text";
  matchingObjects: number;
  referencedObjects: string[];
};
export class SceneClaimFailure extends JobFailure {
  constructor(public issues: ClaimIssue[]) {
    super(
      "The slide did not display each supporting claim exactly once. Repair the listed text objects using the slide-local claimIndex and exact claim text.",
    );
  }
}
// Line breaks, non-breaking spaces and canonically equivalent Unicode do not
// change a claim. Do not fuzzily match wording, numbers, punctuation or sources.
const canonical = (text: string) =>
  text.normalize("NFC").replace(/\s+/gu, " ").trim();
export function reconcileSceneClaims(input: SceneSlide) {
  const scene = structuredClone(input);
  const texts = scene.objects.filter((object) => object.type === "text");
  const bound = new Map<string, number>(),
    issues: ClaimIssue[] = [];
  for (let i = 0; i < scene.claims.length; i++) {
    const expected = canonical(scene.claims[i].text);
    const matches = texts.filter(
      (object) =>
        !object.decorative &&
        !bound.has(object.key) &&
        canonical(object.text) === expected,
    );
    // Prefer an existing unambiguous body binding when the headline repeats
    // the takeaway. Multiple identical body blocks still require a repair.
    const bodies = matches.filter((object) => object.role === "body");
    const tagged = matches.filter((object) => object.claimIndex === i);
    const target =
      matches.length === 1
        ? matches[0]
        : bodies.length === 1
          ? bodies[0]
          : tagged.length === 1 && bodies.length <= 1
            ? tagged[0]
            : null;
    if (target) bound.set(target.key, i);
    else
      issues.push({
        claimIndex: i,
        reason: matches.length ? "ambiguous-text" : "missing-text",
        matchingObjects: matches.length,
        referencedObjects: texts
          .filter((object) => object.claimIndex === i)
          .map((object) => object.key),
      });
  }
  if (issues.length) throw new SceneClaimFailure(issues);
  let repaired = false;
  for (const object of texts) {
    const index = bound.get(object.key);
    const claimIndex = index ?? null;
    if (object.claimIndex !== claimIndex) {
      object.claimIndex = claimIndex;
      repaired = true;
    }
    if (index !== undefined && object.text !== scene.claims[index].text) {
      object.text = scene.claims[index].text;
      repaired = true;
    }
  }
  return {
    scene,
    warnings: repaired
      ? [
          "Repaired supporting-text references and whitespace. Claims and source citations were preserved.",
        ]
      : [],
  };
}
