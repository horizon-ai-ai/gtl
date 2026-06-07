/**
 * G³ swoosh watermark — large, soft, single-stroke flourish drawn in white
 * over the breathing gradient hero (spec gtl_ui_redesign_spec.md §4.2 +
 * Grace's 26/06/07 visual reference: an abstract, calligraphic
 * G-with-a-tail mark that occupies the centre-left of the canvas).
 *
 * Pure inline SVG so we can ship before the business owner delivers the
 * official asset. Replace with public/brand/g3-watermark.svg when ready.
 */
export function BrandWatermark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      {/*
        Abstract calligraphic swoosh:
          - top crescent opens upward (mimicking a soft G bowl)
          - tail curls down-right and trails off
        Stroked in white with rounded caps so it reads as a single
        liquid gesture on the pastel breathing gradient behind it.
      */}
      <g
        stroke="#ffffff"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.95"
      >
        {/* Main bowl + tail (one continuous path) */}
        <path
          d="
            M 520 130
            C 410 80, 280 110, 230 220
            C 200 290, 230 380, 320 410
            C 400 435, 470 410, 500 360
            C 520 320, 510 290, 470 280
            C 430 275, 400 295, 395 335
            C 390 380, 415 430, 460 460
            C 510 495, 580 500, 620 470
          "
        />
        {/* Counter-stroke (subtle highlight to give the gesture weight) */}
        <path
          d="
            M 295 195
            C 340 165, 405 160, 450 195
          "
          opacity="0.45"
          strokeWidth="8"
        />
      </g>
    </svg>
  );
}
