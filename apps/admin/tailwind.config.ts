import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        accent: "#00FF9C",
        card: "#101010",
        background: "#0B0B0B"
      }
    }
  },
  plugins: []
};

export default config;
