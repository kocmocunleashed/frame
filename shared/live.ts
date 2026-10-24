import { z } from "zod";
import type { FrameDocument } from "./schema";
import type { PublicDocument } from "./publications";
export const liveStateSchema = z.object({
  index: z.number().int().min(0).max(299),
  step: z.number().int().min(0).max(100),
  stepStartedAt: z.number().finite().min(0).optional(),
  questionId: z.string().max(100).nullable(),
  round: z.number().int().min(0),
  open: z.boolean(),
  resultsVisible: z.boolean(),
  answerVisible: z.boolean(),
  revealedIds: z.array(z.string().min(1).max(100)).max(400).default([]),
});
export type LiveState = z.infer<typeof liveStateSchema>;
export const liveCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("navigate"),
    index: z.number().int().min(0),
    step: z.number().int().min(0).max(100),
  }),
  z.object({ type: z.literal("open"), questionId: z.string().min(1).max(100) }),
  z.object({
    type: z.literal("reveal"),
    elementId: z.string().min(1).max(100),
  }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("results"), visible: z.boolean() }),
  z.object({ type: z.literal("answer"), visible: z.boolean() }),
  z.object({ type: z.literal("end") }),
]);
export type LiveCommand = z.infer<typeof liveCommandSchema>;
export type LiveQuestion = {
  id: string;
  kind: "multiple-choice" | "poll" | "true-false";
  prompt: string;
  options: string[];
  round: number;
  open: boolean;
  answerVisible: boolean;
  correctIndex?: number;
  explanation?: string;
  counts?: number[];
  total?: number;
  response?: number;
  feedback?: string;
};
export type HostSession = {
  serverTime?: number;
  id: string;
  code: string;
  version: number;
  ended: boolean;
  expiresAt: number;
  document: FrameDocument;
  state: LiveState;
  participants: number;
  connected: number;
  question: LiveQuestion | null;
};
export type AudienceSession = {
  serverTime?: number;
  id: string;
  title: string;
  version: number;
  ended: boolean;
  state: Pick<LiveState, "index" | "step" | "revealedIds" | "stepStartedAt">;
  document: PublicDocument | null;
  question: LiveQuestion | null;
};
