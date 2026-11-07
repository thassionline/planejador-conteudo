'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import clsx from 'clsx';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { useUrls } from '@/lib/midia';
import { dataHora, diaCurto, hora } from '@/lib/datas';
import type { Cliente } from '@/lib/tipos';
import { Carregando } from '@/components/ui';
import { PerfilCliente } from '@/components/painel/perfil-cliente';
import { useRouter } from 'next/navigation';

type Resumo = { planejados: number; aguardando: number; ajustes: number; aprovados: number; proxima: string | null; atividade: string | null };
type Filtro = 'todos' | 'aguardando' | 'ajustes' | 'sem';

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [resumo, setResumo] = useState<Record<string, Resumo>>({});
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [novo, setNovo] = useState(false);
  const urlDe = useUrls();
  const router = useRouter();

  const carregar = useCallback(async () => {
    const sb = supabaseNavegador();
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    const [c, p, a] = await Promise.all([
      sb.from('clientes').select('*').is('excluido_em', null).order('nome'),
      sb.from('posts').select('cliente_id, aprovacao, publicar_em').eq('tipo', 'planejado').is('excluido_em', null).neq('publicacao', 'cancelado').gte('publicar_em', desde),
      sb.from('auditoria').select('cliente_id, criado_em').eq('ator_tipo', 'cliente').order('criado_em', { ascending: false }).limit(500),
    ]);
    const r: Record<string, Resumo> = {};
    const agora = Date.now();
    (c.data || []).forEach((x: Cliente) => (r[x.id] = { planejados: 0, aguardando: 0, ajustes: 0, aprovados: 0, proxima: null, atividade: null }));
    (p.data || []).forEach((x: { cliente_id: string; aprovacao: string; publicar_em: string }) => {
      const o = r[x.cliente_id]; if (!o) return;
      o.planejados++;
      if (x.aprovacao === 'aguardando') o.aguardando++;
      if (x.aprovacao === 'ajustes') o.ajustes++;
      if (x.aprovacao === 'aprovado') o.aprovados++;
      if (new Date(x.publicar_em).getTime() > agora && (!o.proxima || x.publicar_em < o.proxima)) o.proxima = x.publicar_em;
    });
    (a.data || []).forEach((x: { cliente_id: string; criado_em: string }) => { const o = r[x.cliente_id]; if (o && !o.atividade) o.atividade = x.criado_em; });
    setResumo(r);
    setClientes(c.data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => (clientes || []).filter((c) => {
    const q = busca.trim().toLowerCase();
    if (q && !`${c.nome} ${c.usuario_ig}`.toLowerCase().includes(q)) return false;
    const r = resumo[c.id];
    if (filtro === 'aguardando') return r?.aguardando > 0;
    if (filtro === 'ajustes') return r?.ajustes > 0;
    if (filtro === 'sem') return !r?.planejados;
    return true;
  }), [clientes, resumo, busca, filtro]);

  if (!clientes) return <Carregando />;
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold">Clientes</h1>
        <div className="flex-1" />
        <button className="btn-principal" onClick={() => setNovo(true)}><Plus size={16} />Novo cliente</button>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-2" />
          <input className="campo pl-9" placeholder="Buscar por nome ou @" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {([['todos', 'Todos'], ['aguardando', 'Aguardando cliente'], ['ajustes', 'Com ajustes'], ['sem', 'Sem planejamento']] as [Filtro, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)} className={clsx('pilula border', filtro === k ? 'border-texto bg-texto text-white' : 'border-borda bg-cartao')}>{l}</button>
        ))}
      </div>
      {!clientes.length ? (
        <div className="cartao p-10 text-center">
          <p className="text-[15px] font-semibold">Cadastre seu primeiro cliente</p>
          <p className="mt-1 text-texto-2">Depois é só abrir o calendário e começar a planejar.</p>
          <button className="btn-principal mt-4" onClick={() => setNovo(true)}><Plus size={16} />Novo cliente</button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {lista.map((c) => {
            const r = resumo[c.id];
            const av = urlDe(c.avatar_path);
            return (
              <Link key={c.id} href={`/c/${c.id}`} className="cartao block p-4 transition hover:border-principal/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-suave font-semibold text-texto-2">{av ? <img src={av} alt="" className="h-full w-full object-cover" /> : c.nome[0]}</div>
                  <div className="min-w-0"><div className="truncate font-semibold">{c.nome}</div><div className="truncate text-[12.5px] text-texto-2">{c.usuario_ig ? `@${c.usuario_ig}` : 'sem @'}</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="pilula">{r?.planejados || 0} planejados</span>
                  {r?.aguardando > 0 && <span className="pilula bg-amber-50 text-amber-800">{r.aguardando} aguardando</span>}
                  {r?.ajustes > 0 && <span className="pilula bg-red-50 text-erro">{r.ajustes} com ajuste</span>}
                  {r?.aprovados > 0 && <span className="pilula bg-emerald-50 text-sucesso">{r.aprovados} aprovados</span>}
                </div>
                <div className="mt-3 space-y-0.5 text-[12px] text-texto-2">
                  <div>Próxima publicação: {r?.proxima ? `${diaCurto(r.proxima)} às ${hora(r.proxima)}` : 'nenhuma'}</div>
                  <div>Última ação do cliente: {r?.atividade ? dataHora(r.atividade) : 'nenhuma ainda'}</div>
                </div>
              </Link>
            );
          })}
          {!lista.length && <p className="col-span-full py-10 text-center text-texto-2">Nenhum cliente neste filtro.</p>}
        </div>
      )}
      <PerfilCliente aberto={novo} cliente={null} aoFechar={() => setNovo(false)} aoSalvar={(c) => { setNovo(false); router.push(`/c/${c.id}`); }} />
    </main>
  );
}
