/**
 * Manutenção periódica · v1.0.46
 *
 * Eventos recorrentes do condomínio (manutenção do elevador, inspeção
 * periódica, extintores, etc.) com data da última realização, periodicidade
 * flexível (N dias/semanas/meses/anos) e cálculo automático da próxima data.
 *
 * Documento (coleção 'manutencoes'):
 *   { id, nome, categoria, dataUltima (ISO), periodicidadeValor,
 *     periodicidadeUnidade, diasAviso, notas, ativo, criadoEm, atualizadoEm }
 */

import * as store from '../store/local-store.js';
import { todayISO } from '../utils/format.js';

export const UNIDADES = {
  dias:    { label: 'dias',    singular: 'dia' },
  semanas: { label: 'semanas', singular: 'semana' },
  meses:   { label: 'meses',   singular: 'mês' },
  anos:    { label: 'anos',    singular: 'ano' }
};

// Atalhos de periodicidade
export const PRESETS = [
  { id: 'mensal',     label: 'Mensal',      valor: 1, unidade: 'meses' },
  { id: 'trimestral', label: 'Trimestral',  valor: 3, unidade: 'meses' },
  { id: 'semestral',  label: 'Semestral',   valor: 6, unidade: 'meses' },
  { id: 'anual',      label: 'Anual',       valor: 1, unidade: 'anos' },
  { id: 'bienal',     label: 'Bienal (2 anos)', valor: 2, unidade: 'anos' },
  { id: '5anos',      label: '5 anos',      valor: 5, unidade: 'anos' },
  { id: '6anos',      label: '6 anos',      valor: 6, unidade: 'anos' }
];

// Modelos com periodicidades legais (Portugal) — arranque rápido
export const MODELOS = [
  { nome: 'Elevador · manutenção',          categoria: 'Elevador',   valor: 1, unidade: 'meses', diasAviso: 15,
    notas: 'Manutenção mensal pela empresa (Schindler). DL 320/2002.' },
  { nome: 'Elevador · inspeção periódica',  categoria: 'Elevador',   valor: 6, unidade: 'anos',  diasAviso: 60,
    notas: 'Inspeção por entidade acreditada. 6 anos (passa a 2 anos após 2 inspeções). Pedir 60 dias antes. DL 320/2002, art. 8.º.' },
  { nome: 'Extintores · manutenção',        categoria: 'Incêndio',   valor: 1, unidade: 'anos',  diasAviso: 30,
    notas: 'Manutenção anual obrigatória por empresa certificada ANEPC. NP 4413.' },
  { nome: 'Extintores · inspeção visual',   categoria: 'Incêndio',   valor: 3, unidade: 'meses', diasAviso: 15,
    notas: 'Verificação rápida (pressão, selo, acesso). NP 4413.' },
  { nome: 'Extintores · recarga',           categoria: 'Incêndio',   valor: 5, unidade: 'anos',  diasAviso: 60,
    notas: 'Recarga (pó químico / água+aditivo). NP 4413.' },
  { nome: 'Limpeza do prédio',              categoria: 'Limpeza',    valor: 1, unidade: 'semanas', diaSemana: 5, diasAviso: 2,
    notas: 'Limpeza semanal das partes comuns.' },
  { nome: 'Reunião de condomínio',          categoria: 'Assembleia', modo: 'pontual', diasAviso: 15,
    notas: 'Assembleia de condóminos. Convocatória com antecedência mínima de 10 dias (Código Civil, art. 1432.º).' }
];

export const WEEKDAYS = [
  { v: 1, label: 'Segunda-feira' },
  { v: 2, label: 'Terça-feira' },
  { v: 3, label: 'Quarta-feira' },
  { v: 4, label: 'Quinta-feira' },
  { v: 5, label: 'Sexta-feira' },
  { v: 6, label: 'Sábado' },
  { v: 0, label: 'Domingo' }
];

/** Soma a periodicidade a uma data ISO e devolve a próxima data ISO. */
export function calcularProxima(dataUltimaISO, valor, unidade, diaSemana = null) {
  if (!dataUltimaISO) return null;
  const d = new Date(dataUltimaISO + 'T00:00:00');
  const n = parseInt(valor, 10) || 0;
  if (n <= 0) return null;
  if (unidade === 'dias')    d.setDate(d.getDate() + n);
  else if (unidade === 'semanas') d.setDate(d.getDate() + n * 7);
  else if (unidade === 'meses')   d.setMonth(d.getMonth() + n);
  else if (unidade === 'anos')    d.setFullYear(d.getFullYear() + n);
  // Fixar num dia da semana (opcional): avança até esse dia
  if (diaSemana !== null && diaSemana !== '' && diaSemana !== undefined) {
    const alvo = parseInt(diaSemana, 10);
    let guard = 0;
    while (d.getDay() !== alvo && guard < 7) { d.setDate(d.getDate() + 1); guard++; }
  }
  return d.toISOString().slice(0, 10);
}

/** Dias entre hoje e uma data ISO (negativo = já passou). */
export function diasAte(dataISO) {
  if (!dataISO) return null;
  const hoje = new Date(todayISO() + 'T00:00:00');
  const alvo = new Date(dataISO + 'T00:00:00');
  return Math.round((alvo - hoje) / 86400000);
}

