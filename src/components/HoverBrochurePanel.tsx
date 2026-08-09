import {
  ArrowLeft,
  Check,
  CloudOff,
  Download,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";

export type BrochureGenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "saving"; imageDataUrl: string }
  | {
      status: "success";
      generationId: string;
      imageDataUrl: string;
      saved: boolean;
      saveError?: string;
    }
  | { status: "error"; message: string };

type HoverBrochurePanelProps = {
  modelName: string;
  onBack: () => void;
  onRegenerate: () => void;
  onRetrySave: () => void;
  state: BrochureGenerationState;
};

export function HoverBrochurePanel({
  modelName,
  onBack,
  onRegenerate,
  onRetrySave,
  state,
}: HoverBrochurePanelProps) {
  const isGenerating =
    state.status === "generating" || state.status === "saving";
  const hasImage = state.status === "saving" || state.status === "success";

  return (
    <section
      aria-busy={isGenerating}
      aria-label="AI brochure render"
      aria-live="polite"
      className="hover-brochure-panel"
      data-status={state.status}
      data-testid="hover-brochure-panel"
    >
      {hasImage ? (
        <img
          alt={`${modelName} in a generated brochure room scene`}
          className="hover-brochure-image"
          src={state.imageDataUrl}
        />
      ) : (
        <div className="hover-brochure-backdrop" aria-hidden="true" />
      )}

      <div className="hover-brochure-toolbar">
        <button onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" />
          Back to model
        </button>
        {state.status === "success" ? (
          <>
            <span
              className={`hover-brochure-save-status${state.saved ? " saved" : " unsaved"}`}
            >
              {state.saved ? (
                <Check aria-hidden="true" />
              ) : (
                <CloudOff aria-hidden="true" />
              )}
              {state.saved ? "Saved" : "Not saved"}
            </span>
            {!state.saved ? (
              <button onClick={onRetrySave} type="button">
                <Save aria-hidden="true" />
                Save again
              </button>
            ) : null}
            <button onClick={onRegenerate} type="button">
              <RefreshCw aria-hidden="true" />
              Regenerate
            </button>
            <a
              download="x-hover-dining-table-brochure.png"
              href={state.imageDataUrl}
            >
              <Download aria-hidden="true" />
              Download PNG
            </a>
          </>
        ) : null}
      </div>

      {state.status === "idle" || state.status === "generating" ? (
        <div className="hover-brochure-message">
          <span className="hover-brochure-spark" aria-hidden="true">
            <Sparkles />
          </span>
          <p>Brochure mode</p>
          <h2>Creating a room scene</h2>
          <span>
            Capturing four CAD angles, then preserving the table geometry while
            Vercel AI Gateway generates the brochure image.
          </span>
          <div className="hover-brochure-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      ) : null}

      {state.status === "saving" ? (
        <div className="hover-brochure-message saving">
          <span className="hover-brochure-spark" aria-hidden="true">
            <Save />
          </span>
          <p>Brochure ready</p>
          <h2>Saving the full-resolution image</h2>
          <span>
            Uploading this render to the brochure library so it remains
            available after you leave this page.
          </span>
          <div className="hover-brochure-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="hover-brochure-message error" role="alert">
          <p>Brochure generation stopped</p>
          <h2>Unable to create the image</h2>
          <span>{state.message}</span>
          <button onClick={onRegenerate} type="button">
            <RefreshCw aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : null}

      {state.status === "success" ? (
        <p className="hover-brochure-disclaimer">
          {state.saved
            ? "Saved to Brochures · "
            : `Not saved yet${state.saveError ? `: ${state.saveError}` : ""} · `}
          the CAD model remains authoritative for dimensions and fabrication.
        </p>
      ) : null}
    </section>
  );
}
