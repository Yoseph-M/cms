/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      'tablet-portrait': '768px',
      'tablet-landscape': '1024px',
      'desktop': '1280px',
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Explicit brand blue scale (mirrors login #3B82F6 = brand-500)
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        // Cyan accent scale — eye-catching complement
        cyan: {
          50:  '#ECFEFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
          700: '#0E7490',
          800: '#155E75',
          900: '#164E63',
        },
        // Legacy Aliases (re-mapped to brand-aligned tokens)
        surface: {
          DEFAULT: 'hsl(var(--background))',
          warm: 'hsl(var(--card))',
          raised: 'hsl(var(--card))'
        },
        ink: {
          DEFAULT: 'hsl(var(--foreground))',
          muted: 'hsl(var(--muted-foreground))'
        },
        copper: 'hsl(var(--primary))',
        moss: 'hsl(var(--success))',
        'rust-alert': 'hsl(var(--destructive))',
        'gold-line': 'hsl(var(--accent))',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-from-bottom-2': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-from-bottom-4': {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-from-top-2': {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        shake: 'shake 0.4s ease-in-out',
        'fade-in': 'fade-in 200ms ease-out',
        'slide-in-from-bottom-2': 'slide-in-from-bottom-2 240ms ease-out',
        'slide-in-from-bottom-4': 'slide-in-from-bottom-4 320ms ease-out',
        'slide-in-from-top-2': 'slide-in-from-top-2 200ms ease-out',
        'scale-in': 'scale-in 180ms ease-out',
      },
      boxShadow: {
        // Soft brand-blue glow used on hover for primary CTAs / nav pills
        brand: '0 8px 24px -8px rgba(59,130,246,0.45), 0 2px 6px -2px rgba(59,130,246,0.25)',
        'brand-lg': '0 18px 40px -16px rgba(59,130,246,0.55), 0 4px 12px -4px rgba(59,130,246,0.30)',
        // Cyan accent glow
        cyan: '0 8px 24px -8px rgba(6,182,212,0.45), 0 2px 6px -2px rgba(6,182,212,0.25)',
      },
    },
  },
  plugins: [],
}
