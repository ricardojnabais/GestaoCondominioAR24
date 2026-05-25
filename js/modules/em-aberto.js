/**
 * Em Aberto · cálculos de valores por receber e por pagar.
 *
 * Tem 3 dimensões:
 *  1. Quotas em falta · por condómino e ano (receitas em atraso)
 *  2. Prestações pendentes · de planos ativos (receitas em atraso)
 *  3. Plano Schindler · despesas programadas vs pagas (saídas previstas)
 */

import * as store from '../store/local-store.js';

/**
 * Para cada (tenant, ano, mes) calcula quanto está pago e quanto falta.
 * Considera só meses já passados (não calcula futuro).
 *
 * @param {number} ateAno - até este ano inclusive
 * @returns {Promise<Array<{tenantId, tenantName, fraction, anos: {[ano]: {esperado, pago, falta, mesesFalta: [num]}}, totalEmFalta}>>}
 */
export async function quotasEmFaltaPorCondomino(ateAno = new Date().getFullYear()) {
  const tenants = await store.listDocs('tenants');
  const receipts = await store.listDocs('receipts');

  // Map: tenantId → ano → mes → soma coverage
  const cobertura = {};
  receipts.forEach(r => {
    if (r.cancelado) return;
    if (!Array.isArray(r.coverage)) return;
    r.coverage.forEach(c => {
      if (!cobertura[r.tenantId]) cobertura[r.tenantId] = {};
      if (!cobertura[r.tenantId][c.year]) cobertura[r.tenantId][c.year] = {};
      if (!cobertura[r.tenantId][c.year][c.month]) cobertura[r.tenantId][c.year][c.month] = 0;
      cobertura[r.tenantId][c.year][c.month] += (c.valor_centimos || 0);
    });
  });

  const hoje = new Date();
  const anoCorrente = hoje.getFullYear();
  const mesCorrente = hoje.getMonth() + 1;

  const resultado = [];
  for (const t of tenants) {
    if (t.inativoEm) continue;
    if (!t.rentByYear) continue;

    const anos = {};
    let totalEmFalta = 0;

    Object.entries(t.rentByYear).forEach(([anoStr, quotaMensal]) => {
      const ano = parseInt(anoStr, 10);
      if (ano > ateAno) return;
      const ultimoMes = (ano === anoCorrente) ? mesCorrente : 12;
      let esperado = 0, pago = 0;
      const mesesFalta = [];
      for (let m = 1; m <= ultimoMes; m++) {
        const esperadoM = quotaMensal;
        const pagoM = cobertura[t.id]?.[ano]?.[m] || 0;
        esperado += esperadoM;
        pago += Math.min(esperadoM, pagoM);  // não contar excesso como "pago"
        if (pagoM < esperadoM) mesesFalta.push(m);
      }
      const falta = Math.max(0, esperado - pago);
      if (falta > 0) {
        anos[anoStr] = { esperado, pago, falta, mesesFalta };
        totalEmFalta += falta;
      }
    });

    if (totalEmFalta > 0) {
      resultado.push({
        tenantId: t.id,
        tenantName: t.name,
        fraction: t.fraction,
        anos,
        totalEmFalta,
      });
    }
  }
  // Ordenar por total em falta desc
  resultado.sort((a, b) => b.totalEmFalta - a.totalEmFalta);
  return resultado;
}

/**
 * Lista prestações pendentes de planos ativos.
 * @returns {Promise<Array<{plano, tenantId, tenantName, prestacoes: [...], totalPendente}>>}
 */
export async function prestacoesPendentes() {
  const planos = (await store.listDocs('planos')).filter(p => p.estado === 'ativo');
  if (planos.length === 0) return [];

  const tenants = await store.listDocs('tenants');
  const tenantsById = Object.fromEntries(tenants.map(t => [t.id, t]));

  const prestacoes = await store.listDocs('prestacoes');
  const pendentes = prestacoes.filter(p => p.estado === 'pendente' || p.estado === 'atraso');

  // Agrupar por (planoId, tenantId)
  const map = {};
  pendentes.forEach(p => {
    const key = `${p.planoId}|${p.tenantId}`;
    if (!map[key]) {
      const plano = planos.find(pl => pl.id === p.planoId);
      if (!plano) return;
      map[key] = {
        plano,
        tenantId: p.tenantId,
        tenantName: tenantsById[p.tenantId]?.name || p.tenantId,
        fraction: tenantsById[p.tenantId]?.fraction || '',
        prestacoes: [],
        totalPendente: 0,
      };
    }
    map[key].prestacoes.push(p);
    map[key].totalPendente += (p.valor_centimos || 0);
  });

  return Object.values(map).sort((a, b) => b.totalPendente - a.totalPendente);
}

/**
 * Plano Schindler · agrega prestações previstas vs pagas reais.
 * @returns {Promise<{plano, totalPrevisto, totalPago, totalEmFalta, percentPago, prestacoesEnriquecidas: [...]}|null>}
 */
export async function planoSchindler() {
  const meta = await store.getDoc('meta', 'planoSchindler');
  if (!meta || !Array.isArray(meta.prestacoes)) return null;

  // Despesas pagas com rúbrica do plano Schindler
  const despesas = await store.queryDocs('pagamentosDespesa', {});
  const pagasSchindler = despesas
    .filter(d => d.rubricaId === meta.rubricaId && !d.cancelado)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const totalPrevisto = meta.prestacoes.reduce((s, p) => s + p.valor_centimos, 0);
  const totalPago = pagasSchindler.reduce((s, p) => s + (p.valor_centimos || 0), 0);
  const totalEmFalta = Math.max(0, totalPrevisto - totalPago);
  const percentPago = totalPrevisto > 0 ? (totalPago / totalPrevisto) * 100 : 0;

  // Enriquecer prestações: tentar alinhar pagas com previstas (FIFO por data)
  const pool = [...pagasSchindler];
  let acumulado = 0;
  let acumuladoPrevisto = 0;
  const hoje = new Date().toISOString().slice(0, 10);

  const prestacoesEnriquecidas = meta.prestacoes.map(prev => {
    acumuladoPrevisto += prev.valor_centimos;
    const venceu = prev.data <= hoje;
    // Se já estava pago acumulado >= previsto acumulado, considerar prestação como paga
    const paga = (acumulado + (pool[0]?.valor_centimos || 0)) <= totalPago + 1
                 ? false  // ainda não vai consumir
                 : acumulado < acumuladoPrevisto && totalPago >= acumuladoPrevisto;
    const statusBlock = totalPago >= acumuladoPrevisto
      ? { estado: 'paga', pagoEm: pool[0]?.date }
      : (venceu ? { estado: 'em_falta' } : { estado: 'futura' });
    if (statusBlock.estado === 'paga' && pool.length > 0) {
      acumulado += pool[0].valor_centimos;
      pool.shift();
    }
    return { ...prev, ...statusBlock };
  });

  return {
    plano: meta,
    totalPrevisto,
    totalPago,
    totalEmFalta,
    percentPago,
    prestacoesEnriquecidas,
    pagamentosReais: pagasSchindler,
  };
}
