import { useMutation, useQuery } from "convex/react";
import { UploadCloud } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type LengthUnit = "mm" | "cm" | "in";
type ThemeMode = "light" | "dark";
type ModelParams = Record<string, number>;

type CatalogSeedModel = {
  key: string;
  name: string;
  configUrl: string;
  description?: string;
  publicStlUrl?: string;
  fileName?: string;
};

type CurrentModel = {
  id: string;
  name: string;
};

export type SavedLibraryVersion = {
  _id: Id<"versions">;
  modelKey: string;
  modelName: string;
  title: string;
  source: "save" | "fork";
  params: ModelParams;
  unit: LengthUnit;
  theme: ThemeMode;
  parentVersionId?: Id<"versions">;
  stlUrl?: string | null;
  fileName?: string;
  updatedAt: number;
};

type LibraryPanelProps = {
  activeVersionId: Id<"versions"> | null;
  catalogModels: CatalogSeedModel[];
  currentModel: CurrentModel;
  exportFileName: string;
  params: ModelParams;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onOpenVersion: (version: SavedLibraryVersion) => void;
  onSavedVersion: (versionId: Id<"versions">) => void;
};

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function defaultTitle(modelName: string) {
  return `${modelName} ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(Date.now())}`;
}

export function LibraryUnavailablePanel() {
  return (
    <section className="panel-section library-section">
      <h2>Library</h2>
      <p className="library-note">
        Convex is provisioned through Vercel Marketplace. Local persistence turns
        on when `VITE_CONVEX_URL` is available; Vercel builds receive it from
        `npm run build:vercel`.
      </p>
    </section>
  );
}

export function LibraryPanel({
  activeVersionId,
  catalogModels,
  currentModel,
  exportFileName,
  params,
  theme,
  unit,
  onCreateStlBlob,
  onOpenVersion,
  onSavedVersion,
}: LibraryPanelProps) {
  const library = useQuery(api.library.listLibrary);
  const upsertCatalogModels = useMutation(api.library.upsertCatalogModels);
  const generateUploadUrl = useMutation(api.library.generateUploadUrl);
  const saveUploadedModel = useMutation(api.library.saveUploadedModel);
  const saveVersion = useMutation(api.library.saveVersion);
  const forkVersion = useMutation(api.library.forkVersion);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Library ready");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (catalogModels.length > 0) {
      void upsertCatalogModels({ models: catalogModels });
    }
  }, [catalogModels, upsertCatalogModels]);

  const catalogKeys = useMemo(
    () => new Set(catalogModels.map((model) => model.key)),
    [catalogModels],
  );
  const sourceModels =
    library?.models.filter((model) => !model.uploaded) ?? [];
  const uploadedModels =
    library?.models.filter((model) => model.uploaded) ?? [];
  const versions = (library?.versions ?? []) as SavedLibraryVersion[];
  const versionTitle = title.trim() || defaultTitle(currentModel.name);

  const uploadBlob = async (blob: Blob, fileName: string) => {
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type || "model/stl" },
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`Upload failed with ${response.status}`);
    }
    const result = (await response.json()) as { storageId: Id<"_storage"> };
    return result.storageId;
  };

  const saveCurrent = async (source: "save" | "fork") => {
    const blob = onCreateStlBlob();
    if (!blob) {
      setStatus("The model is still loading. Try again in a moment.");
      return;
    }

    setIsSaving(true);
    setStatus(source === "fork" ? "Forking version..." : "Saving version...");
    try {
      const stlStorageId = await uploadBlob(blob, exportFileName);
      const versionId =
        source === "fork" && activeVersionId
          ? await forkVersion({
              versionId: activeVersionId,
              title: versionTitle,
              params,
              unit,
              theme,
              stlStorageId,
              fileName: exportFileName,
            })
          : await saveVersion({
              modelKey: currentModel.id,
              modelName: currentModel.name,
              title: versionTitle,
              params,
              unit,
              theme,
              stlStorageId,
              fileName: exportFileName,
              source,
            });
      onSavedVersion(versionId);
      setTitle("");
      setStatus(source === "fork" ? "Fork saved." : "Version saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const uploadModel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setIsSaving(true);
    setStatus(`Uploading ${file.name}...`);
    try {
      const stlStorageId = await uploadBlob(file, file.name);
      await saveUploadedModel({
        title: file.name.replace(/\.stl$/i, ""),
        fileName: file.name,
        stlStorageId,
        size: file.size,
        description: "Uploaded STL asset",
      });
      setStatus("Uploaded STL saved to library.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const forkExisting = async (version: SavedLibraryVersion) => {
    setIsSaving(true);
    setStatus(`Forking ${version.title}...`);
    try {
      const versionId = await forkVersion({
        versionId: version._id,
        title: `${version.title} fork`,
      });
      onSavedVersion(versionId);
      setStatus("Fork saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="panel-section library-section">
      <div className="section-heading-row">
        <h2>Library</h2>
        <span>{versions.length} saved</span>
      </div>
      <div className="library-summary">
        <span>{sourceModels.length} source models</span>
        <span>{uploadedModels.length} uploads</span>
        <span>{versions.filter((version) => version.source === "fork").length} forks</span>
      </div>
      <input
        aria-label="Version name"
        className="library-name-input"
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder="Version name"
        type="text"
        value={title}
      />
      <div className="library-actions">
        <button
          aria-label="Save current version"
          disabled={isSaving}
          onClick={() => saveCurrent("save")}
          type="button"
        >
          Save
        </button>
        <button
          aria-label="Fork current version"
          disabled={isSaving}
          onClick={() => saveCurrent("fork")}
          type="button"
        >
          Fork
        </button>
        <label className="library-upload-button">
          <UploadCloud aria-hidden="true" />
          Upload STL
          <input
            accept=".stl,model/stl"
            aria-label="Upload STL"
            onChange={uploadModel}
            type="file"
          />
        </label>
      </div>
      <p className="library-note" role="status">
        {library ? status : "Loading library..."}
      </p>
      <div className="library-list" aria-label="Saved models and forks">
        {versions.map((version) => {
          const canOpen = catalogKeys.has(version.modelKey);
          return (
            <article className="library-item" key={version._id}>
              <div>
                <strong>{version.title}</strong>
                <span>
                  {version.modelName} · {version.source === "fork" ? "Fork" : "Saved"} ·{" "}
                  {formatDate(version.updatedAt)}
                </span>
              </div>
              <div className="library-item-actions">
                <button
                  disabled={!canOpen}
                  onClick={() => onOpenVersion(version)}
                  type="button"
                >
                  Open
                </button>
                <button disabled={isSaving} onClick={() => forkExisting(version)} type="button">
                  Fork
                </button>
                {version.stlUrl ? (
                  <a href={version.stlUrl} rel="noreferrer" target="_blank">
                    STL
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
        {uploadedModels.map((model) => (
          <article className="library-item" key={model._id}>
            <div>
              <strong>{model.name}</strong>
              <span>
                Uploaded STL · {model.fileName ?? "file"} ·{" "}
                {model.size ? `${Math.round(model.size / 1024)} KB` : "stored"}
              </span>
            </div>
            <div className="library-item-actions">
              {model.stlUrl ? (
                <a href={model.stlUrl} rel="noreferrer" target="_blank">
                  STL
                </a>
              ) : null}
            </div>
          </article>
        ))}
        {versions.length === 0 && uploadedModels.length === 0 ? (
          <p className="library-empty">No saved versions yet.</p>
        ) : null}
      </div>
    </section>
  );
}
