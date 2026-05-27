/**
 * Módulo Análise · cálculos consolidados para dashboard.
 *
 * Cada função recebe um ano (YYYY) e devolve dados agregados.
 * Não armazena estado próprio · sempre derivado das coleções primárias.
 */

import * as store from '../store/local-store.js';
import * as receipts from './receipts.js';
import * as emAberto from './em-aberto.js';
import * as despesas from './despesas.js';
import * as saldoBanco from './saldo-banco.js';
import * as planos from './planos.js';
import { monthsOfYear, currentMonthRef } from '../utils/format.js';

const MESES_LBL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/**
 * Indicadores principais YTD (Year-To-Date).
 */
export async function kpisYTD(ano) {
  const tenants = await store.listDocs('tenants');
  const currMonth = currentMonthRef();

  let esperadoYTD = 0;
  let recebidoYTD = 0;
  let totalEmAtraso = 0;
  let condominosEmAtraso = 0;

  const months = monthsOfYear(ano).filter(m => m <= currMonth);

  for (const t of tenants) {
    const quotaMensal = t.rentByYear?.[ano] || 0;
    let pagoTotal = 0;
    let esperadoTotal = 0;

    for (const m of months) {
      const pago = await receipts.valorPagoNoMes(t.id, m);
      pagoTotal += pago;
      esperadoTotal += quotaMensal;
    }

    esperadoYTD += esperadoTotal;
    recebidoYTD += pagoTotal;
    const emFalta = Math.max(0, esperadoTotal - pagoTotal);
    if (emFalta > 0) {
      totalEmAtraso += emFalta;
      condominosEmAtraso++;
    }
  }

  // Receitas totais YTD (inclui outros recebimentos)
  const outrosRec = (await store.queryDocs('outrosRecebimentos', { ano }))
    .filter(o => !o.cancelado)
    .reduce((s, o) => s + (o.valor_centimos || 0), 0);

  // Despesas YTD
  const despesasYTD = await despesas.totalAno(ano);

  // Saldo bancário atual
  const { saldo } = await saldoBanco.calcularSaldo(ano);

  // Taxa de cobrança
  const taxaCobranca = esperadoYTD > 0 ? Math.round(recebidoYTD / esperadoYTD * 100) : 100;

  return {
    ano,
    esperadoYTD_centimos: esperadoYTD,
    recebidoYTD_centimos: recebidoYTD,
    outrosRecYTD_centimos: outrosRec,
    despesasYTD_centimos: despesasYTD,
    saldoBancarioAtual_centimos: saldo,
    totalEmAtraso_centimos: totalEmAtraso,
    condominosEmAtraso,
    totalCondominos: tenants.length,
    taxaCobrancaYTD: taxaCobranca
  };
}

/**
 * Receitas e despesas agregadas por mês.
 * Retorna [{ mes, label, receitas, despesas, saldoMes }]
 */
export async function movimentosMensais(ano) {
  const months = monthsOfYear(ano);
  const series = [];

  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    // Receitas: recibos do mês (data do recibo, não mesReferencia)
    const recs = (await store.queryDocs('receipts', { ano }))
      .filter(r => !r.cancelado && r.data && r.data.startsWith(m));
    const receitasMes = recs.reduce((s, r) => s + (r.valor_centimos || 0), 0);

    const outros = (await store.queryDocs('outrosRecebimentos', { ano }))
      .filter(o => !o.cancelado && o.data && o.data.startsWith(m));
    const outrosMes = outros.reduce((s, o) => s + (o.valor_centimos || 0), 0);

    // Despesas: pagamentos do mês
    const desp = (await store.queryDocs('pagamentosDespesa', { ano }))
      .filter(d => !d.cancelada && d.data && d.data.startsWith(m));
    const despesasMes = desp.reduce((s, d) => s + (d.valor_centimos || 0), 0);

    const totalReceitas = receitasMes + outrosMes;
    series.push({
      mes: m,
      label: MESES_LBL[i],
      receitas_centimos: totalReceitas,
      despesas_centimos: despesasMes,
      saldoMes_centimos: totalReceitas - despesasMes
    });
  }

  return series;
}

/**
 * Distribuição de despesas por rúbrica (YTD).
 */
export async function despesasPorRubrica(ano) {
  const agg = await despesas.totalPorRubrica(ano);
  const arr = Object.entries(agg).map(([id, v]) => ({
    rubricaId: id,
    nome: v.nome,
    total_centimos: v.total
  }));
  arr.sort((a, b) => b.total_centimos - a.total_centimos);
  return arr;
}

/**
 * Evolução do saldo bancário mês a mês.
 * Retorna [{ mes, label, saldoFimMes }]
 */
export async function evolucaoSaldo(ano) {
  const { saldoInicial } = await saldoBanco.calcularSaldo(ano);
  const movs = await movimentosMensais(ano);
  let acumulado = saldoInicial;
  return movs.map(m => {
    acumulado += m.saldoMes_centimos;
    return { mes: m.mes, label: m.label, saldoFimMes_centimos: acumulado };
  });
}

/**
 * Top condóminos em atraso, ordenados pelo valor em falta.
 */
export async function topAtrasos(ano, limit = 5) {
  // Somar 3 dimensões da dívida por tenant
  const [quotasAtraso, prestAtraso, dividasArr] = await Promise.all([
    emAberto.quotasAtrasoAnoCorrente(ano),
    emAberto.prestacoesAtraso(),
    emAberto.dividasArrastadas(ano),
  ]);

  const porTenant = {};  // tenantId → { tenantName, fraction, quotas, prest, arrastadas, total }

  for (const q of quotasAtraso) {
    if (!porTenant[q.tenantId]) porTenant[q.tenantId] = { tenantName: q.tenantName, fraction: q.fraction, quotas: 0, prest: 0, arrastadas: 0 };
    porTenant[q.tenantId].quotas += q.totalEmFalta;
  }
  for (const p of prestAtraso) {
    if (!porTenant[p.tenantId]) porTenant[p.tenantId] = { tenantName: p.tenantName, fraction: p.fraction, quotas: 0, prest: 0, arrastadas: 0 };
    porTenant[p.tenantId].prest += p.totalPendente;
  }
  for (const d of dividasArr) {
    if (!porTenant[d.tenantId]) porTenant[d.tenantId] = { tenantName: d.tenantName, fraction: d.fraction, quotas: 0, prest: 0, arrastadas: 0 };
    porTenant[d.tenantId].arrastadas += d.valor_centimos;
  }

  const lista = Object.entries(porTenant).map(([tid, info]) => ({
    tenantId: tid,
    tenantName: info.tenantName,
    fraction: info.fraction,
    emFalta_centimos: info.quotas + info.prest + info.arrastadas,
    quotas_centimos: info.quotas,
    prestacoes_centimos: info.prest,
    arrastadas_centimos: info.arrastadas,
    pagoYTD_centimos: 0,  // legacy
    esperadoYTD_centimos: 0,  // legacy
  })).filter(x => x.emFalta_centimos > 0);

  lista.sort((a, b) => b.emFalta_centimos - a.emFalta_centimos);
  return lista.slice(0, limit);
}

/**
 * Estado dos planos ativos.
 */
export async function estadoPlanos() {
  const lista = await planos.listar({ estado: 'ativo' });
  const arr = [];
  for (const p of lista) {
    const prog = await planos.progresso(p.id);
    arr.push({ plano: p, progresso: prog });
  }
  return arr;
}
