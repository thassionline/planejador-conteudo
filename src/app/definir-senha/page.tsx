'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { mensagemErro } from '@/lib/erros';

export default function DefinirSenha() {
  const [s1, set1] = useState('');
  const [s2, set2] = useState('');
  const [msg, setMsg] = useState('');
  const router = useRouter();
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (s1.length < 8) return setMsg('Use pelo menos 8 caracteres.');
    if (s1 !== s2) return setMsg('As senhas não são iguais.');
    const { error } = await supabaseNavegador().auth.updateUser({ password: s1 });
    if (error) return setMsg(mensagemErro(error));
    router.replace('/');
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={salvar} className="cartao w-full max-w-sm p-6">
        <h1 className="text-[20px] font-semibold">Crie sua senha</h1>
        <p className="mb-4 mt-1 text-[13.5px] text-texto-2">Você vai usar esta senha para entrar no Planejador.</p>
        <label className="rotulo">Nova senha</label>
        <input type="password" className="campo mb-3" value={s1} onChange={(e) => set1(e.target.value)} autoComplete="new-password" />
        <label className="rotulo">Repita a senha</label>
        <input type="password" className="campo mb-3" value={s2} onChange={(e) => set2(e.target.value)} autoComplete="new-password" />
        {msg && <p className="mb-3 text-[13px] text-erro">{msg}</p>}
        <button className="btn-principal w-full py-2.5">Salvar e entrar</button>
      </form>
    </main>
  );
}
