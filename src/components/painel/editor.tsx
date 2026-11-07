'use client';
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, Copy, FolderOpen, History, ImagePlus, MessageSquare, RotateCcw, Send, Star, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Confirmar, Modal, avisar } from '@/components/ui';
import { Miniatura } from '@/components/instagram';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { capturarQuadro, enviarArquivo, useUrls, validarArquivo } from '@/lib/midia';
import { mensagemErro } from '@/lib/erros';
import { chaveDia, dataHora, hora, montarInstante } from '@/lib/datas';
import { capaDoPost, contarCaracteres, contarHashtags, proporcao } from '@/lib/feed';
import { APROVACAO, FORMATOS, LIMITES, PUBLICACAO, type Capa, type Cliente, type Comentario, type Formato, type Midia, type Post, type Publicacao } from '@/lib/tipos';
import { useAgencia } from '@/lib/agencia';
import { Biblioteca } from './biblioteca';

type Rascunho = {
  tipo: 'planejado' | 'existente'; formato: Formato; dia: string; horario: string; legenda: string; midias: Midia[]; capa: Capa;
  notas_internas: string; fixado: boolean; ordem_manual: number; publicacao: Publicacao;
};
type Envio = { nome: string; progresso: number; erro?: string; arquivo: File };
type Versao = { versao: number; conteudo: { legenda: string; midias: Midia[]; capa: Capa; formato: Formato; publicar_em: string }; criado_em: string };
type Dec = { versao: number; acao: string; revisor_nome: string; comentario: string; criado_em: string };

function deTela(p: Post | null, dia: string, tipo: 'planejado' | 'existente'): Rascunho {
  if (!p) return { tipo, formato: 'imagem', dia, horario: tipo === 'existente' ? '12:00' : '18:00', legenda: '', midias: [], capa: {}, notas_internas: '', fixado: false, ordem_manual: 0, publicacao: tipo === 'existente' ? 'publicado' : 'pendente' };
  return { tipo: p.tipo, formato: p.formato, dia: chaveDia(p.publicar_em), horario: hora(p.publicar_em), legenda: p.legenda, midias: p.midias || [], capa: p.capa || {}, notas_internas: p.notas_internas, fixado: p.fixado, ordem_manual: p.ordem_manual, publicacao: p.publicacao };
}
const conteudoDe = (r: Rascunho) => JSON.stringify([r.formato, r.legenda, r.midias, r.capa]);

