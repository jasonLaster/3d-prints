import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const lengthUnit = v.union(v.literal("mm"), v.literal("cm"), v.literal("in"));
const themeMode = v.union(v.literal("light"), v.literal("dark"));
const params = v.record(v.string(), v.number());

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const upsertCatalogModels = mutation({
  args: {
    models: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        configUrl: v.string(),
        description: v.optional(v.string()),
        publicStlUrl: v.optional(v.string()),
        fileName: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const model of args.models) {
      const optionalFields: {
        description?: string;
        publicStlUrl?: string;
        fileName?: string;
      } = {};
      if (model.description !== undefined) {
        optionalFields.description = model.description;
      }
      if (model.publicStlUrl !== undefined) {
        optionalFields.publicStlUrl = model.publicStlUrl;
      }
      if (model.fileName !== undefined) {
        optionalFields.fileName = model.fileName;
      }

      const existing = await ctx.db
        .query("models")
        .withIndex("by_key", (q) => q.eq("key", model.key))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: model.name,
          configUrl: model.configUrl,
          ...optionalFields,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("models", {
          key: model.key,
          name: model.name,
          uploaded: false,
          configUrl: model.configUrl,
          ...optionalFields,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

export const saveVersion = mutation({
  args: {
    modelKey: v.string(),
    modelName: v.string(),
    title: v.string(),
    params,
    unit: lengthUnit,
    theme: themeMode,
    parentVersionId: v.optional(v.id("versions")),
    stlStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    source: v.optional(v.union(v.literal("save"), v.literal("fork"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("versions", {
      modelKey: args.modelKey,
      modelName: args.modelName,
      title: args.title,
      source: args.source ?? (args.parentVersionId ? "fork" : "save"),
      params: args.params,
      unit: args.unit,
      theme: args.theme,
      parentVersionId: args.parentVersionId,
      stlStorageId: args.stlStorageId,
      fileName: args.fileName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const forkVersion = mutation({
  args: {
    versionId: v.id("versions"),
    title: v.optional(v.string()),
    params: v.optional(params),
    unit: v.optional(lengthUnit),
    theme: v.optional(themeMode),
    stlStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.versionId);
    if (!parent) {
      throw new Error("Version not found");
    }

    const now = Date.now();
    return await ctx.db.insert("versions", {
      modelKey: parent.modelKey,
      modelName: parent.modelName,
      title: args.title ?? `${parent.title} fork`,
      source: "fork",
      params: args.params ?? parent.params,
      unit: args.unit ?? parent.unit,
      theme: args.theme ?? parent.theme,
      parentVersionId: parent._id,
      stlStorageId: args.stlStorageId,
      fileName: args.fileName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listLibrary = query({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query("models").order("desc").collect();
    const versions = await ctx.db.query("versions").order("desc").collect();

    return {
      models: await Promise.all(
        models.map(async (model) => ({
          ...model,
          stlUrl: model.stlStorageId
            ? await ctx.storage.getUrl(model.stlStorageId)
            : (model.publicStlUrl ?? null),
        })),
      ),
      versions: await Promise.all(
        versions.map(async (version) => ({
          ...version,
          stlUrl: version.stlStorageId
            ? await ctx.storage.getUrl(version.stlStorageId)
            : null,
        })),
      ),
    };
  },
});
