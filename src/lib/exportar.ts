'use client';
// Exportações para WhatsApp: imagem do feed, PDF de aprovação e comprovante.
// Tudo é desenhado no navegador, com as mesmas regras de ordem e filtro da prévia.
import { capaDoPost, proporcao } from './feed';
import { APROVACAO, FORMATOS, type Capa, type PostVisual } from './tipos';
import { dataHora, diaCurto, hora } from './datas';
import type { PerfilVisual } from '@/components/instagram';

type ObterUrl = (path?: string | null) => Promise<string | null>;
export type Marca = { agencia: string; contato?: string; cor?: string };
const AZUL = '#1B52F7';
const FONTE = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

async function carregarImagem(url: string | null): Promise<HTMLImageElement | HTMLVideoElement | null> {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const obj = URL.createObjectURL(blob);
    if (blob.type.startsWith('video')) {
      return await new Promise((r) => {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto';
        const fim = setTimeout(() => r(null), 10000);
        v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
        v.onseeked = () => { clearTimeout(fim); r(v); };
        v.onerror = () => { clearTimeout(fim); r(null); };
        v.src = obj;
      });
    }
    return await new Promise((r) => {
      const i = new Image();
      i.onload = () => r(i);
      i.onerror = () => r(null);
      i.src = obj;
    });
  } catch {
    return null;
  }
}

function cobrir(ctx: CanvasRenderingContext2D, el: CanvasImageSource & { videoWidth?: number; naturalWidth?: number; videoHeight?: number; naturalHeight?: number }, x: number, y: number, w: number, h: number, capa?: Capa) {
  const iw = el.videoWidth || el.naturalWidth || 0, ih = el.videoHeight || el.naturalHeight || 0;
  if (!iw || !ih) return;
  const zoom = Math.max(1, capa?.zoom || 1);
  const s = Math.max(w / iw, h / ih) * zoom;
  const sw = w / s, sh = h / s;
  const fx = (capa?.foco?.x ?? 50) / 100, fy = (capa?.foco?.y ?? 50) / 100;
  const sx = Math.min(Math.max(0, iw * fx - sw / 2), iw - sw), sy = Math.min(Math.max(0, ih * fy - sh / 2), ih - sh);
  ctx.drawImage(el, sx, sy, sw, sh, x, y, w, h);
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  for (const par of (texto || '').split('\n')) {
    if (!par.trim()) { linhas.push(''); continue; }
    let atual = '';
    for (const palavra of par.split(/\s+/)) {
      const t = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(t).width > largura && atual) { linhas.push(atual); atual = palavra; }
      else atual = t;
    }
    linhas.push(atual);
  }
  return linhas;
}

function circulo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
}

