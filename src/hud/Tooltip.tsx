import { useAtlas } from "../app/store";

/** Follows the cursor. Deliberately plain — it is a map surface, not a card. */
export default function Tooltip() {
  const hover = useAtlas((s) => s.hover);
  if (!hover) return null;

  const flipX = hover.x > window.innerWidth - 240;
  const flipY = hover.y > window.innerHeight - 120;

  return (
    <div
      className="tip"
      style={{
        left: hover.x + (flipX ? -14 : 14),
        top: hover.y + (flipY ? -14 : 14),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
      aria-hidden="true"
    >
      <div className="tip__row">
        {hover.color && <span className="tip__swatch" style={{ background: hover.color }} />}
        <span className="tip__name">{hover.name}</span>
      </div>
      {hover.subtitle && <div className="tip__sub">{hover.subtitle}</div>}
      {hover.detail && <div className="tip__detail tnum">{hover.detail}</div>}
    </div>
  );
}
