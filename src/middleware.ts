import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// O portal do cliente (/r) e a API dele são públicos: o token é validado no servidor a cada chamada.
const PUBLICAS = ['/entrar', '/auth', '/r/', '/api/revisao/'];

export async function middleware(req: NextRequest) {
  let resposta = NextResponse.next({ request: req });
  const caminho = req.nextUrl.pathname;
  if (PUBLICAS.some((p) => caminho.startsWith(p))) return resposta;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(lista) {
        lista.forEach(({ name, value }) => req.cookies.set(name, value));
        resposta = NextResponse.next({ request: req });
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = caminho !== '/' ? `?voltar=${encodeURIComponent(caminho)}` : '';
    return NextResponse.redirect(url);
  }
  return resposta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)'],
};
