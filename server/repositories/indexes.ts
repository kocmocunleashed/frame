import type { IndexSpecification, CreateIndexesOptions } from "mongodb";
type Index = { key: IndexSpecification; options?: CreateIndexesOptions };
const unique = (key: IndexSpecification): Index => ({
  key,
  options: { unique: true },
});
const expiry: Index = {
  key: { expiresAt: 1 },
  options: { expireAfterSeconds: 0 },
};
export const MIGRATION_VERSION = 1;
export const indexDefinitions: Record<string, Index[]> = {
  users: [unique({ email: 1 })],
  authIdentities: [unique({ provider: 1, issuer: 1, subject: 1 })],
  workspaces: [],
  members: [unique({ workspaceId: 1, userId: 1 }), { key: { userId: 1 } }],
  folders: [{ key: { workspaceId: 1, name: 1 } }],
  decks: [
    { key: { workspaceId: 1, status: 1, updatedAt: -1, _id: 1 } },
    { key: { ownerId: 1, updatedAt: -1 } },
    { key: { folderId: 1 } },
  ],
  snapshots: [{ key: { workspaceId: 1 } }],
  contentManifests: [{ key: { workspaceId: 1, hash: 1 } }],
  contentChunks: [unique({ manifestId: 1, ordinal: 1 })],
  revisions: [
    unique({ deckId: 1, revision: 1 }),
    { key: { deckId: 1, createdAt: -1 } },
  ],
  assets: [
    { key: { workspaceId: 1, ownerId: 1, createdAt: -1 } },
    { key: { storageKey: 1 } },
  ],
  uploadIntents: [
    { key: { ownerId: 1, createdAt: -1 } },
    { key: { expiresAt: 1 } },
  ],
  sources: [{ key: { workspaceId: 1, ownerId: 1, createdAt: -1 } }],
  themes: [{ key: { workspaceId: 1, updatedAt: -1 } }],
  brandKits: [{ key: { workspaceId: 1, updatedAt: -1 } }],
  compositions: [{ key: { workspaceId: 1, createdAt: -1 } }],
  creationDrafts: [{ key: { ownerId: 1, workspaceId: 1, updatedAt: -1 } }],
  agentPreferences: [unique({ userId: 1 })],
  jobs: [
    unique({ ownerId: 1, idempotencyKey: 1 }),
    { key: { status: 1, availableAt: 1, leaseUntil: 1, createdAt: 1 } },
    { key: { parentId: 1, status: 1 } },
    { key: { ownerId: 1, createdAt: -1 } },
  ],
  jobQuotas: [],
  generationSteps: [
    unique({ parentJobId: 1, stageKey: 1 }),
    { key: { parentJobId: 1, ordinal: 1 } },
  ],
  jobApplications: [unique({ jobId: 1 })],
  outbox: [
    unique({ jobId: 1, dispatchGeneration: 1 }),
    { key: { sentAt: 1, availableAt: 1, leaseUntil: 1 } },
  ],
  publications: [
    {
      key: { deckId: 1 },
      options: { unique: true, partialFilterExpression: { active: true } },
    },
    { key: { visibility: 1, active: 1, createdAt: -1 } },
  ],
  publicationEditions: [unique({ publicationId: 1, edition: 1 })],
  publicationAssets: [unique({ publicationId: 1, edition: 1, assetId: 1 })],
  exportRequests: [
    unique({ jobId: 1 }),
    { key: { publicationId: 1, publicationEdition: 1, format: 1 } },
  ],
  collaborators: [unique({ deckId: 1, userId: 1 }), { key: { userId: 1 } }],
  comments: [{ key: { deckId: 1, createdAt: 1, _id: 1 } }],
  presence: [unique({ deckId: 1, userId: 1 }), expiry],
  liveSessions: [
    unique({ code: 1 }),
    { key: { deckId: 1, ownerId: 1, endedAt: 1 } },
  ],
  liveParticipants: [
    unique({ tokenHash: 1 }),
    { key: { sessionId: 1, lastSeen: 1 } },
    expiry,
  ],
  liveResponses: [
    unique({ sessionId: 1, round: 1, participantId: 1 }),
    { key: { sessionId: 1, round: 1, questionId: 1 } },
  ],
  presentationCredits: [unique({ userId: 1 })],
  presentationCreditChanges: [
    { key: { userId: 1, createdAt: -1 } },
    { key: { actorId: 1, createdAt: -1 } },
  ],
  rateLimits: [unique({ key: 1 }), expiry],
  operationLeases: [],
  errorEvents: [{ key: { createdAt: -1 } }],
  schemaMigrations: [],
  erxesDeployment: [],
  erxesIdentities: [unique({ tenant: 1, subject: 1 }), unique({ userId: 1 })],
  erxesTickets: [unique({ nonce: 1 }), expiry],
  erxesSessions: [unique({ tokenHash: 1 }), expiry],
  workerHeartbeats: [expiry],
  backupRoots: [],
  deletionTombstones: [],
};
