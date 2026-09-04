/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e2eaff",
          200: "#c7d6ff",
          300: "#a3b9ff",
          400: "#7d97fb",
          500: "#5b74f0",
          600: "#4256d6",
          700: "#3644ac",
          800: "#2c3688",
          900: "#232a66",
          950: "#161a42",
        },
        ink: {
          50: "#f7f8fa",
          100: "#eceef2",
          200: "#d5d9e2",
          300: "#aeb5c4",
          400: "#818ba1",
          500: "#636e85",
          600: "#4f586d",
          700: "#414859",
          800: "#2e3340",
          900: "#1c1f28",
          950: "#111319",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(17, 19, 25, 0.04), 0 4px 16px rgba(17, 19, 25, 0.06)",
      },
    },
  },
  plugins: [],
};
