import { useEffect, useState } from "react";

// Follows the OS theme (or data-theme on <html> if you add a toggle later).
export default function useDark() {
  const q = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [d, setD] = useState(q);
  useEffect(() => {
    const m = matchMedia("(prefers-color-scheme: dark)");
    const f = () => setD(q());
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return d;
}
