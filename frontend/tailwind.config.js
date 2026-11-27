/** @type {import('tailwindcss').Config} */

// Faint "white/NN" text and borders are lifted towards full strength by a
// per-theme floor (see index.css), so they stay readable in both themes.
const liftedForeground = (floor) => ({ opacityValue }) => (
  opacityValue === undefined
    ? 'rgb(var(--fg))'
    : `rgb(var(--fg) / calc(var(${floor}) + (1 - var(${floor})) * ${opacityValue}))`
);

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        bebas: ['"Bebas Neue"', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        // legacy (kept for backward compat)
        'ipl-blue':    '#004BA0',
        'ipl-gold':    '#F7A800',
        'ipl-dark':    '#07080E',
        // design system — theme-aware via CSS custom properties (see index.css)
        'obsidian':    'rgb(var(--obsidian) / <alpha-value>)',
        'surface':     'rgb(var(--surface) / <alpha-value>)',
        'surface-2':   'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3':   'rgb(var(--surface-3) / <alpha-value>)',
        'neon':        'rgb(var(--neon) / <alpha-value>)',
        'neon-dim':    'rgb(var(--neon-dim) / <alpha-value>)',
        'bid-red':     'rgb(var(--bid-red) / <alpha-value>)',
        'gold-bright': 'rgb(var(--gold-bright) / <alpha-value>)',
        'text-primary':'rgb(var(--text-primary) / <alpha-value>)',
        'text-muted':  'rgb(var(--text-muted) / <alpha-value>)',
        'text-subtle': 'rgb(var(--text-subtle) / <alpha-value>)',
        // "white" is used throughout as the foreground-on-surface token (text-white/40,
        // border-white/[0.06], etc.) — repointing it makes those utilities theme-aware
        // without touching every component.
        'white':       'rgb(var(--fg) / <alpha-value>)',
        // team colours
        'mi-blue':     '#004FC7',
        'csk-gold':    '#FFC72C',
        'rcb-red':     '#EC1C24',
      },
      textColor: {
        white: liftedForeground('--text-floor'),
      },
      borderColor: {
        white: liftedForeground('--border-floor'),
        DEFAULT: 'rgb(var(--fg) / 0.06)',
      },
      boxShadow: {
        'card':        'inset 0 1px 0 rgb(var(--fg) / 0.045), 0 2px 12px rgb(var(--shadow) / 0.28)',
        'card-hover':  'inset 0 1px 0 rgb(var(--fg) / 0.07), 0 8px 28px rgb(var(--shadow) / 0.5)',
        'glow-neon':   '0 0 20px rgb(var(--neon) / 0.25), 0 0 40px rgb(var(--neon) / 0.1)',
        'glow-red':    '0 0 20px rgb(var(--bid-red) / 0.3)',
        'glow-gold':   '0 0 20px rgb(var(--gold-bright) / 0.3)',
        'modal':       '0 0 0 1px rgb(var(--fg) / 0.06), 0 24px 80px rgb(var(--shadow) / 0.7)',
      },
      animation: {
        'pulse-fast':      'pulse 0.8s cubic-bezier(0.4,0,0.6,1) infinite',
        'bounce-in':       'bounceIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        'fade-in':         'fadeIn 0.3s ease-out',
        'slide-left':      'slideLeft 0.38s cubic-bezier(0.25,1,0.5,1) both',
        'bid-flash':       'bidFlash 0.7s ease-out',
        'crit-pulse':      'critPulse 0.5s ease-in-out infinite',
        'glow-pulse':      'glowPulse 3s ease-in-out infinite',
        'sold-pop':        'soldPop 0.5s cubic-bezier(0.25,1,0.5,1) both',
        'ticker-scroll':   'tickerScroll 42s linear infinite',
        'live-blink':      'liveBlink 1.4s ease-in-out infinite',
        'hammer-bob':      'hammerBob 2s ease-in-out infinite',
        'unsold-pop':      'unsoldPop 0.4s cubic-bezier(0.25,1,0.5,1) both',
      },
      keyframes: {
        bounceIn:  { '0%':{ transform:'scale(.5)',opacity:'0' }, '100%':{ transform:'scale(1)',opacity:'1' } },
        fadeIn:    { '0%':{ opacity:'0',transform:'translateY(8px)' }, '100%':{ opacity:'1',transform:'translateY(0)' } },
        slideLeft: { '0%':{ transform:'translateX(-16px)',opacity:'0' }, '100%':{ transform:'translateX(0)',opacity:'1' } },
        bidFlash:  { '0%':{ backgroundColor:'rgb(var(--neon) / 0.16)' }, '100%':{ backgroundColor:'transparent' } },
        critPulse: {
          '0%,100%': { textShadow:'0 0 22px rgb(var(--bid-red) / .7), 0 0 50px rgb(var(--bid-red) / .35)' },
          '50%':     { textShadow:'0 0 40px rgb(var(--bid-red) / 1),  0 0 80px rgb(var(--bid-red) / .7)'  },
        },
        glowPulse:     { '0%,100%':{ opacity:'.6' }, '50%':{ opacity:'1' } },
        soldPop:       { '0%':{ transform:'scale(.25)',opacity:'0' }, '60%':{ transform:'scale(1.08)' }, '100%':{ transform:'scale(1)',opacity:'1' } },
        unsoldPop:     { '0%':{ transform:'scale(.4)',opacity:'0' }, '100%':{ transform:'scale(1)',opacity:'1' } },
        tickerScroll:  { '0%':{ transform:'translateX(0)' }, '100%':{ transform:'translateX(-50%)' } },
        liveBlink:     { '0%,100%':{ opacity:'1',transform:'scale(1)' }, '50%':{ opacity:'.45',transform:'scale(.75)' } },
        hammerBob:     { '0%,100%':{ transform:'rotate(-18deg)' }, '50%':{ transform:'rotate(10deg)' } },
      },
    },
  },
  plugins: [],
};
