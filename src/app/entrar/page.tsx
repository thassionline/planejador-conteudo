'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { mensagemErro } from '@/lib/erros';

function Formulario() {
  const sp = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'entrar' | 'recuperar'>('entrar');
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setMsg(null);
    const sb = supabaseNavegador();
    if (modo === 'entrar') {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) { setMsg({ t: error.message.includes('Invalid') ? 'E-mail ou senha incorretos.' : mensagemErro(error), erro: true }); setOcupado(false); return; }
      router.replace(sp.get('voltar') || '/');
      router.refresh();
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/confirmar?proximo=/definir-senha` });
      setMsg(error ? { t: mensagemErro(error), erro: true } : { t: 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.' });
      setOcupado(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={enviar} className="cartao w-full max-w-sm p-6">
        <div className="text-[13px] font-bold uppercase tracking-wide text-principal">Descomplica Digital</div>
        <h1 className="mt-1 text-[22px] font-semibold">Planejador de Conteúdo</h1>
        <p className="mb-5 mt-1 text-[13.5px] text-texto-2">{modo === 'entrar' ? 'Entre para organizar e aprovar os conteúdos.' : 'Informe seu e-mail para criar uma nova senha.'}</p>
        <label className="rotulo" htmlFor="email">E-mail</label>
        <input id="email" type="email" required autoComplete="email" className="campo mb-3" value={email} onChange={(e) => setEmail(e.target.value)} />
        {modo === 'entrar' && (<>
          <label className="rotulo" htmlFor="senha">Senha</label>
          <input id="senha" type="password" required autoComplete="current-password" className="campo mb-4" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </>)}
        {msg && <p className={`mb-3 text-[13px] ${msg.erro ? 'text-erro' : 'text-sucesso'}`}>{msg.t}</p>}
        <button className="btn-principal w-full py-2.5" disabled={ocupado}>{ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Enviar link'}</button>
        <button type="button" className="mt-3 w-full text-[13px] text-texto-2 underline" onClick={() => { setModo(modo === 'entrar' ? 'recuperar' : 'entrar'); setMsg(null); }}>
          {modo === 'entrar' ? 'Esqueci minha senha' : 'Voltar para o login'}
        </button>
      </form>
    </main>
  );
}

export default function Entrar() {
  return <Suspense><Formulario /></Suspense>;
}
