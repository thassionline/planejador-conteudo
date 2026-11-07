'use client';
import { CheckSquare, Copy, Layers, MoreHorizontal, Play, Plus, Send, Square, Trash2, Image as Img, Clapperboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { chaveDia, diaDaSemana, diaLongo, hojeChave, hora, somarDias } from '@/lib/datas';
import { capaDoPost } from '@/lib/feed';
import { APROVACAO, FORMATOS, PUBLICACAO, type Post } from '@/lib/tipos';
import { Miniatura } from '@/components/instagram';

export type Visao = 'mes' | 'semana' | 'lista';
type UrlDe = (p?: string | null) => string | null;

export type AcoesPost = {
  abrir: (p: Post) => void;
  novo: (dia: string) => void;
  mover: (p: Post, dia: string) => void;
  duplicar: (p: Post) => void;
  enviar: (ids: string[]) => void;
  lixeira: (ids: string[]) => void;
};

const ICONE_FORMATO = { imagem: Img, carrossel: Layers, reel: Play, story: Clapperboard };

function statusDe(p: Post) {
  return p.tipo === 'existente' ? APROVACAO.publicado : APROVACAO[p.aprovacao];
}

function MenuRapido({ p, acoes }: { p: Post; acoes: AcoesPost }) {
  const [aberto, set] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && set(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [aberto]);
  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-suave';
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button className="rounded p-0.5 text-texto-2 hover:bg-suave" aria-label="Ações rápidas" onClick={() => set(!aberto)}><MoreHorizontal size={14} /></button>
      {aberto && (
        <div className="absolute right-0 top-6 z-30 w-48 overflow-hidden rounded-lg border border-borda bg-cartao shadow-lg">
          {p.tipo === 'planejado' && ['rascunho', 'ajustes'].includes(p.aprovacao) && <button className={item} onClick={() => { set(false); acoes.enviar([p.id]); }}><Send size={14} />Enviar para aprovação</button>}
          <button className={item} onClick={() => { set(false); acoes.duplicar(p); }}><Copy size={14} />Duplicar</button>
          <button className={clsx(item, 'text-erro')} onClick={() => { set(false); acoes.lixeira([p.id]); }}><Trash2 size={14} />Mover para a lixeira</button>
        </div>
      )}
    </div>
  );
}

function Chip({ p, urlDe, acoes, compacto }: { p: Post; urlDe: UrlDe; acoes: AcoesPost; compacto?: boolean }) {
  const st = statusDe(p);
  const I = ICONE_FORMATO[p.formato];
  const titulo = p.legenda.split('\n')[0].trim() || (p.tipo === 'existente' ? 'Já publicado' : FORMATOS[p.formato]);
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData('text/post', p.id)} onClick={() => acoes.abrir(p)}
      className={clsx('group w-full cursor-pointer rounded-lg border bg-cartao p-0.5 text-left sm:p-1.5 shadow-sm transition hover:border-principal/40', p.tipo === 'existente' ? 'border-dashed border-borda opacity-80' : 'border-borda')}>
      <div className="flex items-start gap-1.5">
        <div className="relative h-11 w-full shrink-0 overflow-hidden rounded bg-suave sm:h-9 sm:w-7">
          <Miniatura midia={capaDoPost(p)} capa={p.capa} urlDe={urlDe} />
          <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-white sm:hidden" style={{ background: st.cor }} />
        </div>
        <div className="hidden min-w-0 flex-1 sm:block">
          {!compacto && <div className="line-clamp-2 text-[11.5px] font-medium leading-tight">{titulo}</div>}
          <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-texto-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: st.cor }} title={st.rotulo} />
            <I size={11} className="shrink-0" />
            <span className="truncate">{hora(p.publicar_em)}</span>
          </div>
        </div>
        <div className="hidden sm:group-hover:block"><MenuRapido p={p} acoes={acoes} /></div>
      </div>
    </div>
  );
}

