import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/servidor';

// Portal do cliente. O token é validado no banco a cada chamada (revogado e expirado deixam de funcionar na hora).
// O cliente nunca escolhe cliente, agência ou status: só o post, a versão que viu e a decisão.

export const dynamic = 'force-dynamic';
const TOKEN = /^[a-f0-9]{64}$/;
const janela = new Map<string, { n: number; ate: number }>();
function limitar(chave: string, max: number) {
  const agora = Date.now();
  const j = janela.get(chave);
  if (!j || j.ate < agora) { janela.set(chave, { n: 1, ate: agora + 60_000 }); return false; }
  j.n++;
  return j.n > max;
}
const ip = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
const erro = (codigo: string, status = 400) => NextResponse.json({ erro: codigo }, { status, headers: { 'Cache-Control': 'no-store' } });
function codigoDe(msg: string) {
  const m = msg.match(/(link_invalido|versao_desatualizada|informe_seu_nome|descreva_o_ajuste|post_invalido|post_nao_esta_em_aprovacao|post_ja_agendado|comentario_vazio|lista_invalida|acao_invalida)/);
  return m ? m[1] : 'falha';
}

type Dados = { prefixo: string; cliente: { avatar_path: string | null; destaques: { capa_path?: string | null }[] }; posts: { midias: { path: string }[]; capa: { path?: string } }[] };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return erro('link_invalido', 404);
  if (limitar(`g:${ip(req)}`, 120)) return erro('muitas_tentativas', 429);
  const adm = supabaseAdmin();
  const { data, error } = await adm.rpc('revisao_dados', { p_token: token });
  if (error) return erro(codigoDe(error.message), codigoDe(error.message) === 'link_invalido' ? 404 : 500);
  const d = data as Dados;
  // só assina arquivos da pasta deste cliente
  const paths = new Set<string>();
  const add = (p?: string | null) => p && p.startsWith(d.prefixo) && paths.add(p);
  add(d.cliente.avatar_path);
  d.cliente.destaques?.forEach((x) => add(x.capa_path));
  d.posts.forEach((p) => { p.midias?.forEach((m) => add(m.path)); add(p.capa?.path); });
  const urls: Record<string, string> = {};
  if (paths.size) {
    const { data: assinadas } = await adm.storage.from('midias').createSignedUrls([...paths], 7200);
    assinadas?.forEach((a) => { if (a.path && a.signedUrl) urls[a.path] = a.signedUrl; });
  }
  const { prefixo: _p, ...publico } = d as Dados & Record<string, unknown>;
  void _p;
  return NextResponse.json({ ...publico, urls }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return erro('link_invalido', 404);
  if (limitar(`p:${ip(req)}:${token.slice(0, 8)}`, 60)) return erro('muitas_tentativas', 429);
  const c = await req.json().catch(() => null);
  if (!c || typeof c !== 'object') return erro('pedido_invalido');
  const nome = String(c.nome || '').slice(0, 80);
  const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const adm = supabaseAdmin();
  let r;
  if (c.acao === 'decidir') {
    if (!uuid(c.post) || !Number.isInteger(c.versao)) return erro('pedido_invalido');
    r = await adm.rpc('revisao_decidir', {
      p_token: token, p_post: c.post, p_versao: c.versao, p_acao: c.decisao, p_nome: nome,
      p_comentario: String(c.comentario || '').slice(0, 2000), p_midia_indice: Number.isInteger(c.midia) ? c.midia : null,
    });
  } else if (c.acao === 'lote') {
    if (!Array.isArray(c.itens) || c.itens.length > 200) return erro('lista_invalida');
    const itens = c.itens.filter((i: { post: unknown; versao: unknown }) => uuid(i?.post) && Number.isInteger(i?.versao)).map((i: { post: string; versao: number }) => ({ post_id: i.post, versao: i.versao }));
    r = await adm.rpc('revisao_aprovar_lote', { p_token: token, p_itens: itens, p_nome: nome });
  } else if (c.acao === 'comentar') {
    if (!uuid(c.post)) return erro('pedido_invalido');
    r = await adm.rpc('revisao_comentar', {
      p_token: token, p_post: c.post, p_nome: nome, p_texto: String(c.texto || '').slice(0, 2000),
      p_midia_indice: Number.isInteger(c.midia) ? c.midia : null, p_trecho: c.trecho ? String(c.trecho).slice(0, 300) : null,
      p_tempo: typeof c.tempo === 'number' && isFinite(c.tempo) ? c.tempo : null,
    });
  } else return erro('acao_invalida');
  if (r.error) return erro(codigoDe(r.error.message), codigoDe(r.error.message) === 'link_invalido' ? 404 : 400);
  return NextResponse.json({ ok: true, resultado: r.data }, { headers: { 'Cache-Control': 'no-store' } });
}
