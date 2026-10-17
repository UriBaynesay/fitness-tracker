import { useEffect } from "react";

// A single-page app keeps one <title> unless told otherwise, and screen readers announce
// the title when the page changes. Each screen sets its own.
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Fitness Tracker` : "Fitness Tracker";
  }, [title]);
}
