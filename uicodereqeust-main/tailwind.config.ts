import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Inter", "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Ronsberger HMO brand scale — anchored on the real brand hex (#3f3f95)
        // at step 700, so `brand-700` == the exact color previously hardcoded
        // as text-[#3f3f95] / bg-[#3f3f95] throughout the app.
        brand: {
          50: '#f4f4fa',
          100: '#e9e9f6',
          200: '#d0d0eb',
          300: '#b0b0de',
          400: '#8c8ccf',
          500: '#6464be',
          600: '#4a4ab0',
          700: '#3f3f95', // = Ronsberger Indigo (primary)
          800: '#35357e',
          900: '#2a2a65',
          950: '#1b1b41',
        },
        // Sky Blue accent — anchored on #01aef2 at step 500
        sky: {
          50: '#f0fbff',
          100: '#dbf5ff',
          200: '#b3e9ff',
          300: '#7bd9fe',
          400: '#34c5fe',
          500: '#01aef2', // = Ronsberger Sky Blue (accent)
          600: '#0192cb',
          700: '#0178a7',
          800: '#016289',
          900: '#015070',
          950: '#003347',
        },
        // Lime Green highlight — anchored on #93c34b at step 500
        lime: {
          50: '#f6faf0',
          100: '#edf5e0',
          200: '#daebc1',
          300: '#c3df9b',
          400: '#aad171',
          500: '#93c34b', // = Ronsberger Lime Green (highlight)
          600: '#7ca937',
          700: '#658b2d',
          800: '#517024',
          900: '#41591d',
          950: '#273611',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Consistent elevation scale. Use these instead of ad hoc shadow-xl /
      // shadow-2xl / shadow-[...] combos so every card, dropdown, and modal
      // in the app sits at one of exactly 4 depths.
      boxShadow: {
        "elevation-1": "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 1px 0 rgb(15 23 42 / 0.03)",
        "elevation-2": "0 2px 8px -2px rgb(15 23 42 / 0.08), 0 1px 3px -1px rgb(15 23 42 / 0.05)",
        "elevation-3": "0 8px 24px -4px rgb(15 23 42 / 0.10), 0 4px 8px -4px rgb(15 23 42 / 0.06)",
        "elevation-4": "0 20px 48px -8px rgb(15 23 42 / 0.16), 0 8px 16px -8px rgb(15 23 42 / 0.08)",
        "brand-glow": "0 8px 24px -4px rgb(63 63 149 / 0.25)",
      },
      height: {
        screen: "100dvh",
      },
      minHeight: {
        screen: "100dvh",
      },
      maxHeight: {
        screen: "100dvh",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
