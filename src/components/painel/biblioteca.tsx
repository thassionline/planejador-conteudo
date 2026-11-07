'use client';
import { Check, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Modal, avisar } from '@/components/ui';
import { Miniatura } from '@/components/instagram';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { enviarArquivo, formatarTamanho, useUrls, validarArquivo } from '@/lib/midia';
import { mensagemErro } from '@/lib/erros';
import { dataHora } from '@/lib/datas';
import type { Cliente, Midia } from '@/lib/tipos';

type Item = { id: string; path: string; nome: string; tipo: 'imagem' | 'video'; mime: string; tamanho: number; largura: number | null; altura: number | null; criado_em: string };

export function Biblioteca({ aberto, cliente, aoFechar, modoEscolha, aoEscolher }: { aberto: boolean; cliente: Cliente; aoFechar: () => void; modoEscolha?: boolean; aoEscolher?: (m: Midia[]) => void }) {
  const urlDe = useUrls();
  const [itens, setItens] = useState<Item[]>([]);
  const [usos, setUsos] = useState<Record<string, number>>({});
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<'todos' | 'imagem' | 'video'>('todos');
  const [sel, setSel] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  async function carregar() {
    const sb = supabaseNavegador();
    const [b, p] = await Promise.all([
      sb.from('biblioteca').select('*').eq('cliente_id', cliente.id).is('excluido_em', null).order('criado_em', { ascending: false }).limit(1000),
      sb.from('posts').select('midias, capa').eq('cliente_id', cliente.id).is('excluido_em', null),
    ]);
    const u: Record<string, number> = {};
    (p.data || []).forEach((x: { midias: Midia[]; capa: { path?: string } }) => {
      x.midias?.forEach((m) => (u[m.path] = (u[m.path] || 0) + 1));
      if (x.capa?.path) u[x.capa.path] = (u[x.capa.path] || 0) + 1;
    });
    setUsos(u);
    setItens(b.data || []);
  }
  useEffect(() => { if (aberto) { setSel([]); carregar(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, cliente.id]);

  const lista = useMemo(() => itens.filter((i) => (tipo === 'todos' || i.tipo === tipo) && (!busca || i.nome.toLowerCase().includes(busca.toLowerCase()))), [itens, tipo, busca]);

  async function enviar(files: File[]) {
    for (const f of files) {
      const e = validarArquivo(f);
      if (e) { avisar(e, 'erro'); continue; }
      setEnviando((n) => n + 1);
      try { await enviarArquivo(f, f.name, cliente.agencia_id, cliente.id); } catch (er) { avisar(mensagemErro(er), 'erro'); }
      setEnviando((n) => n - 1);
    }
    carregar();
  }
  async function apagar(i: Item) {
    if (usos[i.path]) return avisar('Este arquivo está em uso em um post.', 'erro');
    const sb = supabaseNavegador();
    await sb.storage.from('midias').remove([i.path]);
    const { error } = await sb.from('biblioteca').delete().eq('id', i.id);
    if (error) return avisar(mensagemErro(error), 'erro');
    setItens((x) => x.filter((y) => y.id !== i.id));
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={`Biblioteca · ${cliente.nome}`} largura="max-w-4xl"
      rodape={modoEscolha ? <div className="flex items-center justify-end gap-2"><span className="text-[12.5px] text-texto-2">{sel.length} selecionado(s)</span><button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn-principal" disabled={!sel.length} onClick={() => aoEscolher?.(sel.map((path) => { const i = itens.find((x) => x.path === path)!; return { path, tipo: i.tipo, largura: i.largura ?? undefined, altura: i.altura ?? undefined }; }))}>Adicionar ao post</button></div> : undefined}>
      <input ref={input} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { enviar([...(e.target.files || [])]); e.target.value = ''; }} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-2" /><input className="campo pl-9" placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        {(['todos', 'imagem', 'video'] as const).map((t) => <button key={t} onClick={() => setTipo(t)} className={clsx('pilula border', tipo === t ? 'border-texto bg-texto text-white' : 'border-borda bg-cartao')}>{t === 'todos' ? 'Todos' : t === 'imagem' ? 'Imagens' : 'Vídeos'}</button>)}
        <div className="flex-1" />
        <button className="btn" onClick={() => input.current?.click()}><Upload size={15} />{enviando ? `Enviando ${enviando}…` : 'Enviar arquivos'}</button>
      </div>
      {!lista.length && <p className="py-12 text-center text-texto-2">Nenhum arquivo. Tudo que você envia nos posts fica guardado aqui para reutilizar.</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {lista.map((i) => {
          const marcado = sel.includes(i.path);
          return (
            <div key={i.id} className={clsx('group overflow-hidden rounded-lg border bg-cartao', marcado ? 'border-principal ring-2 ring-principal/30' : 'border-borda')}>
              <button className="relative block aspect-[4/5] w-full bg-suave" onClick={() => modoEscolha && setSel(marcado ? sel.filter((x) => x !== i.path) : [...sel, i.path])}>
                <Miniatura midia={{ path: i.path, tipo: i.tipo }} urlDe={urlDe} />
                {marcado && <span className="absolute right-1.5 top-1.5 rounded-full bg-principal p-0.5 text-white"><Check size={14} /></span>}
                {usos[i.path] ? <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 text-[10.5px] text-white">em {usos[i.path]} post(s)</span> : null}
              </button>
              <div className="p-1.5 text-[11px]">
                <div className="truncate font-medium" title={i.nome}>{i.nome || 'sem nome'}</div>
                <div className="flex items-center justify-between text-texto-2">
                  <span>{formatarTamanho(i.tamanho)} · {(i.mime.split('/')[1] || '').toUpperCase()}{i.largura ? ` · ${i.largura}×${i.altura}` : ''}</span>
                  {!modoEscolha && !usos[i.path] && <button aria-label="Apagar" className="text-erro" onClick={() => apagar(i)}><Trash2 size={13} /></button>}
                </div>
                <div className="text-texto-2">{dataHora(i.criado_em)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
