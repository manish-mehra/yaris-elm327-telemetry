import { useEffect, useRef } from "react";
import Replay from "./Replay.jsx";
import "./replay.css";

// Full-screen dialog that holds the trip replay. Replay only mounts while open, so nothing animates in the background.
export default function ReplayModal({ open, onClose, title, ...replayProps }) {
  const closeRef = useRef();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const k = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; removeEventListener("keydown", k); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="rpm-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"rpm-panel " + (replayProps.dark === false ? "light" : "dark")} role="dialog" aria-modal="true" aria-label={title || "Trip replay"}>
        <div className="rpm-head">
          <strong>{title || "Trip replay"}</strong>
          <button ref={closeRef} className="rpm-x" onClick={onClose} aria-label="Close replay">Close</button>
        </div>
        <Replay {...replayProps} />
      </div>
    </div>
  );
}