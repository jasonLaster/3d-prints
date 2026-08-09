import { ArrowLeft, Download, RefreshCw, Sparkles } from "lucide-react";

export type BrochureGenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "success"; imageDataUrl: string }
  | { status: "error"; message: string };

type HoverBrochurePanelProps = {
  modelName: string;
  onBack: () => void;
  onRegenerate: () => void;
  state: BrochureGenerationState;
};

export function HoverBrochurePanel({
  modelName,
  onBack,
  onRegenerate,
  state,
}: HoverBrochurePanelProps) {
  const isGenerating = state.status === "generating";

  return (
    <section
      aria-busy={isGenerating}
      aria-label="AI brochure render"
      aria-live="polite"
      className="hover-brochure-panel"
      data-status={state.status}
      data-testid="hover-brochure-panel"
    >
      {state.status === "success" ? (
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
          AI presentation render · the CAD model remains authoritative for
          dimensions and fabrication.
        </p>
      ) : null}
    </section>
  );
}
