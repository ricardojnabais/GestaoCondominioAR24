/**
 * Saldo Bancário · cálculo derivado.
 *
 * Fórmula:
 *   saldo = saldoInicial(ano) + Σ(receipts) + Σ(outrosRecebimentos) − Σ(pagamentosDespesa)
 *
 * Calculado em tempo real a cada chamada. Não armazenado.
 */

import * as store from '../store/local-store.js';

/**
 * Calcula o saldo bancário cumulativo até hoje.
 * @param {string} year - ano em causa (ex: '2026')
 * @returns {Promise<{saldo: number, receitas: number, despesas: number, saldoInicial: number}>}
 *          Valores em cêntimos.
 */
export async function calcularSaldo(year) {
  const meta = await store.getDoc('meta', 'config');
  const saldoInicial = (meta?.saldoInicial?.[year]) || 0;

  const receipts = await store.queryDocs('receipts', { ano: year });
  const outros = await store.queryDocs('outrosRecebimentos', { ano: year });
  const despesas = await store.queryDocs('pagamentosDespesa', { ano: year });

  const totReceipts = receipts.reduce((s, r) => s + (r.valor_centimos || 0), 0);
  const totOutros = outros.reduce((s, o) => s + (o.valor_centimos || 0), 0);
  const totDespesas = despesas.reduce((s, d) => s + (d.valor_centimos || 0), 0);

  const receitas = totReceipts + totOutros;
  const saldo = saldoInicial + receitas - totDespesas;

  return { saldo, receitas, despesas: totDespesas, saldoInicial };
}

/**
 * Define o saldo inicial de um ano. Apenas admin.
 */
export async function setSaldoInicial(year, valor_centimos) {
  const meta = await store.getDoc('meta', 'config');
  if (!meta.saldoInicial) meta.saldoInicial = {};
  meta.saldoInicial[year] = valor_centimos;
  await store.setDoc('meta', meta);
}
