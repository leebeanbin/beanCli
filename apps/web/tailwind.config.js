/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--c-bg)',
        'bg-2': 'var(--c-bg2)',
        fg: 'var(--c-fg)',
        'fg-2': 'var(--c-fg2)',
        rim: 'var(--c-rim)',
        accent: 'var(--c-accent)',
        ok: 'var(--c-ok)',
        warn: 'var(--c-warn)',
        danger: 'var(--c-danger)',
        special: 'var(--c-special)',
      },
      fontFamily: {
        pixel: ['"VT323"', 'monospace'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        px: '2px 2px 0px var(--c-rim)',
        'px-a': '2px 2px 0px var(--c-accent)',
        'px-d': '2px 2px 0px var(--c-danger)',
        'px-o': '2px 2px 0px var(--c-ok)',
      },
    },
  },
  plugins: [],
};