/** desenha cabeçalho da marca + perfil + grade numerada. Devolve o canvas. */
export async function desenharFeed(perfil: PerfilVisual & { avatarPath?: string | null; destaquesPaths?: (string | null | undefined)[] }, posts: PostVisual[], obterUrl: ObterUrl, opcoes: { marca: Marca; cliente: string; periodo: string; proporcaoGrade: string; numerar?: boolean }): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const W = 1080, PAD = 48, G = 4, TW = (W - 2 * G) / 3, TH = TW * proporcao(opcoes.proporcaoGrade);
  const c = document.createElement('canvas'); const m = c.getContext('2d')!;
  m.font = `400 30px ${FONTE}`;
  const bio = quebrarLinhas(m, perfil.bio || '', W - 2 * PAD).slice(0, 8);
  const temDest = perfil.destaques.length > 0;
  const TOPO = 150;
  const HEAD = TOPO + PAD + 56 + 190 + 24 + (perfil.nome ? 42 : 0) + (perfil.categoria ? 38 : 0) + bio.length * 40 + (perfil.link ? 44 : 0) + (temDest ? 200 : 0) + 30;
  const linhas = Math.ceil(posts.length / 3);
  c.width = W; c.height = HEAD + Math.max(1, linhas) * (TH + G) + 70;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, c.height); ctx.textBaseline = 'top';
  // faixa da marca (fundo claro, sem faixa escura)
  ctx.fillStyle = '#F4F6FB'; ctx.fillRect(0, 0, W, TOPO);
  ctx.fillStyle = opcoes.marca.cor || AZUL; ctx.font = `700 32px ${FONTE}`; ctx.fillText(opcoes.marca.agencia, PAD, 34);
  ctx.fillStyle = '#1F2430'; ctx.font = `600 28px ${FONTE}`; ctx.fillText(`${opcoes.cliente} · ${opcoes.periodo}`, PAD, 80);
  ctx.fillStyle = '#6B7280'; ctx.font = `400 22px ${FONTE}`; ctx.textAlign = 'right';
  ctx.fillText(`Gerado em ${dataHora(new Date())}`, W - PAD, 40); ctx.textAlign = 'left';
  let y = TOPO + PAD;
  ctx.fillStyle = '#111'; ctx.font = `700 38px ${FONTE}`; ctx.fillText(perfil.usuario || perfil.nome, PAD, y); y += 56;
  const R = 90;
  ctx.save(); circulo(ctx, PAD + R, y + R, R); ctx.fillStyle = '#EEF0F4'; ctx.fill(); ctx.clip();
  const av = await carregarImagem(await obterUrl(perfil.avatarPath));
  if (av) cobrir(ctx, av, PAD, y, R * 2, R * 2);
  ctx.restore();
  const sx = PAD + R * 2 + 40, sw = (W - sx - PAD) / 3;
  ctx.textAlign = 'center';
  [[String(perfil.posts), 'posts'], [perfil.seguidores || '0', 'seguidores'], [perfil.seguindo || '0', 'seguindo']].forEach(([n, l], k) => {
    const cx = sx + sw * k + sw / 2;
    ctx.fillStyle = '#111'; ctx.font = `700 38px ${FONTE}`; ctx.fillText(n, cx, y + R - 46);
    ctx.fillStyle = '#555'; ctx.font = `400 28px ${FONTE}`; ctx.fillText(l, cx, y + R + 4);
  });
  ctx.textAlign = 'left'; y += R * 2 + 24;
  ctx.fillStyle = '#111';
  if (perfil.nome) { ctx.font = `600 30px ${FONTE}`; ctx.fillText(perfil.nome, PAD, y); y += 42; }
  if (perfil.categoria) { ctx.fillStyle = '#6B7280'; ctx.font = `400 28px ${FONTE}`; ctx.fillText(perfil.categoria, PAD, y); y += 38; ctx.fillStyle = '#111'; }
  ctx.font = `400 30px ${FONTE}`; bio.forEach((l) => { ctx.fillText(l, PAD, y); y += 40; });
  if (perfil.link) { ctx.fillStyle = '#00376b'; ctx.font = `600 29px ${FONTE}`; ctx.fillText(perfil.link.replace(/^https?:\/\//, ''), PAD, y + 2); y += 44; }
  if (temDest) {
    y += 18; let x = PAD; const HR = 62;
    for (let k = 0; k < perfil.destaques.length && x + HR * 2 <= W; k++) {
      ctx.strokeStyle = '#DBDBDB'; ctx.lineWidth = 2; circulo(ctx, x + HR, y + HR, HR); ctx.stroke();
      ctx.save(); circulo(ctx, x + HR, y + HR, HR - 8); ctx.fillStyle = '#F1F1F1'; ctx.fill(); ctx.clip();
      const im = await carregarImagem(await obterUrl(perfil.destaquesPaths?.[k]));
      if (im) cobrir(ctx, im, x + 8, y + 8, (HR - 8) * 2, (HR - 8) * 2);
      ctx.restore();
      ctx.fillStyle = '#111'; ctx.font = `400 23px ${FONTE}`; ctx.textAlign = 'center'; ctx.fillText(perfil.destaques[k].titulo, x + HR, y + HR * 2 + 12); ctx.textAlign = 'left';
      x += HR * 2 + 34;
    }
    y += 182;
  }
  ctx.fillStyle = '#DBDBDB'; ctx.fillRect(0, HEAD - 14, W, 2);
  for (let k = 0; k < posts.length; k++) {
    const p = posts[k], x = (k % 3) * (TW + G), yy = HEAD + Math.floor(k / 3) * (TH + G);
    ctx.fillStyle = '#EFEFEF'; ctx.fillRect(x, yy, TW, TH);
    const cp = capaDoPost(p);
    const el = cp ? await carregarImagem(await obterUrl(cp.path)) : null;
    if (el) cobrir(ctx, el, x, yy, TW, TH, p.capa);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    if (p.formato === 'reel') { ctx.beginPath(); ctx.moveTo(x + TW - 48, yy + 18); ctx.lineTo(x + TW - 48, yy + 52); ctx.lineTo(x + TW - 20, yy + 35); ctx.closePath(); ctx.fill(); }
    else if (p.midias.length > 1) { ctx.lineWidth = 4; ctx.strokeRect(x + TW - 46, yy + 26, 26, 26); ctx.beginPath(); ctx.moveTo(x + TW - 54, yy + 44); ctx.lineTo(x + TW - 54, yy + 18); ctx.lineTo(x + TW - 28, yy + 18); ctx.stroke(); }
    ctx.restore();
    if (opcoes.numerar !== false) {
      ctx.fillStyle = 'rgba(0,0,0,.62)'; circulo(ctx, x + 34, yy + 34, 22); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 22px ${FONTE}`; ctx.textAlign = 'center'; ctx.fillText(String(k + 1), x + 34, yy + 22); ctx.textAlign = 'left';
    }
  }
  ctx.fillStyle = '#9CA3AF'; ctx.font = `400 20px ${FONTE}`;
  ctx.fillText(`Prévia ilustrativa · ${opcoes.marca.agencia}${opcoes.marca.contato ? ' · ' + opcoes.marca.contato : ''}`, PAD, c.height - 46);
  return c;
}

export async function canvasParaBlob(c: HTMLCanvasElement, tipo = 'image/png', q = 0.92): Promise<Blob> {
  return await new Promise((r, f) => c.toBlob((b) => (b ? r(b) : f(new Error('Não foi possível gerar a imagem'))), tipo, q));
}

/** baixa um arquivo no navegador */
export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function nomeArquivo(base: string) {
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').toLowerCase();
}

// ---------- PDF ----------
// Legendas são desenhadas como imagem para manter acentos e emojis; páginas quebram sozinhas.
type Doc = import('jspdf').jsPDF;
const MM = { w: 210, h: 297, m: 16 };
const PX_MM = 4; // 4 px por mm na renderização

function blocoTexto(texto: string, larguraMm: number, fontePx: number, peso = 400, cor = '#1F2430'): { canvas: HTMLCanvasElement; linhasPx: number[] } {
  const c = document.createElement('canvas'); const m = c.getContext('2d')!;
  const wpx = larguraMm * PX_MM; m.font = `${peso} ${fontePx}px ${FONTE}`;
  const linhas = quebrarLinhas(m, texto, wpx);
  const lh = Math.round(fontePx * 1.45);
  c.width = wpx; c.height = Math.max(lh, linhas.length * lh);
  const ctx = c.getContext('2d')!; ctx.font = `${peso} ${fontePx}px ${FONTE}`; ctx.fillStyle = cor; ctx.textBaseline = 'top';
  linhas.forEach((l, i) => ctx.fillText(l, 0, i * lh + 2));
  return { canvas: c, linhasPx: linhas.map((_, i) => (i + 1) * lh) };
}

class Paginador {
  y = MM.m;
  constructor(public doc: Doc, private rodape: string) { this.rodapear(); }
  rodapear() {
    const n = this.doc.getNumberOfPages();
    this.doc.setFontSize(8); this.doc.setTextColor(150);
    this.doc.text(`${this.rodape} · página ${n}`, MM.m, MM.h - 8);
  }
  nova() { this.doc.addPage(); this.y = MM.m; this.rodapear(); }
  garantir(alturaMm: number) { if (this.y + alturaMm > MM.h - 16) this.nova(); }
  /** insere texto longo quebrando entre páginas */
  texto(texto: string, x: number, larguraMm: number, fontePx = 40, peso = 400, cor = '#1F2430') {
    if (!texto) return;
    const { canvas, linhasPx } = blocoTexto(texto, larguraMm, fontePx, peso, cor);
    let inicioPx = 0;
    while (inicioPx < canvas.height) {
      const livreMm = MM.h - 16 - this.y;
      const livrePx = livreMm * PX_MM;
      // corta na última linha inteira que cabe
      let fimPx = linhasPx.filter((l) => l - inicioPx <= livrePx).pop() ?? inicioPx;
      if (fimPx <= inicioPx) { this.nova(); continue; }
      fimPx = Math.min(fimPx, canvas.height);
      const parte = document.createElement('canvas'); parte.width = canvas.width; parte.height = fimPx - inicioPx;
      parte.getContext('2d')!.drawImage(canvas, 0, inicioPx, canvas.width, parte.height, 0, 0, canvas.width, parte.height);
      this.doc.addImage(parte.toDataURL('image/png'), 'PNG', x, this.y, larguraMm, parte.height / PX_MM);
      this.y += parte.height / PX_MM;
      inicioPx = fimPx;
      if (inicioPx < canvas.height) this.nova();
    }
  }
}

async function miniaturaDataUrl(path: string | null | undefined, obterUrl: ObterUrl, w: number, h: number, capa?: Capa): Promise<string | null> {
  const el = await carregarImagem(await obterUrl(path));
  if (!el) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, w, h);
  cobrir(ctx, el, 0, 0, w, h, capa);
  return c.toDataURL('image/jpeg', 0.82);
}

export type ItemPdf = PostVisual & { numero?: number; historico?: { quando: string; texto: string }[] };

export async function pdfAprovacao(args: {
  perfil: Parameters<typeof desenharFeed>[0]; feed: PostVisual[]; itens: ItemPdf[]; obterUrl: ObterUrl;
  marca: Marca; cliente: string; periodo: string; proporcaoGrade: string; comHistorico?: boolean;
}): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const rodape = `${args.marca.agencia}${args.marca.contato ? ' · ' + args.marca.contato : ''}`;
  const pg = new Paginador(doc, rodape);
  // capa
  doc.setTextColor(27, 82, 247); doc.setFontSize(12); doc.text(args.marca.agencia.toUpperCase(), MM.m, 40);
  pg.y = 56; pg.texto('Planejamento de conteúdo', MM.m, 178, 96, 700, '#171B26');
  pg.y += 4; pg.texto(`${args.cliente}\n${args.periodo}`, MM.m, 178, 56, 500, '#444B5A');
  const planejados = args.itens.filter((p) => p.tipo === 'planejado');
  const cont = (s: string) => planejados.filter((p) => p.aprovacao === s).length;
  pg.y += 10;
  pg.texto(`${planejados.length} publicações planejadas\nAguardando aprovação: ${cont('aguardando')} · Aprovadas: ${cont('aprovado')} · Com ajustes: ${cont('ajustes')}\n\nGerado em ${dataHora(new Date())}`, MM.m, 178, 40, 400, '#444B5A');
  // visão geral do feed (cabe numa página)
  pg.nova();
  pg.texto('Visão geral do feed', MM.m, 178, 56, 700);
  pg.y += 3;
  const feed = await desenharFeed(args.perfil, args.feed, args.obterUrl, { marca: args.marca, cliente: args.cliente, periodo: args.periodo, proporcaoGrade: args.proporcaoGrade });
  const disp = MM.h - 16 - pg.y, larg = 178;
  let w = larg, h = (feed.height / feed.width) * larg;
  if (h > disp) { h = disp; w = (feed.width / feed.height) * h; }
  doc.addImage(feed.toDataURL('image/jpeg', 0.85), 'JPEG', MM.m + (larg - w) / 2, pg.y, w, h);
  // cada publicação
  for (const p of args.itens) {
    pg.nova();
    const st = APROVACAO[p.aprovacao];
    pg.texto(`${p.numero ? `Post ${p.numero} · ` : ''}${diaCurto(p.publicar_em)} às ${hora(p.publicar_em)} · ${FORMATOS[p.formato]}${p.versao ? ` · versão ${p.versao}` : ''}`, MM.m, 178, 46, 700);
    pg.texto(st.rotulo, MM.m, 178, 36, 600, st.cor);
    pg.y += 3;
    const midias = p.midias.length ? p.midias : [];
    const capaPath = p.capa?.path;
    const lista: { path: string; capa?: Capa }[] = capaPath && p.formato === 'reel' ? [{ path: capaPath }] : midias.slice(0, 10).map((m, i) => ({ path: m.path, capa: i === (p.capa?.indice ?? 0) ? p.capa : undefined }));
    const n = Math.max(1, lista.length), col = n === 1 ? 1 : n <= 4 ? 2 : 3;
    const tw = n === 1 ? 80 : (178 - (col - 1) * 3) / col, th = tw * (p.formato === 'reel' || p.formato === 'story' ? 16 / 9 : 5 / 4);
    for (let k = 0; k < lista.length; k++) {
      const cx = MM.m + (k % col) * (tw + 3);
      if (k % col === 0) pg.garantir(th + 2);
      const img = await miniaturaDataUrl(lista[k].path, args.obterUrl, Math.round(tw * 6), Math.round(th * 6), lista[k].capa);
      if (img) doc.addImage(img, 'JPEG', cx, pg.y, tw, th);
      else { doc.setDrawColor(220); doc.rect(cx, pg.y, tw, th); }
      if (k % col === col - 1 || k === lista.length - 1) pg.y += th + 3;
    }
    if (p.midias.length > 10) pg.texto(`+ ${p.midias.length - 10} imagens no carrossel`, MM.m, 178, 32, 400, '#6B7280');
    if (p.formato === 'reel' && midias[0]?.tipo === 'video') pg.texto('Vídeo: acompanhe pelo link de aprovação para assistir.', MM.m, 178, 32, 400, '#6B7280');
    pg.y += 2;
    pg.texto('Legenda', MM.m, 178, 34, 600, '#6B7280');
    pg.texto(p.legenda || '(sem legenda)', MM.m, 178, 40);
    if (args.comHistorico && p.historico?.length) {
      pg.y += 3; pg.texto('Histórico', MM.m, 178, 34, 600, '#6B7280');
      pg.texto(p.historico.map((h) => `${dataHora(h.quando)} · ${h.texto}`).join('\n'), MM.m, 178, 34, 400, '#444B5A');
    }
  }
  return doc.output('blob');
}

export async function pdfComprovante(args: {
  marca: Marca; cliente: string; periodo: string;
  linhas: { post: string; formato: string; versao: number; decisao: string; revisor: string; quando: string; comentario?: string }[];
  conclusoes: { quando: string; revisor: string }[];
}): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pg = new Paginador(doc, `${args.marca.agencia}${args.marca.contato ? ' · ' + args.marca.contato : ''}`);
  doc.setTextColor(27, 82, 247); doc.setFontSize(11); doc.text(args.marca.agencia.toUpperCase(), MM.m, 22);
  pg.y = 30; pg.texto('Comprovante de aprovação', MM.m, 178, 80, 700);
  pg.texto(`${args.cliente} · ${args.periodo}\nEmitido em ${dataHora(new Date())}`, MM.m, 178, 40, 400, '#444B5A');
  if (args.conclusoes.length) { pg.y += 3; pg.texto(args.conclusoes.map((c) => `Revisão concluída por ${c.revisor} em ${dataHora(c.quando)}`).join('\n'), MM.m, 178, 38, 600, '#16835D'); }
  pg.y += 4;
  const aprov = args.linhas.filter((l) => l.decisao === 'Aprovado').length;
  pg.texto(`${aprov} decisões de aprovação · ${args.linhas.length - aprov} pedidos de ajuste`, MM.m, 178, 38, 500);
  pg.y += 3;
  for (const l of args.linhas) {
    pg.garantir(14);
    pg.texto(`${l.post} · ${l.formato} · versão ${l.versao}\n${l.decisao} por ${l.revisor} em ${dataHora(l.quando)}${l.comentario ? `\n“${l.comentario}”` : ''}`, MM.m, 178, 36, 400);
    doc.setDrawColor(230); doc.line(MM.m, pg.y + 1.5, MM.m + 178, pg.y + 1.5); pg.y += 4;
  }
  pg.y += 4;
  pg.texto('Cada aprovação está vinculada à versão exata apresentada (mídias, ordem do carrossel, capa e legenda). Alterações feitas depois exigem nova aprovação.', MM.m, 178, 32, 400, '#6B7280');
  return doc.output('blob');
}

/** compartilha pelo celular (folha nativa) quando possível; senão baixa */
export async function compartilharOuBaixar(blob: Blob, nome: string) {
  const arquivo = new File([blob], nome, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [arquivo] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await nav.share({ files: [arquivo], title: nome }); return; } catch { /* cancelado: cai no download */ }
  }
  baixar(blob, nome);
}
