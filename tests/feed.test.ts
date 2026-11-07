import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarFeed, capaDoPost, contarHashtags } from '../src/lib/feed.ts';

const base = { tipo: 'planejado', formato: 'imagem', legenda: '', midias: [{ path: 'x', tipo: 'imagem' }], capa: {}, aprovacao: 'aguardando', publicacao: 'pendente', fixado: false, ordem_manual: 0, criado_em: '2026-01-01' } as const;
const p = (id: string, quando: string, extra: Record<string, unknown> = {}) => ({ ...base, id, publicar_em: quando, ...extra }) as never;

test('mais recente primeiro e empate estável', () => {
  const r = ordenarFeed([p('a', '2026-11-01T12:00:00Z'), p('b', '2026-11-05T12:00:00Z'), p('c', '2026-11-05T12:00:00Z', { ordem_manual: 2 })]);
  assert.deepEqual(r.map((x: { id: string }) => x.id), ['c', 'b', 'a']);
});
test('fixados no topo (máximo 3) e stories fora', () => {
  const r = ordenarFeed([p('a', '2026-11-01T12:00:00Z', { fixado: true }), p('b', '2026-11-09T12:00:00Z'), p('s', '2026-11-10T12:00:00Z', { formato: 'story' })]);
  assert.deepEqual(r.map((x: { id: string }) => x.id), ['a', 'b']);
});
test('modo aprovado inclui existentes e aprovados; data limite corta o futuro', () => {
  const ps = [p('e', '2026-10-01T12:00:00Z', { tipo: 'existente', aprovacao: 'publicado' }), p('ok', '2026-11-02T12:00:00Z', { aprovacao: 'aprovado' }), p('w', '2026-11-03T12:00:00Z')];
  assert.deepEqual(ordenarFeed(ps, 'aprovado').map((x: { id: string }) => x.id), ['ok', 'e']);
  assert.deepEqual(ordenarFeed(ps, 'completo', '2026-11-02').map((x: { id: string }) => x.id), ['ok', 'e']);
});
test('capa escolhida e hashtags', () => {
  assert.equal(capaDoPost({ midias: [{ path: '1', tipo: 'imagem' }, { path: '2', tipo: 'imagem' }], capa: { indice: 1 } })?.path, '2');
  assert.equal(capaDoPost({ midias: [{ path: 'v', tipo: 'video' }], capa: { path: 'capa.jpg' } })?.path, 'capa.jpg');
  assert.equal(contarHashtags('oi #estética #pele_bonita #2026'), 3);
});
