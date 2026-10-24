import { apolloCommonTypes, markResolvers, startPlugin } from "erxes-api-shared/utils";
import { canGroup } from "erxes-api-shared/core-modules";
import type {
  IPermissionConfig,
  IUserDocument,
} from "erxes-api-shared/core-types";
import { gql } from "graphql-tag";
import { createFrameLaunch, frameTarget } from "./ticket";

type FrameContext = {
  subdomain: string;
  user?: IUserDocument;
};

export const permissions: IPermissionConfig = {
  plugin: "frame",
  modules: [
    {
      name: "studio",
      description: "Frame presentation studio",
      scopeField: null,
      ownerFields: [],
      scopes: [
        {
          name: "all",
          description: "Open the studio; Frame controls document access",
        },
      ],
      actions: [
        {
          name: "frameStudioOpen",
          title: "Open Frame",
          description: "Create a session in the Frame presentation studio",
          type: "custom",
        },
      ],
    },
  ],
  defaultGroups: [
    {
      id: "frame:user",
      name: "Frame User",
      description: "Access to the Frame studio",
      permissions: [
        {
          plugin: "frame",
          module: "studio",
          actions: ["frameStudioOpen"],
          scope: "all",
        },
      ],
    },
  ],
};

export const resolvers = {
  Query: {
    frameAvailable: async (
      _parent: unknown,
      _args: unknown,
      context: FrameContext,
    ) => {
      if (!context.user?._id) return false;
      if (!(await canGroup(context.subdomain, "frameStudioOpen", context.user)))
        return false;
      frameTarget(process.env.FRAME_ERXES_TENANTS, context.subdomain);
      return true;
    },
  },
  Mutation: {
    frameLaunch: async (
      _parent: unknown,
      _args: unknown,
      context: FrameContext,
    ) => {
      if (!context.user?._id)
        throw new Error("Sign in to erxes to open Frame.");
      if (!(await canGroup(context.subdomain, "frameStudioOpen", context.user)))
        throw new Error("You do not have permission to open Frame.");
      const target = frameTarget(
        process.env.FRAME_ERXES_TENANTS,
        context.subdomain,
      );
      const user = context.user;
      return createFrameLaunch(target, context.subdomain, {
        id: user._id,
        email: user.email || "",
        name: user.details?.fullName || user.email || "",
      });
    },
  },
};

// The host normally requires login before executing every query. Availability
// must return false to signed-out callers; the resolver still checks both the
// authenticated identity and frameStudioOpen before reporting availability.
markResolvers(resolvers.Query, { wrapperConfig: { skipPermission: true } });
// The host's ordinary mutation wrapper records returned values. A launch
// result contains a credential, so use the public wrapper with the resolver's
// explicit authentication and frameStudioOpen checks instead.
markResolvers(resolvers.Mutation, { wrapperConfig: { skipPermission: true } });

startPlugin({
  name: "frame",
  port: Number(process.env.FRAME_ERXES_API_PORT || 3319),
  graphql: async () => ({
    typeDefs: gql`
      ${apolloCommonTypes}
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
    `,
    resolvers,
  }),
  apolloServerContext: async (subdomain, context) => ({
    ...context,
    subdomain,
  }),
  meta: { permissions },
});