export function Calendario({ visao, referencia, posts, urlDe, acoes, selecionados, setSelecionados }: {
  visao: Visao; referencia: string; posts: Post[]; urlDe: UrlDe; acoes: AcoesPost; selecionados: Set<string>; setSelecionados: (s: Set<string>) => void;
}) {
  const [alvo, setAlvo] = useState<string | null>(null);
  const hoje = hojeChave();
  const porDia = new Map<string, Post[]>();
  posts.forEach((p) => {
    const k = chaveDia(p.publicar_em);
    porDia.set(k, [...(porDia.get(k) || []), p]);
  });
  porDia.forEach((l) => l.sort((a, b) => a.publicar_em.localeCompare(b.publicar_em)));

  const soltar = (dia: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setAlvo(null);
    const id = e.dataTransfer.getData('text/post');
    const p = posts.find((x) => x.id === id);
    if (p && chaveDia(p.publicar_em) !== dia) acoes.mover(p, dia);
  };

  if (visao === 'lista') {
    const ordenados = [...posts].sort((a, b) => a.publicar_em.localeCompare(b.publicar_em));
    const todos = ordenados.length > 0 && ordenados.every((p) => selecionados.has(p.id));
    return (
      <div>
        <div className="flex items-center gap-2 border-b border-borda px-4 py-2 text-[12.5px] text-texto-2">
          <button className="flex items-center gap-1.5" onClick={() => setSelecionados(todos ? new Set() : new Set(ordenados.map((p) => p.id)))}>
            {todos ? <CheckSquare size={16} className="text-principal" /> : <Square size={16} />} Selecionar todos
          </button>
        </div>
        {!ordenados.length && <p className="px-4 py-12 text-center text-texto-2">Nenhum conteúdo neste período.</p>}
        {ordenados.map((p) => {
          const st = statusDe(p);
          const marcado = selecionados.has(p.id);
          return (
            <div key={p.id} className={clsx('flex items-center gap-3 border-b border-borda px-4 py-2.5 hover:bg-suave/60', marcado && 'bg-principal-suave/50')}>
              <button aria-label="Selecionar" onClick={() => { const s = new Set(selecionados); if (marcado) s.delete(p.id); else s.add(p.id); setSelecionados(s); }}>
                {marcado ? <CheckSquare size={17} className="text-principal" /> : <Square size={17} className="text-texto-2" />}
              </button>
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => acoes.abrir(p)}>
                <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-suave"><Miniatura midia={capaDoPost(p)} capa={p.capa} urlDe={urlDe} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-texto-2">{diaLongo(p.publicar_em)} · {hora(p.publicar_em)} · {FORMATOS[p.formato]}</div>
                  <div className="truncate text-[13.5px] font-medium">{p.legenda.split('\n')[0] || 'Sem legenda'}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: st.cor }} />{st.rotulo}</span>
                    {p.tipo === 'planejado' && p.publicacao !== 'pendente' && <span className="text-texto-2">· {PUBLICACAO[p.publicacao]}</span>}
                    {p.versao_atual > 0 && <span className="text-texto-2">· v{p.versao_atual}</span>}
                  </div>
                </div>
              </button>
              <MenuRapido p={p} acoes={acoes} />
            </div>
          );
        })}
      </div>
    );
  }

  // mês: 6 semanas a partir do domingo anterior ao dia 1; semana: 7 dias a partir do domingo
  const inicio = visao === 'mes' ? somarDias(referencia, -diaDaSemana(referencia)) : somarDias(referencia, -diaDaSemana(referencia));
  const total = visao === 'mes' ? (diaDaSemana(referencia) + new Date(Number(referencia.slice(0, 4)), Number(referencia.slice(5, 7)), 0).getDate() > 35 ? 42 : 35) : 7;
  const mesRef = referencia.slice(0, 7);
  const dias = Array.from({ length: total }, (_, i) => somarDias(inicio, i));
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-borda">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="py-2 text-center text-[11px] font-medium text-texto-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia, i) => {
          const lista = porDia.get(dia) || [];
          const fora = visao === 'mes' && dia.slice(0, 7) !== mesRef;
          const max = visao === 'semana' ? 20 : 3;
          return (
            <div key={dia} onDragOver={(e) => { e.preventDefault(); setAlvo(dia); }} onDragLeave={() => setAlvo((a) => (a === dia ? null : a))} onDrop={soltar(dia)}
              onClick={(e) => e.target === e.currentTarget && acoes.novo(dia)}
              className={clsx('group/dia relative flex min-w-0 cursor-pointer flex-col gap-1 border-b border-r border-borda p-1 sm:p-1.5', (i + 1) % 7 === 0 && 'border-r-0',
                visao === 'semana' ? 'min-h-[360px]' : 'min-h-[92px] sm:min-h-[122px]', fora && 'bg-suave/50', alvo === dia && 'bg-principal-suave')}>
              <div className="pointer-events-none flex items-center justify-between">
                <span className={clsx('text-[11.5px] font-medium', dia === hoje ? 'rounded-full bg-principal px-1.5 text-white' : fora ? 'text-texto-2/50' : 'text-texto-2')}>{Number(dia.slice(8))}</span>
              </div>
              <button className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded text-texto-2 hover:bg-suave group-hover/dia:flex" aria-label="Novo conteúdo neste dia" onClick={() => acoes.novo(dia)}><Plus size={14} /></button>
              {lista.slice(0, max).map((p) => <Chip key={p.id} p={p} urlDe={urlDe} acoes={acoes} compacto={visao === 'mes' && lista.length > 2} />)}
              {lista.length > max && <button className="text-left text-[11px] text-texto-2 hover:underline" onClick={() => acoes.abrir(lista[max])}>+{lista.length - max} mais</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
