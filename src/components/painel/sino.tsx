'use client';
import { Bell, Check, MessageSquare, PencilLine, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { useAgencia } from '@/lib/agencia';
import { dataHora } from '@/lib/datas';
import { avisar } from '@/components/ui';

type N = { id: string; tipo: string; texto: string; cliente_id: string | null; post_id: string | null; lida_em: string | null; criado_em: string };
const ICONE: Record<string, typeof Bell> = { aprovado: Check, ajustes: PencilLine, comentario: MessageSquare, aprovacao_invalidada: RotateCcw, revisao_concluida: Check };

export function Sino() {
  const { agencia } = useAgencia();
  const [lista, set] = useState<N[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!agencia) return;
    const sb = supabaseNavegador();
    const carregar = () => sb.from('notificacoes').select('*').order('criado_em', { ascending: false }).limit(40).then(({ data }: { data: N[] | null }) => set(data || []));
    carregar();
    const canal = sb.channel(`notif-${agencia.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `agencia_id=eq.${agencia.id}` }, (p: { new: N }) => {
      set((l) => [p.new, ...l].slice(0, 40));
      if (p.new.tipo !== 'aprovacao_invalidada') avisar(p.new.texto, 'info');
    }).subscribe();
    const t = setInterval(carregar, 60000);
    return () => { sb.removeChannel(canal); clearInterval(t); };
  }, [agencia]);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [aberto]);
  const naoLidas = lista.filter((n) => !n.lida_em);
  async function abrir() {
    setAberto(!aberto);
    if (!aberto && naoLidas.length) {
      const ids = naoLidas.map((n) => n.id);
      await supabaseNavegador().from('notificacoes').update({ lida_em: new Date().toISOString() }).in('id', ids);
      setTimeout(() => set((l) => l.map((n) => (ids.includes(n.id) ? { ...n, lida_em: new Date().toISOString() } : n))), 1500);
    }
  }
  return (
    <div className="relative" ref={caixa}>
      <button className="btn-icone relative" onClick={abrir} aria-label={`Notificações${naoLidas.length ? `: ${naoLidas.length} novas` : ''}`}>
        <Bell size={17} />
        {naoLidas.length > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-erro px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white">{naoLidas.length}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-40 max-h-[70dvh] w-[min(380px,92vw)] overflow-y-auto rounded-xl border border-borda bg-cartao shadow-xl">
          <div className="border-b border-borda px-4 py-3 text-[14px] font-semibold">Notificações</div>
          {!lista.length && <p className="px-4 py-8 text-center text-[13px] text-texto-2">Nada por aqui ainda.</p>}
          {lista.map((n) => {
            const I = ICONE[n.tipo] || Bell;
            const conteudo = (
              <div className={clsx('flex gap-3 border-b border-borda px-4 py-3 text-[13px] last:border-0 hover:bg-suave', !n.lida_em && 'bg-principal-suave/60')}>
                <I size={16} className={clsx('mt-0.5 shrink-0', n.tipo === 'ajustes' ? 'text-erro' : n.tipo === 'aprovado' || n.tipo === 'revisao_concluida' ? 'text-sucesso' : 'text-texto-2')} />
                <div><div>{n.texto}</div><div className="mt-0.5 text-[11.5px] text-texto-2">{dataHora(n.criado_em)}</div></div>
              </div>
            );
            return n.cliente_id ? <Link key={n.id} href={`/c/${n.cliente_id}${n.post_id ? `?post=${n.post_id}` : ''}`} onClick={() => setAberto(false)}>{conteudo}</Link> : <div key={n.id}>{conteudo}</div>;
          })}
        </div>
      )}
    </div>
  );
}
