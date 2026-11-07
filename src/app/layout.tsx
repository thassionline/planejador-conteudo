import type { Metadata, Viewport } from 'next';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './globals.css';
import { Avisos } from '@/components/ui';

export const metadata: Metadata = {
  title: { default: 'Planejador de Conteúdo', template: '%s · Planejador de Conteúdo' },
  description: 'Calendário editorial, prévia do Instagram e aprovação de conteúdo.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Avisos />
      </body>
    </html>
  );
}
