'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, CheckCircle2, ChevronRight, Download, Grid3x3, List, MessageSquare, PartyPopper, PencilLine, Quote } from 'lucide-react';
import { AvisoPrevia, Grade, Miniatura, Perfil, Visualizador, type PerfilVisual } from '@/components/instagram';
import { Carregando, Modal, avisar } from '@/components/ui';
import { capaDoPost, ordenarFeed } from '@/lib/feed';
import { chaveDia, dataHora, diaCurto, diaLongo, hora, periodoTexto } from '@/lib/datas';
import { mensagemErro } from '@/lib/erros';
import { baixar, pdfAprovacao } from '@/lib/exportar';
import { APROVACAO, FORMATOS, type Capa, type Destaque, type Formato, type Midia, type Publicacao } from '@/lib/tipos';

type PostCliente = {
  id: string; tipo: 'planejado' | 'existente'; formato: Formato; publicar_em: string; legenda: string; midias: Midia[]; capa: Capa;
  aprovacao: 'aguardando' | 'ajustes' | 'aprovado' | 'publicado'; publicacao: Publicacao; fixado: boolean; ordem_manual: number; versao: number | null;
  comentarios: { id: string; autor_tipo: 'agencia' | 'cliente'; autor_nome: string; texto: string; midia_indice: number | null; trecho_legenda: string | null; resolvido: boolean; versao: number | null; criado_em: string }[];
  decisoes: { acao: 'aprovado' | 'ajustes'; versao: number; revisor_nome: string; criado_em: string }[];
};
type Dados = {
  cliente: { nome: string; usuario_ig: string; nome_perfil: string; categoria: string; bio: string; link: string; avatar_path: string | null; seguidores: string; seguindo: string; posts_base: number; destaques: Destaque[]; proporcao_grade: string };
  agencia: { nome: string; whatsapp: string | null };
  posts: PostCliente[];
  urls: Record<string, string>;
};