/** Estado: 'vencida' | 'proxima' | 'emdia'. */
export function estado(proximaISO, diasAviso = 30) {
  const d = diasAte(proximaISO);
  if (d === null) return 'emdia';
  if (d < 0) return 'vencida';
  if (d <= (diasAviso || 30)) return 'proxima';
  return 'emdia';
}

export const ESTADO_INFO = {
  vencida: { label: 'Vencida',   cor: '#c0392b' },
  proxima: { label: 'A vencer',  cor: '#d68910' },
  emdia:   { label: 'Em dia',    cor: '#1e8449' }
};

export function textoPeriodicidade(valor, unidade, diaSemana = null) {
  const n = parseInt(valor, 10) || 0;
  const u = UNIDADES[unidade];
  if (!u || n <= 0) return '—';
  let txt = n === 1 ? `A cada ${u.singular}` : `A cada ${n} ${u.label}`;
  if (diaSemana !== null && diaSemana !== '' && diaSemana !== undefined) {
    const wd = WEEKDAYS.find(w => w.v === parseInt(diaSemana, 10));
    if (wd) {
      const prep = (wd.v === 0 || wd.v === 6) ? 'ao' : 'à';
      txt += `, ${prep} ${wd.label.toLowerCase()}`;
    }
  }
  return txt;
}

/** Lista todas as manutenções com próxima data e estado calculados. */
export async function listar() {
  const docs = await store.listDocs('manutencoes');
  return docs
    .filter(m => m.ativo !== false)
    .map(m => {
      const proxima = (m.modo === 'pontual')
        ? (m.dataEvento || null)
        : calcularProxima(m.dataUltima, m.periodicidadeValor, m.periodicidadeUnidade, m.diaSemana);
      return { ...m, proxima, estado: estado(proxima, m.diasAviso), diasAte: diasAte(proxima) };
    })
    .sort((a, b) => (a.proxima || '9999').localeCompare(b.proxima || '9999'));
}

/** Próximas/vencidas (para a Home). */
export async function proximas(limite = 4) {
  const todas = await listar();
  return todas.filter(m => m.estado !== 'emdia').slice(0, limite);
}

export async function criar(data) {
  if (!data.nome || !data.nome.trim()) throw new Error('Falta o nome.');
  const modo = data.modo === 'pontual' ? 'pontual' : 'recorrente';
  if (modo === 'pontual' && !data.dataEvento) throw new Error('Indica a data do evento.');
  if (modo === 'recorrente' && !data.dataUltima) throw new Error('Indica a data da última realização.');
  const doc = {
    nome: data.nome.trim(),
    categoria: (data.categoria || '').trim(),
    modo,
    dataEvento: modo === 'pontual' ? data.dataEvento : null,
    dataUltima: data.dataUltima || null,
    periodicidadeValor: parseInt(data.periodicidadeValor, 10) || 1,
    periodicidadeUnidade: data.periodicidadeUnidade || 'meses',
    diaSemana: (data.diaSemana === '' || data.diaSemana == null) ? null : parseInt(data.diaSemana, 10),
    diasAviso: parseInt(data.diasAviso, 10) || 30,
    notas: (data.notas || '').trim(),
    ativo: true,
    criadoEm: Date.now()
  };
  return await store.setDoc('manutencoes', doc);
}

export async function atualizar(id, data) {
  const atual = await store.getDoc('manutencoes', id);
  if (!atual) throw new Error('Item não encontrado.');
  const modo = data.modo === 'pontual' ? 'pontual' : (data.modo === 'recorrente' ? 'recorrente' : (atual.modo || 'recorrente'));
  const doc = {
    ...atual,
    nome: data.nome?.trim() ?? atual.nome,
    categoria: (data.categoria ?? atual.categoria ?? '').trim(),
    modo,
    dataEvento: modo === 'pontual' ? (data.dataEvento ?? atual.dataEvento ?? null) : null,
    dataUltima: data.dataUltima ?? atual.dataUltima,
    periodicidadeValor: parseInt(data.periodicidadeValor, 10) || atual.periodicidadeValor,
    periodicidadeUnidade: data.periodicidadeUnidade || atual.periodicidadeUnidade,
    diaSemana: (data.diaSemana === '' || data.diaSemana == null) ? null : parseInt(data.diaSemana, 10),
    diasAviso: parseInt(data.diasAviso, 10) || atual.diasAviso || 30,
    notas: (data.notas ?? atual.notas ?? '').trim(),
    atualizadoEm: Date.now()
  };
  return await store.setDoc('manutencoes', { ...doc, id });
}

/** Marca a manutenção como realizada numa data (default hoje) → recalcula próxima. */
export async function registarRealizacao(id, dataISO) {
  const atual = await store.getDoc('manutencoes', id);
  if (!atual) throw new Error('Manutenção não encontrada.');
  return await store.setDoc('manutencoes', {
    ...atual, id, dataUltima: dataISO || todayISO(), atualizadoEm: Date.now()
  });
}

export async function remover(id) {
  return await store.deleteDoc('manutencoes', id);
}
