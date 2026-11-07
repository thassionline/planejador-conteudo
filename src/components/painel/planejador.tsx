'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, CloudOff, Copy, Download, FileText, FolderOpen, Image as ImgIcon, List,
  Loader2, Maximize2, MoreHorizontal, Plus, Receipt, RotateCcw, Send, Share2, Trash2, UserCog, X,
} from 'lucide-react';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { urlGarantida, useUrls } from '@/lib/midia';
import { mensagemErro } from '@/lib/erros';
import { chaveDia, dataHora, diaCurto, hojeChave, hora, montarInstante, nomeMes, periodoTexto, somarDias, diaDaSemana } from '@/lib/datas';
import { MODOS_FEED, ordenarFeed, type ModoFeed } from '@/lib/feed';
import { APROVACAO, FORMATOS, type Cliente, type Post } from '@/lib/tipos';
import { useAgencia } from '@/lib/agencia';
import { baixar, canvasParaBlob, compartilharOuBaixar, desenharFeed, nomeArquivo, pdfAprovacao, pdfComprovante } from '@/lib/exportar';
import { AvisoPrevia, Grade, Miniatura, Perfil, type PerfilVisual } from '@/components/instagram';
import { Carregando, Confirmar, Modal, avisar } from '@/components/ui';
import { Calendario, type AcoesPost, type Visao } from './calendario';
import { Editor } from './editor';
import { Compartilhar } from './compartilhar';
import { Biblioteca } from './biblioteca';
import { PerfilCliente } from './perfil-cliente';
import { Sino } from './sino';
import { capaDoPost } from '@/lib/feed';

type Filtro = 'todos' | 'rascunho' | 'aguardando' | 'ajustes' | 'aprovado' | 'existente';
type Aba = 'calendario' | 'feed' | 'aprovacoes';
type Salvamento = 'ok' | 'salvando' | 'erro';

