'use client';
import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';

export function Modal({ aberto, aoFechar, titulo, children, largura = 'max-w-lg', semPadding, rodape }: {
  aberto: boolean; aoFechar: () => void; titulo?: ReactNode; children: ReactNode; largura?: string; semPadding?: boolean; rodape?: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', f);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', f);
      document.body.style.overflow = o;
    };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div role="dialog" aria-modal className={clsx('flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-cartao shadow-xl sm:rounded-2xl', largura)}>
        {titulo !== undefined && (
          <div className="flex items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
            <div className="text-[16px] font-semibold">{titulo}</div>
            <button className="btn-icone border-0" onClick={aoFechar} aria-label="Fechar"><X size={18} /></button>
          </div>
        )}
        <div className={clsx('min-h-0 flex-1 overflow-y-auto', !semPadding && 'p-5')}>{children}</div>
        {rodape && <div className="border-t border-borda px-5 py-3">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------- Avisos ----------
type Aviso = { id: number; texto: string; tipo: 'ok' | 'erro' | 'info'; acao?: { rotulo: string; fazer: () => void } };
let avisos: Aviso[] = [];
let ouvir: ((a: Aviso[]) => void) | null = null;
let seq = 0;
export function avisar(texto: string, tipo: Aviso['tipo'] = 'ok', acao?: Aviso['acao']) {
  const a = { id: ++seq, texto, tipo, acao };
  avisos = [...avisos.slice(-2), a];
  ouvir?.(avisos);
  setTimeout(() => {
    avisos = avisos.filter((x) => x.id !== a.id);
    ouvir?.(avisos);
  }, acao ? 8000 : tipo === 'erro' ? 6000 : 3200);
}
export function Avisos() {
  const [lista, set] = useState<Aviso[]>([]);
  useEffect(() => {
    ouvir = set;
    return () => {
      ouvir = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={clsx('pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-[13.5px] shadow-lg', a.tipo === 'erro' ? 'bg-erro text-white' : 'bg-slate-900 text-white')}>
          <span>{a.texto}</span>
          {a.acao && <button className="font-semibold underline" onClick={a.acao.fazer}>{a.acao.rotulo}</button>}
        </div>
      ))}
    </div>
  );
}

export function Confirmar({ aberto, titulo, texto, rotulo = 'Confirmar', perigo, aoConfirmar, aoFechar }: {
  aberto: boolean; titulo: string; texto: ReactNode; rotulo?: string; perigo?: boolean; aoConfirmar: () => void; aoFechar: () => void;
}) {
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura="max-w-md"
      rodape={<div className="flex justify-end gap-2"><button className="btn" onClick={aoFechar}>Cancelar</button><button className={perigo ? 'btn-perigo' : 'btn-principal'} onClick={() => { aoConfirmar(); aoFechar(); }}>{rotulo}</button></div>}>
      <div className="text-[14px] text-texto-2">{texto}</div>
    </Modal>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-texto-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-principal border-t-transparent" />{texto}</div>;
}
