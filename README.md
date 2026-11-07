# Planejador de Conteúdo 2.0 · Descomplica Digital

Calendário editorial, prévia do Instagram e aprovação de conteúdo pelo cliente, com histórico de versões.

- **Agência**: organiza o mês por cliente, sobe imagens, vídeos e carrosséis, escreve legendas, vê o perfil pronto e compartilha um link seguro.
- **Cliente**: abre o link no celular, vê como o Instagram vai ficar, toca nos posts, aprova ou pede alteração direto pelo feed. Sem senha.

## O que garante a segurança
- **Isolamento por agência**: toda tabela tem RLS por membro da agência. Testado: uma agência não lê, não edita e não injeta dados em outra.
- **Link de aprovação com token**: 256 bits aleatórios; só o hash SHA-256 fica no banco. Pode expirar (7 a 90 dias) e ser desativado na hora.
- **O cliente nunca fala com o banco**: o portal chama `/api/revisao/[token]`, que valida o token a cada pedido e chama funções liberadas só para o `service_role`.
- **Aprovação não pode ser forjada**: a decisão precisa trazer a versão que o cliente viu (`versao_desatualizada` se mudou), nome do revisor e, no ajuste, a descrição.
- **A agência não consegue marcar "aprovado" na tabela**: as colunas de aprovação e versão só mudam pelas funções do banco.
- **Mídias privadas**: bucket `midias` fechado; o cliente recebe URLs assinadas de 2 horas, só de arquivos da pasta do próprio cliente.
- **Auditoria** de envio, decisão, invalidação, links e lixeira.

## Regras de aprovação
- Enviar para aprovação grava uma **versão imutável** (V1, V2, V3…) com mídias, ordem do carrossel, capa, legenda e data.
- Mudar **mídia, capa, legenda ou formato** de um post aguardando ou aprovado o devolve para rascunho. O histórico fica.
- Mudar **só data ou horário** de um aprovado é administrativo por padrão (fica registrado e marcado "data alterada depois da aprovação"). Em Equipe e ajustes dá para exigir nova aprovação também para data.
- **Agendado/Publicado** só para conteúdo aprovado. Status de aprovação e de publicação são separados.
- **Aprovação em lote** só pega posts aguardando, na versão exibida. Posts com ajuste pedido nunca entram.
- Quando nada mais está aguardando, o sistema registra a **conclusão da revisão** e avisa a agência.
- Exclusão vai para a **lixeira**; apagar de vez pede confirmação.

## Publicar (uma vez)
1. Crie um projeto no Supabase **separado** do Financeiro (região São Paulo).
2. SQL Editor: rode `supabase/migrations/001_planejador.sql` inteiro. Ele cria tabelas, regras, o bucket privado `midias` e liga o tempo real.
3. Authentication > Providers > Email: **desative "Allow new users to sign up"**.
4. Authentication > Users > Add user: crie seu usuário (thassi.online@gmail.com) com senha.
5. Authentication > URL Configuration: Site URL = seu domínio; Redirect URLs = `https://SEU-DOMINIO/auth/confirmar`.
6. Vercel: importe o repositório e configure as variáveis do `.env.example` (`SUPABASE_SERVICE_ROLE_KEY` só no servidor, nunca com `NEXT_PUBLIC_`).
7. Entre no sistema: no primeiro acesso ele pede o nome da agência e cria você como administradora.

Colaboradores: Equipe e ajustes > Convidar (chega um e-mail para criar senha).

## Rodar e testar
```bash
npm install
cp .env.example .env.local   # preencha
npm run dev
npm test                     # testes do banco (Postgres real embutido) + regras do feed
```
`npm run test:db` cobre isolamento, link revogado e expirado, aprovação forjada, versão desatualizada, invalidação após edição, lote, comentários e auditoria.

## Telas
- `/` Clientes: busca, filtros, pendências, ajustes, próxima publicação e última ação do cliente.
- `/c/[id]` Planejador: calendário mês, semana e lista (seleção em lote), arrastar entre datas, duplicar, simulador do feed com filtros (completo, planejados, aprovados, publicados) e "até a data", ampliar, divisor ajustável. No celular: abas Calendário, Feed e Aprovações.
- Editor: formato, data e hora, envio múltiplo com progresso e nova tentativa, ordem do carrossel, capa do carrossel, capa do Reel (quadro do vídeo ou imagem), enquadramento com zoom, contador de 2.200 caracteres e 30 hashtags, modelos de legenda, observações internas, comentários (internos ou para o cliente, marcar resolvido), versões com comparação, aprovação registrada por fora, duplicar para data. Rascunho salvo no aparelho e aviso ao sair sem salvar. Conflito de edição simultânea é detectado.
- Perfil do cliente: foto, @, nome (30), categoria, bio (150, contador real), link, destaques com capa, contadores manuais, WhatsApp de quem aprova, corte da grade (3:4, 4:5, 1:1).
- Posts já publicados: entram no feed para mostrar a transição e nunca na aprovação.
- Biblioteca por cliente: busca, filtro, tamanho, formato, uso em posts, reutilização.
- Exportar: imagem do feed numerada, PDF de aprovação (com ou sem histórico) e comprovante de aprovação. Legendas completas com acentos e emojis, páginas quebradas sozinhas.
- `/r/[token]` Portal do cliente: resumo, feed como tela de aprovação (check discreto em aprovados, lápis em ajustes), lista por data, post ampliado com carrossel e vídeo, legenda inteira, comentar trecho selecionado ou imagem específica, aprovar, pedir alteração (obrigatório descrever), aprovar todas com confirmação explícita, próxima pendente automática, PDF do planejamento.
- Notificações na hora (sino) quando o cliente aprova, pede ajuste, comenta ou conclui.

## Próxima fase (não incluído)
Marcação visual na imagem, comentário no tempo do vídeo pelo cliente, envio automático por WhatsApp Business ou e-mail, integração oficial com a Meta para publicar, pilares de conteúdo, banco de ideias e IA para legendas.
