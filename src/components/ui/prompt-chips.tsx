"use client";

import type { ChipItem } from "@/lib/chips/default-prompts";

type PromptChipsProps = {
  items: ChipItem[];
  onSelect: (item: ChipItem) => void;
  className?: string;
};

const CATEGORY_HOVER_BORDER: Record<ChipItem["category"], string> = {
  generate: "hover:border-generate-400",
  growth: "hover:border-growth-400",
  global: "hover:border-global-400",
};

/**
 * Quick-prompt chip cloud rendered under the hero composer (spec §4.4).
 *
 * Visual: pill, white surface, neutral border, brand-tinted border on hover
 * based on the chip's business-pillar category.
 */
export function PromptChips({ items, onSelect, className }: PromptChipsProps) {
  return (
    <div
      className={[
        "flex flex-wrap justify-center gap-2",
        className ?? "",
      ].join(" ")}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className={[
            "rounded-full border border-stone-200 bg-white/80 px-4 py-1.5",
            "text-sm text-stone-700 backdrop-blur",
            "transition hover:bg-white hover:shadow-sm",
            CATEGORY_HOVER_BORDER[item.category],
          ].join(" ")}
          title={item.prompt}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
