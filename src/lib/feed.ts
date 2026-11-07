import type { PostVisual } from './tipos';

export type ModoFeed = 'completo' | 'planejado' | 'aprovado' | 'publicado';

export const MODOS_FEED: Record<ModoFeed, string> = {
  completo: 'Feed completo',
  planejado: 'Só planejados',
  aprovado: 'Aprovados',
  publicado: 'Publicados',
};

/**
 * Ordem do perfil: até 3 fixados no topo, depois o mais recente primeiro.
 * Empate de data e hora: ordem_manual (maior primeiro), depois criação e id, para nunca "pular" de lugar.
 * Stories e cancelados nunca entram na grade.
 */
export function ordenarFeed<T extends PostVisual>(posts: T[], modo: ModoFeed = 'completo', ateChave?: string | null): T[] {
  const lim = ateChave ? new Date(`${ateChave}T23:59:59-03:00`).getTime() : null;
  const lista = posts.filter((p) => {
    if (p.formato === 'story' || p.publicacao === 'cancelado') return false;
    if (lim !== null && new Date(p.publicar_em).getTime() > lim) return false;
    if (modo === 'planejado') return p.tipo === 'planejado';
    if (modo === 'aprovado') return p.tipo === 'existente' || p.aprovacao === 'aprovado';
    if (modo === 'publicado') return p.tipo === 'existente' || p.publicacao === 'publicado';
    return true;
  });
  const cmp = (a: T, b: T) => {
    const t = new Date(b.publicar_em).getTime() - new Date(a.publicar_em).getTime();
    if (t) return t;
    if (b.ordem_manual !== a.ordem_manual) return b.ordem_manual - a.ordem_manual;
    const c = (b.criado_em || '').localeCompare(a.criado_em || '');
    return c || b.id.localeCompare(a.id);
  };
  const fixados = lista.filter((p) => p.fixado).sort(cmp).slice(0, 3);
  const ids = new Set(fixados.map((p) => p.id));
  return [...fixados, ...lista.filter((p) => !ids.has(p.id)).sort(cmp)];
}

export function proporcao(r: string): number {
  if (r === '1:1') return 1;
  if (r === '4:5') return 5 / 4;
  return 4 / 3;
}

/** caminho e tipo da imagem que aparece na grade */
export function capaDoPost(p: Pick<PostVisual, 'midias' | 'capa'>): { path: string; tipo: 'imagem' | 'video' } | null {
  if (p.capa?.path) return { path: p.capa.path, tipo: 'imagem' };
  const m = p.midias?.[Math.min(p.capa?.indice ?? 0, Math.max(0, (p.midias?.length || 1) - 1))];
  return m ? { path: m.path, tipo: m.tipo } : null;
}

export function contarHashtags(t: string): number {
  return (t.match(/#[\p{L}\p{N}_]+/gu) || []).length;
}
export function contarCaracteres(t: string): number {
  return [...t].length;
}
