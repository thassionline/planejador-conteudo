// Todas as datas do sistema são mostradas no horário de Brasília.
export const FUSO = 'America/Sao_Paulo';

const fmtChave = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });

/** AAAA-MM-DD no horário de Brasília */
export function chaveDia(d: string | Date): string {
  return fmtChave.format(typeof d === 'string' ? new Date(d) : d);
}
export function hora(d: string | Date): string {
  return fmtHora.format(typeof d === 'string' ? new Date(d) : d);
}
/** junta data (AAAA-MM-DD) e hora (HH:MM) do formulário num instante em Brasília (UTC-3, sem horário de verão desde 2019) */
export function montarInstante(dia: string, horario: string): string {
  return new Date(`${dia}T${horario || '12:00'}:00-03:00`).toISOString();
}
export function hojeChave(): string {
  return chaveDia(new Date());
}
export function diaCurto(d: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(typeof d === 'string' ? new Date(d) : d);
}
export function diaLongo(d: string | Date): string {
  const t = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long' }).format(typeof d === 'string' ? new Date(d) : d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function dataHora(d: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(typeof d === 'string' ? new Date(d) : d);
}
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function nomeMes(ano: number, mes: number) {
  return `${MESES[mes]} de ${ano}`;
}
/** soma dias numa chave AAAA-MM-DD */
export function somarDias(chave: string, n: number): string {
  const d = new Date(`${chave}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diaDaSemana(chave: string): number {
  return new Date(`${chave}T12:00:00Z`).getUTCDay();
}
/** período legível entre duas chaves */
export function periodoTexto(posts: { publicar_em: string }[]): string {
  if (!posts.length) return '';
  const ds = posts.map((p) => chaveDia(p.publicar_em)).sort();
  const [a, b] = [ds[0], ds[ds.length - 1]];
  const ma = Number(a.slice(5, 7)) - 1, mb = Number(b.slice(5, 7)) - 1, ya = a.slice(0, 4), yb = b.slice(0, 4);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${MESES[ma]} de ${ya}`;
  if (ya === yb) return `${MESES[ma]} a ${MESES[mb]} de ${ya}`;
  return `${MESES[ma]} de ${ya} a ${MESES[mb]} de ${yb}`;
}
