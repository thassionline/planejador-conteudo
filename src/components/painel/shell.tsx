'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LogOut, Users } from 'lucide-react';
import { ProvedorAgencia, useAgencia } from '@/lib/agencia';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { mensagemErro } from '@/lib/erros';
import { Carregando } from '@/components/ui';
import { Sino } from './sino';

function CriarAgencia() {
  const { recarregar, eu } = useAgencia();
  const [nome, setNome] = useState('Descomplica Digital');
  const [meuNome, setMeuNome] = useState('');
  const [erro, setErro] = useState('');
  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabaseNavegador().rpc('criar_agencia', { p_nome: nome, p_nome_usuario: meuNome });
    if (error) return setErro(mensagemErro(error));
    await recarregar();
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={criar} className="cartao w-full max-w-sm p-6">
        <h1 className="text-[20px] font-semibold">Bem-vinda!</h1>
        <p className="mb-4 mt-1 text-[13.5px] text-texto-2">Conta {eu?.email}. Crie o espaço da sua agência para começar. Se você foi convidada por uma agência, peça para ela reenviar o convite.</p>
        <label className="rotulo">Nome da agência</label>
        <input className="campo mb-3" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <label className="rotulo">Seu nome</label>
        <input className="campo mb-3" value={meuNome} onChange={(e) => setMeuNome(e.target.value)} placeholder="Como aparece para a equipe" />
        {erro && <p className="mb-3 text-[13px] text-erro">{erro}</p>}
        <button className="btn-principal w-full py-2.5">Criar agência</button>
      </form>
    </main>
  );
}

function Interno({ children }: { children: ReactNode }) {
  const { agencia, carregando } = useAgencia();
  const caminho = usePathname();
  const router = useRouter();
  if (carregando) return <Carregando />;
  if (!agencia) return <CriarAgencia />;
  const naPlanilha = caminho.startsWith('/c/');
  return (
    <div className="min-h-dvh">
      {!naPlanilha && (
        <header className="sticky top-0 z-30 border-b border-borda bg-cartao/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="leading-tight">
              <div className="text-[11px] font-bold uppercase tracking-wide text-principal">{agencia.nome}</div>
              <div className="text-[15px] font-semibold">Planejador de Conteúdo</div>
            </Link>
            <div className="flex-1" />
            <Link href="/equipe" className="btn hidden sm:inline-flex"><Users size={16} />Equipe e ajustes</Link>
            <Link href="/equipe" className="btn-icone sm:hidden" aria-label="Equipe"><Users size={17} /></Link>
            <Sino />
            <button className="btn-icone" aria-label="Sair" title="Sair" onClick={async () => { await supabaseNavegador().auth.signOut(); router.replace('/entrar'); }}><LogOut size={17} /></button>
          </div>
        </header>
      )}
      {children}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return <ProvedorAgencia><Interno>{children}</Interno></ProvedorAgencia>;
}
