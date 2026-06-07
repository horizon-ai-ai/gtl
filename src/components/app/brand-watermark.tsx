/**
 * G³ wordmark watermark — large, low-opacity decorative element rendered
 * behind the hero greeting per spec gtl_ui_redesign_spec.md §4.2.
 *
 * Pure inline SVG (no external asset dependency) so it works before the
 * business owner ships the official g3-watermark.svg.
 */
export function BrandWatermark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="g3-watermark-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9be6d7" />
          <stop offset="50%" stopColor="#7dc8fa" />
          <stop offset="100%" stopColor="#be9bf0" />
        </linearGradient>
      </defs>
      <g
        stroke="url(#g3-watermark-stroke)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* Stylised G³ glyph */}
        <path d="M 360 80 C 260 80, 200 160, 220 240 C 240 320, 320 340, 380 300 C 420 270, 420 220, 380 200 L 300 200" />
        <path d="M 410 100 C 440 100, 460 120, 460 145 C 460 168, 444 182, 420 184 C 444 186, 462 200, 462 224 C 462 252, 440 270, 410 270" />
      </g>
    </svg>
  );
}
