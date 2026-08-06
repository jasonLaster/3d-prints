import {
  getHoverDiningTableCutList,
  type LengthUnit,
  type ModelParams,
} from "../models";
import type { HoverDiningTableCutPart } from "../models/hoverDiningTable";
import { formatLength } from "../units";

function formatAngle(value: number | undefined) {
  if (!value || Math.abs(value) < 0.05) return "square";
  return `${value.toFixed(1)}° from square`;
}

function formatProcessing(part: HoverDiningTableCutPart) {
  if (part.kind === "brace" && part.lap) {
    return `${formatAngle(part.cutAngleDegrees)} box-parallel ends · ${part.lap.face} half-lap`;
  }
  if (part.kind === "tabletop") return "square ends · roll long edges";
  if (part.kind === "stile") {
    return `${formatAngle(part.cutAngleDegrees)} blank · route frame after glue-up`;
  }
  return "square blank";
}

function GrainArrow({ markerId }: { markerId: string }) {
  return (
    <g className="cut-part-grain">
      <line markerEnd={`url(#${markerId})`} x1="92" x2="232" y1="76" y2="76" />
      <text x="104" y="68">grain</text>
    </g>
  );
}

function getPartSkew(part: HoverDiningTableCutPart) {
  const angle = part.cutAngleDegrees ?? 0;
  return part.kind === "stile" || part.kind === "brace"
    ? Math.min(34, Math.tan((angle * Math.PI) / 180) * 62)
    : 0;
}

function PartOutline({ part }: { part: HoverDiningTableCutPart }) {
  const skew = getPartSkew(part);
  if (part.kind === "stile" || part.kind === "brace") {
    return (
      <polygon
        className="cut-part-outline"
        points={`${45 + skew},38 ${280 + skew},38 ${280 - skew},100 ${45 - skew},100`}
      />
    );
  }
  return <rect className="cut-part-outline" height="62" width="235" x="45" y="38" />;
}

