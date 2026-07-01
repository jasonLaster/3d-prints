import { useMutation, useQuery } from "convex/react";
import { CopyPlus, Save } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type LengthUnit = "mm" | "cm" | "in";
type ThemeMode = "light" | "dark";
type ModelParams = Record<string, number>;

export type CatalogSeedModel = {
  key: string;
  name: string;
  configUrl: string;
  description?: string;
  publicStlUrl?: string;
  fileName?: string;
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

type CurrentModel = {
  id: string;
  name: string;
};

type SaveForkControlsProps = {
  activeVersionId: Id<"versions"> | null;
  currentModel: CurrentModel;
  exportFileName: string;
  params: ModelParams;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onSavedVersion: (versionId: Id<"versions">) => void;
};

type LibraryDashboardProps = {
  actions?: ReactNode;
  catalogModels: CatalogSeedModel[];
  onOpenModel: (modelId: string) => void;
  onOpenVersion: (version: SavedLibraryVersion) => void;
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

function useCatalogSeed(catalogModels: CatalogSeedModel[]) {
  const upsertCatalogModels = useMutation(api.library.upsertCatalogModels);

  useEffect(() => {
    if (catalogModels.length > 0) {
      void upsertCatalogModels({ models: catalogModels });
    }
  }, [catalogModels, upsertCatalogModels]);
}

async function uploadBlob(
  generateUploadUrl: () => Promise<string>,
  blob: Blob,
) {
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
}

export function LibraryUnavailableMessage() {
  return (
    <p className="library-note">
      Convex persistence is configured for Vercel. Local saved versions appear
      when `VITE_CONVEX_URL` is available.
    </p>
  );
}

export function SaveForkControls({
  activeVersionId,
  currentModel,
  exportFileName,
  params,
  theme,
  unit,
  onCreateStlBlob,
  onSavedVersion,
}: SaveForkControlsProps) {
  const generateUploadUrl = useMutation(api.library.generateUploadUrl);
  const saveVersion = useMutation(api.library.saveVersion);
  const forkVersion = useMutation(api.library.forkVersion);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isSaving, setIsSaving] = useState(false);
  const versionTitle = title.trim() || defaultTitle(currentModel.name);

  const saveCurrent = async (source: "save" | "fork") => {
    const blob = onCreateStlBlob();
    if (!blob) {
      setStatus("Model is still loading.");
      return;
    }

    setIsSaving(true);
    setStatus(source === "fork" ? "Forking..." : "Saving...");
    try {
      const stlStorageId = await uploadBlob(generateUploadUrl, blob);
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

  return (
    <div className="save-fork-controls">
      <input
        aria-label="Version name"
        className="version-name-input"
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder="Version name"
        type="text"
        value={title}
      />
      <button
        aria-label="Save current version"
        disabled={isSaving}
        onClick={() => saveCurrent("save")}
        type="button"
      >
        <Save aria-hidden="true" />
        Save
      </button>
      <button
        aria-label="Fork current version"
        disabled={isSaving}
        onClick={() => saveCurrent("fork")}
        type="button"
      >
        <CopyPlus aria-hidden="true" />
        Fork
      </button>
      <span className="save-status" role="status">
        {status}
      </span>
    </div>
  );
}

export function LibraryDashboard({
  actions,
  catalogModels,
  onOpenModel,
  onOpenVersion,
}: LibraryDashboardProps) {
  useCatalogSeed(catalogModels);
  const library = useQuery(api.library.listLibrary);
  const sourceModels = useMemo(() => {
    const persistedModels = library?.models.filter((model) => !model.uploaded);
    return persistedModels && persistedModels.length > 0
      ? persistedModels.map((model) => ({
          key: model.key,
          name: model.name,
          description: model.description,
        }))
      : catalogModels;
  }, [catalogModels, library]);
  const versions = (library?.versions ?? []) as SavedLibraryVersion[];
  const forks = versions.filter((version) => version.source === "fork");
  const saved = versions.filter((version) => version.source !== "fork");

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p>3D Prints</p>
          <h1>Model Library</h1>
        </div>
        {actions ? <div className="dashboard-actions">{actions}</div> : null}
      </header>

      <section className="dashboard-section" aria-labelledby="dashboard-models">
        <div className="dashboard-section-heading">
          <h2 id="dashboard-models">Models</h2>
          <span>{sourceModels.length} available</span>
        </div>
        <div className="dashboard-grid">
          {sourceModels.map((model) => (
            <article className="dashboard-card" key={model.key}>
              <div>
                <strong>{model.name}</strong>
                <p>{model.description ?? "Parametric STL model"}</p>
              </div>
              <button onClick={() => onOpenModel(model.key)} type="button">
                Open
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-forks">
        <div className="dashboard-section-heading">
          <h2 id="dashboard-forks">Saved Versions And Forks</h2>
          <span>{versions.length} total</span>
        </div>
        <div className="dashboard-list">
          {versions.length === 0 ? (
            <p className="library-empty">No saved versions yet.</p>
          ) : null}
          {[...forks, ...saved].map((version) => (
            <article className="dashboard-row" key={version._id}>
              <div>
                <strong>{version.title}</strong>
                <span>
                  {version.modelName} · {version.source === "fork" ? "Fork" : "Saved"} ·{" "}
                  {formatDate(version.updatedAt)}
                </span>
              </div>
              <div className="dashboard-row-actions">
                <button onClick={() => onOpenVersion(version)} type="button">
                  Open
                </button>
                {version.stlUrl ? (
                  <a href={version.stlUrl} rel="noreferrer" target="_blank">
                    STL
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