function telefone(t?: string | null) {
  const d = (t || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '';
}

export function Planejador({ clienteId }: { clienteId: string }) {
  const { agencia } = useAgencia();
  const router = useRouter();
  const busca = useSearchParams();
  const urlDe = useUrls();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [visao, setVisao] = useState<Visao>('mes');
  const [ref, setRef] = useState(() => `${hojeChave().slice(0, 7)}-01`);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [modo, setModo] = useState<ModoFeed>('completo');
  const [ate, setAte] = useState('');
  const [aba, setAba] = useState<Aba>('calendario');
  const [larguraFeed, setLarguraFeed] = useState(430);
  const [ampliado, setAmpliado] = useState(false);
  const [editor, setEditor] = useState<{ post: Post | null; dia: string; tipo: 'planejado' | 'existente' } | null>(null);
  const [painel, setPainel] = useState<null | 'compartilhar' | 'biblioteca' | 'perfil' | 'lixeira' | 'duplicar' | 'exportar'>(null);
  const [menu, setMenu] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvamento, setSalvamento] = useState<Salvamento>('ok');
  const [confirmar, setConfirmar] = useState<null | { titulo: string; texto: string; rotulo: string; perigo?: boolean; fazer: () => void }>(null);
  const arrastando = useRef(false);

  // ---------- dados ----------
  const carregar = useCallback(async () => {
    const sb = supabaseNavegador();
    const [c, p, l] = await Promise.all([
      sb.from('clientes').select('*').eq('id', clienteId).maybeSingle(),
      sb.from('posts').select('*').eq('cliente_id', clienteId).is('excluido_em', null).order('publicar_em').limit(3000),
      sb.from('clientes').select('id, nome').is('excluido_em', null).order('nome'),
    ]);
    if (!c.data) { avisar('Cliente não encontrado', 'erro'); router.replace('/'); return; }
    setCliente(c.data as Cliente);
    setPosts((p.data || []) as Post[]);
    setClientes(l.data || []);
  }, [clienteId, router]);
  useEffect(() => { setPosts(null); carregar(); }, [carregar]);

  // tempo real: decisões do cliente aparecem sem recarregar
  useEffect(() => {
    const sb = supabaseNavegador();
    const canal = sb.channel(`posts-${clienteId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `cliente_id=eq.${clienteId}` }, (ev: { eventType: string; new: Post; old: { id: string } }) => {
      setPosts((lista) => {
        if (!lista) return lista;
        if (ev.eventType === 'DELETE') return lista.filter((x) => x.id !== ev.old.id);
        const novo = ev.new;
        if (novo.excluido_em) return lista.filter((x) => x.id !== novo.id);
        const atual = lista.find((x) => x.id === novo.id);
        if (atual && atual.revisao > novo.revisao) return lista;
        return atual ? lista.map((x) => (x.id === novo.id ? novo : x)) : [...lista, novo];
      });
    }).subscribe();
    return () => { sb.removeChannel(canal); };
  }, [clienteId]);

  useEffect(() => {
    try { const w = Number(localStorage.getItem('largura-feed')); if (w >= 340 && w <= 760) setLarguraFeed(w); } catch {}
  }, []);
  // abrir post vindo de notificação
  useEffect(() => {
    const id = busca.get('post');
    if (id && posts) { const p = posts.find((x) => x.id === id); if (p) setEditor({ post: p, dia: chaveDia(p.publicar_em), tipo: p.tipo }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, posts === null]);

  const substituir = (p: Post | null, removerId?: string) => setPosts((l) => {
    if (!l) return l;
    if (removerId) return l.filter((x) => x.id !== removerId);
    if (!p) return l;
    if (p.excluido_em) return l.filter((x) => x.id !== p.id);
    return l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [...l, p];
  });

  async function executar<T>(f: () => Promise<T>, ok?: string): Promise<T | null> {
    setSalvamento('salvando');
    try {
      const r = await f();
      setSalvamento('ok');
      if (ok) avisar(ok);
      return r;
    } catch (e) {
      setSalvamento('erro');
      avisar(mensagemErro(e), 'erro', { rotulo: 'Recarregar', fazer: () => carregar() });
      return null;
    }
  }

  // ---------- ações ----------
  const acoes: AcoesPost = {
    abrir: (p) => setEditor({ post: p, dia: chaveDia(p.publicar_em), tipo: p.tipo }),
    novo: (dia) => setEditor({ post: null, dia, tipo: 'planejado' }),
    mover: (p, dia) => {
      const fazer = () => executar(async () => {
        const { data, error } = await supabaseNavegador().from('posts').update({ publicar_em: montarInstante(dia, hora(p.publicar_em)) }).eq('id', p.id).eq('revisao', p.revisao).select();
        if (error) throw error;
        if (!data?.length) throw new Error('conflito');
        substituir(data[0] as Post);
      }, `Movido para ${diaCurto(montarInstante(dia, '12:00'))}`);
      if (p.aprovacao === 'aprovado' && agencia?.reaprovar_ao_mudar_data) setConfirmar({ titulo: 'Mudar a data de um post aprovado?', texto: 'Pela regra da sua agência, mudar a data pede nova aprovação do cliente.', rotulo: 'Mover', fazer });
      else fazer();
    },
    duplicar: (p) => executar(async () => {
      const { data, error } = await supabaseNavegador().rpc('duplicar_post', { p_post: p.id, p_quando: p.publicar_em });
      if (error) throw error;
      const { data: novo } = await supabaseNavegador().from('posts').select().eq('id', data).single();
      substituir(novo as Post);
    }, 'Cópia criada como rascunho'),
    enviar: (ids) => executar(async () => {
      const { data, error } = await supabaseNavegador().rpc('enviar_para_aprovacao', { p_posts: ids });
      if (error) throw error;
      await carregar();
      setSelecionados(new Set());
      return data;
    }).then((n) => n !== null && avisar(n ? `${n} post(s) enviados para aprovação` : 'Nada para enviar (só rascunhos e ajustes podem ser enviados).', n ? 'ok' : 'info')),
    lixeira: (ids) => setConfirmar({
      titulo: ids.length > 1 ? `Mover ${ids.length} posts para a lixeira?` : 'Mover para a lixeira?', texto: 'Dá para recuperar depois pela Lixeira.', rotulo: 'Mover', perigo: true,
      fazer: () => executar(async () => {
        const { error } = await supabaseNavegador().from('posts').update({ excluido_em: new Date().toISOString() }).in('id', ids);
        if (error) throw error;
        setPosts((l) => l?.filter((x) => !ids.includes(x.id)) || l);
        setSelecionados(new Set());
      }, 'Movido para a lixeira'),
    }),
  };

  // ---------- derivados ----------
  const periodo = useMemo(() => {
    if (visao === 'semana') { const ini = somarDias(ref, -diaDaSemana(ref)); return { ini, fim: somarDias(ini, 6) }; }
    const ini = `${ref.slice(0, 7)}-01`;
    const [y, m] = [Number(ref.slice(0, 4)), Number(ref.slice(5, 7))];
    return { ini, fim: `${ref.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
  }, [ref, visao]);

  const doCalendario = useMemo(() => (posts || []).filter((p) => {
    if (filtro === 'existente') return p.tipo === 'existente';
    if (filtro !== 'todos') return p.tipo === 'planejado' && p.aprovacao === filtro;
    return true;
  }).filter((p) => visao !== 'lista' || (chaveDia(p.publicar_em) >= periodo.ini && chaveDia(p.publicar_em) <= periodo.fim)), [posts, filtro, visao, periodo]);

  const feed = useMemo(() => ordenarFeed(posts || [], modo, ate || null), [posts, modo, ate]);
  const stories = useMemo(() => (posts || []).filter((p) => p.formato === 'story' && p.publicacao !== 'cancelado' && chaveDia(p.publicar_em) >= periodo.ini && chaveDia(p.publicar_em) <= periodo.fim), [posts, periodo]);
  const planejados = (posts || []).filter((p) => p.tipo === 'planejado');
  const contagem = (k: Filtro) => (k === 'todos' ? (posts || []).length : k === 'existente' ? (posts || []).filter((p) => p.tipo === 'existente').length : planejados.filter((p) => p.aprovacao === k).length);
  const fila = planejados.filter((p) => p.aprovacao === 'aguardando' || p.aprovacao === 'ajustes').sort((a, b) => a.publicar_em.localeCompare(b.publicar_em));
  const proximas = planejados.filter((p) => p.aprovacao !== 'aprovado' && new Date(p.publicar_em).getTime() - Date.now() < 3 * 864e5 && new Date(p.publicar_em) > new Date());

  const perfilVisual = (c: Cliente): PerfilVisual & { avatarPath: string | null; destaquesPaths: (string | null | undefined)[] } => ({
    nome: c.nome_perfil || c.nome, usuario: c.usuario_ig, categoria: c.categoria, bio: c.bio, link: c.link, avatarUrl: urlDe(c.avatar_path),
    posts: feed.length + (c.posts_base || 0) - feed.filter((p) => p.tipo === 'existente').length, seguidores: c.seguidores, seguindo: c.seguindo,
    destaques: (c.destaques || []).map((d) => ({ titulo: d.titulo, url: urlDe(d.capa_path) })), avatarPath: c.avatar_path, destaquesPaths: (c.destaques || []).map((d) => d.capa_path),
  });

  // ---------- exportações ----------
  const marca = { agencia: agencia?.nome || 'Descomplica Digital', contato: telefone(agencia?.whatsapp) };
  async function exportar(tipo: 'imagem' | 'pdf' | 'pdf-historico' | 'comprovante') {
    if (!cliente) return;
    setPainel(null);
    avisar('Gerando arquivo…', 'info');
    try {
      const per = periodoTexto(feed.filter((p) => p.tipo === 'planejado')) || nomeMes(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)) - 1);
      const base = nomeArquivo(`${cliente.nome}-${per}`);
      if (tipo === 'imagem') {
        const c = await desenharFeed(perfilVisual(cliente), feed, urlGarantida, { marca, cliente: cliente.nome, periodo: per, proporcaoGrade: cliente.proporcao_grade });
        return compartilharOuBaixar(await canvasParaBlob(c, 'image/jpeg', 0.9), `feed-${base}.jpg`);
      }
      if (tipo === 'comprovante') {
        const sb = supabaseNavegador();
        const ids = planejados.map((p) => p.id);
        const [d, c] = await Promise.all([
          sb.from('decisoes').select('post_id, versao, acao, revisor_nome, comentario, criado_em').in('post_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('criado_em'),
          sb.from('conclusoes').select('revisor_nome, criado_em').eq('cliente_id', cliente.id).order('criado_em'),
        ]);
        const blob = await pdfComprovante({
          marca, cliente: cliente.nome, periodo: per,
          linhas: (d.data || []).map((x: { post_id: string; versao: number; acao: string; revisor_nome: string; comentario: string; criado_em: string }) => {
            const p = planejados.find((y) => y.id === x.post_id)!;
            return { post: `Post de ${diaCurto(p.publicar_em)} às ${hora(p.publicar_em)}`, formato: FORMATOS[p.formato], versao: x.versao, decisao: x.acao === 'aprovado' ? 'Aprovado' : 'Ajuste pedido', revisor: x.revisor_nome, quando: x.criado_em, comentario: x.comentario };
          }),
          conclusoes: (c.data || []).map((x: { revisor_nome: string; criado_em: string }) => ({ revisor: x.revisor_nome, quando: x.criado_em })),
        });
        return baixar(blob, `comprovante-aprovacao-${base}.pdf`);
      }
      const itens = feed.filter((p) => p.tipo === 'planejado').map((p) => ({ ...p, versao: p.versao_atual || null, numero: feed.indexOf(p) + 1 }));
      const extras = stories.filter((p) => p.tipo === 'planejado').map((p, i) => ({ ...p, versao: p.versao_atual || null, numero: feed.length + i + 1 }));
      let historico: Record<string, { quando: string; texto: string }[]> = {};
      if (tipo === 'pdf-historico') {
        const { data } = await supabaseNavegador().from('decisoes').select('post_id, versao, acao, revisor_nome, criado_em').in('post_id', [...itens, ...extras].map((p) => p.id));
        historico = {};
        (data || []).forEach((x: { post_id: string; versao: number; acao: string; revisor_nome: string; criado_em: string }) => (historico[x.post_id] ||= []).push({ quando: x.criado_em, texto: `v${x.versao} ${x.acao === 'aprovado' ? 'aprovada' : 'ajuste pedido'} por ${x.revisor_nome}` }));
      }
      const blob = await pdfAprovacao({
        perfil: perfilVisual(cliente), feed, itens: [...itens, ...extras].map((p) => ({ ...p, historico: historico[p.id] })), obterUrl: urlGarantida,
        marca, cliente: cliente.nome, periodo: per, proporcaoGrade: cliente.proporcao_grade, comHistorico: tipo === 'pdf-historico',
      });
      return compartilharOuBaixar(blob, `planejamento-${base}.pdf`);
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
  }

  // ---------- divisor arrastável ----------
  useEffect(() => {
    const mover = (e: MouseEvent) => {
      if (!arrastando.current) return;
      const w = Math.min(760, Math.max(340, window.innerWidth - e.clientX - 24));
      setLarguraFeed(w);
    };
    const soltar = () => { if (arrastando.current) { arrastando.current = false; document.body.style.userSelect = ''; try { localStorage.setItem('largura-feed', String(larguraFeed)); } catch {} } };
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar);
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
  }, [larguraFeed]);

  if (!cliente || !posts) return <Carregando />;

  const navegar = (n: number) => {
    if (visao === 'semana') setRef(somarDias(ref, n * 7));
    else { const d = new Date(`${ref.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setRef(d.toISOString().slice(0, 10)); }
  };
  const tituloPeriodo = visao === 'semana' ? `${diaCurto(montarInstante(periodo.ini, '12:00'))} a ${diaCurto(montarInstante(periodo.fim, '12:00'))}` : nomeMes(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)) - 1);

  const marcadorAgencia = (p: Post) => p.tipo === 'existente' ? null : <span className="absolute bottom-1.5 left-1.5 h-2.5 w-2.5 rounded-full border-2 border-white shadow" style={{ background: APROVACAO[p.aprovacao].cor }} title={APROVACAO[p.aprovacao].rotulo} />;

  const painelFeed = (grande = false) => (
    <div className={clsx('flex flex-col', grande ? '' : 'cartao overflow-hidden')}>
      <div className="flex flex-wrap items-center gap-2 border-b border-borda px-3 py-2.5">
        <select className="campo w-auto py-1.5 text-[12.5px]" value={modo} onChange={(e) => setModo(e.target.value as ModoFeed)} aria-label="Visualização do feed">
          {(Object.keys(MODOS_FEED) as ModoFeed[]).map((k) => <option key={k} value={k}>{MODOS_FEED[k]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-texto-2" title="Como ficará meu feed até esta data">Até<input type="date" className="campo w-auto py-1 text-[12.5px]" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        {ate && <button className="text-[12px] text-texto-2 underline" onClick={() => setAte('')}>limpar</button>}
        <div className="flex-1" />
        {!grande && <button className="btn-icone h-8 w-8" onClick={() => setAmpliado(true)} aria-label="Ampliar prévia" title="Ampliar"><Maximize2 size={15} /></button>}
        <button className="btn-icone h-8 w-8" onClick={() => setPainel('exportar')} aria-label="Exportar" title="Exportar"><Download size={15} /></button>
      </div>
      <div className={clsx(grande ? 'mx-auto w-full max-w-[520px]' : '', 'bg-white')}>
        <Perfil p={perfilVisual(cliente)} />
        {stories.length > 0 && (
          <div className="sem-barra flex gap-2 overflow-x-auto border-b border-borda px-4 py-2 text-[11.5px] text-texto-2">
            <span className="shrink-0 self-center">Stories do período:</span>
            {stories.map((s) => <button key={s.id} onClick={() => acoes.abrir(s)} className="h-12 w-8 shrink-0 overflow-hidden rounded ring-2 ring-pink-400"><Miniatura midia={capaDoPost(s)} capa={s.capa} urlDe={urlDe} /></button>)}
          </div>
        )}
        <Grade posts={feed} urlDe={urlDe} proporcaoGrade={cliente.proporcao_grade} aoAbrir={(p) => { setAmpliado(false); acoes.abrir(p); }} sobreposicao={marcadorAgencia}
          vazio={<>Nenhuma publicação.<br /><button className="mt-2 font-medium text-principal" onClick={() => acoes.novo(hojeChave())}>Criar a primeira</button></>} />
        <AvisoPrevia />
      </div>
    </div>
  );

  const listaAprovacoes = (
    <div className="cartao overflow-hidden">
      <div className="border-b border-borda px-4 py-3 text-[14px] font-semibold">Aprovações</div>
      {!fila.length && <p className="px-4 py-10 text-center text-[13px] text-texto-2">Nada aguardando o cliente.</p>}
      {fila.map((p) => (
        <button key={p.id} onClick={() => acoes.abrir(p)} className="flex w-full items-center gap-3 border-b border-borda px-4 py-2.5 text-left last:border-0 hover:bg-suave">
          <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-suave"><Miniatura midia={capaDoPost(p)} capa={p.capa} urlDe={urlDe} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-texto-2">{diaCurto(p.publicar_em)} · {FORMATOS[p.formato]} · v{p.versao_atual}</div>
            <div className="truncate text-[13px]">{p.legenda.split('\n')[0] || 'Sem legenda'}</div>
          </div>
          <span className="pilula shrink-0" style={{ color: APROVACAO[p.aprovacao].cor }}>{APROVACAO[p.aprovacao].rotulo}</span>
        </button>
      ))}
    </div>
  );

  const itemMenu = 'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] hover:bg-suave';
  return (
    <div className="pb-20 lg:pb-6">
      {/* cabeçalho */}
      <header className="sticky top-0 z-30 border-b border-borda bg-cartao/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5">
          <Link href="/" className="btn-icone" aria-label="Voltar para clientes"><ArrowLeft size={17} /></Link>
          <div className="hidden leading-tight md:block">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-principal">{agencia?.nome}</div>
            <div className="text-[13px] font-semibold">Planejador</div>
          </div>
          <select className="campo w-auto max-w-[128px] py-1.5 font-medium sm:max-w-[220px]" value={cliente.id} onChange={(e) => router.push(`/c/${e.target.value}`)} aria-label="Cliente">
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <span className={clsx('hidden items-center gap-1.5 text-[12px] sm:flex', salvamento === 'erro' ? 'text-erro' : 'text-texto-2')}>
            {salvamento === 'salvando' ? <><Loader2 size={13} className="animate-spin" />Salvando…</> : salvamento === 'erro' ? <><CloudOff size={13} />Erro ao salvar</> : <><Check size={13} />Tudo salvo</>}
          </span>
          <div className="flex-1" />
          <Sino />
          <div className="relative">
            <button className="btn-icone" onClick={() => setMenu(!menu)} aria-label="Mais opções"><MoreHorizontal size={17} /></button>
            {menu && (
              <div className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-borda bg-cartao shadow-xl" onMouseLeave={() => setMenu(false)}>
                <button className={itemMenu} onClick={() => { setMenu(false); setPainel('perfil'); }}><UserCog size={16} />Perfil, bio e destaques</button>
                <button className={itemMenu} onClick={() => { setMenu(false); setEditor({ post: null, dia: hojeChave(), tipo: 'existente' }); }}><ImgIcon size={16} />Adicionar post já publicado</button>
                <button className={itemMenu} onClick={() => { setMenu(false); setPainel('biblioteca'); }}><FolderOpen size={16} />Biblioteca de mídias</button>
                <button className={itemMenu} onClick={() => { setMenu(false); setPainel('duplicar'); }}><Copy size={16} />Duplicar planejamento</button>
                <button className={itemMenu} onClick={() => { setMenu(false); setPainel('exportar'); }}><Download size={16} />Exportar</button>
                <button className={itemMenu} onClick={() => { setMenu(false); setPainel('lixeira'); }}><Trash2 size={16} />Lixeira</button>
              </div>
            )}
          </div>
          <button className="btn" onClick={() => setPainel('compartilhar')}><Share2 size={16} /><span className="hidden sm:inline">Compartilhar para aprovação</span></button>
          <button className="btn-principal hidden sm:inline-flex" onClick={() => acoes.novo(hojeChave() >= periodo.ini && hojeChave() <= periodo.fim ? hojeChave() : periodo.ini)}><Plus size={16} />Novo conteúdo</button>
          <button className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-principal text-white shadow-lg sm:hidden" aria-label="Novo conteúdo" onClick={() => acoes.novo(hojeChave() >= periodo.ini && hojeChave() <= periodo.fim ? hojeChave() : periodo.ini)}><Plus size={24} /></button>
        </div>
      </header>

      {proximas.length > 0 && (
        <div className="mx-auto max-w-[1800px] px-3 pt-3 sm:px-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            {proximas.length} post(s) programados para os próximos 3 dias ainda sem aprovação: {proximas.map((p) => `${diaCurto(p.publicar_em)} ${hora(p.publicar_em)}`).join(', ')}.
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1800px] px-3 pt-3 sm:px-5">
        {/* abas no celular */}
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-suave p-1 lg:hidden">
          {([['calendario', 'Calendário'], ['feed', 'Feed'], ['aprovacoes', `Aprovações${fila.length ? ` (${fila.length})` : ''}`]] as [Aba, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} className={clsx('rounded-lg py-2 text-[13px] font-medium', aba === k ? 'bg-cartao shadow-sm' : 'text-texto-2')}>{l}</button>
          ))}
        </div>

        <div className="lg:flex lg:items-start lg:gap-0">
          <section className={clsx('min-w-0 flex-1', aba !== 'calendario' && 'hidden lg:block')}>
            <div className="cartao overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-borda px-3 py-2.5">
                <button className="btn-icone h-8 w-8" onClick={() => navegar(-1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
                <h2 className="min-w-[150px] text-center text-[15px] font-semibold">{tituloPeriodo.charAt(0).toUpperCase() + tituloPeriodo.slice(1)}</h2>
                <button className="btn-icone h-8 w-8" onClick={() => navegar(1)} aria-label="Próximo"><ChevronRight size={16} /></button>
                <button className="btn py-1.5 text-[12.5px]" onClick={() => setRef(visao === 'semana' ? hojeChave() : `${hojeChave().slice(0, 7)}-01`)}>Hoje</button>
                <div className="flex-1" />
                <div className="flex rounded-lg bg-suave p-0.5 text-[12.5px]">
                  {([['mes', 'Mês', CalendarDays], ['semana', 'Semana', CalendarDays], ['lista', 'Lista', List]] as const).map(([k, l, I]) => (
                    <button key={k} onClick={() => { setVisao(k); if (k === 'semana') setRef(hojeChave().slice(0, 7) === ref.slice(0, 7) ? hojeChave() : ref); }} className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 font-medium', visao === k ? 'bg-cartao shadow-sm' : 'text-texto-2')}><I size={13} />{l}</button>
                  ))}
                </div>
              </div>
              <div className="sem-barra flex gap-1.5 overflow-x-auto border-b border-borda px-3 py-2">
                {(['todos', 'rascunho', 'aguardando', 'ajustes', 'aprovado', 'existente'] as Filtro[]).map((k) => (
                  <button key={k} onClick={() => setFiltro(k)} className={clsx('pilula shrink-0 border', filtro === k ? 'border-texto bg-texto text-white' : 'border-borda bg-cartao')}>
                    {k !== 'todos' && <span className="h-2 w-2 rounded-full" style={{ background: k === 'existente' ? APROVACAO.publicado.cor : APROVACAO[k].cor }} />}
                    {k === 'todos' ? 'Todos' : k === 'existente' ? 'Já publicados' : APROVACAO[k].rotulo} · {contagem(k)}
                  </button>
                ))}
              </div>
              {visao === 'lista' && selecionados.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-borda bg-principal-suave/60 px-3 py-2 text-[13px]">
                  <b>{selecionados.size} selecionado(s)</b>
                  <button className="btn py-1" onClick={() => acoes.enviar([...selecionados])}><Send size={14} />Enviar para aprovação</button>
                  <button className="btn-perigo py-1" onClick={() => acoes.lixeira([...selecionados])}><Trash2 size={14} />Lixeira</button>
                  <button className="text-texto-2 underline" onClick={() => setSelecionados(new Set())}>limpar</button>
                </div>
              )}
              <Calendario visao={visao} referencia={visao === 'mes' ? `${ref.slice(0, 7)}-01` : ref} posts={doCalendario} urlDe={urlDe} acoes={acoes} selecionados={selecionados} setSelecionados={setSelecionados} />
            </div>
            <div className="mt-4 hidden lg:block">{listaAprovacoes}</div>
          </section>

          <div className="hidden w-3 shrink-0 cursor-col-resize self-stretch lg:block" onMouseDown={() => { arrastando.current = true; document.body.style.userSelect = 'none'; }} title="Arraste para ajustar o tamanho">
            <div className="mx-auto mt-40 h-14 w-1 rounded-full bg-borda" />
          </div>

          <aside className={clsx('shrink-0 lg:sticky lg:top-[68px] lg:w-[var(--lf)]', aba !== 'feed' && 'hidden lg:block')} style={{ ['--lf' as string]: `${larguraFeed}px` }}>
            {painelFeed()}
          </aside>
          <section className={clsx(aba !== 'aprovacoes' && 'hidden', 'lg:hidden')}>{listaAprovacoes}</section>
        </div>
      </div>

      {/* prévia ampliada */}
      {ampliado && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-borda bg-white px-4 py-2.5">
            <b>{cliente.nome} · prévia do feed</b>
            <button className="btn-icone" onClick={() => setAmpliado(false)} aria-label="Fechar"><X size={18} /></button>
          </div>
          {painelFeed(true)}
        </div>
      )}

      {editor && <Editor aberto post={editor.post} diaInicial={editor.dia} tipoInicial={editor.tipo} cliente={cliente} aoFechar={() => setEditor(null)}
        aoSalvo={(p) => { if (p) substituir(p); else if (editor.post) substituir(null, editor.post.id); setEditor(p ? { post: p, dia: chaveDia(p.publicar_em), tipo: p.tipo } : null); if (!p) carregar(); }} />}
      <Compartilhar aberto={painel === 'compartilhar'} cliente={cliente} posts={posts} aoFechar={() => setPainel(null)} aoMudar={carregar} />
      <Biblioteca aberto={painel === 'biblioteca'} cliente={cliente} aoFechar={() => setPainel(null)} />
      <PerfilCliente aberto={painel === 'perfil'} cliente={cliente} aoFechar={() => setPainel(null)} aoSalvar={(c) => { setCliente(c); setPainel(null); }} />
      <Lixeira aberto={painel === 'lixeira'} cliente={cliente} aoFechar={() => setPainel(null)} aoRestaurar={carregar} urlDe={urlDe} />
      <DuplicarPeriodo aberto={painel === 'duplicar'} cliente={cliente} referencia={ref} aoFechar={() => setPainel(null)} aoFeito={carregar} />
      <Modal aberto={painel === 'exportar'} aoFechar={() => setPainel(null)} titulo="Exportar para o cliente" largura="max-w-md">
        <p className="mb-3 text-[12.5px] text-texto-2">Usa a mesma ordem e o mesmo filtro da prévia ({MODOS_FEED[modo].toLowerCase()}{ate ? `, até ${diaCurto(montarInstante(ate, '12:00'))}` : ''}).</p>
        <div className="space-y-2">
          {([
            ['imagem', ImgIcon, 'Imagem do feed', 'Perfil + grade numerada, pronta para o WhatsApp'],
            ['pdf', FileText, 'PDF de aprovação', 'Capa, visão do feed e cada post com mídia, data e legenda completa'],
            ['pdf-historico', FileText, 'PDF com histórico', 'Igual ao anterior, com as decisões de cada versão'],
            ['comprovante', Receipt, 'Comprovante de aprovação', 'Quem aprovou, quando e qual versão'],
          ] as const).map(([k, I, t, d]) => (
            <button key={k} onClick={() => exportar(k)} className="flex w-full items-start gap-3 rounded-lg border border-borda p-3 text-left hover:border-principal/40 hover:bg-suave/50">
              <I size={18} className="mt-0.5 text-principal" /><div><div className="font-medium">{t}</div><div className="text-[12.5px] text-texto-2">{d}</div></div>
            </button>
          ))}
        </div>
      </Modal>
      {confirmar && <Confirmar aberto titulo={confirmar.titulo} texto={confirmar.texto} rotulo={confirmar.rotulo} perigo={confirmar.perigo} aoConfirmar={confirmar.fazer} aoFechar={() => setConfirmar(null)} />}
    </div>
  );
}

function Lixeira({ aberto, cliente, aoFechar, aoRestaurar, urlDe }: { aberto: boolean; cliente: Cliente; aoFechar: () => void; aoRestaurar: () => void; urlDe: (p?: string | null) => string | null }) {
  const [itens, setItens] = useState<Post[]>([]);
  const [apagar, setApagar] = useState<Post | null>(null);
  const carregar = useCallback(async () => {
    const { data } = await supabaseNavegador().from('posts').select('*').eq('cliente_id', cliente.id).not('excluido_em', 'is', null).order('excluido_em', { ascending: false });
    setItens((data || []) as Post[]);
  }, [cliente.id]);
  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);
  async function restaurar(p: Post) {
    const { error } = await supabaseNavegador().from('posts').update({ excluido_em: null }).eq('id', p.id);
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar('Post restaurado'); carregar(); aoRestaurar();
  }
  async function excluir(p: Post) {
    const { error } = await supabaseNavegador().from('posts').delete().eq('id', p.id);
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar('Excluído definitivamente'); carregar();
  }
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Lixeira" largura="max-w-lg">
      {!itens.length && <p className="py-8 text-center text-texto-2">A lixeira está vazia.</p>}
      <div className="space-y-2">
        {itens.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-borda p-2">
            <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-suave"><Miniatura midia={capaDoPost(p)} capa={p.capa} urlDe={urlDe} /></div>
            <div className="min-w-0 flex-1 text-[12.5px]">
              <div className="truncate font-medium">{p.legenda.split('\n')[0] || FORMATOS[p.formato]}</div>
              <div className="text-texto-2">{diaCurto(p.publicar_em)} · excluído em {dataHora(p.excluido_em!)}</div>
            </div>
            <button className="btn py-1 text-[12.5px]" onClick={() => restaurar(p)}><RotateCcw size={14} />Restaurar</button>
            <button className="btn-icone text-erro" aria-label="Excluir definitivamente" onClick={() => setApagar(p)}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <Confirmar aberto={!!apagar} titulo="Excluir definitivamente?" texto="O post, as versões e o histórico de aprovação dele serão apagados. Não dá para desfazer." rotulo="Excluir" perigo aoConfirmar={() => apagar && excluir(apagar)} aoFechar={() => setApagar(null)} />
    </Modal>
  );
}

function DuplicarPeriodo({ aberto, cliente, referencia, aoFechar, aoFeito }: { aberto: boolean; cliente: Cliente; referencia: string; aoFechar: () => void; aoFeito: () => void }) {
  const mes = referencia.slice(0, 7);
  const proximo = (() => { const d = new Date(`${mes}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  const [de, setDe] = useState(mes);
  const [para, setPara] = useState(proximo);
  useEffect(() => { if (aberto) { setDe(mes); setPara(proximo); } }, [aberto, mes, proximo]);
  async function duplicar() {
    const [y, m] = de.split('-').map(Number);
    const fim = `${de}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const { data, error } = await supabaseNavegador().rpc('duplicar_periodo', { p_cliente: cliente.id, p_de: `${de}-01`, p_ate: fim, p_para: `${para}-01` });
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar(`${data} post(s) copiados como rascunho`);
    aoFeito(); aoFechar();
  }
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Duplicar planejamento" largura="max-w-md"
      rodape={<div className="flex justify-end gap-2"><button className="btn" onClick={aoFechar}>Cancelar</button><button className="btn-principal" onClick={duplicar} disabled={de === para}>Duplicar</button></div>}>
      <p className="mb-4 text-[13px] text-texto-2">Copia os posts planejados de um mês para outro do mesmo cliente, mantendo dia relativo, horário, mídias e legendas. As cópias nascem como rascunho.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="rotulo">Copiar de</label><input type="month" className="campo" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><label className="rotulo">Para</label><input type="month" className="campo" value={para} onChange={(e) => setPara(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
