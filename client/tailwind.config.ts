import type { Config } from 'tailwindcss';

// Colours come from the CSS variables in src/index.css (RGB triplets, so `/opacity` modifiers work).
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.tsx'],
  theme: {
    extend: {
      colors: {
        obsidian: token('obsidian'), // page background
        onyx: token('onyx'), // cards, panels
        graphite: token('graphite'), // raised: hover, inputs
        stone: token('stone'), // borders on dark
        ivory: token('ivory'), // primary text on dark
        pearl: token('pearl'),
        linen: token('linen'),
        'muted-dark': token('muted-dark'), // secondary text on dark
        'muted-light': token('muted-light'),
        gold: token('gold'), // decorative gold on dark
        'gold-deep': token('gold-deep'),
        'gold-soft': token('gold-soft'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      keyframes: {
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'sheet-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'sheet-up': 'sheet-up 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        'sheet-in': 'sheet-in 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 280ms ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
