/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#1F5F4A',
          dark: '#6FBF9F',
        },
        danger: '#B3261E',
        background: '#FFFFFF',
        text: '#111111',
        'text-secondary': '#666666',
        border: '#E3E3E3',
        'dark-background': '#0E0E0E',
        'dark-text': '#EDEDED',
        'dark-text-secondary': '#9A9A9A',
        'dark-border': '#2A2A2A',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      spacing: {
        '4': '4px',
        '8': '8px',
        '16': '16px',
        '24': '24px',
        '40': '40px',
      },
      borderRadius: {
        'input': '6px',
        'btn': '6px',
      },
    },
  },
  plugins: [],
}