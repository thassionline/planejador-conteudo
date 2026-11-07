'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabaseNavegador } from './supabase/navegador';

export type Agencia = { id: string; nome: string; whatsapp: string | null; reaprovar_ao_mudar_data: boolean };
export type Eu = { id: string; email: string; papel: 'admin' | 'colaborador'; nome: string | null };
type Ctx = { agencia: Agencia | null; eu: Eu | null; carregando: boolean; recarregar: () => Promise<void> };

const C = createContext<Ctx>({ agencia: null, eu: null, carregando: true, recarregar: async () => {} });

export function ProvedorAgencia({ children }: { children: ReactNode }) {
  const [estado, set] = useState<Omit<Ctx, 'recarregar'>>({ agencia: null, eu: null, carregando: true });
  const recarregar = useCallback(async () => {
    const sb = supabaseNavegador();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) { set({ agencia: null, eu: null, carregando: false }); return; }
    const { data: m } = await sb.from('membros').select('agencia_id, papel, nome, email').eq('usuario_id', u.user.id).order('criado_em').limit(1).maybeSingle();
    if (!m) { set({ agencia: null, eu: { id: u.user.id, email: u.user.email || '', papel: 'colaborador', nome: null }, carregando: false }); return; }
    const { data: a } = await sb.from('agencias').select('id, nome, whatsapp, reaprovar_ao_mudar_data').eq('id', m.agencia_id).single();
    set({ agencia: a as Agencia, eu: { id: u.user.id, email: u.user.email || '', papel: m.papel, nome: m.nome }, carregando: false });
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  return <C.Provider value={{ ...estado, recarregar }}>{children}</C.Provider>;
}
export const useAgencia = () => useContext(C);
