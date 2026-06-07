import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        canvas: "var(--bg-canvas)",
        surface: "var(--bg-surface)",
        sunken: "var(--bg-sunken)",
        hover: "var(--bg-hover)",
        ink: {
          900: "var(--ink-900)",
          700: "var(--ink-700)",
          500: "var(--ink-500)",
          400: "var(--ink-400)",
          300: "var(--ink-300)",
        },
        brand: {
          50: "var(--brand-50)",
          200: "var(--brand-200)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
        },
        accent: {
          50: "var(--accent-50)",
          300: "var(--accent-300)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
        },
        ok: {
          500: "var(--ok-500)",
        },
        warn: {
          500: "var(--warn-500)",
        },
        err: {
          500: "var(--err-500)",
        },
        info: {
          500: "var(--info-500)",
        },
        // G³ Brand palettes (spec §2.1, §3.1)
        generate: {
          50: "var(--g3-generate-50)",
          100: "var(--g3-generate-100)",
          200: "var(--g3-generate-200)",
          300: "var(--g3-generate-300)",
          400: "var(--g3-generate-400)",
          500: "var(--g3-generate-500)",
          600: "var(--g3-generate-600)",
          700: "var(--g3-generate-700)",
        },
        growth: {
          50: "var(--g3-growth-50)",
          100: "var(--g3-growth-100)",
          200: "var(--g3-growth-200)",
          300: "var(--g3-growth-300)",
          400: "var(--g3-growth-400)",
          500: "var(--g3-growth-500)",
          600: "var(--g3-growth-600)",
          700: "var(--g3-growth-700)",
        },
        global: {
          50: "var(--g3-global-50)",
          100: "var(--g3-global-100)",
          200: "var(--g3-global-200)",
          300: "var(--g3-global-300)",
          400: "var(--g3-global-400)",
          500: "var(--g3-global-500)",
          600: "var(--g3-global-600)",
          700: "var(--g3-global-700)",
        },
      },
      backgroundImage: {
        "g3-brand": "var(--g3-gradient-brand)",
        "g3-brand-soft": "var(--g3-gradient-brand-soft)",
      },
      keyframes: {
        "brand-breathing": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "brand-breathing": "brand-breathing 30s ease-in-out infinite",
      },
      borderColor: {
        DEFAULT: "var(--line-1)",
        line1: "var(--line-1)",
        line2: "var(--line-2)",
        line3: "var(--line-3)",
      },
      borderRadius: {
        xs: "var(--r-xs)",
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        pill: "var(--r-pill)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "var(--shadow-focus)",
      },
      fontFamily: {
        display: "var(--font-display)",
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      transitionDuration: {
        120: "120ms",
        240: "240ms",
        420: "420ms",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.32, 0.72, 0, 1)",
        snap: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
