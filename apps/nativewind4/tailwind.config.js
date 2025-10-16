/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        gray: 'var(--color-gray)',
        typography: 'var(--color-typography)',
      },
    },
  },
  plugins: [],
}
