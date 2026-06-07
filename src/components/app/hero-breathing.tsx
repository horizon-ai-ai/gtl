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
 * the G³ watermark, per spec gtl_ui_redesign_spec.md §4.2 and Grace's
 * 26/06/07 visual reference.
 *
 * Visual contract:
 *  - The breathing gradient is full-bleed across the section.
 *  - The bottom edge fades into the page canvas via a mask gradient,
 *    matching the business-owner mock where the colour halo bleeds
 *    into the white area below rather than terminating in a card edge.
 *  - The G³ swoosh watermark sits centre-left, sized large.
 *  - Breathing animation respects prefers-reduced-motion (globals.css).
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
        "relative isolate w-full overflow-hidden",
        "px-6 sm:px-10",
        "pt-16 pb-24 sm:pt-20 sm:pb-28",
        "min-h-[420px]",
        className ?? "",
      ].join(" ")}
    >
      {/*
        Breathing gradient layer with a bottom fade so the colour halo
        dissolves into the page canvas instead of meeting it on a hard
        edge. The mask lets ~75% of the gradient render at full strength
        and feathers the remaining 25% toward transparent.
      */}
      <div
        aria-hidden
        className="bg-g3-breathing pointer-events-none absolute inset-0 -z-10"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
        }}
      />

      {/* Decorative G³ swoosh — large, centre-left, layered behind text */}
      <BrandWatermark
        className="pointer-events-none absolute left-[-4%] top-1/2 -z-10 h-[140%] w-auto -translate-y-1/2 opacity-90"
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
