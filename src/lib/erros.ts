const MENSAGENS: Record<string, string> = {
  link_invalido: 'Este link não está mais ativo. Peça um novo link para a agência.',
  versao_desatualizada: 'Este post foi atualizado pela agência. A página vai recarregar com a versão nova.',
  informe_seu_nome: 'Informe seu nome para registrar a revisão.',
  descreva_o_ajuste: 'Conte o que precisa ser alterado.',
  post_invalido: 'Este post não está disponível para revisão.',
  post_nao_esta_em_aprovacao: 'Este post não está aguardando aprovação.',
  post_ja_agendado: 'Este post já foi agendado. Fale com a agência para mudar.',
  post_sem_midia: 'Envie pelo menos uma imagem ou vídeo antes de mandar para aprovação',
  so_aprovado_pode_ser_agendado: 'Só dá para agendar ou publicar um conteúdo aprovado.',
  sem_permissao: 'Você não tem permissão para isso.',
  ja_tem_agencia: 'Sua conta já faz parte de uma agência.',
  periodo_invalido: 'Período inválido (máximo de 3 meses).',
  informe_quem_aprovou: 'Informe quem aprovou.',
  comentario_vazio: 'Escreva o comentário.',
  lista_invalida: 'Nada para aprovar.',
  conflito: 'Alguém alterou este conteúdo enquanto você editava. Recarregue para ver a versão mais nova antes de salvar.',
};

export function mensagemErro(e: unknown): string {
  const txt = typeof e === 'string' ? e : (e as { message?: string })?.message || '';
  for (const [k, v] of Object.entries(MENSAGENS)) {
    if (txt.includes(k)) {
      const extra = k === 'post_sem_midia' ? txt.split('post_sem_midia:')[1]?.trim() : '';
      return extra ? `${v} (post de ${extra}).` : v;
    }
  }
  if (/Failed to fetch|NetworkError|network/i.test(txt)) return 'Sem conexão. Confira a internet e tente de novo.';
  if (/JWT|session/i.test(txt)) return 'Sua sessão expirou. Entre de novo.';
  return txt ? `Não foi possível concluir: ${txt}` : 'Não foi possível concluir. Tente de novo.';
}
