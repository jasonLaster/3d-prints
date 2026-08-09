import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const dimensions = v.object({
  height: v.number(),
  length: v.number(),
  topThickness: v.number(),
  width: v.number(),
});
const params = v.record(v.string(), v.number());

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const create = mutation({
  args: {
    generationId: v.string(),
    clientId: v.string(),
    modelKey: v.string(),
    modelName: v.string(),
    imageModel: v.string(),
    promptVersion: v.string(),
    params,
    dimensions,
    referenceCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (existing) {
      if (existing.clientId !== args.clientId) {
        throw new Error("Brochure generation ID already exists");
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("brochures", {
      ...args,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const complete = mutation({
  args: {
    generationId: v.string(),
    clientId: v.string(),
    imageStorageId: v.id("_storage"),
    mediaType: v.string(),
    warnings: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const brochure = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (!brochure || brochure.clientId !== args.clientId) {
      throw new Error("Brochure generation not found");
    }

    if (
      brochure.imageStorageId &&
      brochure.imageStorageId !== args.imageStorageId
    ) {
      await ctx.storage.delete(brochure.imageStorageId);
    }
    await ctx.db.patch(brochure._id, {
      status: "complete",
      imageStorageId: args.imageStorageId,
      mediaType: args.mediaType,
      warnings: args.warnings,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
    const imageUrl = await ctx.storage.getUrl(args.imageStorageId);
    if (!imageUrl) {
      throw new Error("Stored brochure image URL is unavailable");
    }
    return { brochureId: brochure._id, imageUrl };
  },
});

export const fail = mutation({
  args: {
    generationId: v.string(),
    clientId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const brochure = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (!brochure || brochure.clientId !== args.clientId) return;
    await ctx.db.patch(brochure._id, {
      status: "error",
      errorMessage: args.errorMessage.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

export const listByClient = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const brochures = await ctx.db
      .query("brochures")
      .withIndex("by_client_updated", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(60);
    return await Promise.all(
      brochures
        .filter(
          (brochure) =>
            brochure.status === "complete" && brochure.imageStorageId,
        )
        .map(async (brochure) => ({
          ...brochure,
          imageUrl: await ctx.storage.getUrl(brochure.imageStorageId!),
        })),
    );
  },
});

export const getByGenerationId = query({
  args: { generationId: v.string() },
  handler: async (ctx, args) => {
    const brochure = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (
      !brochure ||
      brochure.status !== "complete" ||
      !brochure.imageStorageId
    ) {
      return null;
    }
    return {
      ...brochure,
      imageUrl: await ctx.storage.getUrl(brochure.imageStorageId),
    };
  },
});
