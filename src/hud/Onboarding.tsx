import { useEffect, useState } from "react";
import { hasVisitedBefore, markVisited } from "../app/store";

const HINTS = [
  { text: "Drag to move through time", where: "hint--timeline" },
  { text: "Click a realm to open it", where: "hint--map" },
  { text: "Zoom in — smaller powers appear", where: "hint--zoom" },
];

/** Three hints, once, then out of the way for good. */
export default function Onboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (hasVisitedBefore()) return;
    const t = window.setTimeout(() => setShow(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!show) return;
    const dismiss = () => { setShow(false); markVisited(); };
    const t = window.setTimeout(dismiss, 9000);
    window.addEventListener("pointerdown", dismiss, { once: true });
    window.addEventListener("keydown", dismiss, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="hints" aria-hidden="true">
      {HINTS.map((h, i) => (
        <div key={h.where} className={`hint ${h.where}`} style={{ animationDelay: `${i * 140}ms` }}>
          {h.text}
        </div>
      ))}
    </div>
  );
}