export function Editor({ aberto, post, diaInicial, tipoInicial = 'planejado', cliente, aoFechar, aoSalvo }: {
  aberto: boolean; post: Post | null; diaInicial: string; tipoInicial?: 'planejado' | 'existente'; cliente: Cliente; aoFechar: () => void; aoSalvo: (p: Post | null) => void;
}) {
  const { agencia, eu } = useAgencia();
  const urlDe = useUrls();
  const [r, setR] = useState<Rascunho>(() => deTela(post, diaInicial, tipoInicial));
  const [original, setOriginal] = useState('');
  const [aba, setAba] = useState<'conteudo' | 'comentarios' | 'versoes'>('conteudo');
  const [sel, setSel] = useState(0);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [mais, setMais] = useState(false);
  const [biblioteca, setBiblioteca] = useState(false);
  const [confirmar, setConfirmar] = useState<null | { titulo: string; texto: string; rotulo: string; perigo?: boolean; fazer: () => void }>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [decisoes, setDecisoes] = useState<Dec[]>([]);
  const [modelos, setModelos] = useState<{ id: string; titulo: string; texto: string }[]>([]);
  const [resposta, setResposta] = useState('');
  const [interno, setInterno] = useState(false);
  const [aprovManual, setAprovManual] = useState(false);
  const [nomeManual, setNomeManual] = useState('');
  const [duplicarPara, setDuplicarPara] = useState('');
  const [comparar, setComparar] = useState<number | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const capaRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chaveLocal = `rascunho:${post?.id || `novo-${cliente.id}`}`;

  // ---------- abrir ----------
  useEffect(() => {
    if (!aberto) return;
    const inicial = deTela(post, diaInicial, tipoInicial);
    setOriginal(JSON.stringify(inicial));
    setAba('conteudo'); setSel(0); setEnvios([]); setMais(false); setComparar(null); setResposta('');
    let salvo: { r: Rascunho; em: string } | null = null;
    try { salvo = JSON.parse(localStorage.getItem(chaveLocal) || 'null'); } catch { salvo = null; }
    if (salvo && (!post || salvo.em > post.atualizado_em) && JSON.stringify(salvo.r) !== JSON.stringify(inicial)) {
      setR(inicial);
      avisar('Há alterações não salvas deste conteúdo.', 'info', { rotulo: 'Restaurar', fazer: () => setR(salvo!.r) });
    } else setR(inicial);
    const sb = supabaseNavegador();
    sb.from('modelos_legenda').select('id, titulo, texto').order('titulo').then(({ data }: { data: typeof modelos | null }) => setModelos(data || []));
    if (post) carregarHistorico(post.id);
    else { setComentarios([]); setVersoes([]); setDecisoes([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, post?.id]);

  const carregarHistorico = useCallback(async (id: string) => {
    const sb = supabaseNavegador();
    const [c, v, d] = await Promise.all([
      sb.from('comentarios').select('*').eq('post_id', id).order('criado_em'),
      sb.from('post_versoes').select('versao, conteudo, criado_em').eq('post_id', id).order('versao', { ascending: false }),
      sb.from('decisoes').select('versao, acao, revisor_nome, comentario, criado_em').eq('post_id', id).order('criado_em', { ascending: false }),
    ]);
    setComentarios(c.data || []); setVersoes(v.data || []); setDecisoes(d.data || []);
  }, []);

  const sujo = aberto && original !== '' && JSON.stringify(r) !== original;
  // autosave local e proteção contra fechar a aba
  useEffect(() => {
    if (!sujo) { try { localStorage.removeItem(chaveLocal); } catch {} return; }
    const t = setTimeout(() => { try { localStorage.setItem(chaveLocal, JSON.stringify({ r, em: new Date().toISOString() })); } catch {} }, 600);
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', f);
    return () => { clearTimeout(t); window.removeEventListener('beforeunload', f); };
  }, [r, sujo, chaveLocal]);

  const mudar = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));
  const fechar = () => {
    if (sujo || envios.some((e) => e.progresso < 1 && !e.erro)) setConfirmar({ titulo: 'Sair sem salvar?', texto: 'As alterações deste conteúdo ficam guardadas neste aparelho e podem ser restauradas ao abrir de novo.', rotulo: 'Sair', fazer: aoFechar });
    else aoFechar();
  };

  // ---------- mídias ----------
  async function enviarArquivos(lista: File[]) {
    if (!agencia) return;
    const validos: File[] = [];
    for (const f of lista) {
      const e = validarArquivo(f);
      if (e) avisar(e, 'erro'); else validos.push(f);
    }
    if (r.midias.length + validos.length > LIMITES.carrossel) { avisar(`O carrossel aceita até ${LIMITES.carrossel} mídias.`, 'erro'); validos.splice(LIMITES.carrossel - r.midias.length); }
    const novos = validos.map((f) => ({ nome: f.name, progresso: 0, arquivo: f }));
    setEnvios((x) => [...x, ...novos]);
    for (const env of novos) await enviarUm(env);
  }
  async function enviarUm(env: Envio) {
    if (!agencia) return;
    setEnvios((x) => x.map((e) => (e === env || e.arquivo === env.arquivo ? { ...e, erro: undefined, progresso: 0 } : e)));
    try {
      const { midia } = await enviarArquivo(env.arquivo, env.nome, agencia.id, cliente.id, (p) => setEnvios((x) => x.map((e) => (e.arquivo === env.arquivo ? { ...e, progresso: p } : e))));
      setR((x) => {
        const midias = [...x.midias, midia];
        let formato = x.formato;
        if (x.tipo === 'planejado' && formato === 'imagem' && midias.length > 1) formato = 'carrossel';
        if (formato === 'imagem' && midias.length === 1 && midia.tipo === 'video') formato = 'reel';
        return { ...x, midias, formato };
      });
      setEnvios((x) => x.filter((e) => e.arquivo !== env.arquivo));
    } catch (e) {
      setEnvios((x) => x.map((it) => (it.arquivo === env.arquivo ? { ...it, erro: mensagemErro(e) } : it)));
    }
  }
  function mover(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= r.midias.length) return;
    const m = [...r.midias];
    [m[i], m[j]] = [m[j], m[i]];
    let indice = r.capa.indice ?? 0;
    if (indice === i) indice = j; else if (indice === j) indice = i;
    setR((x) => ({ ...x, midias: m, capa: { ...x.capa, indice } }));
    setSel(j);
  }
  function remover(i: number) {
    const m = r.midias.filter((_, k) => k !== i);
    let indice = r.capa.indice ?? 0;
    if (indice >= m.length) indice = 0; else if (i < indice) indice--;
    setR((x) => ({ ...x, midias: m, capa: { ...x.capa, indice }, formato: x.formato === 'carrossel' && m.length <= 1 ? 'imagem' : x.formato }));
    setSel(Math.max(0, Math.min(sel, m.length - 1)));
  }
  async function capaDoQuadro() {
    if (!videoRef.current || !agencia) return;
    try {
      const blob = await capturarQuadro(videoRef.current);
      const { midia } = await enviarArquivo(blob, 'capa-reel.jpg', agencia.id, cliente.id);
      mudar('capa', { ...r.capa, path: midia.path, foco: { x: 50, y: 50 } });
      avisar('Capa definida a partir do vídeo');
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
  }
  async function enviarCapa(f?: File) {
    if (!f || !agencia) return;
    const e = validarArquivo(f);
    if (e || !f.type.startsWith('image')) return avisar(e || 'A capa precisa ser uma imagem.', 'erro');
    try {
      const { midia } = await enviarArquivo(f, f.name, agencia.id, cliente.id);
      mudar('capa', { ...r.capa, path: midia.path, foco: { x: 50, y: 50 } });
    } catch (er) { avisar(mensagemErro(er), 'erro'); }
  }

  // ---------- salvar ----------
  const estado = post?.tipo === 'existente' ? 'publicado' : post?.aprovacao || 'rascunho';
  const invalida = !!post && post.tipo === 'planejado' && ['aguardando', 'aprovado'].includes(post.aprovacao) && conteudoDe(r) !== conteudoDe(JSON.parse(original || 'null') || r);

  async function gravar(): Promise<Post | null> {
    if (!agencia) return null;
    if (!r.dia) { avisar('Escolha a data.', 'erro'); return null; }
    if (contarCaracteres(r.legenda) > LIMITES.legenda) { avisar(`A legenda passou de ${LIMITES.legenda} caracteres.`, 'erro'); return null; }
    if (envios.some((e) => !e.erro)) { avisar('Aguarde o envio das mídias terminar.', 'erro'); return null; }
    const dados = {
      formato: r.formato, publicar_em: montarInstante(r.dia, r.horario), legenda: r.legenda, midias: r.midias, capa: r.capa,
      notas_internas: r.notas_internas, fixado: r.formato === 'story' ? false : r.fixado, ordem_manual: r.ordem_manual,
      ...(post && r.publicacao !== post.publicacao ? { publicacao: r.publicacao } : {}),
    };
    const sb = supabaseNavegador();
    setSalvando(true);
    try {
      if (!post) {
        const { data, error } = await sb.from('posts').insert({ ...dados, tipo: r.tipo, cliente_id: cliente.id, agencia_id: agencia.id, criado_por: eu?.id }).select().single();
        if (error) throw error;
        return data as Post;
      }
      // controle otimista: só grava se ninguém mudou desde que abrimos
      const { data, error } = await sb.from('posts').update(dados).eq('id', post.id).eq('revisao', post.revisao).select();
      if (error) throw error;
      if (!data?.length) throw new Error('conflito');
      return data[0] as Post;
    } finally {
      setSalvando(false);
    }
  }
  async function salvar(depois?: 'enviar') {
    const executar = async () => {
      try {
        let salvo = await gravar();
        if (!salvo) return;
        if (depois === 'enviar') {
          const { error } = await supabaseNavegador().rpc('enviar_para_aprovacao', { p_posts: [salvo.id] });
          if (error) throw error;
          const { data } = await supabaseNavegador().from('posts').select().eq('id', salvo.id).single();
          salvo = (data as Post) || salvo;
          avisar(`Enviado para aprovação (versão ${salvo.versao_atual}).`);
        } else avisar(invalida ? 'Salvo. O post voltou para rascunho: reenvie para aprovação.' : 'Salvo');
        try { localStorage.removeItem(chaveLocal); } catch {}
        setOriginal(JSON.stringify(r));
        aoSalvo(salvo);
      } catch (e) { avisar(mensagemErro(e), 'erro'); }
    };
    if (invalida) setConfirmar({ titulo: 'Alterar conteúdo já enviado?', texto: post?.aprovacao === 'aprovado' ? 'Este post foi aprovado. Mudar mídia, capa ou legenda cancela a aprovação desta versão (o histórico fica guardado) e ele precisa ser aprovado de novo.' : 'O cliente já está com este post para revisar. Ao salvar, ele volta para rascunho até você reenviar.', rotulo: depois ? 'Salvar e reenviar' : 'Salvar mesmo assim', fazer: executar });
    else await executar();
  }
  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabaseNavegador().rpc(nome, args);
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar(ok);
    const { data } = post ? await supabaseNavegador().from('posts').select().eq('id', post.id).single() : { data: null };
    aoSalvo((data as Post) || null);
  }
  async function lixeira() {
    if (!post) return;
    const { error } = await supabaseNavegador().from('posts').update({ excluido_em: new Date().toISOString() }).eq('id', post.id);
    if (error) return avisar(mensagemErro(error), 'erro');
    try { localStorage.removeItem(chaveLocal); } catch {}
    avisar('Movido para a lixeira', 'ok');
    aoSalvo(null);
  }

  // ---------- comentários ----------
  async function responder() {
    if (!post || !resposta.trim()) return;
    const { error } = await supabaseNavegador().from('comentarios').insert({ post_id: post.id, cliente_id: cliente.id, agencia_id: cliente.agencia_id, autor_tipo: 'agencia', texto: resposta.trim(), interno });
    if (error) return avisar(mensagemErro(error), 'erro');
    setResposta('');
    carregarHistorico(post.id);
  }
  async function resolver(c: Comentario) {
    await supabaseNavegador().from('comentarios').update({ resolvido: !c.resolvido }).eq('id', c.id);
    if (post) carregarHistorico(post.id);
  }
  async function salvarModelo() {
    const titulo = r.legenda.split('\n')[0].slice(0, 60) || 'Modelo';
    const { error } = await supabaseNavegador().from('modelos_legenda').insert({ agencia_id: agencia!.id, titulo, texto: r.legenda });
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar('Legenda salva como modelo');
    const { data } = await supabaseNavegador().from('modelos_legenda').select('id, titulo, texto').order('titulo');
    setModelos(data || []);
  }

  const capa = capaDoPost(r);
  const atual = r.midias[sel];
  const pendentes = comentarios.filter((c) => c.autor_tipo === 'cliente' && !c.resolvido).length;
  const caracteres = contarCaracteres(r.legenda), hashtags = contarHashtags(r.legenda);
  const versaoComparada = useMemo(() => versoes.find((v) => v.versao === comparar) || null, [versoes, comparar]);
  if (!aberto) return null;
  const ehExistente = r.tipo === 'existente';
  const st = APROVACAO[estado];

  return (
    <Modal aberto={aberto} aoFechar={fechar} largura="max-w-[1180px]" semPadding
      titulo={<div className="flex flex-wrap items-center gap-2">{post ? (ehExistente ? 'Post já publicado' : 'Editar conteúdo') : ehExistente ? 'Adicionar post já publicado' : 'Novo conteúdo'}
        {post && <span className="pilula" style={{ color: st.cor }}><span className="h-2 w-2 rounded-full" style={{ background: st.cor }} />{st.rotulo}{post.versao_atual > 0 && ` · v${post.versao_atual}`}</span>}
        {post?.data_alterada_apos_aprovacao && <span className="pilula text-atencao">Data alterada depois da aprovação</span>}</div>}
      rodape={
        <div className="flex flex-wrap items-center gap-2">
          {post && <button className="btn-perigo" onClick={() => setConfirmar({ titulo: 'Mover para a lixeira?', texto: 'Dá para recuperar depois pela Lixeira.', rotulo: 'Mover', perigo: true, fazer: lixeira })}><Trash2 size={15} /><span className="hidden sm:inline">Lixeira</span></button>}
          <div className="flex-1" />
          {sujo && <span className="hidden text-[12px] text-texto-2 sm:inline">Alterações não salvas</span>}
          <button className="btn" onClick={fechar}>Cancelar</button>
          {(() => {
            const emAprovacao = !!post && post.tipo === 'planejado' && ['aguardando', 'aprovado'].includes(post.aprovacao);
            if (ehExistente) return <button className="btn-principal" onClick={() => salvar()} disabled={salvando}>Salvar</button>;
            if (emAprovacao && !invalida) return <button className="btn-principal" onClick={() => salvar()} disabled={salvando}>Salvar</button>;
            return (<>
              {!emAprovacao && <button className="btn" onClick={() => salvar()} disabled={salvando}>Salvar rascunho</button>}
              <button className="btn-principal" disabled={salvando} onClick={() => salvar('enviar')}><Send size={15} />{emAprovacao ? 'Salvar e reenviar' : 'Enviar para aprovação'}</button>
            </>);
          })()}
        </div>
      }>
      <input ref={arquivoRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { enviarArquivos([...(e.target.files || [])]); e.target.value = ''; }} />
      <input ref={capaRef} type="file" accept="image/*" className="hidden" onChange={(e) => { enviarCapa(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* mídias */}
        <div className="border-b border-borda bg-[#0f1115] lg:border-b-0 lg:border-r"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) enviarArquivos([...e.dataTransfer.files]); }}>
          <div className="flex min-h-[300px] items-center justify-center p-3 lg:min-h-[520px]">
            {!atual ? (
              <div className="text-center text-[13.5px] text-slate-300">
                <Upload className="mx-auto mb-2" />
                Arraste imagens e vídeos aqui
                <div className="mt-3 flex justify-center gap-2">
                  <button className="btn-principal" onClick={() => arquivoRef.current?.click()}><ImagePlus size={16} />Enviar arquivos</button>
                  <button className="btn" onClick={() => setBiblioteca(true)}><FolderOpen size={16} />Biblioteca</button>
                </div>
                <p className="mt-2 text-[11.5px] text-slate-400">JPG, PNG, WEBP, MP4 ou MOV até {LIMITES.arquivoMb} MB</p>
              </div>
            ) : atual.tipo === 'video' ? (
              <video key={atual.path} ref={videoRef} src={urlDe(atual.path) || undefined} controls playsInline crossOrigin="anonymous" className="max-h-[62dvh] max-w-full" />
            ) : (
              <img src={urlDe(atual.path) || undefined} alt="" className="max-h-[62dvh] max-w-full object-contain" />
            )}
          </div>
          {(r.midias.length > 0 || envios.length > 0) && (
            <div className="sem-barra flex gap-2 overflow-x-auto bg-[#16191f] p-2">
              {r.midias.map((m, i) => (
                <div key={m.path + i} className={clsx('relative h-[84px] w-[64px] shrink-0 cursor-pointer overflow-hidden rounded-md border-2', i === sel ? 'border-white' : 'border-transparent')} onClick={() => setSel(i)}>
                  <Miniatura midia={m} urlDe={urlDe} />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
                  {(r.capa.indice ?? 0) === i && !r.capa.path && r.midias.length > 1 && <Star size={13} className="absolute right-1 top-1 fill-amber-400 text-amber-400" />}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-0.5">
                    <button className="text-white disabled:opacity-30" disabled={i === 0} onClick={(e) => { e.stopPropagation(); mover(i, -1); }} aria-label="Mover para a esquerda"><ArrowLeft size={13} /></button>
                    <button className="text-white" onClick={(e) => { e.stopPropagation(); remover(i); }} aria-label="Remover"><X size={13} /></button>
                    <button className="text-white disabled:opacity-30" disabled={i === r.midias.length - 1} onClick={(e) => { e.stopPropagation(); mover(i, 1); }} aria-label="Mover para a direita"><ArrowRight size={13} /></button>
                  </div>
                </div>
              ))}
              {envios.map((e, i) => (
                <div key={`e${i}`} className="flex h-[84px] w-[64px] shrink-0 flex-col items-center justify-center rounded-md border border-slate-600 p-1 text-center text-[10px] text-slate-300">
                  {e.erro ? (<><span className="text-red-300">Falhou</span><button className="mt-1 underline" onClick={() => enviarUm(e)}>Tentar de novo</button><button className="underline" onClick={() => setEnvios((x) => x.filter((y) => y !== e))}>Descartar</button></>)
                    : (<><span className="truncate w-full">{e.nome}</span><div className="mt-1 h-1 w-full rounded bg-slate-700"><div className="h-1 rounded bg-principal" style={{ width: `${Math.round(e.progresso * 100)}%` }} /></div><span>{Math.round(e.progresso * 100)}%</span></>)}
                </div>
              ))}
              {r.midias.length < LIMITES.carrossel && (
                <div className="flex shrink-0 flex-col gap-1">
                  <button className="flex h-[40px] w-[64px] items-center justify-center rounded-md border border-dashed border-slate-500 text-slate-300" onClick={() => arquivoRef.current?.click()} aria-label="Adicionar mídia"><ImagePlus size={17} /></button>
                  <button className="flex h-[40px] w-[64px] items-center justify-center rounded-md border border-dashed border-slate-500 text-slate-300" onClick={() => setBiblioteca(true)} aria-label="Escolher da biblioteca"><FolderOpen size={17} /></button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* lado direito */}
        <div className="flex min-h-0 flex-col">
          {post && (
            <div className="flex border-b border-borda text-[13px]">
              {([['conteudo', 'Conteúdo'], ['comentarios', `Comentários${comentarios.length ? ` (${comentarios.length})` : ''}`], ['versoes', 'Versões e histórico']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setAba(k)} className={clsx('flex-1 border-b-2 px-2 py-2.5 font-medium', aba === k ? 'border-principal text-principal' : 'border-transparent text-texto-2')}>
                  {l}{k === 'comentarios' && pendentes > 0 && <span className="ml-1 rounded-full bg-erro px-1.5 text-[10.5px] text-white">{pendentes}</span>}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {aba === 'conteudo' && (<>
              {!post && (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-suave p-1 text-[13px]">
                  {(['planejado', 'existente'] as const).map((t) => (
                    <button key={t} onClick={() => setR((x) => ({ ...x, tipo: t, publicacao: t === 'existente' ? 'publicado' : 'pendente' }))} className={clsx('rounded-md py-1.5 font-medium', r.tipo === t ? 'bg-cartao shadow-sm' : 'text-texto-2')}>
                      {t === 'planejado' ? 'Novo conteúdo' : 'Já publicado no perfil'}
                    </button>
                  ))}
                </div>
              )}
              {ehExistente && <p className="rounded-lg bg-suave p-3 text-[12.5px] text-texto-2">Post que já está no Instagram. Aparece na prévia do feed para mostrar a transição e nunca entra na aprovação. Legenda é opcional.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="rotulo">Formato</label>
                  <div className="grid grid-cols-4 gap-1 rounded-lg bg-suave p-1 text-[12.5px]">
                    {(Object.keys(FORMATOS) as Formato[]).filter((f) => !ehExistente || f !== 'story').map((f) => (
                      <button key={f} onClick={() => mudar('formato', f)} className={clsx('rounded-md py-1.5 font-medium', r.formato === f ? 'bg-cartao shadow-sm' : 'text-texto-2')}>{FORMATOS[f]}</button>
                    ))}
                  </div>
                  {r.formato === 'story' && <p className="mt-1 text-[11.5px] text-texto-2">Stories não aparecem na grade do perfil.</p>}
                </div>
                <div><label className="rotulo">Data</label><input type="date" className="campo" value={r.dia} onChange={(e) => mudar('dia', e.target.value)} /></div>
                <div><label className="rotulo">Horário</label><input type="time" className="campo" value={r.horario} onChange={(e) => mudar('horario', e.target.value)} /></div>
              </div>

              {/* capa e enquadramento */}
              {r.formato !== 'story' && r.midias.length > 0 && (
                <div>
                  <label className="rotulo">Capa na grade e enquadramento</label>
                  <div className="flex gap-3">
                    <div className="relative w-[112px] shrink-0 cursor-crosshair overflow-hidden rounded-md bg-suave" style={{ aspectRatio: `1 / ${proporcao(cliente.proporcao_grade)}` }}
                      onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); mudar('capa', { ...r.capa, foco: { x: Math.round(((e.clientX - b.left) / b.width) * 100), y: Math.round(((e.clientY - b.top) / b.height) * 100) } }); }}
                      title="Clique no ponto que deve ficar no centro">
                      <Miniatura midia={capa} capa={r.capa} urlDe={urlDe} />
                      <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${r.capa.foco?.x ?? 50}%`, top: `${r.capa.foco?.y ?? 50}%` }} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2 text-[12.5px]">
                      <p className="text-texto-2">Clique na miniatura para escolher o ponto central. Corte {cliente.proporcao_grade}.</p>
                      <label className="flex items-center gap-2">Zoom<input type="range" min={1} max={2} step={0.05} value={r.capa.zoom || 1} onChange={(e) => mudar('capa', { ...r.capa, zoom: Number(e.target.value) })} className="flex-1" /></label>
                      {r.midias.length > 1 && !r.capa.path && <button className="btn py-1 text-[12px]" onClick={() => mudar('capa', { ...r.capa, indice: sel, foco: { x: 50, y: 50 } })}><Star size={13} />Usar a mídia {sel + 1} como capa</button>}
                      {(r.formato === 'reel' || atual?.tipo === 'video') && (
                        <div className="flex flex-wrap gap-1.5">
                          {atual?.tipo === 'video' && <button className="btn py-1 text-[12px]" onClick={capaDoQuadro}><Camera size={13} />Usar quadro atual</button>}
                          <button className="btn py-1 text-[12px]" onClick={() => capaRef.current?.click()}><ImagePlus size={13} />Enviar capa</button>
                        </div>
                      )}
                      {r.capa.path && <button className="text-[12px] text-erro underline" onClick={() => mudar('capa', { indice: r.capa.indice, foco: { x: 50, y: 50 } })}>Remover capa personalizada</button>}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-end justify-between">
                  <label className="rotulo">Legenda</label>
                  <span className={clsx('text-[11.5px]', caracteres > LIMITES.legenda || hashtags > LIMITES.hashtags ? 'font-semibold text-erro' : 'text-texto-2')}>{caracteres}/{LIMITES.legenda} · {hashtags}/{LIMITES.hashtags} hashtags</span>
                </div>
                <textarea className="campo min-h-[190px] leading-relaxed" value={r.legenda} onChange={(e) => mudar('legenda', e.target.value)} placeholder={ehExistente ? 'Opcional' : 'Escreva a legenda, a chamada e as hashtags'} />
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {modelos.length > 0 && (
                    <select className="campo w-auto py-1 text-[12.5px]" value="" onChange={(e) => { const m = modelos.find((x) => x.id === e.target.value); if (m) mudar('legenda', r.legenda ? `${r.legenda}\n\n${m.texto}` : m.texto); }}>
                      <option value="">Inserir modelo…</option>
                      {modelos.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
                    </select>
                  )}
                  {r.legenda.trim() && <button className="text-[12px] text-texto-2 underline" onClick={salvarModelo}>Salvar como modelo</button>}
                </div>
              </div>

              <button className="flex w-full items-center justify-between rounded-lg border border-borda px-3 py-2 text-[13px] font-medium" onClick={() => setMais(!mais)}>
                Mais opções <ChevronDown size={16} className={clsx('transition', mais && 'rotate-180')} />
              </button>
              {mais && (
                <div className="space-y-3 rounded-lg border border-borda p-3">
                  <div><label className="rotulo">Observações internas (o cliente não vê)</label><textarea className="campo min-h-[70px]" value={r.notas_internas} onChange={(e) => mudar('notas_internas', e.target.value)} /></div>
                  {r.formato !== 'story' && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={r.fixado} onChange={(e) => mudar('fixado', e.target.checked)} />Fixado no topo do perfil</label>}
                  <div><label className="rotulo">Desempate na grade (mesma data e hora: maior aparece antes)</label><input type="number" className="campo w-28" value={r.ordem_manual} onChange={(e) => mudar('ordem_manual', Number(e.target.value) || 0)} /></div>
                  {post && !ehExistente && (
                    <div>
                      <label className="rotulo">Publicação</label>
                      <select className="campo" value={r.publicacao} onChange={(e) => mudar('publicacao', e.target.value as Publicacao)}>
                        {(Object.keys(PUBLICACAO) as Publicacao[]).map((k) => <option key={k} value={k} disabled={(k === 'agendado' || k === 'publicado') && post.aprovacao !== 'aprovado'}>{PUBLICACAO[k]}{(k === 'agendado' || k === 'publicado') && post.aprovacao !== 'aprovado' ? ' (precisa estar aprovado)' : ''}</option>)}
                      </select>
                    </div>
                  )}
                  {post && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" className="campo w-auto" value={duplicarPara} onChange={(e) => setDuplicarPara(e.target.value)} />
                      <button className="btn" disabled={!duplicarPara} onClick={() => rpc('duplicar_post', { p_post: post.id, p_quando: montarInstante(duplicarPara, r.horario) }, 'Cópia criada como rascunho')}><Copy size={14} />Duplicar para esta data</button>
                    </div>
                  )}
                  {post && !ehExistente && ['aguardando', 'aprovado', 'ajustes'].includes(post.aprovacao) && post.publicacao === 'pendente' && (
                    <button className="btn" onClick={() => rpc('voltar_para_rascunho', { p_post: post.id }, 'Voltou para rascunho')}><RotateCcw size={14} />Tirar da aprovação (voltar a rascunho)</button>
                  )}
                  {post && !ehExistente && ['aguardando', 'ajustes'].includes(post.aprovacao) && (
                    aprovManual ? (
                      <div className="flex flex-wrap gap-2"><input className="campo flex-1" placeholder="Quem aprovou (ex.: Dra. Ana pelo WhatsApp)" value={nomeManual} onChange={(e) => setNomeManual(e.target.value)} />
                        <button className="btn-sucesso" onClick={() => rpc('registrar_aprovacao_manual', { p_post: post.id, p_nome: nomeManual, p_observacao: '' }, 'Aprovação registrada')}><Check size={14} />Registrar</button></div>
                    ) : <button className="btn" onClick={() => setAprovManual(true)}><Check size={14} />Cliente aprovou por fora: registrar</button>
                  )}
                </div>
              )}
            </>)}

            {aba === 'comentarios' && post && (
              <div className="space-y-3">
                {!comentarios.length && <p className="py-6 text-center text-[13px] text-texto-2">Nenhum comentário ainda.</p>}
                {comentarios.map((c) => (
                  <div key={c.id} className={clsx('rounded-lg p-3 text-[13px]', c.interno ? 'border border-dashed border-borda bg-cartao' : c.autor_tipo === 'cliente' ? 'bg-amber-50' : 'bg-suave', c.resolvido && 'opacity-60')}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px] text-texto-2">
                      <b className="text-texto">{c.autor_nome || (c.autor_tipo === 'cliente' ? 'Cliente' : 'Agência')}</b>
                      {c.interno && <span className="pilula py-0">interno</span>}
                      <span>{dataHora(c.criado_em)}</span>{c.versao ? <span>· v{c.versao}</span> : null}
                      {c.midia_indice !== null && c.midia_indice !== undefined && <button className="pilula py-0" onClick={() => setSel(c.midia_indice!)}>mídia {c.midia_indice + 1}</button>}
                      {c.tempo_video !== null && c.tempo_video !== undefined && <span className="pilula py-0">{Math.floor(c.tempo_video / 60)}:{String(Math.floor(c.tempo_video % 60)).padStart(2, '0')}</span>}
                    </div>
                    {c.trecho_legenda && <div className="mb-1 border-l-2 border-amber-400 pl-2 text-[12px] italic text-texto-2">“{c.trecho_legenda}”</div>}
                    <div className="whitespace-pre-wrap">{c.texto}</div>
                    {c.autor_tipo === 'cliente' && <button className="mt-1.5 text-[12px] font-medium text-principal" onClick={() => resolver(c)}>{c.resolvido ? 'Reabrir' : 'Marcar como resolvido'}</button>}
                  </div>
                ))}
                <div className="rounded-lg border border-borda p-2">
                  <textarea className="w-full resize-none bg-transparent p-1 text-[13px] outline-none" rows={3} placeholder={interno ? 'Nota interna (só a equipe vê)' : 'Resposta para o cliente'} value={resposta} onChange={(e) => setResposta(e.target.value)} />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[12px] text-texto-2"><input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />Nota interna</label>
                    <button className="btn-principal py-1.5" onClick={responder} disabled={!resposta.trim()}><MessageSquare size={14} />Enviar</button>
                  </div>
                </div>
              </div>
            )}

            {aba === 'versoes' && post && (
              <div className="space-y-3 text-[13px]">
                {!versoes.length && <p className="py-6 text-center text-texto-2">Ainda não foi enviado para aprovação.</p>}
                {versoes.map((v) => {
                  const ds = decisoes.filter((d) => d.versao === v.versao);
                  return (
                    <div key={v.versao} className="rounded-lg border border-borda p-3">
                      <div className="flex items-center justify-between">
                        <b>Versão {v.versao}</b><span className="text-[11.5px] text-texto-2">enviada em {dataHora(v.criado_em)}</span>
                      </div>
                      {ds.map((d, i) => (
                        <div key={i} className={clsx('mt-1 text-[12.5px]', d.acao === 'aprovado' ? 'text-sucesso' : 'text-erro')}>
                          {d.acao === 'aprovado' ? 'Aprovada' : 'Ajuste pedido'} por {d.revisor_nome} em {dataHora(d.criado_em)}{d.comentario ? `: “${d.comentario}”` : ''}
                        </div>
                      ))}
                      {!ds.length && <div className="mt-1 text-[12.5px] text-texto-2">Sem decisão</div>}
                      <button className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-principal" onClick={() => setComparar(comparar === v.versao ? null : v.versao)}><History size={13} />{comparar === v.versao ? 'Fechar comparação' : 'Comparar com o atual'}</button>
                    </div>
                  );
                })}
                {versaoComparada && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-principal/30 bg-principal-suave/40 p-3 text-[12px]">
                    <div className="font-semibold">Versão {versaoComparada.versao}</div><div className="font-semibold">Atual (editando)</div>
                    <div className="flex flex-wrap gap-1">{versaoComparada.conteudo.midias.map((m, i) => <div key={i} className="h-12 w-9 overflow-hidden rounded bg-suave"><Miniatura midia={m} urlDe={urlDe} /></div>)}</div>
                    <div className="flex flex-wrap gap-1">{r.midias.map((m, i) => <div key={i} className={clsx('h-12 w-9 overflow-hidden rounded bg-suave', versaoComparada.conteudo.midias[i]?.path !== m.path && 'ring-2 ring-atencao')}><Miniatura midia={m} urlDe={urlDe} /></div>)}</div>
                    <div className="whitespace-pre-wrap break-words">{versaoComparada.conteudo.legenda}</div>
                    <div className={clsx('whitespace-pre-wrap break-words', versaoComparada.conteudo.legenda !== r.legenda && 'rounded bg-amber-100/70 p-1')}>{r.legenda}</div>
                    {versaoComparada.conteudo.legenda === r.legenda && JSON.stringify(versaoComparada.conteudo.midias) === JSON.stringify(r.midias) && <div className="col-span-2 text-sucesso">Sem diferenças de mídia e legenda.</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <Biblioteca aberto={biblioteca} cliente={cliente} modoEscolha aoFechar={() => setBiblioteca(false)}
        aoEscolher={(ms) => { setR((x) => { const midias = [...x.midias, ...ms].slice(0, LIMITES.carrossel); return { ...x, midias, formato: x.formato === 'imagem' && midias.length > 1 ? 'carrossel' : x.formato === 'imagem' && midias[0]?.tipo === 'video' ? 'reel' : x.formato }; }); setBiblioteca(false); }} />
      {confirmar && <Confirmar aberto titulo={confirmar.titulo} texto={confirmar.texto} rotulo={confirmar.rotulo} perigo={confirmar.perigo} aoConfirmar={confirmar.fazer} aoFechar={() => setConfirmar(null)} />}
    </Modal>
  );
}
