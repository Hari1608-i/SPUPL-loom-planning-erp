/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        spu: {
          primary: '#2563eb',
          secondary: '#0f766e',
          accent: '#0284c7',
          success: '#059669',
          warning: '#d97706',
          danger: '#dc2626',
          background: '#f5f7fa',
          sidebar: '#0f1b33',
        },
        industrial: {
          50:  '#f5f7fa',
          100: '#f1f5f9',
          200: '#d7dee8',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#172033',
          900: '#0f1b33',
        }
      }
    },
  },
  plugins: [],
}
