/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./modules/**/*.{js,jsx}", "./config/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        accent:   "rgb(var(--accent) / <alpha-value>)",
        bg:       "rgb(var(--bg) / <alpha-value>)",
        surface:  "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        content:  "rgb(var(--content) / <alpha-value>)",
        muted:    "rgb(var(--muted) / <alpha-value>)",
        line:     "rgb(var(--line) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
