/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0B1020",
        cloud: "#F5F7FB",
        sea: "#0EA5E9",
        moss: "#14B8A6",
        coral: "#F97316",
        gold: "#FBBF24",
        slate: "#51606F"
      },
      boxShadow: {
        glow: "0 26px 60px rgba(14, 165, 233, 0.22)",
        card: "0 18px 45px rgba(15, 23, 42, 0.1)"
      },
      borderRadius: {
        xl: "20px"
      }
    }
  },
  plugins: []
};
