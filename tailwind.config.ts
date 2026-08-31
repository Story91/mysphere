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
        'coin-base': ['coin-base-sans', 'sans-serif'],
        'coinbase': ['Coinbase Display', 'sans-serif']
      },
      colors: {
        base: {
          primary: '#0052FF',
          secondary: '#FFFFFF',
          background: '#0A0B0D',
          text: '#FFFFFF',
          accent: '#00FF8F'
        },
        // Tokeny shadcn - zmienne CSS zyja w app/globals.css (@layer base { :root } + .dark)
        // i sa trojkami HSL, dlatego mapujemy je przez hsl(var(--x)).
        // Bez tego mapowania komponenty z components/ui/ (button, dialog, select, card...)
        // renderowaly sie z martwymi klasami: bg-popover, text-muted-foreground, bg-accent itd.
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backgroundImage: {
        'base-gradient': 'linear-gradient(90deg, #0052FF 0%, #00FF8F 100%)',
        'base-dark': 'linear-gradient(180deg, #0A0B0D 0%, #1E2025 100%)'
      },
      keyframes: {
        glow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255, 0, 168, 0.7), 0 0 30px rgba(0, 255, 209, 0.7)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 0, 168, 0.9), 0 0 50px rgba(0, 255, 209, 0.9)' }
        }
      },
      animation: {
        'glow': 'glow 1.5s ease-in-out infinite'
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
