import type { Config } from "tailwindcss";

const config: Config = {
  /**
   * ===== TRYB CIEMNY STEROWANY KLASA, KTOREJ NIKT NIE DOKLADA =====
   *
   * Bez tego wpisu Tailwind stoi na domyslnym `media`, czyli KAZDA klasa
   * `dark:` w repo odpala sie od ustawienia systemu patrzacego. A ta aplikacja
   * ma jedno, jasne tlo wpisane na sztywno (`bg-soft-bg`, patrz naglowek
   * tokenow w app/globals.css) i nie ma zadnego przelacznika motywu:
   * ThemeContext trzyma stan, ale NIGDY nie dokłada klasy `dark` do
   * dokumentu - sprawdzone w calym repo.
   *
   * Skutek byl realny i widoczny: czlowiek z ciemnym systemem dostawal na
   * jasnych kartach nadpisania w rodzaju `dark:text-white` (bialy tekst na
   * bialej karcie) i `dark:bg-gray-800` (ciemny kafel w jasnym panelu). Sam
   * basechat ma okolo 170 takich klas, wiekszosc w panelu edycji profilu
   * i w kompozytorach lancuchowych.
   *
   * `class` wylacza je wszystkie naraz, bez ruszania ani jednego wywolania.
   * Nadpisania zostaja w kodzie i odzyja w chwili, gdy ktos naprawde doda
   * przelacznik motywu i zacznie dokladac klase `dark` - wtedy trzeba je
   * przejrzec, bo dzis nikt ich nie widzial i nikt nie sprawdzil, czy sa
   * spojne.
   */
  darkMode: 'class',
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
        'coinbase': ['Coinbase Display', 'sans-serif'],
        // Kierunek Soft Social. Zmienne wstrzykuje next/font w app/layout.tsx.
        'soft-display': ['var(--font-soft-display)', 'Baloo 2', 'system-ui', 'sans-serif'],
        'soft': ['var(--font-soft-body)', 'Nunito', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--soft-shadow-card)',
        chip: 'var(--soft-shadow-chip)',
        float: 'var(--soft-shadow-float)',
      },
      transitionTimingFunction: {
        'out-strong': 'var(--ease-out-strong)',
        'in-out-strong': 'var(--ease-in-out-strong)',
        drawer: 'var(--ease-drawer)',
      },
      colors: {
        // Soft Social - uzasadnienie kazdej wartosci przy :root w globals.css.
        // Tutaj samo mapowanie, zeby pisac bg-soft-surface zamiast
        // bg-[var(--soft-surface)].
        soft: {
          bg: 'rgb(var(--soft-bg) / <alpha-value>)',
          surface: 'rgb(var(--soft-surface) / <alpha-value>)',
          sunken: 'rgb(var(--soft-surface-sunken) / <alpha-value>)',
          ink: 'rgb(var(--soft-ink) / <alpha-value>)',
          'ink-muted': 'rgb(var(--soft-ink-muted) / <alpha-value>)',
          'ink-soft': 'rgb(var(--soft-ink-soft) / <alpha-value>)',
          'ink-faint': 'rgb(var(--soft-ink-faint) / <alpha-value>)',
          primary: 'rgb(var(--soft-primary) / <alpha-value>)',
          'primary-deep': 'rgb(var(--soft-primary-deep) / <alpha-value>)',
          line: 'rgb(var(--soft-line) / <alpha-value>)',
          'line-strong': 'rgb(var(--soft-line-strong) / <alpha-value>)',
          accent: 'rgb(var(--soft-accent) / <alpha-value>)',
          'accent-soft': 'rgb(var(--soft-accent-soft) / <alpha-value>)',
          'accent-deep': 'rgb(var(--soft-accent-deep) / <alpha-value>)',
          info: 'rgb(var(--soft-info) / <alpha-value>)',
          'info-soft': 'rgb(var(--soft-info-soft) / <alpha-value>)',
        },
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
        // Soft Social. Dopisane do ISTNIEJACEGO bloku, nie obok - drugi
        // borderRadius w tym samym obiekcie cicho nadpisalby tokeny shadcn.
        card: 'var(--soft-radius-card)',
        pill: 'var(--soft-radius-pill)',
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
