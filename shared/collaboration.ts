import type { PublicDocument } from "./publications";
export type AccessRole = "owner" | "editor" | "viewer";
export type AccessGrant = {
  userId: string;
  name: string;
  email: string;
  role: "editor" | "viewer";
  inheritedRole: "editor" | "viewer" | null;
};
export type Sharing = {
  role: AccessRole;
  owner: { id: string; name: string };
  grants: AccessGrant[];
};
export type ReviewDocument = {
  document: PublicDocument;
  revision: number;
  role: AccessRole;
  owner: string;
};
export type ReviewComment = {
  id: string;
  slideId: string | null;
  elementId: string | null;
  authorId: string;
  author: string;
  body: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  canResolve: boolean;
  canDelete: boolean;
};
export type Presence = {
  revision: number;
  peers: {
    userId: string;
    name: string;
    role: AccessRole;
    mode: "view" | "edit";
    lastSeen: number;
  }[];
};
