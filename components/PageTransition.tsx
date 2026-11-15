import { ViewTransition, type ReactNode } from "react";

/**
 * Wraps a page so tab and drill-down navigations slide in the right
 * direction (Links tag them "nav-forward" / "nav-back"). Untyped transitions
 * (refreshes after an action, browser back) don't animate. Children get a
 * short staggered rise on first mount.
 */
export function PageTransition({
  children,
  className = "space-y-6",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <div className={`stagger ${className}`}>{children}</div>
    </ViewTransition>
  );
}
