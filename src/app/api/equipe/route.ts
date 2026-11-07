import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, supabaseServidor } from '@/lib/supabase/servidor';

// Convida colaborador por e-mail. Só admin da agência.
export async function POST(req: NextRequest) {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Entre de novo.' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email || '').trim().toLowerCase();
  const nome = String(corpo.nome || '').trim().slice(0, 80);
  const papel = corpo.papel === 'admin' ? 'admin' : 'colaborador';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 400 });
  const { data: agencia } = await sb.rpc('minha_agencia');
  const { data: admin } = await sb.rpc('eh_admin', { p_agencia: agencia });
  if (!agencia || !admin) return NextResponse.json({ erro: 'Só administradores podem convidar.' }, { status: 403 });

  const adm = supabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  let usuarioId: string | null = null;
  const convite = await adm.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/auth/confirmar`, data: { nome } });
  if (convite.data.user) usuarioId = convite.data.user.id;
  else {
    // já tem conta: procura e só adiciona à agência
    const { data } = await adm.auth.admin.listUsers({ page: 1, perPage: 1000 });
    usuarioId = data?.users.find((u) => u.email?.toLowerCase() === email)?.id || null;
    if (!usuarioId) return NextResponse.json({ erro: convite.error?.message || 'Não foi possível convidar.' }, { status: 400 });
  }
  const { error } = await adm.rpc('adicionar_membro', { p_agencia: agencia, p_usuario: usuarioId, p_papel: papel, p_email: email, p_nome: nome });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, convidado: !!convite.data.user });
}
