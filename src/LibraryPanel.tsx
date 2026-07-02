import { useMutation } from "convex/react";
import {
  ChevronDown,
  CloudOff,
  CopyPlus,
  Save,
} from "lucide-react";
import { useState, type ReactNode } from "react";
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

type ModelSummary = {
  key: string;
  name: string;
  description?: string;
};

type SaveForkControlsProps = {
  activeVersionId: Id<"versions"> | null;
  currentModel: CurrentModel;
  exportFileName: string;
  mode?: "popover" | "inline";
  params: ModelParams;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onSavedVersion: (versionId: Id<"versions">, title: string) => void;
};

const PERSISTENCE_OFFLINE_MESSAGE =
  "Library sync is temporarily unavailable. You can still open models and export STLs; saved versions will return when sync is healthy.";
const SAVE_OFFLINE_MESSAGE =
  "Library sync is temporarily unavailable. Your model is still editable; export an STL or try saving again shortly.";

function defaultTitle(modelName: string) {
  return `${modelName} ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(Date.now())}`;
}

function getModelTypeLabel(modelKey: string) {
  return modelKey.includes("tray") ? "Tray" : "Holder";
}

export function filterLibraryModels<T extends ModelSummary>(
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
  mode = "popover",
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [isSaving, setIsSaving] = useState(false);
  const versionTitle = title.trim() || defaultTitle(currentModel.name);
  const menuId = `version-actions-${currentModel.id}`;

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
      onSavedVersion(versionId, versionTitle);
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

  const controlsBody = (
    <>
      <div className="version-menu-heading">
        <strong>Version actions</strong>
        <span>{currentModel.name}</span>
      </div>
      <label className="version-field">
        <span>Version name</span>
        <input
          aria-label="Version name"
          className="version-name-input"
          onChange={(event) => setTitle(event.currentTarget.value)}
          placeholder="Version name"
          type="text"
          value={title}
        />
      </label>
      <div className="version-menu-actions">
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
      </div>
      <span
        className={`save-status${statusTone === "error" ? " error" : ""}`}
        role="status"
      >
        {status}
      </span>
    </>
  );

  if (mode === "inline") {
    return (
      <div className="save-fork-controls inline">
        {controlsBody}
      </div>
    );
  }

  return (
    <div
      className="save-fork-controls"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsMenuOpen(false);
        }
      }}
    >
      <button
        aria-controls={isMenuOpen ? menuId : undefined}
        aria-expanded={isMenuOpen}
        aria-label="Version actions"
        className="version-menu-trigger"
        onClick={() => setIsMenuOpen((current) => !current)}
        type="button"
      >
        <CopyPlus aria-hidden="true" />
        Fork
        <ChevronDown aria-hidden="true" />
      </button>
      <span className={`save-status-indicator${statusTone === "error" ? " error" : ""}`}>
        {statusTone === "error" ? "Sync issue" : isSaving ? "Saving" : "Ready"}
      </span>
      {isMenuOpen ? (
        <div className="version-menu" id={menuId} role="dialog" aria-label="Version actions">
          {controlsBody}
        </div>
      ) : null}
    </div>
  );
}
