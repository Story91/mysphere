import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        'sm': '576px',    // Zmniejszone z 640px
        'md': '691px',    // Zmniejszone z 768px
        'lg': '922px',    // Zmniejszone z 1024px
        'xl': '1152px',   // Zmniejszone z 1280px
        '2xl': '1382px'   // Zmniejszone z 1536px
      },
      fontSize: {
        'xs': ['0.675rem', { lineHeight: '0.9rem' }],
        'sm': ['0.7875rem', { lineHeight: '1.125rem' }],
        'base': ['0.9rem', { lineHeight: '1.35rem' }],
        'lg': ['1.0125rem', { lineHeight: '1.575rem' }],
        'xl': ['1.125rem', { lineHeight: '1.575rem' }],
        '2xl': ['1.35rem', { lineHeight: '1.8rem' }],
        '3xl': ['1.6875rem', { lineHeight: '2.025rem' }],
        '4xl': ['2.025rem', { lineHeight: '2.25rem' }],
      },
      spacing: {
        'screen-90': '81vh',  // Zmniejszone z 90vh
        'screen-80': '72vh',  // Zmniejszone z 80vh
      },
      maxWidth: {
        'screen-xl': '1152px',  // Zmniejszone z 1280px
        'screen-lg': '922px',   // Zmniejszone z 1024px
      },
      fontFamily: {
        'coin-base': ['coin-base-sans', 'sans-serif']
      },
      colors: {
        base: {
          primary: '#0052FF',
          secondary: '#FFFFFF',
          background: '#0A0B0D',
          text: '#FFFFFF',
          accent: '#00FF8F'
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      backgroundImage: {
        'base-gradient': 'linear-gradient(90deg, #0052FF 0%, #00FF8F 100%)',
        'base-dark': 'linear-gradient(180deg, #0A0B0D 0%, #1E2025 100%)'
      }
    },
  },
  plugins: [],
};
export default config;
