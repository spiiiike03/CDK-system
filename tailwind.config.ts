import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#162033",
        panel: "#ffffff",
        line: "#d8dee9",
        brand: "#2563eb",
        mint: "#0f9f6e",
        amber: "#b7791f",
        rose: "#d14343",
      },
      boxShadow: {
        panel: "0 20px 60px rgba(22, 32, 51, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
