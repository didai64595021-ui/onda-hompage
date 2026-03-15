import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: '#0F1218',
        gold: '#C9A96E',
        'gold-light': '#E8D5A8',
        'dark-card': '#161B22',
        'dark-border': '#2A2F38',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'serif'],
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
