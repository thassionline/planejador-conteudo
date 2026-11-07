import type { Config } from 'tailwindcss';

// Cores vêm de variáveis CSS (src/app/globals.css): trocar a identidade (white label) sem refazer componentes.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: 'rgb(var(--fundo) / <alpha-value>)',
        cartao: 'rgb(var(--cartao) / <alpha-value>)',
        principal: 'rgb(var(--principal) / <alpha-value>)',
        'principal-suave': 'rgb(var(--principal-suave) / <alpha-value>)',
        texto: 'rgb(var(--texto) / <alpha-value>)',
        'texto-2': 'rgb(var(--texto-2) / <alpha-value>)',
        borda: 'rgb(var(--borda) / <alpha-value>)',
        suave: 'rgb(var(--suave) / <alpha-value>)',
        sucesso: 'rgb(var(--sucesso) / <alpha-value>)',
        atencao: 'rgb(var(--atencao) / <alpha-value>)',
        erro: 'rgb(var(--erro) / <alpha-value>)',
        whatsapp: 'rgb(var(--whatsapp) / <alpha-value>)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      // Regra da marca: peso máximo 700
      fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '700', extrabold: '700', black: '700' },
      borderRadius: { cartao: '14px' },
      boxShadow: { leve: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05)' },
    },
  },
  plugins: [],
};
export default config;
