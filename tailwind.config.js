/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pendix: {
          bg: '#06000f',
          panel: '#08000f',
          card: '#0e0e1a',
        },
      },
    },
  },
  plugins: [],
};
