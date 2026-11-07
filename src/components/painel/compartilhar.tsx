'use client';
import { Copy, Link2, MessageCircle, Send, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal, avisar } from '@/components/ui';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { mensagemErro } from '@/lib/erros';
import { dataHora, periodoTexto } from '@/lib/datas';
import type { Cliente, Post } from '@/lib/tipos';

type Link = { id: string; rotulo: string; token_hash: string; expira_em: string | null; revogado_em: string | null; ultimo_acesso_em: string | null; criado_em: string };

async function sha256(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// o token só existe em claro no momento da criação; guardamos neste aparelho para poder copiar de novo
const LS = 'links-revisao';
const lerTokens = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
const guardarToken = (hash: string, token: string) => { try { localStorage.setItem(LS, JSON.stringify({ ...lerTokens(), [hash]: token })); } catch {} };

export function soDigitos(t: string) {
  const d = t.replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 11 ? `55${d}` : d;
}

export function Compartilhar({ aberto, cliente, posts, aoFechar, aoMudar }: { aberto: boolean; cliente: Cliente; posts: Post[]; aoFechar: () => void; aoMudar: () => void }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [rotulo, setRotulo] = useState('');
  const [dias, setDias] = useState(30);
  const [novo, setNovo] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const base = process.env.NEXT_PUBLIC_SITE_URL || (typeof location !== 'undefined' ? location.origin : '');

  const planejados = posts.filter((p) => p.tipo === 'planejado' && p.publicacao !== 'cancelado' && p.formato);
  const rascunhos = planejados.filter((p) => p.aprovacao === 'rascunho' && p.midias.length && new Date(p.publicar_em) > new Date());
  const visiveis = planejados.filter((p) => ['aguardando', 'ajustes', 'aprovado'].includes(p.aprovacao));
  const aguardando = planejados.filter((p) => p.aprovacao === 'aguardando').length;

  async function carregar() {
    const { data } = await supabaseNavegador().from('links_revisao').select('*').eq('cliente_id', cliente.id).order('criado_em', { ascending: false });
    setLinks(data || []);
    setTokens(lerTokens());
  }
  useEffect(() => { if (aberto) { setNovo(null); setRotulo(''); carregar(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  async function enviarRascunhos() {
    const { data, error } = await supabaseNavegador().rpc('enviar_para_aprovacao', { p_posts: rascunhos.map((p) => p.id) });
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar(`${data} post(s) enviados para aprovação`);
    aoMudar();
  }
  async function criar() {
    const { data, error } = await supabaseNavegador().rpc('criar_link_revisao', { p_cliente: cliente.id, p_rotulo: rotulo, p_dias: dias });
    if (error) return avisar(mensagemErro(error), 'erro');
    const token = data as string;
    guardarToken(await sha256(token), token);
    setNovo(`${base}/r/${token}`);
    carregar();
  }
  async function revogar(id: string) {
    const { error } = await supabaseNavegador().rpc('revogar_link', { p_link: id });
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar('Link desativado');
    carregar();
  }
  const mensagem = (url: string) => {
    const periodo = periodoTexto(visiveis.length ? visiveis : planejados);
    return `Olá${cliente.nome ? `, ${cliente.nome}` : ''}! 😊\n\nSeu planejamento de conteúdo${periodo ? ` de ${periodo}` : ''} está pronto para revisão: ${visiveis.length} publicaç${visiveis.length === 1 ? 'ão' : 'ões'}${aguardando ? `, ${aguardando} aguardando sua aprovação` : ''}.\n\nÉ só abrir o link, ver como o seu Instagram vai ficar e tocar em cada post para aprovar ou pedir ajuste:\n${url}`;
  };
  const whatsapp = (url: string) => {
    const n = soDigitos(cliente.whatsapp);
    return `https://wa.me/${n}?text=${encodeURIComponent(mensagem(url))}`;
  };
  const copiar = async (t: string, ok: string) => { try { await navigator.clipboard.writeText(t); avisar(ok); } catch { avisar('Não consegui copiar. Selecione e copie manualmente.', 'erro'); } };

  const ativos = links.filter((l) => !l.revogado_em && (!l.expira_em || new Date(l.expira_em) > new Date()));
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Compartilhar para aprovação" largura="max-w-xl">
      {rascunhos.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px]">
          <b>{rascunhos.length} post(s) futuros ainda estão em rascunho</b> e não aparecem para o cliente.
          <button className="btn mt-2 w-full" onClick={enviarRascunhos}><Send size={14} />Enviar todos para aprovação agora</button>
        </div>
      )}
      <p className="mb-3 text-[13px] text-texto-2">O cliente verá {visiveis.length} post(s) enviados + os posts já publicados que você cadastrou. Rascunhos e observações internas nunca aparecem.</p>
      {novo ? (
        <div className="space-y-3 rounded-lg border border-principal/30 bg-principal-suave/50 p-4">
          <div className="text-[13px] font-semibold">Link criado</div>
          <div className="break-all rounded bg-cartao p-2 text-[12.5px]">{novo}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <a className="btn border-whatsapp bg-whatsapp text-[#073b2a] hover:bg-whatsapp" href={whatsapp(novo)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Enviar no WhatsApp</a>
            <button className="btn" onClick={() => copiar(mensagem(novo), 'Mensagem e link copiados')}><Copy size={15} />Copiar mensagem</button>
          </div>
          {!cliente.whatsapp && <p className="text-[12px] text-texto-2">Sem WhatsApp cadastrado no perfil do cliente: o WhatsApp vai abrir para você escolher o contato.</p>}
          <p className="text-[12px] text-texto-2">O WhatsApp abre com a mensagem pronta; o envio é confirmado por você no aplicativo.</p>
        </div>
      ) : (
        <div className="grid gap-3 rounded-lg border border-borda p-4 sm:grid-cols-[1fr_150px]">
          <div><label className="rotulo">Nome do link (opcional)</label><input className="campo" placeholder="Ex.: Dezembro" value={rotulo} onChange={(e) => setRotulo(e.target.value)} /></div>
          <div><label className="rotulo">Válido por</label>
            <select className="campo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}
              <option value={0}>Sem expiração</option>
            </select></div>
          <button className="btn-principal sm:col-span-2" onClick={criar}><Link2 size={16} />Gerar link seguro</button>
        </div>
      )}
      <div className="mt-5">
        <div className="mb-2 text-[13px] font-semibold">Links deste cliente</div>
        {!links.length && <p className="text-[13px] text-texto-2">Nenhum link ainda.</p>}
        <div className="space-y-2">
          {links.map((l) => {
            const ativo = ativos.includes(l);
            const t = tokens[l.token_hash];
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-borda p-2.5 text-[12.5px]">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.rotulo || 'Link de revisão'} {!ativo && <span className="pilula ml-1 py-0 text-erro">{l.revogado_em ? 'desativado' : 'expirado'}</span>}</div>
                  <div className="text-texto-2">criado {dataHora(l.criado_em)} · {l.expira_em ? `expira ${dataHora(l.expira_em)}` : 'sem expiração'} · {l.ultimo_acesso_em ? `último acesso ${dataHora(l.ultimo_acesso_em)}` : 'ainda não aberto'}</div>
                </div>
                {ativo && t && <a className="btn-icone" title="Enviar no WhatsApp" href={whatsapp(`${base}/r/${t}`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /></a>}
                {ativo && t && <button className="btn-icone" title="Copiar link" onClick={() => copiar(`${base}/r/${t}`, 'Link copiado')}><Copy size={15} /></button>}
                {ativo && <button className="btn-icone text-erro" title="Desativar link" onClick={() => revogar(l.id)}><ShieldOff size={15} /></button>}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-texto-2">Por segurança, o link completo só fica disponível no aparelho em que foi criado. Em outro aparelho, gere um novo.</p>
      </div>
    </Modal>
  );
}
