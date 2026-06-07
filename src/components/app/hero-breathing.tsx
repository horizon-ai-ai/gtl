"use client";

import { useSession } from "next-auth/react";
import { BrandWatermark } from "./brand-watermark";

type HeroBreathingProps = {
  /** Optional override for the greeting name. If absent, falls back to session data, then "there". */
  userName?: string;
  /** Subtitle below the greeting. */
  subtitle?: string;
  /** The composer / input element to render inside the hero surface. */
  children?: React.ReactNode;
  className?: string;
};

function deriveDisplayName(raw: string | null | undefined): string {
  if (!raw) return "there";
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  if (!local) return "there";
  const parts = local.split(/[._\-\s]+/).filter(Boolean);
  if (parts.length === 0) return local;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/**
 * Hero block with the brand tri-colour breathing gradient surface and
 * the G³ watermark, per spec gtl_ui_redesign_spec.md §4.2.
 *
 * The breathing animation cycles every 30 seconds and respects
 * prefers-reduced-motion (handled globally in globals.css).
 */
export function HeroBreathing({
  userName,
  subtitle = "你可以問我服務內容，也可以直接告訴我想做什麼設計。",
  children,
  className,
}: HeroBreathingProps) {
  const { data: session } = useSession();
  const displayName =
    userName ?? deriveDisplayName(session?.user?.name || session?.user?.email);

  return (
    <section
      className={[
        "relative overflow-hidden rounded-3xl bg-g3-breathing",
        "px-6 py-12 sm:px-10 sm:py-16",
        "min-h-[360px]",
        className ?? "",
      ].join(" ")}
    >
      {/* Decorative G³ watermark */}
      <BrandWatermark
        className="pointer-events-none absolute inset-0 m-auto h-[80%] w-auto opacity-25"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <h1 className="font-display text-3xl font-light leading-tight text-stone-800 sm:text-4xl">
          Hello {displayName}，今天想來點什麼？
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600 sm:text-base">{subtitle}</p>

        {children ? <div className="mt-8 w-full">{children}</div> : null}
      </div>
    </section>
  );
}
