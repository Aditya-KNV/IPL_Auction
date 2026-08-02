/** @type {import('tailwindcss').Config} */
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
        // design system
        'obsidian':    '#07080E',
        'surface':     '#0D0F18',
        'surface-2':   '#111420',
        'surface-3':   '#161B2E',
        'neon':        '#00FF66',
        'neon-dim':    '#00CC52',
        'bid-red':     '#FF3355',
        'gold-bright': '#FFD060',
        'text-primary':'#F0F4FF',
        'text-muted':  '#8B92A5',
        'text-subtle': '#454E66',
        // team colours
        'mi-blue':     '#004FC7',
        'csk-gold':    '#FFC72C',
        'rcb-red':     '#EC1C24',
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.06)',
      },
      boxShadow: {
        'card':        'inset 0 1px 0 rgba(255,255,255,0.045), 0 2px 12px rgba(0,0,0,0.28)',
        'card-hover':  'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 28px rgba(0,0,0,0.5)',
        'glow-neon':   '0 0 20px rgba(0,255,102,0.25), 0 0 40px rgba(0,255,102,0.1)',
        'glow-red':    '0 0 20px rgba(255,51,85,0.3)',
        'glow-gold':   '0 0 20px rgba(255,208,96,0.3)',
        'modal':       '0 0 0 1px rgba(255,255,255,0.06), 0 24px 80px rgba(0,0,0,0.7)',
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
        bidFlash:  { '0%':{ backgroundColor:'rgba(0,255,102,0.16)' }, '100%':{ backgroundColor:'transparent' } },
        critPulse: {
          '0%,100%': { textShadow:'0 0 22px rgba(255,51,85,.7), 0 0 50px rgba(255,51,85,.35)' },
          '50%':     { textShadow:'0 0 40px rgba(255,51,85,1),  0 0 80px rgba(255,51,85,.7)'  },
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
