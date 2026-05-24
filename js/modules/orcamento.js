/**
 * Módulo Orçamento Anual.
 *
 * Modelo:
 *   - 1 orçamento "ativo" por ano (estado: rascunho | aprovado)
 *   - Versionamento: ao editar um aprovado, arquiva-se o atual e cria-se nova versão
 *
 * Coleção 'orcamentos':
 *   { id, ano, versao, estado, criadoEm/Por, aprovadoEm/Por,
 *     saldoInicial_centimos, receitasPrevistas[],
 *     despesasPrevistasPorRubrica{}, fundoReserva_centimos,
 *     observacoes }
 */

import * as store from '../store/local-store.js';
import * as rubricas from './rubricas.js';
import * as despesas from './despesas.js';
import * as saldoBanco from './saldo-banco.js';

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Obtém o orçamento ativo do ano (rascunho ou aprovado, NÃO arquivado).
 */
export async function obterAtivo(ano) {
  const todos = await store.queryDocs('orcamentos', { ano });
  return todos.find(o => o.estado !== 'arquivado') || null;
}

/**
 * Cria orçamento em rascunho para o ano.
 * Se já existir aprovado, retorna o existente · usa-se editarComoNovaVersao() para alterar.
 */
export async function criarRascunho(ano, operatorName) {
  const existente = await obterAtivo(ano);
  if (existente) {
    if (existente.estado === 'rascunho') return existente;
    throw new Error('Já existe um orçamento aprovado para este ano. Use "Editar como nova versão".');
  }

  // Tentar pré-popular com base no ano anterior
  const anoAnt = String(parseInt(ano, 10) - 1);
  const anterior = (await store.queryDocs('orcamentos', { ano: anoAnt }))
    .filter(o => o.estado === 'aprovado' || o.estado === 'arquivado')
    .sort((a, b) => (b.versao || 1) - (a.versao || 1))[0];

  const novo = {
    id: `orc-${ano}-${uid().slice(0, 8)}`,
    ano,
    versao: 1,
    estado: 'rascunho',
    criadoEm: Date.now(),
    criadoPor: operatorName || null,
    aprovadoEm: null,
    aprovadoPor: null,
    saldoInicial_centimos: anterior?.saldoInicial_centimos || 0,
    receitasPrevistas: anterior?.receitasPrevistas
      ? anterior.receitasPrevistas.map(r => ({ ...r, id: uid() }))
      : [{ id: uid(), descricao: 'Quotas mensais', valor_centimos: 0 }],
    despesasPrevistasPorRubrica: anterior?.despesasPrevistasPorRubrica
      ? { ...anterior.despesasPrevistasPorRubrica }
      : {},
    fundoReserva_centimos: anterior?.fundoReserva_centimos || 0,
    observacoes: ''
  };

  return await store.setDoc('orcamentos', novo);
}

/**
 * Editar um orçamento aprovado · cria nova versão em rascunho.
 * O anterior é movido para estado 'arquivado'.
 */
export async function editarComoNovaVersao(ano, operatorName) {
  const aprovado = await obterAtivo(ano);
  if (!aprovado) throw new Error('Não existe orçamento aprovado para este ano.');
  if (aprovado.estado !== 'aprovado') {
    throw new Error('Só orçamentos aprovados podem ser revistos.');
  }

  // Arquivar o atual
  aprovado.estado = 'arquivado';
  aprovado.arquivadoEm = Date.now();
  await store.setDoc('orcamentos', aprovado);

  // Criar nova versão · clone
  const novo = {
    ...aprovado,
    id: `orc-${ano}-${uid().slice(0, 8)}`,
    versao: (aprovado.versao || 1) + 1,
    estado: 'rascunho',
    criadoEm: Date.now(),
    criadoPor: operatorName || null,
    aprovadoEm: null,
    aprovadoPor: null,
    arquivadoEm: null
  };
  delete novo.arquivadoEm;
  return await store.setDoc('orcamentos', novo);
}

/**
 * Atualiza campos do orçamento (só permitido em rascunho).
 */
export async function atualizar(orcamentoId, updates) {
  const orc = await store.getDoc('orcamentos', orcamentoId);
  if (!orc) throw new Error('Orçamento não encontrado.');
  if (orc.estado !== 'rascunho') {
    throw new Error('Apenas orçamentos em rascunho podem ser editados.');
  }
  const merged = { ...orc, ...updates, id: orc.id, estado: 'rascunho' };
  return await store.setDoc('orcamentos', merged);
}

/**
 * Aprovar orçamento (rascunho → aprovado). Regista quem e quando.
 */
export async function aprovar(orcamentoId, operatorName) {
  const orc = await store.getDoc('orcamentos', orcamentoId);
  if (!orc) throw new Error('Orçamento não encontrado.');
  if (orc.estado !== 'rascunho') {
    throw new Error('Apenas orçamentos em rascunho podem ser aprovados.');
  }
  orc.estado = 'aprovado';
  orc.aprovadoEm = Date.now();
  orc.aprovadoPor = operatorName || null;
  return await store.setDoc('orcamentos', orc);
}

/**
 * Cancela um rascunho (apaga). NÃO permitido em aprovados/arquivados.
 */
