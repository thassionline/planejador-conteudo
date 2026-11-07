'use client';
import { ChevronLeft, ChevronRight, Grid3x3, Layers, Link2, Pin, Play } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { capaDoPost, proporcao } from '@/lib/feed';
import type { Capa, Midia, PostVisual } from '@/lib/tipos';

export type PerfilVisual = {
  nome: string;
  usuario: string;
  categoria?: string;
  bio: string;
  link?: string;
  avatarUrl?: string | null;
  posts: number;
  seguidores: string;
  seguindo: string;
  destaques: { titulo: string; url?: string | null }[];
};

type UrlDe = (path?: string | null) => string | null;

export function Perfil({ p, contadoresManuais = true }: { p: PerfilVisual; contadoresManuais?: boolean }) {
  const ini = (p.nome || p.usuario || '?').trim()[0]?.toUpperCase();
  return (
    <div className="px-4 pt-4">
      <div className="mb-3 text-[16px] font-bold">{p.usuario || 'perfil'}</div>
      <div className="flex items-center gap-5">
        <div className="h-[78px] w-[78px] shrink-0 rounded-full bg-gradient-to-tr from-amber-300 via-rose-400 to-fuchsia-500 p-[2.5px]">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-suave text-[26px] font-bold text-texto-2">
            {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : ini}
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 text-center" title={contadoresManuais ? 'Números informados manualmente' : undefined}>
          {[[p.posts, 'posts'], [p.seguidores || '0', 'seguidores'], [p.seguindo || '0', 'seguindo']].map(([n, l]) => (
            <div key={String(l)}><div className="text-[16px] font-semibold">{n}</div><div className="text-[12.5px] text-texto-2">{l}</div></div>
          ))}
        </div>
      </div>
      <div className="mt-3 text-[13.5px] leading-[1.35]">
        {p.nome && <div className="font-semibold">{p.nome}</div>}
        {p.categoria && <div className="text-texto-2">{p.categoria}</div>}
        {p.bio && <div className="whitespace-pre-line">{p.bio}</div>}
        {p.link && (
          <div className="mt-0.5 flex items-center gap-1 font-semibold text-[#00376b]"><Link2 size={14} />{p.link.replace(/^https?:\/\//, '')}</div>
        )}
      </div>
      {p.destaques.length > 0 && (
        <div className="sem-barra -mx-4 mt-3 flex gap-4 overflow-x-auto px-4 pb-1">
          {p.destaques.map((d, i) => (
            <div key={i} className="flex w-[66px] shrink-0 flex-col items-center gap-1">
              <div className="h-[64px] w-[64px] rounded-full border border-borda p-[3px]">
                <div className="h-full w-full overflow-hidden rounded-full bg-suave">{d.url && <img src={d.url} alt="" className="h-full w-full object-cover" />}</div>
              </div>
              <span className="w-full truncate text-center text-[11.5px]">{d.titulo}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-center border-t border-borda"><span className="-mt-px border-t-2 border-texto px-6 py-2.5"><Grid3x3 size={20} /></span></div>
    </div>
  );
}

export function Miniatura({ midia, capa, urlDe, className }: { midia: { path: string; tipo: 'imagem' | 'video' } | null; capa?: Capa; urlDe: UrlDe; className?: string }) {
  const url = midia ? urlDe(midia.path) : null;
  const foco = capa?.foco ? `${capa.foco.x}% ${capa.foco.y}%` : '50% 50%';
  const estilo = { objectPosition: foco, transform: capa?.zoom && capa.zoom > 1 ? `scale(${capa.zoom})` : undefined, transformOrigin: foco };
  if (!midia) return <div className={clsx('flex h-full w-full items-center justify-center bg-suave text-[11px] text-texto-2', className)}>sem mídia</div>;
  if (!url) return <div className={clsx('h-full w-full animate-pulse bg-suave', className)} />;
  if (midia.tipo === 'video') return <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className={clsx('h-full w-full object-cover', className)} style={estilo} />;
  return <img src={url} alt="" loading="lazy" draggable={false} className={clsx('h-full w-full object-cover', className)} style={estilo} />;
}

export function Grade<T extends PostVisual>({ posts, urlDe, proporcaoGrade = '3:4', aoAbrir, sobreposicao, numerar, vazio }: {
  posts: T[]; urlDe: UrlDe; proporcaoGrade?: string; aoAbrir?: (p: T) => void; sobreposicao?: (p: T, i: number) => ReactNode; numerar?: boolean; vazio?: ReactNode;
}) {
  const r = proporcao(proporcaoGrade);
  if (!posts.length) return <div className="px-6 py-14 text-center text-[13px] text-texto-2">{vazio || 'Nenhuma publicação neste filtro.'}</div>;
  const resto = (3 - (posts.length % 3)) % 3;
  return (
    <div className="grid grid-cols-3 gap-[2px]">
      {posts.map((p, i) => {
        const capa = capaDoPost(p);
        return (
          <button key={p.id} type="button" onClick={() => aoAbrir?.(p)} className="group relative overflow-hidden bg-suave text-left" style={{ aspectRatio: `1 / ${r}` }} aria-label={`Abrir publicação ${i + 1}`}>
            <Miniatura midia={capa} capa={p.capa} urlDe={urlDe} />
            <span className="absolute right-1.5 top-1.5 flex gap-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">
              {p.fixado && <Pin size={15} fill="white" />}
              {p.formato === 'reel' ? <Play size={17} fill="white" /> : p.midias.length > 1 ? <Layers size={17} /> : null}
            </span>
            {numerar && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 text-[11px] font-semibold text-white">{i + 1}</span>}
            {sobreposicao?.(p, i)}
            <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </button>
        );
      })}
      {Array.from({ length: resto }).map((_, i) => <div key={`v${i}`} style={{ aspectRatio: `1 / ${r}` }} className="bg-white" />)}
    </div>
  );
}

/** mídias do post em tamanho de leitura, com carrossel e vídeo */
export function Visualizador({ midias, urlDe, formato, aoMudar, indiceInicial = 0 }: { midias: Midia[]; urlDe: UrlDe; formato: string; aoMudar?: (i: number) => void; indiceInicial?: number }) {
  const [i, setI] = useState(indiceInicial);
  const trilho = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setI(indiceInicial);
    trilho.current?.scrollTo({ left: (trilho.current?.clientWidth || 0) * indiceInicial });
  }, [midias, indiceInicial]);
  const ir = (n: number) => {
    const k = Math.max(0, Math.min(midias.length - 1, n));
    trilho.current?.scrollTo({ left: (trilho.current?.clientWidth || 0) * k, behavior: 'smooth' });
  };
  const alto = formato === 'reel' || formato === 'story';
  if (!midias.length) return <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-texto-2">Sem mídia</div>;
  return (
    <div className="relative bg-black">
      <div ref={trilho} className="sem-barra flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (n !== i) { setI(n); aoMudar?.(n); }
        }}>
        {midias.map((m, k) => {
          const url = urlDe(m.path);
          return (
            <div key={m.path + k} className={clsx('flex w-full shrink-0 snap-center items-center justify-center', alto ? 'aspect-[9/16] max-h-[52dvh] sm:max-h-[64dvh]' : 'aspect-[4/5] max-h-[52dvh] sm:max-h-[64dvh]')}>
              {!url ? <div className="h-full w-full animate-pulse bg-slate-800" />
                : m.tipo === 'video' ? <video src={url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
                : <img src={url} alt={`Mídia ${k + 1}`} className="h-full w-full object-contain" />}
            </div>
          );
        })}
      </div>
      {midias.length > 1 && (
        <>
          {i > 0 && <button className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" onClick={() => ir(i - 1)} aria-label="Anterior"><ChevronLeft size={18} /></button>}
          {i < midias.length - 1 && <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" onClick={() => ir(i + 1)} aria-label="Próxima"><ChevronRight size={18} /></button>}
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[12px] text-white">{i + 1}/{midias.length}</span>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {midias.map((_, k) => <span key={k} className={clsx('h-1.5 w-1.5 rounded-full', k === i ? 'bg-principal' : 'bg-white/60')} />)}
          </div>
        </>
      )}
    </div>
  );
}

export function AvisoPrevia() {
  return <p className="px-4 py-3 text-center text-[11.5px] text-texto-2">Prévia ilustrativa do perfil. A aparência final pode variar conforme o aparelho e as atualizações do Instagram.</p>;
}
