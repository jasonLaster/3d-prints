import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const lengthUnit = v.union(v.literal("mm"), v.literal("cm"), v.literal("in"));
const themeMode = v.union(v.literal("light"), v.literal("dark"));

export default defineSchema({
  models: defineTable({
    key: v.string(),
    name: v.string(),
    uploaded: v.boolean(),
    configUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    fileName: v.optional(v.string()),
    publicStlUrl: v.optional(v.string()),
    stlStorageId: v.optional(v.id("_storage")),
    size: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_uploaded", ["uploaded"]),

  versions: defineTable({
    modelKey: v.string(),
    modelName: v.string(),
    title: v.string(),
    source: v.union(v.literal("save"), v.literal("fork")),
    params: v.record(v.string(), v.number()),
    unit: lengthUnit,
    theme: themeMode,
    parentVersionId: v.optional(v.id("versions")),
    stlStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_model", ["modelKey"])
    .index("by_parent", ["parentVersionId"])
    .index("by_updated", ["updatedAt"]),

  brochures: defineTable({
    generationId: v.string(),
    clientId: v.string(),
    modelKey: v.string(),
    modelName: v.string(),
    imageModel: v.string(),
    promptVersion: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("error"),
    ),
    params: v.record(v.string(), v.number()),
    dimensions: v.object({
      height: v.number(),
      length: v.number(),
      topThickness: v.number(),
      width: v.number(),
    }),
    referenceCount: v.number(),
    imageStorageId: v.optional(v.id("_storage")),
    mediaType: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_generation", ["generationId"])
    .index("by_client_updated", ["clientId", "updatedAt"])
    .index("by_model_updated", ["modelKey", "updatedAt"]),
});
