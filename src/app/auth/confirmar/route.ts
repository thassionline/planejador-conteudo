import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/servidor';

// Links de convite e de nova senha chegam aqui com ?code= ou ?token_hash=&type=
export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const proximo = u.searchParams.get('proximo') || '/';
  const destino = proximo.startsWith('/') && !proximo.startsWith('//') ? proximo : '/';
  const sb = await supabaseServidor();
  const code = u.searchParams.get('code');
  const tokenHash = u.searchParams.get('token_hash');
  const tipo = u.searchParams.get('type') as 'invite' | 'recovery' | 'email' | null;
  let erro = null;
  if (code) erro = (await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && tipo) erro = (await sb.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error;
  const url = u.clone();
  url.search = '';
  if (erro) { url.pathname = '/entrar'; return NextResponse.redirect(url); }
  url.pathname = tipo === 'invite' || tipo === 'recovery' ? '/definir-senha' : destino;
  return NextResponse.redirect(url);
}
