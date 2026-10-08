/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#12211C",
          700: "#1F3630",
          500: "#4C635C",
          300: "#8FA39C",
        },
        pine: {
          900: "#0B2B24",
          700: "#0F6E5B",
          500: "#238066",
          200: "#CFE6DC",
          100: "#E9F3EE",
        },
        sand: {
          50: "#FBF9F4",
          100: "#F5F1E8",
        },
        amber: {
          600: "#B8873A",
          100: "#F4E9D6",
        },
        rose: {
          600: "#B5493F",
          100: "#F6E4E1",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(18, 33, 28, 0.06), 0 1px 1px rgba(18,33,28,0.04)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
