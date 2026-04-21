import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Extra classes on the `<h1>` (e.g. `flex items-center gap-2` with an icon). */
  titleClassName?: string;
  className?: string;
};

/**
 * Standard page chrome: title + optional lead copy. Typography is driven by
 * `index.css` `.page-title` and `.page-description` (design tokens).
 */
export function PageHeader({ title, description, titleClassName, className }: PageHeaderProps) {
  return (
    <header className={cn("space-y-1.5", className)}>
      <h1 className={cn("page-title", titleClassName)}>{title}</h1>
      {description != null ? <p className="page-description">{description}</p> : null}
    </header>
  );
}
