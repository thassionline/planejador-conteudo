'use client';
import { useEffect, useState } from 'react';
import { supabaseNavegador } from './supabase/navegador';
import { LIMITES, TIPOS_ACEITOS, type Midia } from './tipos';

// ---------- URLs assinadas (bucket privado) ----------
const cache = new Map<string, { url: string; ate: number }>();
const pendentes = new Set<string>();
let ouvintes: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function assinarLote() {
  timer = null;
  const paths = [...pendentes];
  pendentes.clear();
  if (!paths.length) return;
  const { data } = await supabaseNavegador().storage.from('midias').createSignedUrls(paths, 3600);
  (data || []).forEach((d: { path: string | null; signedUrl: string | null }) => {
    if (d.path && d.signedUrl) cache.set(d.path, { url: d.signedUrl, ate: Date.now() + 50 * 60 * 1000 });
  });
  ouvintes.forEach((f) => f());
}

export function urlMidia(path?: string | null): string | null {
  if (!path) return null;
  const c = cache.get(path);
  if (c && c.ate > Date.now()) return c.url;
  pendentes.add(path);
  if (!timer) timer = setTimeout(assinarLote, 20);
  return null;
}

/** devolve uma função urlDe(path) e re-renderiza quando novas URLs chegam */
export function useUrls(): (path?: string | null) => string | null {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    ouvintes.push(f);
    return () => {
      ouvintes = ouvintes.filter((x) => x !== f);
    };
  }, []);
  return urlMidia;
}

// ---------- Validação e envio ----------
export function validarArquivo(f: File): string | null {
  const tipo = f.type || tipoPorExtensao(f.name);
  if (!TIPOS_ACEITOS.includes(tipo)) return `${f.name}: formato não aceito. Use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV.`;
  if (f.size > LIMITES.arquivoMb * 1024 * 1024) return `${f.name}: acima de ${LIMITES.arquivoMb} MB.`;
  if (f.size === 0) return `${f.name}: arquivo vazio.`;
  return null;
}
function tipoPorExtensao(n: string) {
  const e = n.split('.').pop()?.toLowerCase() || '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' } as Record<string, string>)[e] || '';
}

export async function dimensoes(f: Blob, video: boolean): Promise<{ largura?: number; altura?: number }> {
  const url = URL.createObjectURL(f);
  try {
    if (video) {
      return await new Promise((r) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => r({ largura: v.videoWidth, altura: v.videoHeight });
        v.onerror = () => r({});
        v.src = url;
      });
    }
    return await new Promise((r) => {
      const i = new Image();
      i.onload = () => r({ largura: i.naturalWidth, altura: i.naturalHeight });
      i.onerror = () => r({});
      i.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/** envia ao Storage com progresso (XHR na API REST do Supabase) */
export async function enviarArquivo(
  f: Blob,
  nome: string,
  agenciaId: string,
  clienteId: string,
  aoProgredir?: (p: number) => void,
  registrarNaBiblioteca = true,
): Promise<{ midia: Midia; tamanho: number; mime: string }> {
  const sb = supabaseNavegador();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('JWT ausente: entre de novo');
  const mime = f.type || tipoPorExtensao(nome);
  const video = mime.startsWith('video');
  const ext = (nome.split('.').pop() || (video ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const path = `${agenciaId}/${clienteId}/${crypto.randomUUID()}.${ext}`;
  const dim = await dimensoes(f, video);
  await new Promise<void>((ok, falha) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/midias/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? ok() : falha(new Error(`Falha no envio (${xhr.status}): ${xhr.responseText.slice(0, 120)}`)));
    xhr.onerror = () => falha(new Error('Failed to fetch'));
    xhr.send(f);
  });
  if (registrarNaBiblioteca) await sb.from('biblioteca').insert({
    agencia_id: agenciaId,
    cliente_id: clienteId,
    path,
    nome: nome.slice(0, 120),
    tipo: video ? 'video' : 'imagem',
    mime,
    tamanho: f.size,
    largura: dim.largura ?? null,
    altura: dim.altura ?? null,
  });
  return { midia: { path, tipo: video ? 'video' : 'imagem', ...dim }, tamanho: f.size, mime };
}

/** captura o quadro atual de um vídeo como JPEG (capa do Reel) */
export async function capturarQuadro(v: HTMLVideoElement): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  return await new Promise((r, f) => c.toBlob((b) => (b ? r(b) : f(new Error('Não foi possível capturar o quadro'))), 'image/jpeg', 0.9));
}

export function formatarTamanho(b: number) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** garante a URL assinada (para exportações) */
export async function urlGarantida(path?: string | null): Promise<string | null> {
  if (!path) return null;
  const u = urlMidia(path);
  if (u) return u;
  const { data } = await supabaseNavegador().storage.from('midias').createSignedUrl(path, 3600);
  if (data?.signedUrl) cache.set(path, { url: data.signedUrl, ate: Date.now() + 50 * 60 * 1000 });
  return data?.signedUrl || null;
}
