import { useEffect, useState } from "react";
import { hasVisitedBefore, markVisited } from "../app/store";

/**
 * One hint, anchored, once.
 *
 * There were three, floating over the middle of the map on first load: drag the
 * timeline, click a realm, zoom for more. Two of them described what a map and a
 * slider already look like they do, and all three covered the thing they were
 * explaining. Three tooltips at once is a tutorial, and a tutorial is what a
 * product resorts to when its surface does not read on its own.
 *
 * What is left is the one mechanic nothing on screen announces: the atlas holds
 * far more than it shows, and zooming is how you ask for it. It sits against the
 * zoom control rather than over the map, and leaves the moment that control is
 * used — which is the moment it has been understood.
 */
export default function Onboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (hasVisitedBefore()) return;
    const t = window.setTimeout(() => setShow(true), 1100);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!show) return;
    const dismiss = () => { setShow(false); markVisited(); };
    const t = window.setTimeout(dismiss, 8000);
    window.addEventListener("wheel", dismiss, { once: true, passive: true });
    window.addEventListener("pointerdown", dismiss, { once: true });
    window.addEventListener("keydown", dismiss, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("wheel", dismiss);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="hint" aria-hidden="true">
      Zoom in for smaller realms, more people, more places
    </div>
  );
}
