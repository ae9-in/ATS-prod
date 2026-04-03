/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1D4ED8",
      },
      fontFamily: {
        body: ["Inter", "sans-serif"],
        manrope: ["Manrope", "sans-serif"],
      },
      spacing: {
        68: "17rem",
        85: "21.25rem",
      },
    },
  },
  plugins: [],
};
