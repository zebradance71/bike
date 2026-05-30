/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./launcher.html", "./companion.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        cozy: ['"Segoe UI"', "system-ui", "sans-serif"],
      },
      colors: {
        ninja: {
          ink: "#1a1a2e",
          mist: "#f5f0e8",
          accent: "#c45c3e",
        },
      },
    },
  },
  plugins: [],
};
