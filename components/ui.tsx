import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Explain } from "@/components/Explain";
import type { GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  ...props
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-zinc-800/70 bg-zinc-900 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Editorial photos in /public/editorial used behind page titles. */
export type BannerImage =
  | "barbell" | "plates" | "kettlebells" | "pullup" | "prep" | "rack"
  | "salmon" | "bowl" | "oats" | "blueberry" | "coffee"
  | "runner" | "ridge" | "track" | "city" | "stack" | "shadows"
  | "sleep" | "tea" | "rain" | "linen" | "wall"
  | "sunrise" | "mountains" | "ocean" | "evening" | "breath";

export function PageHeader({
  title,
  subtitle,
  action,
  image,
  imagePosition,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Optional editorial photo banner behind the title. */
  image?: BannerImage;
  imagePosition?: string;
  /** Small label above the title. */
  eyebrow?: string;
}) {
  if (image) {
    return (
      <header
        className="banner-photo editorial-photo relative mb-5 flex min-h-[148px] items-end justify-between gap-3 overflow-hidden rounded-[28px] px-5 pb-4 pt-10"
        style={{ ["--banner" as string]: `url("/editorial/${image}.webp")`, ["--banner-pos" as string]: imagePosition ?? "center" }}
      >
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-paper/75">{eyebrow}</p>}
          <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-paper">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-paper/80">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
    );
  }
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</p>}
        <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function SectionTitle({
  children,
  className,
  action,
  help,
}: {
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  /** Plain-language explanation behind a "?" button. */
  help?: GlossaryKey;
}) {
  return (
    <div className={cn("mb-2 flex items-start justify-between gap-2", className)}>
      <h2 className="min-w-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {children}
        {help && <Explain k={help} />}
      </h2>
      {action}
    </div>
  );
}

const buttonVariants = {
  primary:
    "bg-citron text-carbon font-semibold hover:bg-citron-deep active:bg-citron-deep",
  secondary:
    "border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800",
  ghost: "text-zinc-300 hover:bg-zinc-800/70 active:bg-zinc-800",
  danger:
    "border border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
} as const;

const buttonSizes = {
  sm: "h-9 px-3.5 text-sm rounded-full",
  md: "h-11 px-5 text-sm rounded-full",
  lg: "h-12 px-6 text-base rounded-full",
  icon: "h-10 w-10 rounded-full",
} as const;

export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  size: keyof typeof buttonSizes = "md",
  className?: string,
) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 font-medium press disabled:pointer-events-none disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export const inputClass =
  "h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3.5 text-base text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-300/25";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

export function Tag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-700/70 bg-zinc-800/40 px-2 py-0.5 text-[11px] font-medium text-zinc-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-500">
          {icon}
        </div>
      )}
      <p className="font-medium text-zinc-200">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-zinc-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
