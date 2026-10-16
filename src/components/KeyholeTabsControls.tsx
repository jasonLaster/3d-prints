import { useId } from "react";
import {
  getKeyholeTabsParameterLimits,
  getKeyholeTabsSpec,
  KEYHOLE_FRACTIONS,
} from "../models/keyholeLevelingTabs";
import type { KeyholeTabsModelDefinition, ModelParams } from "../models/types";

export function KeyholeTabsControls({
  model,
  params,
  onChange,
}: {
  model: KeyholeTabsModelDefinition;
  params: ModelParams;
  onChange: (key: string, value: number) => void;
}) {
  const spec = getKeyholeTabsSpec(params, model);
  const id = useId();
  return (
    <div className="parameter-groups keyhole-tabs-controls">
      <section className="nested-parameter-section">
        <h3>Leveling offset</h3>
        <div
          className="keyhole-offsets"
          role="group"
          aria-label="Fixed offset variants"
        >
          {KEYHOLE_FRACTIONS.map((fraction, i) => (
            <button
              key={fraction}
              type="button"
              aria-pressed={spec.variant === i + 1}
              onClick={() => onChange("variant", i + 1)}
            >
              <strong>{fraction}″</strong>
              <span>
                {i + 1} {i === 0 ? "bump" : "bumps"}
              </span>
            </button>
          ))}
        </div>
        <p className="parameter-derived-note" data-testid="keyhole-lift">
          Frame lift: +{spec.lift.toFixed(5)} mm
        </p>
      </section>
      <section className="nested-parameter-section">
        <h3>Preview</h3>
        <div
          className="keyhole-view-options"
          role="group"
          aria-label="Tab preview"
        >
          {["Selected tab", "All eight", "Installed section"].map(
            (label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={Math.round(params.previewMode) === i}
                onClick={() => onChange("previewMode", i)}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <p className="parameter-derived-note">
          PLA Tough or PETG · 0.4 mm nozzle
        </p>
        <p className="keyhole-prototype-note">
          Prototype: keyhole dimensions are assumed. Confirm seating and test
          under load before use.
        </p>
      </section>
      <details className="keyhole-details">
        <summary>Dimensions &amp; fit assumptions</summary>
        <p>
          All measurements below are in millimeters. Replace the assumed keyhole
          and screw dimensions with measurements from your frame.
        </p>
        {model.parameters
          .filter(
            (parameter) => !["variant", "previewMode"].includes(parameter.key),
          )
          .map((parameter) => {
            const limits = getKeyholeTabsParameterLimits(
              model,
              params,
              parameter.key,
            );
            return (
              <label
                className="keyhole-dimension-row"
                key={parameter.key}
                htmlFor={`${id}-${parameter.key}`}
              >
                <span>
                  {parameter.label} <small>mm</small>
                </span>
                <input
                  id={`${id}-${parameter.key}`}
                  aria-label={`${parameter.label} in millimeters`}
                  type="number"
                  inputMode="decimal"
                  min={limits.min}
                  max={limits.max}
                  step={limits.step}
                  value={params[parameter.key]}
                  onChange={(event) => {
                    if (event.currentTarget.value === "") return;
                    const n = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(n))
                      onChange(
                        parameter.key,
                        Math.min(limits.max, Math.max(limits.min, n)),
                      );
                  }}
                />
              </label>
            );
          })}
      </details>
      <details
        className="keyhole-details"
        open={Math.round(params.previewMode) === 2}
      >
        <summary>Contact geometry &amp; load path</summary>
        <KeyholeSection params={params} model={model} />
        <p>
          The slot roof bears on the leg top. The screw shank bears on its
          underside, {spec.offset.toFixed(5)} mm below the original roof. This
          raises the frame by the same amount if both contacts seat.
        </p>
        <p>
          Tape positions the pad and resists rotation or withdrawal. Its
          retention and the frame material still require a physical test.
        </p>
      </details>
      <details className="keyhole-details">
        <summary>Print files &amp; instructions</summary>
        <p>
          Start with variants 1, 6 and 8. Check screw insertion, upward seating,
          removal and measured lift. Print at 0.12 mm layers, 4 walls and 100%
          infill.
        </p>
        <p>
          The plate places each pad on its long edge to keep the leg and pad in
          continuous XY paths. Enable local supports under the inward leg.
          Inspect supports and layer orientation in Bambu Studio.
        </p>
        <p>
          Downloads use the default assumed dimensions. Workspace Export
          generates the selected tab with your current dimensions in every
          preview mode.
        </p>
        <div className="keyhole-downloads">
          <a
            href="/models/keyhole-leveling-tabs/print/all_variants.3mf"
            download
          >
            Default eight-tab 3MF
          </a>
          <a href="/models/keyhole-leveling-tabs/README.md" download>
            Dimensions &amp; instructions
          </a>
          <a href="/models/keyhole-leveling-tabs/keyhole_tab.scad" download>
            Parametric OpenSCAD source
          </a>
        </div>
      </details>
    </div>
  );
}

function KeyholeSection({
  params: p,
  model,
}: {
  params: ModelParams;
  model: KeyholeTabsModelDefinition;
}) {
  const s = getKeyholeTabsSpec(p, model);
  const scale = 7;
  const top = Math.max(8, s.padTop) + 2;
  const y = (frameY: number) => (top - frameY) * scale;
  const x = (frameZ: number) => 130 + frameZ * scale;
  const height = y(-s.offset - p.screwShankDiameter - 3);
  const roof = y(0),
    center = y(s.screwCenterY);
  return (
    <svg
      className="keyhole-section"
      role="img"
      aria-label={`Installed cross-section: ${s.offset.toFixed(5)} millimeter contact shift raises the frame; assumed dimensions`}
      viewBox={`0 0 300 ${height}`}
    >
      <title>Installed side section · assumed dimensions</title>
      <rect
        x={x(-p.rimThickness)}
        y="16"
        width={p.rimThickness * scale}
        height={roof - 16}
        fill="#c99a62"
      />
      <rect
        x={x(p.wallGap)}
        y="16"
        width="6"
        height={height - 30}
        fill="#85909e"
      />
      <rect
        x={x(-p.rimThickness - p.clearance / 2 - p.screwHeadThickness)}
        y={center - (p.screwHeadDiameter / 2) * scale}
        width={p.screwHeadThickness * scale}
        height={p.screwHeadDiameter * scale}
        rx="2"
        fill="#667285"
      />
      <rect
        x={x(-p.rimThickness - p.clearance / 2)}
        y={center - (p.screwShankDiameter / 2) * scale}
        width={(p.wallGap + p.rimThickness + p.clearance / 2) * scale}
        height={p.screwShankDiameter * scale}
        fill="#667285"
      />
      <rect
        x={x(s.padMinZ)}
        y={y(s.padTop)}
        width={p.padThickness * scale}
        height={p.padHeight * scale}
        rx="2"
        fill="#91b6d6"
        stroke="#315b80"
      />
      <rect
        x={x(-p.legDepth)}
        y={roof}
        width={(p.legDepth + p.tapeThickness) * scale}
        height={s.offset * scale}
        fill="#91b6d6"
        stroke="#315b80"
      />
      <path
        d={`M90 ${roof} H${x(-p.legDepth)} M90 ${roof} V${y(-s.offset)} H${x(-p.legDepth)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <text
        x="82"
        y={(roof + y(-s.offset)) / 2}
        textAnchor="end"
        dominantBaseline="middle"
      >
        {s.offset.toFixed(3)} mm
      </text>
      <text x="28" y="12">
        Frame
      </text>
      <text x="210" y="12">
        Wall →
      </text>
      <text x="14" y={height - 4}>
        Roof → leg → screw shank
      </text>
    </svg>
  );
}
