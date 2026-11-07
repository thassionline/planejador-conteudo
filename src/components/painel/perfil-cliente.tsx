'use client';
import { ArrowLeft, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Modal, avisar } from '@/components/ui';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { enviarArquivo, useUrls, validarArquivo } from '@/lib/midia';
import { mensagemErro } from '@/lib/erros';
import { contarCaracteres } from '@/lib/feed';
import { LIMITES, type Cliente, type Destaque } from '@/lib/tipos';
import { useAgencia } from '@/lib/agencia';

const VAZIO = { nome: '', usuario_ig: '', nome_perfil: '', categoria: '', bio: '', link: '', avatar_path: null, seguidores: '', seguindo: '', posts_base: 0, destaques: [] as Destaque[], whatsapp: '', proporcao_grade: '3:4' as const };

function Contador({ n, max }: { n: number; max: number }) {
  return <span className={`text-[11.5px] ${n > max ? 'font-semibold text-erro' : 'text-texto-2'}`}>{n}/{max}</span>;
}

export function PerfilCliente({ aberto, cliente, aoFechar, aoSalvar }: { aberto: boolean; cliente: Cliente | null; aoFechar: () => void; aoSalvar: (c: Cliente) => void }) {
  const { agencia } = useAgencia();
  const urlDe = useUrls();
  const [f, setF] = useState<Omit<Cliente, 'id' | 'agencia_id'>>(VAZIO);
  const [id, setId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const alvo = useRef<{ tipo: 'avatar' } | { tipo: 'destaque'; i: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setF(cliente ? { ...VAZIO, ...cliente, destaques: cliente.destaques || [] } : VAZIO);
    setId(cliente?.id || crypto.randomUUID());
  }, [aberto, cliente]);

  const mudar = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq || !agencia || !alvo.current) return;
    const erro = validarArquivo(arq);
    if (erro || !arq.type.startsWith('image')) return avisar(erro || 'Escolha uma imagem.', 'erro');
    setEnviando(true);
    try {
      const { midia } = await enviarArquivo(arq, arq.name, agencia.id, id, undefined, false);
      const a = alvo.current;
      if (a.tipo === 'avatar') mudar('avatar_path', midia.path);
      else setF((x) => ({ ...x, destaques: x.destaques.map((d, i) => (i === a.i ? { ...d, capa_path: midia.path } : d)) }));
    } catch (er) {
      avisar(mensagemErro(er), 'erro');
    } finally {
      setEnviando(false);
    }
  }
  function escolher(a: typeof alvo.current) {
    alvo.current = a;
    input.current?.click();
  }

  async function salvar() {
    if (!agencia) return;
    if (!f.nome.trim()) return avisar('Informe o nome do cliente.', 'erro');
    if (contarCaracteres(f.bio) > LIMITES.bio) return avisar(`A bio passou de ${LIMITES.bio} caracteres.`, 'erro');
    setSalvando(true);
    const dados = {
      ...f,
      usuario_ig: f.usuario_ig.replace(/^@/, '').trim().toLowerCase(),
      destaques: f.destaques.filter((d) => d.titulo.trim() || d.capa_path).map((d) => ({ titulo: d.titulo.slice(0, LIMITES.destaque), capa_path: d.capa_path || null })),
      posts_base: Math.max(0, Number(f.posts_base) || 0),
    };
    const sb = supabaseNavegador();
    const r = cliente
      ? await sb.from('clientes').update(dados).eq('id', cliente.id).select().single()
      : await sb.from('clientes').insert({ ...dados, id, agencia_id: agencia.id }).select().single();
    setSalvando(false);
    if (r.error) return avisar(mensagemErro(r.error), 'erro');
    avisar('Perfil salvo');
    aoSalvar(r.data as Cliente);
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={cliente ? 'Perfil do cliente' : 'Novo cliente'} largura="max-w-2xl"
      rodape={<div className="flex justify-end gap-2"><button className="btn" onClick={aoFechar}>Cancelar</button><button className="btn-principal" onClick={salvar} disabled={salvando || enviando}>{salvando ? 'Salvando…' : 'Salvar perfil'}</button></div>}>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={aoEscolher} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 flex items-center gap-4">
          <button type="button" onClick={() => escolher({ tipo: 'avatar' })} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-borda bg-suave text-texto-2" aria-label="Foto de perfil">
            {f.avatar_path && urlDe(f.avatar_path) ? <img src={urlDe(f.avatar_path)!} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={22} />}
          </button>
          <div className="flex-1">
            <label className="rotulo">Nome do cliente (interno)</label>
            <input className="campo" value={f.nome} onChange={(e) => mudar('nome', e.target.value)} placeholder="Ex.: Clínica Bella" />
          </div>
        </div>
        <div>
          <div className="flex justify-between"><label className="rotulo">@ do Instagram</label><Contador n={f.usuario_ig.length} max={LIMITES.usuario} /></div>
          <input className="campo" value={f.usuario_ig} maxLength={LIMITES.usuario} onChange={(e) => mudar('usuario_ig', e.target.value)} placeholder="clinicabella" />
        </div>
        <div>
          <div className="flex justify-between"><label className="rotulo">Nome no perfil</label><Contador n={contarCaracteres(f.nome_perfil)} max={LIMITES.nomePerfil} /></div>
          <input className="campo" value={f.nome_perfil} maxLength={LIMITES.nomePerfil} onChange={(e) => mudar('nome_perfil', e.target.value)} placeholder="Clínica Bella | Estética" />
        </div>
        <div>
          <label className="rotulo">Categoria (opcional)</label>
          <input className="campo" value={f.categoria} maxLength={40} onChange={(e) => mudar('categoria', e.target.value)} placeholder="Clínica de estética" />
        </div>
        <div>
          <label className="rotulo">Link na bio</label>
          <input className="campo" value={f.link} onChange={(e) => mudar('link', e.target.value)} placeholder="seusite.com.br" />
        </div>
        <div className="sm:col-span-2">
          <div className="flex justify-between"><label className="rotulo">Bio (limite real do Instagram)</label><Contador n={contarCaracteres(f.bio)} max={LIMITES.bio} /></div>
          <textarea className="campo min-h-[84px]" value={f.bio} onChange={(e) => mudar('bio', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <div><label className="rotulo">Seguidores</label><input className="campo" value={f.seguidores} onChange={(e) => mudar('seguidores', e.target.value)} placeholder="1.240" /></div>
          <div><label className="rotulo">Seguindo</label><input className="campo" value={f.seguindo} onChange={(e) => mudar('seguindo', e.target.value)} /></div>
          <div><label className="rotulo">Posts já no perfil</label><input className="campo" type="number" min={0} value={f.posts_base} onChange={(e) => mudar('posts_base', Number(e.target.value))} /></div>
          <p className="col-span-3 -mt-1 text-[11.5px] text-texto-2">Números informados manualmente, só para a simulação.</p>
        </div>
        <div>
          <label className="rotulo">WhatsApp de quem aprova</label>
          <input className="campo" value={f.whatsapp} onChange={(e) => mudar('whatsapp', e.target.value)} placeholder="(48) 99999-9999" inputMode="tel" />
        </div>
        <div>
          <label className="rotulo">Corte da grade</label>
          <select className="campo" value={f.proporcao_grade} onChange={(e) => mudar('proporcao_grade', e.target.value as Cliente['proporcao_grade'])}>
            <option value="3:4">3:4 (grade atual do Instagram)</option>
            <option value="4:5">4:5</option>
            <option value="1:1">1:1 (quadrado, grade antiga)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between"><span className="rotulo mb-0">Destaques (toque no círculo para enviar a capa)</span>
            <button type="button" className="btn py-1 text-[12.5px]" onClick={() => mudar('destaques', [...f.destaques, { titulo: '', capa_path: null }])}><Plus size={14} />Destaque</button></div>
          {!f.destaques.length && <p className="text-[12.5px] text-texto-2">Nenhum destaque.</p>}
          <div className="space-y-2">
            {f.destaques.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => escolher({ tipo: 'destaque', i })} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-borda bg-suave text-texto-2" aria-label="Capa do destaque">
                  {d.capa_path && urlDe(d.capa_path) ? <img src={urlDe(d.capa_path)!} alt="" className="h-full w-full object-cover" /> : <Plus size={16} />}
                </button>
                <input className="campo" value={d.titulo} maxLength={LIMITES.destaque} placeholder="Nome do destaque" onChange={(e) => mudar('destaques', f.destaques.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)))} />
                <span className="w-10 text-right text-[11.5px] text-texto-2">{d.titulo.length}/{LIMITES.destaque}</span>
                {i > 0 && <button type="button" className="btn-icone" aria-label="Mover para a esquerda" onClick={() => { const n = [...f.destaques]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; mudar('destaques', n); }}><ArrowLeft size={15} /></button>}
                <button type="button" className="btn-icone" aria-label="Remover" onClick={() => mudar('destaques', f.destaques.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {enviando && <p className="mt-3 text-[12.5px] text-texto-2">Enviando imagem…</p>}
    </Modal>
  );
}
