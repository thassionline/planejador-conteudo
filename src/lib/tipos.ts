export type Formato = 'imagem' | 'carrossel' | 'reel' | 'story';
export type Aprovacao = 'rascunho' | 'aguardando' | 'ajustes' | 'aprovado';
export type Publicacao = 'pendente' | 'agendado' | 'publicado' | 'cancelado';
export type TipoPost = 'planejado' | 'existente';

export type Midia = { path: string; tipo: 'imagem' | 'video'; largura?: number; altura?: number };
export type Capa = { indice?: number; path?: string; foco?: { x: number; y: number }; zoom?: number };
export type Destaque = { titulo: string; capa_path?: string | null };

export type Cliente = {
  id: string;
  agencia_id: string;
  nome: string;
  usuario_ig: string;
  nome_perfil: string;
  categoria: string;
  bio: string;
  link: string;
  avatar_path: string | null;
  seguidores: string;
  seguindo: string;
  posts_base: number;
  destaques: Destaque[];
  whatsapp: string;
  proporcao_grade: '3:4' | '4:5' | '1:1';
  excluido_em?: string | null;
  criado_em?: string;
  atualizado_em?: string;
};

export type Post = {
  id: string;
  agencia_id: string;
  cliente_id: string;
  tipo: TipoPost;
  formato: Formato;
  publicar_em: string;
  legenda: string;
  midias: Midia[];
  capa: Capa;
  notas_internas: string;
  aprovacao: Aprovacao;
  publicacao: Publicacao;
  fixado: boolean;
  ordem_manual: number;
  versao_atual: number;
  versao_aprovada: number | null;
  data_alterada_apos_aprovacao: boolean;
  revisao: number;
  excluido_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type Comentario = {
  id: string;
  post_id: string;
  autor_tipo: 'agencia' | 'cliente';
  autor_nome: string;
  texto: string;
  midia_indice: number | null;
  trecho_legenda: string | null;
  tempo_video: number | null;
  interno: boolean;
  resolvido: boolean;
  versao: number | null;
  criado_em: string;
};

export type Decisao = { id?: string; acao: 'aprovado' | 'ajustes'; versao: number; revisor_nome: string; comentario?: string; criado_em: string };

// O que o simulador do feed e o visualizador precisam: serve para a agência e para o portal
export type PostVisual = {
  id: string;
  tipo: TipoPost;
  formato: Formato;
  publicar_em: string;
  legenda: string;
  midias: Midia[];
  capa: Capa;
  aprovacao: Aprovacao | 'publicado';
  publicacao: Publicacao;
  fixado: boolean;
  ordem_manual: number;
  versao?: number | null;
  criado_em?: string;
};

export const APROVACAO: Record<Aprovacao | 'publicado', { rotulo: string; cor: string }> = {
  rascunho: { rotulo: 'Rascunho', cor: '#9AA1AE' },
  aguardando: { rotulo: 'Aguardando aprovação', cor: '#D99A00' },
  ajustes: { rotulo: 'Ajustes solicitados', cor: '#E5484D' },
  aprovado: { rotulo: 'Aprovado', cor: '#16835D' },
  publicado: { rotulo: 'Já publicado', cor: '#6E56CF' },
};

export const PUBLICACAO: Record<Publicacao, string> = {
  pendente: 'Não agendado',
  agendado: 'Agendado',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
};

export const FORMATOS: Record<Formato, string> = {
  imagem: 'Imagem',
  carrossel: 'Carrossel',
  reel: 'Reel',
  story: 'Story',
};

export const LIMITES = {
  legenda: 2200,
  hashtags: 30,
  bio: 150,
  nomePerfil: 30,
  usuario: 30,
  destaque: 15,
  carrossel: 20,
  // configurável: tamanho máximo de cada arquivo enviado
  arquivoMb: 100,
};

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