function HoverCutPartDiagram({
  part,
  unit,
}: {
  part: HoverDiningTableCutPart;
  unit: LengthUnit;
}) {
  const arrowId = `cut-arrow-${part.id}`;
  const grainArrowId = `grain-arrow-${part.id}`;
  const skew = getPartSkew(part);
  const lengthStartX = 45 - skew;
  const lengthEndX = 280 - skew;
  const outlineMaxX = 280 + skew;
  const verticalDimensionX = outlineMaxX + 24;
  const verticalTextX = verticalDimensionX + 23;
  const lapWidth = part.lap
    ? Math.max(12, Math.min(76, (part.lap.length / part.length) * 235))
    : 0;
  const lapShoulderShift = part.lap
    ? lapWidth * Math.cos((part.lap.shoulderAngleDegrees * Math.PI) / 180)
    : 0;
  const lapCenterX = 162.5;
  return (
    <article className="hover-cut-card" data-part-id={part.id}>
      <header>
        <span className="hover-cut-part-id">{part.id}</span>
        <div>
          <h3>{part.name}</h3>
          <p>{part.assembly}</p>
        </div>
        <span className="hover-cut-quantity">Qty {part.quantity}</span>
      </header>
      <svg
        aria-label={`${part.name} dimensioned cut diagram`}
        className="hover-cut-diagram"
        role="img"
        viewBox="0 0 390 170"
      >
        <defs>
          <marker
            id={arrowId}
            markerHeight="6"
            markerWidth="6"
            orient="auto-start-reverse"
            refX="3"
            refY="3"
            viewBox="0 0 6 6"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" />
          </marker>
          <marker
            id={grainArrowId}
            markerHeight="5"
            markerWidth="6"
            orient="auto"
            refX="5"
            refY="2.5"
            viewBox="0 0 6 5"
          >
            <path d="M 0 0 L 6 2.5 L 0 5 z" />
          </marker>
          <pattern
            height="6"
            id={`lap-hatch-${part.id}`}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width="6"
          >
            <line x1="0" x2="0" y1="0" y2="6" />
          </pattern>
        </defs>

        <PartOutline part={part} />
        {part.kind === "tabletop" ? (
          <g className="cut-part-profile-lines">
            <line x1="45" x2="280" y1="44" y2="44" />
            <line x1="45" x2="280" y1="94" y2="94" />
          </g>
        ) : null}
        {part.lap ? (
          <g className="cut-part-lap">
            <polygon
              fill={`url(#lap-hatch-${part.id})`}
              points={[
                `${lapCenterX - lapWidth / 2 + lapShoulderShift / 2},38`,
                `${lapCenterX + lapWidth / 2 + lapShoulderShift / 2},38`,
                `${lapCenterX + lapWidth / 2 - lapShoulderShift / 2},100`,
                `${lapCenterX - lapWidth / 2 - lapShoulderShift / 2},100`,
              ].join(" ")}
            />
            <text x={lapCenterX} y="31">
              {part.lap.face} half-lap · {part.lap.shoulderAngleDegrees.toFixed(1)}°
            </text>
          </g>
        ) : null}
        <GrainArrow markerId={grainArrowId} />

        <g className="cut-dimension-lines">
          <line x1={lengthStartX} x2={lengthStartX} y1="104" y2="132" />
          <line x1={lengthEndX} x2={lengthEndX} y1="104" y2="132" />
          <line
            markerEnd={`url(#${arrowId})`}
            markerStart={`url(#${arrowId})`}
            x1={lengthStartX + 3}
            x2={lengthEndX - 3}
            y1="124"
            y2="124"
          />
          <text x={(lengthStartX + lengthEndX) / 2} y="145">
            L {formatLength(part.length, unit)}
          </text>
          <line x1={outlineMaxX + 4} x2={verticalDimensionX + 9} y1="38" y2="38" />
          <line x1={280 - skew + 4} x2={verticalDimensionX + 9} y1="100" y2="100" />
          <line
            markerEnd={`url(#${arrowId})`}
            markerStart={`url(#${arrowId})`}
            x1={verticalDimensionX}
            x2={verticalDimensionX}
            y1="41"
            y2="97"
          />
          <text
            transform={`rotate(-90 ${verticalTextX} 69)`}
            x={verticalTextX}
            y="69"
          >
            W {formatLength(part.width, unit)}
          </text>
        </g>
      </svg>
      <dl className="hover-cut-card-data">
        <div>
          <dt>Thickness</dt>
          <dd>{formatLength(part.thickness, unit)}</dd>
        </div>
        <div>
          <dt>End cut</dt>
          <dd>{formatAngle(part.cutAngleDegrees)}</dd>
        </div>
        {part.lap ? (
          <>
            <div>
              <dt>Lap width</dt>
              <dd>{formatLength(part.lap.length, unit)}</dd>
            </div>
            <div>
              <dt>Lap depth</dt>
              <dd>{formatLength(part.lap.depth, unit)}</dd>
            </div>
            <div>
              <dt>Shoulder angle</dt>
              <dd>{part.lap.shoulderAngleDegrees.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>Lap center from end</dt>
              <dd>{formatLength(part.lap.centerFromEnd, unit)}</dd>
            </div>
            <div>
              <dt>Fit clearance</dt>
              <dd>{formatLength(part.lap.fitClearance, unit)}</dd>
            </div>
          </>
        ) : null}
        {part.processDimensions?.map((process) => (
          <div key={process.label}>
            <dt>{process.label}</dt>
            <dd>{formatLength(process.value, unit)}</dd>
          </div>
        ))}
      </dl>
      <ul className="hover-cut-card-notes">
        {part.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </article>
  );
}

export function HoverDiningTableCutList({
  params,
  unit,
}: {
  params: ModelParams;
  unit: LengthUnit;
}) {
  const cutList = getHoverDiningTableCutList(params);
  return (
    <section className="hover-cut-sheet" aria-label="X-Hover full-size cut list">
      <div className="hover-cut-sheet-inner">
        <header className="hover-cut-sheet-header">
          <div>
            <p className="hover-cut-eyebrow">Fabrication sheet · revision follows model parameters</p>
            <h2>X-Hover Dining Table Cut List</h2>
            <p>
              Full-size finished dimensions. Add rough-milling allowance for
              your stock and verify critical joinery on a full-size story stick.
            </p>
          </div>
          <dl>
            <div>
              <dt>Material</dt>
              <dd>{cutList.material}</dd>
            </div>
            <div>
              <dt>Pieces</dt>
              <dd>{cutList.totalPieces}</dd>
            </div>
            <div>
              <dt>Schedule lines</dt>
              <dd>{cutList.parts.length}</dd>
            </div>
          </dl>
        </header>

        <div className="hover-cut-table-wrap">
          <table className="hover-cut-table">
            <caption>Grouped finished-part schedule</caption>
            <thead>
              <tr>
                <th>Item</th>
                <th>Part</th>
                <th>Qty</th>
                <th>Length</th>
                <th>Width</th>
                <th>Thickness</th>
                <th>Processing</th>
              </tr>
            </thead>
            <tbody>
              {cutList.parts.map((part) => (
                <tr key={part.id}>
                  <td>{part.id}</td>
                  <th scope="row">{part.name}</th>
                  <td>{part.quantity}</td>
                  <td>{formatLength(part.length, unit)}</td>
                  <td>{formatLength(part.width, unit)}</td>
                  <td>{formatLength(part.thickness, unit)}</td>
                  <td>{formatProcessing(part)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="hover-cut-card-grid">
          {cutList.parts.map((part) => (
            <HoverCutPartDiagram key={part.id} part={part} unit={unit} />
          ))}
        </div>

        <footer className="hover-cut-sheet-footer">
          <p>
            Brace length is true centerline length between the two parallel
            end-box contact planes. Half-laps are centered at half the member
            length; A is relieved from the top and B from the bottom.
          </p>
          <p>
            Grain runs with every listed length. The end-box curves are routed
            after the four-piece frame glue-up, so B1–B3 are blank dimensions,
            not separate permanently square corner profiles.
          </p>
        </footer>
      </div>
    </section>
  );
}
