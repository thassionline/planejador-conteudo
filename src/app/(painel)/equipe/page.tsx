'use client';
import { useCallback, useEffect, useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { useAgencia } from '@/lib/agencia';
import { mensagemErro } from '@/lib/erros';
import { avisar, Confirmar } from '@/components/ui';

type Membro = { usuario_id: string; papel: string; nome: string | null; email: string | null };
type Modelo = { id: string; titulo: string; texto: string };

export default function Equipe() {
  const { agencia, eu, recarregar } = useAgencia();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [regraData, setRegraData] = useState(false);
  const [convite, setConvite] = useState({ email: '', nome: '', papel: 'colaborador' });
  const [remover, setRemover] = useState<Membro | null>(null);
  const admin = eu?.papel === 'admin';

  const carregar = useCallback(async () => {
    const sb = supabaseNavegador();
    const [m, t] = await Promise.all([sb.from('membros').select('usuario_id, papel, nome, email').order('criado_em'), sb.from('modelos_legenda').select('id, titulo, texto').order('titulo')]);
    setMembros(m.data || []); setModelos(t.data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (agencia) { setNome(agencia.nome); setWhats(agencia.whatsapp || ''); setRegraData(agencia.reaprovar_ao_mudar_data); } }, [agencia]);

  async function salvarAgencia() {
    const { error } = await supabaseNavegador().from('agencias').update({ nome, whatsapp: whats, reaprovar_ao_mudar_data: regraData }).eq('id', agencia!.id);
    if (error) return avisar(mensagemErro(error), 'erro');
    avisar('Agência atualizada'); recarregar();
  }
  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/equipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(convite) });
    const j = await r.json();
    if (!r.ok) return avisar(j.erro || 'Não foi possível convidar.', 'erro');
    avisar(j.convidado ? 'Convite enviado por e-mail' : 'Pessoa adicionada à equipe');
    setConvite({ email: '', nome: '', papel: 'colaborador' }); carregar();
  }
  async function tirar(m: Membro) {
    const { error } = await supabaseNavegador().from('membros').delete().eq('usuario_id', m.usuario_id).eq('agencia_id', agencia!.id);
    if (error) return avisar(mensagemErro(error), 'erro');
    carregar();
  }
  async function apagarModelo(id: string) {
    await supabaseNavegador().from('modelos_legenda').delete().eq('id', id);
    carregar();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <section className="cartao p-5">
        <h2 className="mb-3 text-[17px] font-semibold">Agência</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="rotulo">Nome (aparece nas exportações e no portal do cliente)</label><input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} disabled={!admin} /></div>
          <div><label className="rotulo">WhatsApp da agência (rodapé das exportações)</label><input className="campo" value={whats} onChange={(e) => setWhats(e.target.value)} disabled={!admin} placeholder="(48) 98480-0666" /></div>
        </div>
        <label className="mt-4 flex items-start gap-2 text-[13.5px]">
          <input type="checkbox" className="mt-1" checked={regraData} onChange={(e) => setRegraData(e.target.checked)} disabled={!admin} />
          <span><b>Mudar data ou horário de um post aprovado exige nova aprovação.</b><br /><span className="text-texto-2">Desligado: a data é tratada como ajuste administrativo, fica registrada e o post continua aprovado. Mídia, capa e legenda sempre exigem nova aprovação.</span></span>
        </label>
        {admin && <button className="btn-principal mt-4" onClick={salvarAgencia}>Salvar</button>}
      </section>

      <section className="cartao p-5">
        <h2 className="mb-3 text-[17px] font-semibold">Equipe</h2>
        <div className="divide-y divide-borda">
          {membros.map((m) => (
            <div key={m.usuario_id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
              <div className="min-w-0 flex-1"><div className="font-medium">{m.nome || m.email}</div><div className="text-[12px] text-texto-2">{m.email}</div></div>
              <span className="pilula">{m.papel === 'admin' ? 'Administrador' : 'Colaborador'}</span>
              {admin && m.usuario_id !== eu?.id && <button className="btn-icone text-erro" aria-label="Remover" onClick={() => setRemover(m)}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
        {admin && (
          <form onSubmit={convidar} className="mt-4 grid gap-2 rounded-lg border border-borda p-3 sm:grid-cols-[1fr_1fr_150px_auto]">
            <input className="campo" type="email" required placeholder="e-mail" value={convite.email} onChange={(e) => setConvite({ ...convite, email: e.target.value })} />
            <input className="campo" placeholder="nome" value={convite.nome} onChange={(e) => setConvite({ ...convite, nome: e.target.value })} />
            <select className="campo" value={convite.papel} onChange={(e) => setConvite({ ...convite, papel: e.target.value })}><option value="colaborador">Colaborador</option><option value="admin">Administrador</option></select>
            <button className="btn-principal"><UserPlus size={15} />Convidar</button>
          </form>
        )}
        <p className="mt-2 text-[12px] text-texto-2">Colaborador planeja, edita e compartilha. Administrador também convida, remove pessoas e muda as regras da agência. Clientes nunca entram aqui: eles revisam pelo link de aprovação.</p>
      </section>

      <section className="cartao p-5">
        <h2 className="mb-3 text-[17px] font-semibold">Modelos de legenda</h2>
        {!modelos.length && <p className="text-[13px] text-texto-2">Crie modelos no editor de posts com “Salvar como modelo”.</p>}
        <div className="space-y-2">
          {modelos.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-lg border border-borda p-3 text-[13px]">
              <div className="min-w-0 flex-1"><div className="font-medium">{m.titulo}</div><div className="line-clamp-2 whitespace-pre-line text-texto-2">{m.texto}</div></div>
              <button className="btn-icone text-erro" aria-label="Apagar modelo" onClick={() => apagarModelo(m.id)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </section>
      <Confirmar aberto={!!remover} titulo="Remover da equipe?" texto={`${remover?.nome || remover?.email} perde o acesso aos clientes da agência.`} rotulo="Remover" perigo aoConfirmar={() => remover && tirar(remover)} aoFechar={() => setRemover(null)} />
    </main>
  );
}
