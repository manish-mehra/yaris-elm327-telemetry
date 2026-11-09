import { useEffect, useState } from "react";

// true when the OS is in dark mode (charts need to know so they can recolor).
export default function useDark() {
  const q = window.matchMedia("(prefers-color-scheme: light)");
  const [dark, setDark] = useState(q.matches);
  useEffect(() => {
    const on = (e) => setDark(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return dark;
}