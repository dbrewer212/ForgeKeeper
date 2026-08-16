import type { Config } from "tailwindcss";

const foundryIron = {
  50: "#f4eee3",
  100: "#e6dccb",
  200: "#cfc0aa",
  300: "#b2a188",
  400: "#92816b",
  500: "#736451",
  600: "#594c3e",
  700: "#40372f",
  800: "#2a2520",
  900: "#191613",
  950: "#0d0b0a",
};

const foundrySteel = {
  50: "#f2eee7",
  100: "#ddd6ca",
  200: "#c2b8aa",
  300: "#a3998c",
  400: "#81786e",
  500: "#655e57",
  600: "#4d4843",
  700: "#383430",
  800: "#262320",
  900: "#171513",
  950: "#0b0a09",
};

const foundryBronze = {
  50: "#fff7e6",
  100: "#f8e7bf",
  200: "#efd08e",
  300: "#e0b45f",
  400: "#c79438",
  500: "#a97524",
  600: "#815819",
  700: "#604114",
  800: "#422e12",
  900: "#2c2011",
  950: "#19130c",
};

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Existing UI already speaks slate/gray/amber. Remap those families so
        // every station inherits the Foundry material language without a skin layer.
        slate: foundryIron,
        gray: foundrySteel,
        amber: foundryBronze,
        foundry: {
          iron: "#15120f",
          charcoal: "#0d0b09",
          soot: "#080706",
          steel: "#35312c",
          bronze: "#a97524",
          brass: "#c79438",
          ember: "#b95f2a",
          timber: "#34251b",
          oak: "#4a3525",
          parchment: "#d8cbb7",
          ash: "#9e9384",
          monitor: "#6f98a8",
        },
      },
      boxShadow: {
        forge: "0 18px 55px rgba(0,0,0,0.5), inset 0 1px 0 rgba(239,208,142,0.035)",
        "forge-inset": "inset 0 1px 0 rgba(239,208,142,0.045), inset 0 -1px 0 rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
} satisfies Config;