export function Portal({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [aba, setAba] = useState<'feed' | 'lista'>('feed');
  const [aberto, setAberto] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const nomeRef = useRef('');
  nomeRef.current = nome;
  const [pedirNome, setPedirNome] = useState<null | (() => void)>(null);
  const [lote, setLote] = useState(false);
  const chaveNome = `revisor:${token.slice(0, 12)}`;

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/revisao/${token}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setFalha(j.erro || 'falha'); return null; }
      setDados(j); setFalha(null);
      return j as Dados;
    } catch { setFalha('rede'); return null; }
  }, [token]);
  useEffect(() => { carregar(); try { setNome(localStorage.getItem(chaveNome) || ''); } catch {} }, [carregar, chaveNome]);

  const urlDe = useCallback((p?: string | null) => (p && dados?.urls[p]) || null, [dados]);
  const posts = dados?.posts || [];
  const planejados = posts.filter((p) => p.tipo === 'planejado');
  const pendentes = planejados.filter((p) => p.aprovacao === 'aguardando').sort((a, b) => a.publicar_em.localeCompare(b.publicar_em));
  const feed = useMemo(() => ordenarFeed(posts.map((p) => ({ ...p, criado_em: '' })), 'completo'), [posts]);
  const stories = planejados.filter((p) => p.formato === 'story');
  const atual = posts.find((p) => p.id === aberto) || null;
  const conta = (s: string) => planejados.filter((p) => p.aprovacao === s).length;
  const tudoAprovado = planejados.length > 0 && conta('aprovado') === planejados.length;

  function garantirNome(fazer: () => void) {
    if (nomeRef.current.trim().length >= 2) fazer();
    else setPedirNome(() => fazer);
  }

  async function enviar(corpo: Record<string, unknown>) {
    const r = await fetch(`/api/revisao/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, nome: nomeRef.current }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.erro === 'versao_desatualizada' || j.erro === 'post_invalido') await carregar();
      throw new Error(j.erro || 'falha');
    }
    return j.resultado;
  }

  async function decidir(p: PostCliente, decisao: 'aprovado' | 'ajustes', comentario: string, midia: number | null) {
    try {
      await enviar({ acao: 'decidir', post: p.id, versao: p.versao, decisao, comentario, midia });
      const novos = await carregar();
      const proximo = (novos?.posts || []).filter((x) => x.tipo === 'planejado' && x.aprovacao === 'aguardando' && x.id !== p.id).sort((a, b) => a.publicar_em.localeCompare(b.publicar_em))[0];
      avisar(decisao === 'aprovado' ? `Publicação de ${diaCurto(p.publicar_em)} aprovada ✓` : 'Pedido de alteração enviado para a agência');
      setAberto(proximo ? proximo.id : null);
      return true;
    } catch (e) { avisar(mensagemErro(e), 'erro'); return false; }
  }
  async function comentar(p: PostCliente, texto: string, midia: number | null, trecho: string | null) {
    try {
      await enviar({ acao: 'comentar', post: p.id, texto, midia, trecho });
      await carregar();
      avisar('Comentário enviado');
      return true;
    } catch (e) { avisar(mensagemErro(e), 'erro'); return false; }
  }
  async function aprovarLote() {
    try {
      const r = await enviar({ acao: 'lote', itens: pendentes.map((p) => ({ post: p.id, versao: p.versao })) });
      await carregar();
      setLote(false);
      avisar(`${r.aprovados} publicaç${r.aprovados === 1 ? 'ão aprovada' : 'ões aprovadas'}${r.pulados ? `. ${r.pulados} mudou e precisa ser revista` : ''}`);
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
  }
  async function baixarPdf() {
    if (!dados) return;
    avisar('Gerando PDF…', 'info');
    try {
      const c = dados.cliente;
      const blob = await pdfAprovacao({
        perfil: { ...perfil(dados), avatarPath: c.avatar_path, destaquesPaths: c.destaques.map((d) => d.capa_path) },
        feed, itens: feed.filter((p) => p.tipo === 'planejado').map((p) => ({ ...p, numero: feed.indexOf(p) + 1 })),
        obterUrl: async (p) => urlDe(p), marca: { agencia: dados.agencia.nome }, cliente: c.nome, periodo: periodoTexto(planejados), proporcaoGrade: c.proporcao_grade,
      });
      baixar(blob, 'planejamento-de-conteudo.pdf');
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
  }

  const perfil = (d: Dados): PerfilVisual => ({
    nome: d.cliente.nome_perfil || d.cliente.nome, usuario: d.cliente.usuario_ig, categoria: d.cliente.categoria, bio: d.cliente.bio, link: d.cliente.link,
    avatarUrl: urlDe(d.cliente.avatar_path), posts: (d.cliente.posts_base || 0) + feed.filter((p) => p.tipo === 'planejado').length,
    seguidores: d.cliente.seguidores, seguindo: d.cliente.seguindo, destaques: d.cliente.destaques.map((x) => ({ titulo: x.titulo, url: urlDe(x.capa_path) })),
  });

  if (falha) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="text-[19px] font-semibold">{falha === 'rede' ? 'Sem conexão' : 'Link indisponível'}</div>
          <p className="mt-2 text-texto-2">{falha === 'rede' ? 'Confira sua internet e tente de novo.' : falha === 'muitas_tentativas' ? 'Muitas tentativas seguidas. Aguarde um minuto.' : 'Este link de revisão expirou ou foi desativado. Peça um novo link para a agência.'}</p>
          <button className="btn mt-4" onClick={() => carregar()}>Tentar de novo</button>
        </div>
      </main>
    );
  }
  if (!dados) return <Carregando texto="Abrindo seu planejamento…" />;

  const marcador = (p: PostCliente) => p.aprovacao === 'aprovado'
    ? <span className="absolute bottom-1.5 right-1.5 rounded-full bg-white p-0.5 text-sucesso shadow" title="Aprovado"><Check size={13} strokeWidth={3} /></span>
    : p.aprovacao === 'ajustes' ? <span className="absolute bottom-1.5 right-1.5 rounded-full bg-white p-0.5 text-atencao shadow" title="Alteração pedida"><PencilLine size={13} strokeWidth={2.5} /></span> : null;

  return (
    <main className="mx-auto min-h-dvh max-w-[560px] bg-fundo pb-28">
      <header className="px-4 pb-3 pt-6">
        <div className="text-[11.5px] font-bold uppercase tracking-wide text-principal">{dados.agencia.nome}</div>
        <h1 className="mt-1 text-[21px] font-semibold leading-tight">Olá! Seu planejamento de conteúdo está pronto para revisão.</h1>
        <p className="mt-1 text-[13.5px] text-texto-2">{dados.cliente.nome}{planejados.length ? ` · ${periodoTexto(planejados)}` : ''}</p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[[planejados.length, 'publicações', 'text-texto'], [conta('aguardando'), 'aguardando', 'text-atencao'], [conta('aprovado'), 'aprovadas', 'text-sucesso'], [conta('ajustes'), 'com ajuste', 'text-erro']].map(([n, l, c]) => (
            <div key={String(l)} className="rounded-xl bg-cartao py-2.5 shadow-leve"><div className={clsx('text-[19px] font-semibold', c as string)}>{n}</div><div className="text-[11px] text-texto-2">{l}</div></div>
          ))}
        </div>
        {planejados.length > 0 && pendentes.length === 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13.5px] text-emerald-900">
            <PartyPopper size={22} className="shrink-0" />
            <div><b>{tudoAprovado ? 'Planejamento aprovado! Todos os conteúdos foram revisados.' : 'Todos os conteúdos foram revisados!'}</b>{!tudoAprovado && <div className="text-[12.5px]">A agência já recebeu seus pedidos de alteração.</div>}</div>
          </div>
        )}
        {pendentes.length > 0 && <p className="mt-3 text-[13px] text-texto-2">Toque em uma publicação para ver em tamanho grande, ler a legenda e aprovar ou pedir alteração.</p>}
      </header>

      <div className="sticky top-0 z-20 mx-4 mb-3 grid grid-cols-2 gap-1 rounded-xl bg-suave p-1">
        {([['feed', 'Como vai ficar', Grid3x3], ['lista', 'Por data', List]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => setAba(k)} className={clsx('flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13.5px] font-medium', aba === k ? 'bg-cartao shadow-sm' : 'text-texto-2')}><I size={15} />{l}</button>
        ))}
      </div>

      {aba === 'feed' ? (
        <section className="overflow-hidden bg-white sm:mx-4 sm:rounded-2xl sm:border sm:border-borda">
          <Perfil p={perfil(dados)} />
          {stories.length > 0 && (
            <div className="sem-barra flex gap-2 overflow-x-auto border-b border-borda px-4 py-2 text-[12px] text-texto-2">
              <span className="shrink-0 self-center">Stories:</span>
              {stories.map((s) => <button key={s.id} onClick={() => setAberto(s.id)} className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md ring-2 ring-pink-400"><Miniatura midia={capaDoPost(s)} capa={s.capa} urlDe={urlDe} />{marcador(s)}</button>)}
            </div>
          )}
          <Grade posts={feed} urlDe={urlDe} proporcaoGrade={dados.cliente.proporcao_grade} aoAbrir={(p) => setAberto(p.id)} sobreposicao={(p) => marcador(p as PostCliente)} />
          <AvisoPrevia />
        </section>
      ) : (
        <section className="space-y-2 px-4">
          {[...planejados].sort((a, b) => a.publicar_em.localeCompare(b.publicar_em)).map((p) => {
            const st = APROVACAO[p.aprovacao];
            return (
              <button key={p.id} onClick={() => setAberto(p.id)} className="flex w-full items-center gap-3 rounded-xl bg-cartao p-2.5 text-left shadow-leve">
                <div className="h-[72px] w-[54px] shrink-0 overflow-hidden rounded-lg bg-suave"><Miniatura midia={capaDoPost(p)} capa={p.capa} urlDe={urlDe} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-texto-2">{diaLongo(p.publicar_em)} · {hora(p.publicar_em)}</div>
                  <div className="truncate text-[14px] font-medium">{p.legenda.split('\n')[0] || FORMATOS[p.formato]}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: st.cor }}><span className="h-2 w-2 rounded-full" style={{ background: st.cor }} />{p.aprovacao === 'aguardando' ? 'Aguardando você' : st.rotulo} · {FORMATOS[p.formato]}</div>
                </div>
                <ChevronRight size={18} className="text-texto-2" />
              </button>
            );
          })}
        </section>
      )}

      <div className="px-4 pt-4 text-center">
        <button className="inline-flex items-center gap-1.5 text-[13px] text-texto-2 underline" onClick={baixarPdf}><Download size={14} />Baixar o planejamento em PDF</button>
      </div>

      {/* barra fixa */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-cartao/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[560px] items-center gap-2">
          {pendentes.length ? (<>
            <div className="min-w-0 flex-1 text-[13px]"><b>{pendentes.length}</b> aguardando revisão</div>
            <button className="btn" onClick={() => setAberto(pendentes[0].id)}>Revisar próxima</button>
            <button className="btn-sucesso" onClick={() => garantirNome(() => setLote(true))}>Aprovar todas</button>
          </>) : (
            <div className="flex flex-1 items-center justify-center gap-2 py-1 text-[13.5px] font-medium text-sucesso"><CheckCircle2 size={18} />Revisão concluída. Obrigado!</div>
          )}
        </div>
      </div>

      {atual && <FolhaPost p={atual} urlDe={urlDe} aoFechar={() => setAberto(null)} garantirNome={garantirNome} decidir={decidir} comentar={comentar} pendentes={pendentes.length} />}

      <Modal aberto={!!pedirNome} aoFechar={() => setPedirNome(null)} titulo="Como podemos te chamar?" largura="max-w-sm"
        rodape={<button className="btn-principal w-full py-2.5" disabled={nome.trim().length < 2} onClick={() => { nomeRef.current = nome.trim(); try { localStorage.setItem(chaveNome, nome.trim()); } catch {} const f = pedirNome; setPedirNome(null); f?.(); }}>Continuar</button>}>
        <p className="mb-3 text-[13.5px] text-texto-2">Seu nome fica registrado junto com cada aprovação ou pedido de alteração.</p>
        <input className="campo py-3 text-[16px]" autoFocus placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Modal>

      <Modal aberto={lote} aoFechar={() => setLote(false)} titulo="Aprovar todas as publicações pendentes?" largura="max-w-md"
        rodape={<ConfirmarLote aoConfirmar={aprovarLote} aoCancelar={() => setLote(false)} />}>
        <p className="text-[13.5px] text-texto-2">{pendentes.length} publicaç{pendentes.length === 1 ? 'ão' : 'ões'} · {periodoTexto(pendentes)}. Publicações com alteração pedida não entram.</p>
        <div className="mt-3 space-y-1.5">
          {pendentes.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-lg bg-suave p-1.5 text-[13px]">
              <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-white"><Miniatura midia={capaDoPost(p)} capa={p.capa} urlDe={urlDe} /></div>
              <div className="min-w-0 flex-1"><div className="font-medium">{diaCurto(p.publicar_em)} às {hora(p.publicar_em)} · {FORMATOS[p.formato]}</div><div className="truncate text-texto-2">{p.legenda.split('\n')[0]}</div></div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-texto-2">Aprovando como <b>{nome}</b>.</p>
      </Modal>
    </main>
  );
}

function ConfirmarLote({ aoConfirmar, aoCancelar }: { aoConfirmar: () => Promise<void>; aoCancelar: () => void }) {
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={ok} onChange={(e) => setOk(e.target.checked)} />Revisei e aprovo exatamente o conteúdo apresentado (imagens, vídeos, capas e legendas).</label>
      <div className="flex gap-2"><button className="btn flex-1" onClick={aoCancelar}>Voltar</button>
        <button className="btn-sucesso flex-1 py-2.5" disabled={!ok || enviando} onClick={async () => { setEnviando(true); await aoConfirmar(); setEnviando(false); }}>{enviando ? 'Aprovando…' : 'Confirmar aprovação'}</button></div>
    </div>
  );
}

function FolhaPost({ p, urlDe, aoFechar, garantirNome, decidir, comentar, pendentes }: {
  p: PostCliente; urlDe: (x?: string | null) => string | null; aoFechar: () => void; garantirNome: (f: () => void) => void;
  decidir: (p: PostCliente, d: 'aprovado' | 'ajustes', c: string, m: number | null) => Promise<boolean>; comentar: (p: PostCliente, t: string, m: number | null, tr: string | null) => Promise<boolean>; pendentes: number;
}) {
  const [modo, setModo] = useState<null | 'ajuste' | 'comentario'>(null);
  const [texto, setTexto] = useState('');
  const [midia, setMidia] = useState<number | null>(null);
  const [indice, setIndice] = useState(0);
  const [trecho, setTrecho] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { setModo(null); setTexto(''); setMidia(null); setIndice(0); setTrecho(null); }, [p.id]);
  const st = APROVACAO[p.aprovacao];
  const podeDecidir = p.tipo === 'planejado' && (p.aprovacao !== 'aprovado' || p.publicacao === 'pendente');
  const ultima = p.decisoes[p.decisoes.length - 1];

  function selecionar() {
    const s = window.getSelection()?.toString().trim();
    if (s && s.length > 2) setTrecho(s.slice(0, 300));
  }
  async function confirmar() {
    setEnviando(true);
    const ok = modo === 'ajuste' ? await decidir(p, 'ajustes', texto, midia) : await comentar(p, texto, midia, trecho);
    setEnviando(false);
    if (ok) { setModo(null); setTexto(''); setTrecho(null); }
  }

  return (
    <Modal aberto aoFechar={aoFechar} semPadding largura="max-w-[560px]"
      titulo={<span className="text-[14px]">{diaCurto(p.publicar_em)} às {hora(p.publicar_em)} · {FORMATOS[p.formato]}</span>}
      rodape={podeDecidir ? (
        modo ? (
          <div className="space-y-2">
            {trecho && modo === 'comentario' && <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[12.5px]"><Quote size={13} className="mt-0.5 shrink-0" /><span className="line-clamp-2 italic">{trecho}</span><button className="ml-auto text-texto-2" onClick={() => setTrecho(null)}>×</button></div>}
            <textarea autoFocus className="campo min-h-[84px] text-[15px]" placeholder={modo === 'ajuste' ? 'O que precisa ser alterado? Ex.: trocar a foto, mudar o preço na legenda…' : 'Seu comentário'} value={texto} onChange={(e) => setTexto(e.target.value)} />
            {p.midias.length > 1 && (
              <select className="campo text-[14px]" value={midia ?? ''} onChange={(e) => setMidia(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">Sobre a publicação inteira</option>
                {p.midias.map((_, i) => <option key={i} value={i}>Sobre a imagem {i + 1}</option>)}
              </select>
            )}
            <div className="flex gap-2">
              <button className="btn flex-1 py-2.5" onClick={() => setModo(null)}>Voltar</button>
              <button className={clsx('flex-1 py-2.5', modo === 'ajuste' ? 'btn-principal' : 'btn-principal')} disabled={enviando || texto.trim().length < (modo === 'ajuste' ? 3 : 1)} onClick={() => garantirNome(confirmar)}>
                {enviando ? 'Enviando…' : modo === 'ajuste' ? 'Enviar pedido de alteração' : 'Enviar comentário'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {p.aprovacao !== 'aprovado' && (
              <button className="btn-sucesso w-full py-3 text-[15px]" disabled={enviando} onClick={() => garantirNome(async () => { setEnviando(true); await decidir(p, 'aprovado', '', null); setEnviando(false); })}>
                <Check size={18} />Aprovar publicação
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn py-2.5" onClick={() => { setModo('ajuste'); setMidia(p.midias.length > 1 ? indice : null); }}><PencilLine size={16} />Solicitar alteração</button>
              <button className="btn py-2.5" onClick={() => { setModo('comentario'); setMidia(p.midias.length > 1 ? indice : null); }}><MessageSquare size={16} />Comentar</button>
            </div>
            <p className="text-center text-[11.5px] text-texto-2">Ao aprovar, você aprova exatamente esta versão{p.versao ? ` (v${p.versao})` : ''}. {pendentes > 1 && p.aprovacao === 'aguardando' ? 'Depois abrimos a próxima pendente.' : ''}</p>
          </div>
        )
      ) : undefined}>
      <Visualizador midias={p.midias} urlDe={urlDe} formato={p.formato} aoMudar={setIndice} />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pilula" style={{ color: st.cor }}><span className="h-2 w-2 rounded-full" style={{ background: st.cor }} />{p.aprovacao === 'aguardando' ? 'Aguardando sua aprovação' : st.rotulo}</span>
          {p.publicacao === 'agendado' && <span className="pilula">Agendado</span>}
          <span className="text-[12px] text-texto-2">{diaLongo(p.publicar_em)}</span>
        </div>
        {ultima && <p className="text-[12.5px] text-texto-2">{ultima.acao === 'aprovado' ? 'Aprovado' : 'Alteração pedida'} por {ultima.revisor_nome} em {dataHora(ultima.criado_em)}{ultima.versao !== p.versao ? ` (versão ${ultima.versao}; esta é a versão ${p.versao})` : ''}.</p>}
        {p.legenda ? (
          <div>
            <div className="mb-1 text-[12px] font-medium text-texto-2">Legenda {podeDecidir && <span className="font-normal">· selecione um trecho para comentar sobre ele</span>}</div>
            <div className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed" onMouseUp={selecionar} onTouchEnd={() => setTimeout(selecionar, 50)}>{p.legenda}</div>
            {trecho && !modo && <button className="btn mt-2 py-1.5 text-[12.5px]" onClick={() => setModo('comentario')}><Quote size={13} />Comentar este trecho</button>}
          </div>
        ) : <p className="text-[13px] text-texto-2">Sem legenda.</p>}
        {p.comentarios.length > 0 && (
          <div className="space-y-2 border-t border-borda pt-3">
            <div className="text-[12px] font-medium text-texto-2">Conversa</div>
            {p.comentarios.map((c) => (
              <div key={c.id} className={clsx('rounded-xl p-2.5 text-[13.5px]', c.autor_tipo === 'cliente' ? 'ml-6 bg-principal-suave' : 'mr-6 bg-suave')}>
                <div className="mb-0.5 text-[11.5px] text-texto-2"><b className="text-texto">{c.autor_nome}</b> · {dataHora(c.criado_em)}{c.midia_indice !== null ? ` · imagem ${c.midia_indice + 1}` : ''}{c.resolvido ? ' · resolvido' : ''}</div>
                {c.trecho_legenda && <div className="mb-1 border-l-2 border-amber-400 pl-2 text-[12px] italic text-texto-2">“{c.trecho_legenda}”</div>}
                <div className="whitespace-pre-wrap">{c.texto}</div>
              </div>
            ))}
          </div>
        )}
        {p.tipo === 'existente' && <p className="text-[12.5px] text-texto-2">Esta publicação já está no seu perfil. Ela aparece aqui só para você ver a sequência do feed.</p>}
        {chaveDia(p.publicar_em) < chaveDia(new Date()) && p.tipo === 'planejado' && p.aprovacao === 'aguardando' && <p className="text-[12.5px] text-atencao">A data programada já passou. A agência vai combinar uma nova data com você.</p>}
      </div>
    </Modal>
  );
}
