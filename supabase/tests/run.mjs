// Testes de aceite do banco do Planejador, rodando a migration num Postgres real.
// Uso: npm run test:db
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, readdirSync, mkdtempSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const PORTA = 56329 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(process.env.PGTEST_DIR || tmpdir(), 'planejador-pg-'));
chmodSync(dir, 0o777);
const banco = new EmbeddedPostgres({
  databaseDir: join(dir, 'data'), user: 'postgres', password: 'postgres', port: PORTA, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--no-locale'], onLog: () => {}, onError: () => {},
});

let falhas = 0;
const resultados = [];
async function teste(nome, fn) {
  try { await fn(); resultados.push(`  ok   ${nome}`); }
  catch (e) { falhas++; resultados.push(`  FALHOU ${nome}\n         ${e.message}`); }
}
const afirmar = (c, m) => { if (!c) throw new Error(m); };
async function esperarErro(p, trecho) {
  try { await p; } catch (e) {
    if (trecho && !String(e.message).includes(trecho)) throw new Error(`erro inesperado: ${e.message}`);
    return e;
  }
  throw new Error(`deveria ter dado erro${trecho ? ` (${trecho})` : ''}`);
}

async function principal() {
  await banco.initialise();
  await banco.start();
  const db = new pg.Client({ host: 'localhost', port: PORTA, user: 'postgres', password: 'postgres', database: 'postgres' });
  await db.connect();
  await db.query(readFileSync(join(aqui, 'supabase-shim.sql'), 'utf8'));
  for (const m of readdirSync(join(raiz, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(raiz, 'migrations', m), 'utf8'));
  }
  // roda a migration duas vezes: precisa ser reexecutável sem estragar nada
  for (const m of readdirSync(join(raiz, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(raiz, 'migrations', m), 'utf8'));
  }

  async function como(quem, fn) {
    await db.query('begin');
    try {
      if (quem === 'anon') await db.query('set local role anon');
      else if (quem === 'servico') await db.query('set local role service_role');
      else {
        await db.query('set local role authenticated');
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: quem, role: 'authenticated' })]);
      }
      const r = await fn((sql, params) => db.query(sql, params));
      await db.query('commit');
      return r;
    } catch (e) {
      await db.query('rollback').catch(() => {});
      throw e;
    }
  }
  const um = async (q, sql, p) => (await q(sql, p)).rows[0];

  const T = (await db.query(`insert into auth.users (email) values ('thassia@teste.com') returning id`)).rows[0].id;
  const COL = (await db.query(`insert into auth.users (email) values ('colab@teste.com') returning id`)).rows[0].id;
  const X = (await db.query(`insert into auth.users (email) values ('outra@agencia.com') returning id`)).rows[0].id;

  let ag, agX, cli, cliX, post, post2;
  const midia = JSON.stringify([{ path: 'a/b/1.jpg', tipo: 'imagem' }]);

  console.log('Agências e isolamento');
  await teste('cria agência e vira admin', async () => {
    ag = await como(T, async (q) => (await um(q, `select public.criar_agencia('Descomplica Digital', 'Thássia') id`)).id);
    agX = await como(X, async (q) => (await um(q, `select public.criar_agencia('Outra Agência') id`)).id);
    const m = await como(T, (q) => um(q, `select papel from public.membros where usuario_id = $1`, [T]));
    afirmar(m.papel === 'admin', 'deveria ser admin');
    await esperarErro(como(T, (q) => q(`select public.criar_agencia('Segunda')`)), 'ja_tem_agencia');
  });

  await teste('colaborador adicionado pelo servidor enxerga a agência', async () => {
    await como('servico', (q) => q(`select public.adicionar_membro($1, $2, 'colaborador', 'colab@teste.com', 'Colab')`, [ag, COL]));
    const r = await como(COL, (q) => q(`select id from public.agencias`));
    afirmar(r.rows.length === 1 && r.rows[0].id === ag, 'colaborador deveria ver só a agência dele');
  });

  await teste('agência não vê nem mexe em cliente de outra', async () => {
    cli = await como(T, async (q) => (await um(q, `insert into public.clientes (agencia_id, nome, usuario_ig, bio) values ($1, 'Clínica Bella', 'clinicabella', 'Bio') returning id`, [ag])).id);
    cliX = await como(X, async (q) => (await um(q, `insert into public.clientes (agencia_id, nome) values ($1, 'Cliente X') returning id`, [agX])).id);
    const v = await como(X, (q) => q(`select id from public.clientes`));
    afirmar(v.rows.length === 1 && v.rows[0].id === cliX, 'vazou cliente de outra agência');
    const u = await como(X, (q) => q(`update public.clientes set nome = 'hack' where id = $1`, [cli]));
    afirmar(u.rowCount === 0, 'conseguiu editar cliente alheio');
    await esperarErro(como(X, (q) => q(`insert into public.clientes (agencia_id, nome) values ($1, 'intruso')`, [ag])), 'row-level security');
  });

  await teste('post sempre herda a agência do cliente (não dá para injetar)', async () => {
    await esperarErro(como(X, (q) => q(`insert into public.posts (agencia_id, cliente_id, publicar_em) values ($1, $2, now())`, [agX, cli])), 'row-level security');
    post = await como(T, async (q) => (await um(q, `insert into public.posts (agencia_id, cliente_id, publicar_em, legenda, midias) values ($1, $2, now() + interval '3 days', 'Legenda v1', $3) returning id, agencia_id`, [agX, cli, midia])));
    afirmar(post.agencia_id === ag, 'agencia_id deveria vir do cliente');
    post = post.id;
  });

  await teste('bio acima de 150 caracteres é recusada', async () => {
    await esperarErro(como(T, (q) => q(`update public.clientes set bio = repeat('a', 151) where id = $1`, [cli])), 'check');
  });

  await teste('anônimo não lê nada', async () => {
    await esperarErro(como('anon', (q) => q(`select * from public.posts`)), 'permission denied');
    await esperarErro(como('anon', (q) => q(`select public.revisao_dados('x')`)), 'permission denied');
  });

  console.log('Aprovação e versões');
  await teste('agência não consegue marcar aprovado direto na tabela', async () => {
    await esperarErro(como(T, (q) => q(`update public.posts set aprovacao = 'aprovado' where id = $1`, [post])), 'permission denied');
    await esperarErro(como(T, (q) => q(`update public.posts set versao_atual = 5 where id = $1`, [post])), 'permission denied');
  });

  await teste('não agenda conteúdo sem aprovação', async () => {
    await esperarErro(como(T, (q) => q(`update public.posts set publicacao = 'agendado' where id = $1`, [post])), 'so_aprovado_pode_ser_agendado');
  });

  await teste('enviar para aprovação cria a versão 1 imutável', async () => {
    const n = await como(T, async (q) => (await um(q, `select public.enviar_para_aprovacao(array[$1]::uuid[]) n`, [post])).n);
    afirmar(n === 1, 'deveria enviar 1');
    const p = await como(T, (q) => um(q, `select aprovacao, versao_atual from public.posts where id = $1`, [post]));
    afirmar(p.aprovacao === 'aguardando' && p.versao_atual === 1, JSON.stringify(p));
    await esperarErro(como('servico', (q) => q(`update public.post_versoes set conteudo = '{}' where post_id = $1`, [post])), 'registro_imutavel');
  });

  await teste('post sem mídia não vai para aprovação', async () => {
    post2 = await como(T, async (q) => (await um(q, `insert into public.posts (agencia_id, cliente_id, publicar_em) values ($1, $2, now() + interval '5 days') returning id`, [ag, cli])).id);
    await esperarErro(como(T, (q) => q(`select public.enviar_para_aprovacao(array[$1]::uuid[])`, [post2])), 'post_sem_midia');
  });

  let token, tokenX;
  await teste('link de revisão: token só aparece uma vez e só o hash fica gravado', async () => {
    token = await como(T, async (q) => (await um(q, `select public.criar_link_revisao($1, 'Novembro', 30) t`, [cli])).t);
    tokenX = await como(X, async (q) => (await um(q, `select public.criar_link_revisao($1, '', 30) t`, [cliX])).t);
    afirmar(token.length === 64, 'token curto');
    const l = await como(T, (q) => um(q, `select token_hash from public.links_revisao where cliente_id = $1`, [cli]));
    afirmar(l.token_hash !== token && l.token_hash.length === 64, 'token gravado em claro');
    await esperarErro(como(X, (q) => q(`select public.criar_link_revisao($1)`, [cli])), 'sem_permissao');
  });

  await teste('portal mostra só o que foi enviado, sem rascunho nem nota interna', async () => {
    await como(T, (q) => q(`update public.posts set notas_internas = 'segredo' where id = $1`, [post2]));
    await como(T, (q) => q(`insert into public.comentarios (agencia_id, cliente_id, post_id, autor_tipo, texto, interno) values ($1, $2, $3, 'agencia', 'nota interna', true)`, [ag, cli, post]));
    const d = await como('servico', async (q) => (await um(q, `select public.revisao_dados($1) d`, [token])).d);
    afirmar(d.posts.length === 1 && d.posts[0].id === post, `posts: ${d.posts.length}`);
    afirmar(!JSON.stringify(d).includes('segredo') && !JSON.stringify(d).includes('nota interna'), 'vazou informação interna');
    afirmar(d.posts[0].legenda === 'Legenda v1' && d.posts[0].versao === 1, 'deveria mostrar a versão enviada');
    afirmar(d.prefixo === `${ag}/${cli}/`, 'prefixo errado');
  });

  await teste('token de um cliente não decide post de outro', async () => {
    await esperarErro(como('servico', (q) => q(`select public.revisao_decidir($1, $2, 1, 'aprovado', 'Fulano')`, [tokenX, post])), 'post_invalido');
  });

  await teste('aprovação forjada: versão errada, nome vazio e ajuste sem descrição são recusados', async () => {
    await esperarErro(como('servico', (q) => q(`select public.revisao_decidir($1, $2, 2, 'aprovado', 'Ana')`, [token, post])), 'versao_desatualizada');
    await esperarErro(como('servico', (q) => q(`select public.revisao_decidir($1, $2, 1, 'aprovado', ' ')`, [token, post])), 'informe_seu_nome');
    await esperarErro(como('servico', (q) => q(`select public.revisao_decidir($1, $2, 1, 'ajustes', 'Ana', '')`, [token, post])), 'descreva_o_ajuste');
    await esperarErro(como('servico', (q) => q(`select public.revisao_decidir($1, $2, 1, 'publicado', 'Ana')`, [token, post])), 'acao_invalida');
  });

  await teste('cliente pede ajuste, agência corrige, reenvia v2 e cliente aprova a v2', async () => {
    await como('servico', (q) => q(`select public.revisao_decidir($1, $2, 1, 'ajustes', 'Ana', 'Trocar a foto', 0)`, [token, post]));
    let p = await como(T, (q) => um(q, `select aprovacao from public.posts where id = $1`, [post]));
    afirmar(p.aprovacao === 'ajustes', p.aprovacao);
    await como(T, (q) => q(`update public.posts set legenda = 'Legenda v2' where id = $1`, [post]));
    await como(T, (q) => q(`select public.enviar_para_aprovacao(array[$1]::uuid[])`, [post]));
    const r = await como('servico', async (q) => (await um(q, `select public.revisao_decidir($1, $2, 2, 'aprovado', 'Ana') r`, [token, post])).r);
    p = await como(T, (q) => um(q, `select aprovacao, versao_aprovada from public.posts where id = $1`, [post]));
    afirmar(p.aprovacao === 'aprovado' && p.versao_aprovada === 2, JSON.stringify(p));
    afirmar(r.concluiu === true, 'deveria concluir a revisão');
    const dec = await como(T, (q) => q(`select versao, acao from public.decisoes where post_id = $1 order by criado_em`, [post]));
    afirmar(dec.rows.length === 2 && dec.rows[0].versao === 1 && dec.rows[1].versao === 2, 'histórico de decisões incompleto');
    const n = await como(T, (q) => q(`select tipo from public.notificacoes where cliente_id = $1`, [cli]));
    afirmar(n.rows.some((x) => x.tipo === 'revisao_concluida'), 'faltou notificação de conclusão');
  });

  await teste('editar conteúdo aprovado invalida a aprovação, sem apagar histórico', async () => {
    await como(T, (q) => q(`update public.posts set publicacao = 'agendado' where id = $1`, [post]));
    await como(T, (q) => q(`update public.posts set legenda = 'Legenda v3' where id = $1`, [post]));
    const p = await como(T, (q) => um(q, `select aprovacao, publicacao, versao_aprovada from public.posts where id = $1`, [post]));
    afirmar(p.aprovacao === 'rascunho' && p.publicacao === 'pendente' && p.versao_aprovada === 2, JSON.stringify(p));
    const v = await como(T, (q) => q(`select versao from public.post_versoes where post_id = $1`, [post]));
    afirmar(v.rows.length === 2, 'versões antigas sumiram');
  });

  await teste('mudar só a data do aprovado é administrativo (com a regra padrão)', async () => {
    await como(T, (q) => q(`select public.enviar_para_aprovacao(array[$1]::uuid[])`, [post]));
    await como('servico', (q) => q(`select public.revisao_decidir($1, $2, 3, 'aprovado', 'Ana')`, [token, post]));
    await como(T, (q) => q(`update public.posts set publicar_em = publicar_em + interval '1 day' where id = $1`, [post]));
    const p = await como(T, (q) => um(q, `select aprovacao, data_alterada_apos_aprovacao from public.posts where id = $1`, [post]));
    afirmar(p.aprovacao === 'aprovado' && p.data_alterada_apos_aprovacao === true, JSON.stringify(p));
    await como(T, (q) => q(`update public.agencias set reaprovar_ao_mudar_data = true where id = $1`, [ag]));
    await como(T, (q) => q(`update public.posts set publicar_em = publicar_em + interval '1 day' where id = $1`, [post]));
    const p2 = await como(T, (q) => um(q, `select aprovacao from public.posts where id = $1`, [post]));
    afirmar(p2.aprovacao === 'rascunho', 'com a regra ligada deveria pedir nova aprovação');
    await como(T, (q) => q(`update public.agencias set reaprovar_ao_mudar_data = false where id = $1`, [ag]));
  });

  await teste('aprovação em lote não pega post com ajuste pedido', async () => {
    await como(T, (q) => q(`update public.posts set midias = $2 where id = $1`, [post2, midia]));
    await como(T, (q) => q(`select public.enviar_para_aprovacao(array[$1, $2]::uuid[])`, [post, post2]));
    await como('servico', (q) => q(`select public.revisao_decidir($1, $2, 4, 'ajustes', 'Ana', 'Mudar o título')`, [token, post]));
    const r = await como('servico', async (q) => (await um(q, `select public.revisao_aprovar_lote($1, $2::jsonb, 'Ana') r`,
      [token, JSON.stringify([{ post_id: post, versao: 4 }, { post_id: post2, versao: 1 }])])).r);
    afirmar(r.aprovados === 1 && r.pulados === 1, JSON.stringify(r));
    const p = await como(T, (q) => um(q, `select aprovacao from public.posts where id = $1`, [post]));
    afirmar(p.aprovacao === 'ajustes', 'lote aprovou post com ajuste');
  });

  await teste('comentário do cliente sem mudar status, com imagem do carrossel', async () => {
    await como('servico', (q) => q(`select public.revisao_comentar($1, $2, 'Ana', 'Gostei da segunda foto', 1)`, [token, post2]));
    const c = await como(T, (q) => um(q, `select autor_tipo, midia_indice from public.comentarios where post_id = $1 and autor_tipo = 'cliente'`, [post2]));
    afirmar(c.autor_tipo === 'cliente' && c.midia_indice === 1, JSON.stringify(c));
    await esperarErro(como(T, (q) => q(`update public.comentarios set texto = 'alterado' where post_id = $1`, [post2])), 'permission denied');
  });

  await teste('agência não consegue se passar pelo cliente num comentário', async () => {
    await como(T, (q) => q(`insert into public.comentarios (agencia_id, cliente_id, post_id, autor_tipo, autor_nome, texto) values ($1, $2, $3, 'cliente', 'Ana', 'falso')`, [ag, cli, post2]));
    const c = await como(T, (q) => um(q, `select autor_tipo, autor_nome from public.comentarios where texto = 'falso'`));
    afirmar(c.autor_tipo === 'agencia' && c.autor_nome === 'Thássia', JSON.stringify(c));
  });

  await teste('link revogado e link expirado deixam de funcionar', async () => {
    const link = await como(T, (q) => um(q, `select id from public.links_revisao where cliente_id = $1`, [cli]));
    await como(T, (q) => q(`select public.revogar_link($1)`, [link.id]));
    await esperarErro(como('servico', (q) => q(`select public.revisao_dados($1)`, [token])), 'link_invalido');
    const t2 = await como(T, async (q) => (await um(q, `select public.criar_link_revisao($1, '', 1) t`, [cli])).t);
    await db.query(`update public.links_revisao set expira_em = now() - interval '1 minute' where token_hash = public.hash_token($1)`, [t2]);
    await esperarErro(como('servico', (q) => q(`select public.revisao_dados($1)`, [t2])), 'link_invalido');
    await esperarErro(como('servico', (q) => q(`select public.revisao_dados('token-inventado')`)), 'link_invalido');
  });

  await teste('posts existentes entram no feed do cliente e nunca na aprovação', async () => {
    const e = await como(T, async (q) => (await um(q, `insert into public.posts (agencia_id, cliente_id, tipo, publicar_em, midias, publicacao) values ($1, $2, 'existente', now() - interval '10 days', $3, 'pendente') returning id, publicacao`, [ag, cli, midia])));
    afirmar(e.publicacao === 'publicado', 'existente deveria nascer publicado');
    await esperarErro(como(T, (q) => q(`update public.posts set tipo = 'planejado' where id = $1`, [e.id])), 'permission denied');
    const t3 = await como(T, async (q) => (await um(q, `select public.criar_link_revisao($1) t`, [cli])).t);
    const d = await como('servico', async (q) => (await um(q, `select public.revisao_dados($1) d`, [t3])).d);
    afirmar(d.posts.some((p) => p.id === e.id && p.aprovacao === 'publicado'), 'existente não aparece');
    await esperarErro(como('servico', (q) => q(`select public.revisao_decidir($1, $2, 0, 'aprovado', 'Ana')`, [t3, e.id])), 'post_invalido');
  });

  await teste('lixeira e duplicação', async () => {
    await como(T, (q) => q(`update public.posts set excluido_em = now() where id = $1`, [post2]));
    const d = await como(T, async (q) => (await um(q, `select public.duplicar_post($1, now() + interval '20 days') id`, [post])).id);
    const p = await como(T, (q) => um(q, `select aprovacao, versao_atual, legenda from public.posts where id = $1`, [d]));
    afirmar(p.aprovacao === 'rascunho' && p.versao_atual === 0, 'cópia deveria nascer rascunho');
    const n = await como(T, async (q) => (await um(q, `select public.duplicar_periodo($1, current_date - 30, current_date + 30, current_date + 60) n`, [cli])).n);
    afirmar(n >= 2, `duplicou ${n}`);
    await esperarErro(como(X, (q) => q(`select public.duplicar_post($1, now())`, [post])), 'sem_permissao');
  });

  await teste('auditoria registra as ações do cliente e da agência', async () => {
    const a = await como(T, (q) => q(`select acao from public.auditoria where cliente_id = $1`, [cli]));
    const acoes = new Set(a.rows.map((r) => r.acao));
    for (const x of ['enviado_para_aprovacao', 'decisao_ajustes', 'decisao_aprovado', 'aprovacao_invalidada', 'link_revogado', 'enviado_lixeira'])
      afirmar(acoes.has(x), `faltou ${x}`);
    const ax = await como(X, (q) => q(`select * from public.auditoria where cliente_id = $1`, [cli]));
    afirmar(ax.rows.length === 0, 'auditoria vazou para outra agência');
  });

  await db.end();
  await banco.stop();
  console.log(resultados.join('\n'));
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exit(falhas ? 1 : 0);
}

principal().catch(async (e) => {
  console.error(e);
  try { await banco.stop(); } catch {}
  process.exit(1);
});