export async function descartarRascunho(orcamentoId) {
  const orc = await store.getDoc('orcamentos', orcamentoId);
  if (!orc) return;
  if (orc.estado !== 'rascunho') {
    throw new Error('Apenas rascunhos podem ser descartados.');
  }
  await store.deleteDoc('orcamentos', orcamentoId);
}

/**
 * Calcula totais do orçamento.
 */
export function calcularTotais(orc) {
  const receitasTotal = (orc.receitasPrevistas || [])
    .reduce((s, r) => s + (r.valor_centimos || 0), 0);

  const despesasTotal = Object.values(orc.despesasPrevistasPorRubrica || {})
    .reduce((s, v) => s + (v || 0), 0);

  const fundoReserva = orc.fundoReserva_centimos || 0;
  const saldoInicial = orc.saldoInicial_centimos || 0;

  const resultadoEsperado = saldoInicial + receitasTotal - despesasTotal - fundoReserva;

  return {
    saldoInicial,
    receitasTotal,
    despesasTotal,
    fundoReserva,
    resultadoEsperado
  };
}

/**
 * Calcula execução do orçamento por rúbrica:
 * para cada rúbrica orçada, devolve orçado, realizado, percentagem, status.
 */
export async function execucaoPorRubrica(ano) {
  const orc = await obterAtivo(ano);
  if (!orc || orc.estado === 'rascunho') return [];  // só faz sentido para aprovado

  const realizadoPorRub = await despesas.totalPorRubrica(ano);
  const listaRub = await rubricas.listar();
  const mapaNomes = Object.fromEntries(listaRub.map(r => [r.id, r.nome]));

  const linhas = [];
  const todosIds = new Set([
    ...Object.keys(orc.despesasPrevistasPorRubrica || {}),
    ...Object.keys(realizadoPorRub)
  ]);

  for (const rubId of todosIds) {
    const orcado = orc.despesasPrevistasPorRubrica?.[rubId] || 0;
    const realizado = realizadoPorRub[rubId]?.total || 0;
    const pct = orcado > 0 ? Math.round(realizado / orcado * 100) : null;

    let status;
    if (orcado === 0) status = realizado > 0 ? 'fora-orcamento' : 'sem-movimento';
    else if (realizado > orcado) status = 'ultrapassado';
    else if (realizado >= orcado * 0.8) status = 'alerta';
    else status = 'ok';

    linhas.push({
      rubricaId: rubId,
      nome: mapaNomes[rubId] || realizadoPorRub[rubId]?.nome || 'Rúbrica eliminada',
      orcado_centimos: orcado,
      realizado_centimos: realizado,
      diferenca_centimos: orcado - realizado,
      percentagem: pct,
      status
    });
  }

  // Ordenar: ultrapassados primeiro, depois alerta, depois ok, depois sem movimento
  const ordem = { 'ultrapassado': 0, 'fora-orcamento': 1, 'alerta': 2, 'ok': 3, 'sem-movimento': 4 };
  linhas.sort((a, b) => {
    const oa = ordem[a.status], ob = ordem[b.status];
    if (oa !== ob) return oa - ob;
    return b.realizado_centimos - a.realizado_centimos;
  });

  return linhas;
}

/**
 * Sumário comparativo total orçado vs realizado.
 */
export async function execucaoSumario(ano) {
  const orc = await obterAtivo(ano);
  if (!orc) return null;

  const totais = calcularTotais(orc);
  const realizadoDespesas = await despesas.totalAno(ano);

  // Receitas realizadas = receitas + outros recebimentos (não cancelados)
  const recs = (await store.queryDocs('receipts', { ano }))
    .filter(r => !r.cancelado)
    .reduce((s, r) => s + (r.valor_centimos || 0), 0);
  const outros = (await store.queryDocs('outrosRecebimentos', { ano }))
    .filter(o => !o.cancelado)
    .reduce((s, o) => s + (o.valor_centimos || 0), 0);
  const realizadoReceitas = recs + outros;

  return {
    estado: orc.estado,
    versao: orc.versao,
    aprovadoEm: orc.aprovadoEm,
    aprovadoPor: orc.aprovadoPor,
    receitas: {
      orcado: totais.receitasTotal,
      realizado: realizadoReceitas,
      pct: totais.receitasTotal > 0 ? Math.round(realizadoReceitas / totais.receitasTotal * 100) : null
    },
    despesas: {
      orcado: totais.despesasTotal,
      realizado: realizadoDespesas,
      pct: totais.despesasTotal > 0 ? Math.round(realizadoDespesas / totais.despesasTotal * 100) : null
    },
    fundoReserva: totais.fundoReserva,
    saldoInicial: totais.saldoInicial,
    resultadoEsperado: totais.resultadoEsperado,
    resultadoReal: totais.saldoInicial + realizadoReceitas - realizadoDespesas
  };
}

/**
 * Lista histórico de versões do orçamento de um ano (incluindo arquivadas).
 */
export async function historicoVersoes(ano) {
  const list = await store.queryDocs('orcamentos', { ano });
  return list.sort((a, b) => (b.versao || 1) - (a.versao || 1));
}
