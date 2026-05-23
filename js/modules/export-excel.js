/**
 * Export Excel anual.
 * Gera ficheiro XLSX com várias folhas usando SheetJS (window.XLSX).
 *
 * Folhas:
 *   - Resumo            · KPIs principais
 *   - Quotas            · matriz condóminos × meses + saldo
 *   - Recibos           · lista de todos os recibos
 *   - Despesas          · lista de despesas + breakdown por rúbrica
 *   - Outros Receb.     · outros recebimentos
 *   - Movimentos Banco  · cronológico com saldo acumulado
 *   - Planos            · planos + prestações
 */

import * as store from '../store/local-store.js';
import * as receipts from './receipts.js';
import * as analise from './analise.js';
import * as planos from './planos.js';
import * as saldoBanco from './saldo-banco.js';
import { monthsOfYear, currentMonthRef } from '../utils/format.js';

const MESES_LBL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Helper: valor em € (não cêntimos) para Excel mostrar como moeda
function toEur(centimos) {
  return Math.round(centimos) / 100;
}

/**
 * Exporta o ano completo para um ficheiro Excel.
 */
export async function exportarAno(ano) {
  if (!window.XLSX) {
    throw new Error('SheetJS não está disponível. Verifica que xlsx.mini.min.js foi carregado.');
  }
  const XLSX = window.XLSX;

  const wb = XLSX.utils.book_new();

  // ─── Folha · Resumo ──────────────────────────────────────
  await addFolhaResumo(XLSX, wb, ano);

  // ─── Folha · Quotas (matriz) ─────────────────────────────
  await addFolhaQuotas(XLSX, wb, ano);

  // ─── Folha · Recibos ─────────────────────────────────────
  await addFolhaRecibos(XLSX, wb, ano);

  // ─── Folha · Despesas ────────────────────────────────────
  await addFolhaDespesas(XLSX, wb, ano);

  // ─── Folha · Outros Recebimentos ─────────────────────────
  await addFolhaOutrosRec(XLSX, wb, ano);

  // ─── Folha · Movimentos Banco ────────────────────────────
  await addFolhaBanco(XLSX, wb, ano);

  // ─── Folha · Planos ──────────────────────────────────────
  await addFolhaPlanos(XLSX, wb, ano);

  // Escrever ficheiro
  const filename = `Condominio_AR24_${ano}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

async function addFolhaResumo(XLSX, wb, ano) {
  const kpis = await analise.kpisYTD(ano);
  const data = [
    ['Condomínio Av. Amália Rodrigues, 24'],
    [`Exportação do ano ${ano}`],
    [`Gerado em ${new Date().toLocaleString('pt-PT')}`],
    [],
    ['Indicador', 'Valor'],
    ['Total Esperado YTD',        toEur(kpis.esperadoYTD_centimos)],
    ['Total Recebido (Quotas)',   toEur(kpis.recebidoYTD_centimos)],
    ['Outros Recebimentos',       toEur(kpis.outrosRecYTD_centimos)],
    ['Total Despesas YTD',        toEur(kpis.despesasYTD_centimos)],
    ['Saldo Bancário Atual',      toEur(kpis.saldoBancarioAtual_centimos)],
    [],
    ['Taxa de Cobrança (%)',      kpis.taxaCobrancaYTD],
    ['Total em Atraso',           toEur(kpis.totalEmAtraso_centimos)],
    ['Condóminos em Atraso',      `${kpis.condominosEmAtraso} / ${kpis.totalCondominos}`],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 32 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
}

async function addFolhaQuotas(XLSX, wb, ano) {
  const tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  const months = monthsOfYear(ano);

  // Header
  const header = ['Fração', 'Condómino', 'Quota Mensal', 'Permilagem (‰)', ...MESES_LBL, 'Total Pago', 'Em Falta', 'Saldo a Favor'];
  const rows = [header];

  for (const t of tenants) {
    const quotaMensal = t.rentByYear?.[ano] || 0;
    const row = [t.fraction, t.name, toEur(quotaMensal), t.permilage];
    let pagoTotal = 0;
    let esperadoTotal = 0;
    const curr = currentMonthRef();

    for (const m of months) {
      const pago = await receipts.valorPagoNoMes(t.id, m);
      row.push(toEur(pago));
      pagoTotal += pago;
      if (m <= curr) esperadoTotal += quotaMensal;
    }
    const saldo = await receipts.saldoCondomino(t.id);
    row.push(toEur(pagoTotal));
    row.push(toEur(Math.max(0, esperadoTotal - pagoTotal)));
    row.push(toEur(saldo));
    rows.push(row);
  }

  // Linha de totais
  const totalsRow = ['TOTAL', '', '', ''];
  for (let i = 4; i < header.length; i++) {
    let sum = 0;
    for (let r = 1; r < rows.length; r++) sum += rows[r][i] || 0;
    totalsRow.push(Math.round(sum * 100) / 100);
  }
  rows.push(totalsRow);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 10 },
    ...MESES_LBL.map(() => ({ wch: 8 })),
    { wch: 11 }, { wch: 11 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Quotas');
}

async function addFolhaRecibos(XLSX, wb, ano) {
  const recs = await receipts.listar({ ano });
  recs.sort((a, b) => (a.recibo_seq || 0) - (b.recibo_seq || 0));

  const rows = [['Nº Recibo', 'Data', 'Fração', 'Condómino', 'Tipo', 'Descrição', 'Meses Cobertos', 'Valor (€)', 'Excesso (€)', 'Saldo Usado (€)', 'Estado']];
  for (const r of recs) {
    const meses = (r.mesReferencia || []).join(', ');
    let estado = 'Válido';
    if (r.cancelado) estado = 'Cancelado';
    else if (r.estornoDe) estado = 'Estorno';
    rows.push([
      r.recibo_numero || '',
      r.data || '',
      r.fraction || '',
      r.tenantName || '',
      r.tipo || '',
      r.descricao || '',
      meses,
      toEur(r.valor_centimos || 0),
      toEur(r.excesso_centimos || 0),
      toEur(r.saldoUsado_centimos || 0),
      estado
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 26 },
    { wch: 10 }, { wch: 36 }, { wch: 20 },
    { wch: 11 }, { wch: 10 }, { wch: 12 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Recibos');
}

async function addFolhaDespesas(XLSX, wb, ano) {
  const desp = (await store.queryDocs('pagamentosDespesa', { ano }));
  desp.sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  const rows = [['Data', 'Rúbrica', 'Fornecedor', 'Descrição', 'Método', 'Valor (€)', 'Estado']];
  for (const d of desp) {
    let estado = 'Válida';
    if (d.cancelada) estado = 'Cancelada';
    else if (d.estornoDe) estado = 'Estorno';
    rows.push([
      d.data || '',
      d.rubricaNome || '',
      d.fornecedor || '',
      d.descricao || '',
      d.metodoPagamento || '',
      toEur(d.valor_centimos || 0),
      estado
    ]);
  }

  // Linha em branco + breakdown por rúbrica
  rows.push([]);
  rows.push(['BREAKDOWN POR RÚBRICA']);
  const breakdown = await analise.despesasPorRubrica(ano);
  rows.push(['Rúbrica', '', '', '', '', 'Total (€)']);
  for (const b of breakdown) {
    rows.push([b.nome, '', '', '', '', toEur(b.total_centimos)]);
  }
  const totalDesp = breakdown.reduce((s, b) => s + b.total_centimos, 0);
  rows.push(['TOTAL', '', '', '', '', toEur(totalDesp)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 30 },
    { wch: 14 }, { wch: 11 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas');
}

async function addFolhaOutrosRec(XLSX, wb, ano) {
  const outros = await store.queryDocs('outrosRecebimentos', { ano });
  outros.sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  const rows = [['Data', 'Descrição', 'Origem', 'Condómino Associado', 'Valor (€)', 'Estado']];
  for (const o of outros) {
    let estado = 'Válido';
    if (o.cancelado) estado = 'Cancelado';
    else if (o.estornoDe) estado = 'Estorno';
    rows.push([
      o.data || '',
      o.descricao || '',
      o.origem || '',
      o.tenantName || '',
      toEur(o.valor_centimos || 0),
      estado
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 36 }, { wch: 22 }, { wch: 22 }, { wch: 11 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Outros Receb.');
}

async function addFolhaBanco(XLSX, wb, ano) {
  const { saldoInicial } = await saldoBanco.calcularSaldo(ano);

  const recs = (await store.queryDocs('receipts', { ano }))
    .map(r => ({ data: r.data, descricao: r.descricao, valor: r.valor_centimos, tipo: r.cancelado ? 'CANCELADO · Recibo' : (r.estornoDe ? 'Estorno' : 'Recibo'), origem: `${r.fraction || ''} ${r.tenantName || ''}`.trim() }));
  const outros = (await store.queryDocs('outrosRecebimentos', { ano }))
    .map(o => ({ data: o.data, descricao: o.descricao, valor: o.valor_centimos, tipo: o.cancelado ? 'CANCELADO · Outro' : 'Outro Recebimento', origem: o.origem || '' }));
  const desps = (await store.queryDocs('pagamentosDespesa', { ano }))
    .map(d => ({ data: d.data, descricao: d.descricao, valor: -Math.abs(d.valor_centimos), tipo: d.cancelada ? 'CANCELADO · Despesa' : (d.estornoDe ? 'Estorno Despesa' : 'Despesa'), origem: d.fornecedor || '' }));

  const all = [...recs, ...outros, ...desps].sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  const rows = [['Data', 'Tipo', 'Descrição', 'Origem / Fornecedor', 'Entrada (€)', 'Saída (€)', 'Saldo Acumulado (€)']];
  // Linha do saldo inicial
  let acumulado = saldoInicial;
  rows.push(['', 'SALDO INICIAL', '', '', '', '', toEur(saldoInicial)]);

  for (const m of all) {
    const isEntrada = m.valor > 0;
    if (!m.tipo.startsWith('CANCELADO')) acumulado += m.valor;
    rows.push([
      m.data || '',
      m.tipo,
      m.descricao || '',
      m.origem || '',
      isEntrada ? toEur(m.valor) : '',
      !isEntrada ? toEur(-m.valor) : '',
      toEur(acumulado)
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 22 }, { wch: 36 }, { wch: 26 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Movimentos Banco');
}

async function addFolhaPlanos(XLSX, wb, ano) {
  const list = await planos.listar({ ano });
  if (list.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['Sem planos de pagamento no ano ' + ano]]);
    XLSX.utils.book_append_sheet(wb, ws, 'Planos');
    return;
  }

  const rows = [['Plano', 'Valor Total (€)', 'Prestações', 'Base Cálculo', 'Início', 'Fim', 'Estado', 'Pagas', 'Em Atraso']];

  for (const p of list) {
    const prog = await planos.progresso(p.id);
    rows.push([
      p.nome,
      toEur(p.valorTotal_centimos),
      p.numeroPrestacoes,
      p.baseCalculo,
      p.dataInicio,
      p.dataPrevisaoFim,
      p.estado,
      `${prog.pagas}/${prog.total}`,
      prog.emAtraso
    ]);
  }

  // Detalhe de cada plano · prestações por condómino
  rows.push([]);
  for (const p of list) {
    rows.push([`PRESTAÇÕES · ${p.nome}`]);
    rows.push(['Fração', 'Condómino', 'Nº Prest.', 'Mês', 'Valor (€)', 'Estado', 'Recibo']);
    const prestacoes = (await store.queryDocs('prestacoes', { planoId: p.id }))
      .sort((a, b) => {
        const c = (a.fraction || '').localeCompare(b.fraction || '');
        if (c !== 0) return c;
        return (a.numeroPrestacao || 0) - (b.numeroPrestacao || 0);
      });
    for (const pr of prestacoes) {
      rows.push([
        pr.fraction || '',
        pr.tenantName || '',
        `${pr.numeroPrestacao}/${pr.totalPrestacoes}`,
        pr.mesReferencia || '',
        toEur(pr.valor_centimos || 0),
        pr.estado || '',
        pr.reciboId || ''
      ]);
    }
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 24 }, { wch: 22 }, { wch: 11 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Planos');
}
