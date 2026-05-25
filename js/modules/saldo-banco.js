/**
 * Saldo Bancário · cálculo derivado + ancoragem opcional.
 *
 * Fórmula:
 *   saldoCalculado = saldoInicial(ano) + Σ(receipts) + Σ(outrosRecebimentos) − Σ(pagamentosDespesa)
 *
 * Adicionalmente, o admin pode registar um "saldo conhecido" (saldo real
 * observado no BPI numa data específica). Isto serve como ancoragem para
 * detectar descalibração entre o calculado e o real, sem tentar reconciliar
 * movimentos individuais.
 *
 * Estrutura em meta/config:
 *   saldoInicial: { '2026': 321478, '2025': ..., ... }    // cêntimos
 *   saldoConhecido: {                                      // último observado
 *     data: '2026-05-25',
 *     contaOrdem_centimos: 752178,
 *     contaPoupanca_centimos: 70434,
 *     total_centimos: 822612,
 *     notas: 'BPI Net Empresas · posição integrada'
 *   }
 */

import * as store from '../store/local-store.js';

/**
 * Calcula o saldo bancário cumulativo.
 * @param {string} year - ano em causa (ex: '2026')
 * @returns {Promise<{saldo, receitas, despesas, saldoInicial, saldoConhecido, diferenca}>}
 *          Valores em cêntimos. saldoConhecido e diferenca podem ser null.
 */
export async function calcularSaldo(year) {
  const meta = await store.getDoc('meta', 'config');
  const saldoInicial = (meta?.saldoInicial?.[year]) || 0;
  const saldoConhecido = meta?.saldoConhecido || null;

  const receipts = await store.queryDocs('receipts', { ano: year });
  const outros = await store.queryDocs('outrosRecebimentos', { ano: year });
  const despesas = await store.queryDocs('pagamentosDespesa', { ano: year });

  const totReceipts = receipts.filter(r => !r.cancelado).reduce((s, r) => s + (r.valor_centimos || 0), 0);
  const totOutros   = outros.reduce((s, o) => s + (o.valor_centimos || 0), 0);
  const totDespesas = despesas.filter(d => !d.cancelado).reduce((s, d) => s + (d.valor_centimos || 0), 0);

  const receitas = totReceipts + totOutros;
  const saldo = saldoInicial + receitas - totDespesas;

  // Calcular diferença vs saldo conhecido (apenas se for do mesmo ano)
  let diferenca = null;
  if (saldoConhecido?.data?.startsWith(year)) {
    diferenca = saldoConhecido.total_centimos - saldo;
  }

  return { saldo, receitas, despesas: totDespesas, saldoInicial, saldoConhecido, diferenca };
}

/**
 * Define o saldo inicial de um ano. Apenas admin.
 */
export async function setSaldoInicial(year, valor_centimos) {
  let meta = await store.getDoc('meta', 'config');
  if (!meta) meta = { id: 'config' };
  if (!meta.saldoInicial) meta.saldoInicial = {};
  meta.saldoInicial[year] = valor_centimos;
  await store.setDoc('meta', meta);
}

/**
 * Regista o saldo real observado (ancoragem). Apenas admin.
 * @param {Object} dados - { data, contaOrdem_centimos, contaPoupanca_centimos, notas }
 */
export async function setSaldoConhecido(dados) {
  let meta = await store.getDoc('meta', 'config');
  if (!meta) meta = { id: 'config' };
  meta.saldoConhecido = {
    data: dados.data,
    contaOrdem_centimos: dados.contaOrdem_centimos || 0,
    contaPoupanca_centimos: dados.contaPoupanca_centimos || 0,
    total_centimos: (dados.contaOrdem_centimos || 0) + (dados.contaPoupanca_centimos || 0),
    notas: dados.notas || '',
    registadoEm: Date.now(),
  };
  await store.setDoc('meta', meta);
  return meta.saldoConhecido;
}
