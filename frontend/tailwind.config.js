/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'ipl-blue': '#004BA0',
        'ipl-gold': '#F7A800',
        'ipl-dark': '#0A0A1A',
      },
      animation: {
        'pulse-fast':  'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-in':   'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-in':     'fadeIn 0.3s ease-out',
      },
      keyframes: {
        bounceIn: {
          '0%':   { transform: 'scale(0.5)', opacity: '0' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
