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
        sage: {
          DEFAULT: "#8B9A6E",
          hover: "#74845A",
          soft: "#E1E7D5",
          contrast: "#F7F2EB",
        },
        canvas: {
          DEFAULT: "#F7F2EB",
          surface: "#FFFFFF",
          subtle: "#EAE2D6",
          neutral: "#EEEEEE",
        },
        border: {
          DEFAULT: "#D6CEC1",
          strong: "#8B9A6E",
          structural: "#AEB5BF",
        },
        ink: {
          DEFAULT: "#252822",
          secondary: "#5F6258",
          muted: "#85877D",
          disabled: "#B1B3AA",
        },
        status: {
          success: "#5F7A45",
          warning: "#A8793A",
          danger: "#B6534A",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Geist",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "Geist Mono",
          "JetBrains Mono",
          "IBM Plex Mono",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        none: "0px",
        xs: "2px",
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
      },
      boxShadow: {
        none: "none",
      },
    },
  },
  plugins: [],
};

export default config;

