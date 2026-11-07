import type { Metadata } from 'next';
import { Portal } from '@/components/portal/portal';

export const metadata: Metadata = { title: 'Revisão de conteúdo', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function PaginaRevisao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Portal token={token} />;
}
