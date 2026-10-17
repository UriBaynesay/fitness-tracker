import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

// A page's frame. `nav` adds the bottom tab bar (Today, Plans) and the bottom
// padding that keeps content from sliding underneath it.
export function Screen({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  return (
    <>
      <main className={nav ? "screen screen-with-nav" : "screen"}>{children}</main>
      {nav && <BottomNav />}
    </>
  );
}
