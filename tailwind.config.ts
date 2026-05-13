import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0f172a',
        panel: '#1e293b',
        border: '#334155',
        muted: '#94a3b8',
        text: '#e2e8f0',
        accent: '#7dd3fc',
        up: '#86efac',
        down: '#fca5a5',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
