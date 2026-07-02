import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import {
  Box,
  ChevronRight,
  Clock3,
  CloudOff,
  CopyPlus,
  GitFork,
  Layers3,
  Save,
  Search,
} from "lucide-react";
import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

type DashboardModelSummary = {
  key: string;
  name: string;
  description?: string;
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

type LibraryDashboardErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type LibraryDashboardErrorBoundaryState = {
  hasError: boolean;
};

const PERSISTENCE_OFFLINE_MESSAGE =
  "Library sync is temporarily unavailable. You can still open models and export STLs; saved versions will return when sync is healthy.";
const SAVE_OFFLINE_MESSAGE =
  "Library sync is temporarily unavailable. Your model is still editable; export an STL or try saving again shortly.";
const CATALOG_SYNC_MESSAGE =
  "The catalog loaded, but library sync could not refresh it. Saved versions may be out of date.";
const CONNECTION_SYNC_MESSAGE =
  "Library sync is reconnecting. You can keep browsing models; saved versions may be delayed.";

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

function getModelPreviewClass(modelKey: string) {
  return modelKey.includes("tray") ? "tray" : "holder";
}

function getModelTypeLabel(modelKey: string) {
  return modelKey.includes("tray") ? "Tray" : "Holder";
}

export function filterDashboardModels<T extends DashboardModelSummary>(
  models: T[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return models;
  }
  return models.filter((model) =>
    [model.name, model.description ?? "", getModelTypeLabel(model.key)]
      .filter((value) => value.length > 0)
      .some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}

export function DashboardToolbar({
  count,
  query,
  total,
  onQueryChange,
}: {
  count: number;
  query: string;
  total: number;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="dashboard-toolbar">
      <label className="dashboard-search">
        <Search aria-hidden="true" />
        <input
          aria-label="Search models"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Search models"
          type="search"
          value={query}
        />
      </label>
      <span className="dashboard-result-count">
        {count} of {total}
      </span>
    </div>
  );
}

export function DashboardSidebar({
  modelCount,
  versionCount,
}: {
  modelCount: number;
  versionCount: number | string;
}) {
  return (
    <aside className="dashboard-sidebar" aria-label="Library navigation">
      <div className="dashboard-brand">
        <span className="dashboard-brand-mark" aria-hidden="true">
          <Box />
        </span>
        <div>
          <strong>3D Prints</strong>
          <span>Parametric library</span>
        </div>
      </div>
      <nav className="dashboard-nav" aria-label="Dashboard sections">
        <a href="#dashboard-models" className="active">
          <Layers3 aria-hidden="true" />
          Models
        </a>
        <a href="#dashboard-forks">
          <GitFork aria-hidden="true" />
          Versions
        </a>
      </nav>
      <div className="dashboard-sidebar-stats" aria-label="Library stats">
        <div>
          <strong>{modelCount}</strong>
          <span>Models</span>
        </div>
        <div>
          <strong>{versionCount}</strong>
          <span>Versions</span>
        </div>
      </div>
    </aside>
  );
}

export function DashboardModelCard({
  model,
  onOpenModel,
}: {
  model: DashboardModelSummary;
  onOpenModel: (modelId: string) => void;
}) {
  return (
    <article className="dashboard-card">
      <div
        aria-hidden="true"
        className={`model-preview ${getModelPreviewClass(model.key)}`}
      >
        <span />
      </div>
      <div className="dashboard-card-copy">
        <strong>{model.name}</strong>
        <p>{model.description ?? "Parametric STL model"}</p>
        <div className="dashboard-card-meta" aria-label={`${model.name} metadata`}>
          <span>{getModelTypeLabel(model.key)}</span>
          <span>STL</span>
          <span>Ready</span>
        </div>
      </div>
      <button onClick={() => onOpenModel(model.key)} type="button">
        <span>Open</span>
        <ChevronRight aria-hidden="true" />
      </button>
    </article>
  );
}

class LibraryDashboardErrorBoundary extends Component<
  LibraryDashboardErrorBoundaryProps,
  LibraryDashboardErrorBoundaryState
> {
  state: LibraryDashboardErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Unable to render Convex library dashboard.", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function useCatalogSeed(catalogModels: CatalogSeedModel[]) {
  const upsertCatalogModels = useMutation(api.library.upsertCatalogModels);
  const [hasSeedError, setHasSeedError] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (catalogModels.length > 0) {
      void upsertCatalogModels({ models: catalogModels })
        .then(() => {
          if (mounted) {
            setHasSeedError(false);
          }
        })
        .catch((error) => {
          console.error("Unable to seed catalog models.", error);
          if (mounted) {
            setHasSeedError(true);
          }
        });
    }

    return () => {
      mounted = false;
    };
  }, [catalogModels, upsertCatalogModels]);

  return hasSeedError;
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

export function LibraryUnavailableMessage({
  children = PERSISTENCE_OFFLINE_MESSAGE,
}: {
  children?: ReactNode;
}) {
  return (
    <p className="library-note">
      <CloudOff aria-hidden="true" />
      <span>{children}</span>
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
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [isSaving, setIsSaving] = useState(false);
  const versionTitle = title.trim() || defaultTitle(currentModel.name);

  const saveCurrent = async (source: "save" | "fork") => {
    const blob = onCreateStlBlob();
    if (!blob) {
      setStatus("Model is still loading.");
      setStatusTone("neutral");
      return;
    }

    setIsSaving(true);
    setStatusTone("neutral");
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
      setStatusTone("neutral");
    } catch (error) {
      console.error(`Unable to ${source} library version.`, error);
      setStatus(SAVE_OFFLINE_MESSAGE);
      setStatusTone("error");
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
      <span
        className={`save-status${statusTone === "error" ? " error" : ""}`}
        role="status"
      >
        {status}
      </span>
    </div>
  );
}

function LibraryFallbackDashboard({
  actions,
  catalogModels,
  onOpenModel,
}: {
  actions?: ReactNode;
  catalogModels: CatalogSeedModel[];
  onOpenModel: (modelId: string) => void;
}) {
  const [modelQuery, setModelQuery] = useState("");
  const filteredModels = useMemo(
    () => filterDashboardModels(catalogModels, modelQuery),
    [catalogModels, modelQuery],
  );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        modelCount={catalogModels.length}
        versionCount="Offline"
      />

      <section className="dashboard-main">
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
            <span>{catalogModels.length} available</span>
          </div>
          <DashboardToolbar
            count={filteredModels.length}
            onQueryChange={setModelQuery}
            query={modelQuery}
            total={catalogModels.length}
          />
          <div className="dashboard-grid">
            {filteredModels.map((model) => (
              <DashboardModelCard
                key={model.key}
                model={model}
                onOpenModel={onOpenModel}
              />
            ))}
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="dashboard-forks">
          <div className="dashboard-section-heading">
            <h2 id="dashboard-forks">Saved Versions And Forks</h2>
            <span>Persistence offline</span>
          </div>
          <div className="dashboard-list">
            <LibraryUnavailableMessage />
          </div>
        </section>
      </section>
    </main>
  );
}

function ConnectedLibraryDashboard({
  actions,
  catalogModels,
  onOpenModel,
  onOpenVersion,
}: LibraryDashboardProps) {
  const hasSeedError = useCatalogSeed(catalogModels);
  const connectionState = useConvexConnectionState();
  const library = useQuery(api.library.listLibrary);
  const hasConnectionIssue =
    !connectionState.isWebSocketConnected &&
    (connectionState.hasEverConnected || connectionState.connectionRetries > 0);
  const syncMessage = hasSeedError
    ? CATALOG_SYNC_MESSAGE
    : hasConnectionIssue
      ? CONNECTION_SYNC_MESSAGE
      : null;
  const sourceModels = useMemo<DashboardModelSummary[]>(() => {
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
  const [modelQuery, setModelQuery] = useState("");
  const filteredModels = useMemo(
    () => filterDashboardModels(sourceModels, modelQuery),
    [modelQuery, sourceModels],
  );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        modelCount={sourceModels.length}
        versionCount={versions.length}
      />

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p>3D Prints</p>
            <h1>Model Library</h1>
          </div>
          {actions ? <div className="dashboard-actions">{actions}</div> : null}
        </header>

        {syncMessage ? (
          <LibraryUnavailableMessage>{syncMessage}</LibraryUnavailableMessage>
        ) : null}

        <section className="dashboard-section" aria-labelledby="dashboard-models">
          <div className="dashboard-section-heading">
            <h2 id="dashboard-models">Models</h2>
            <span>{sourceModels.length} available</span>
          </div>
          <DashboardToolbar
            count={filteredModels.length}
            onQueryChange={setModelQuery}
            query={modelQuery}
            total={sourceModels.length}
          />
          <div className="dashboard-grid">
            {filteredModels.map((model) => (
              <DashboardModelCard
                key={model.key}
                model={model}
                onOpenModel={onOpenModel}
              />
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
                <span className="dashboard-row-icon" aria-hidden="true">
                  {version.source === "fork" ? <GitFork /> : <Clock3 />}
                </span>
                <div className="dashboard-row-copy">
                  <strong>{version.title}</strong>
                  <span>
                    {version.modelName} ·{" "}
                    {version.source === "fork" ? "Fork" : "Saved"} ·{" "}
                    {formatDate(version.updatedAt)}
                  </span>
                </div>
                <div className="dashboard-row-actions">
                  <button onClick={() => onOpenVersion(version)} type="button">
                    <span>Open</span>
                    <ChevronRight aria-hidden="true" />
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
      </section>
    </main>
  );
}

export function LibraryDashboard(props: LibraryDashboardProps) {
  return (
    <LibraryDashboardErrorBoundary
      fallback={
        <LibraryFallbackDashboard
          actions={props.actions}
          catalogModels={props.catalogModels}
          onOpenModel={props.onOpenModel}
        />
      }
    >
      <ConnectedLibraryDashboard {...props} />
    </LibraryDashboardErrorBoundary>
  );
}
