import { Suspense } from 'react';
import { Planejador } from '@/components/painel/planejador';

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><Planejador clienteId={id} /></Suspense>;
}
