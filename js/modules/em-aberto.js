/**
 * Em Aberto · cálculos para a vista admin.
 * Atualizado v1.0.14 · 3 dimensões só:
 *   1. dividas arrastadas (meta.config.dividasAnoAnterior)
 *   2. quotas em atraso do ano corrente (calc dinâmico via mesReferencia)
 *   3. prestações em atraso (planos ativos, estado!=paga)
 */

import * as store from '../store/local-store.js';

/**
 * Dívidas arrastadas explícitas registadas no meta.
 */
export async function dividasArrastadas(anoCorrente = new Date().getFullYear()) {
  const config = await store.getDoc('meta', 'config');
  const dividas = config?.dividasAnoAnterior?.[String(anoCorrente)];
  if (!dividas) return [];
  return Object.values(dividas).map(d => ({
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    fraction: d.fraction,
    valor_centimos: d.valor_centimos,
    origem: d.origem || `Dívida ano anterior`,
    detalhe: d.detalhe || '',
  }));
}

/**
 * Quotas em atraso do ano corrente · só meses já passados (incluindo o atual).
 * Usa r.mesReferencia para calcular cobertura.
 */
export async function quotasAtrasoAnoCorrente(ano = new Date().getFullYear()) {
  const anoStr = String(ano);
  const tenants = await store.listDocs('tenants');
  const receipts = await store.listDocs('receipts');

  // Construir matriz cobertura: tenantId → 'YYYY-MM' → valor_cent pago
  const cobertura = {};
  receipts.forEach(r => {
    if (r.cancelado || r.tipo !== 'quota') return;
    if (!Array.isArray(r.mesReferencia) || r.mesReferencia.length === 0) return;
    const valPorMes = (r.valor_centimos || 0) / r.mesReferencia.length;
    r.mesReferencia.forEach(mref => {
      if (!cobertura[r.tenantId]) cobertura[r.tenantId] = {};
      cobertura[r.tenantId][mref] = (cobertura[r.tenantId][mref] || 0) + valPorMes;
    });
  });

  const hoje = new Date();
  const mesCorrente = (ano === hoje.getFullYear()) ? hoje.getMonth() + 1 : 12;

  const resultado = [];
  for (const t of tenants) {
    if (t.inativoEm) continue;
    const quotaMensal = t.rentByYear?.[anoStr];
    if (!quotaMensal) continue;

    let totalEmFalta = 0;
    const mesesFalta = [];
    for (let m = 1; m <= mesCorrente; m++) {
      const mref = `${anoStr}-${String(m).padStart(2, '0')}`;
      const pago = cobertura[t.id]?.[mref] || 0;
      if (pago < quotaMensal - 100) { // tolerância 1€
        const falta = quotaMensal - pago;
        totalEmFalta += falta;
        mesesFalta.push(m);
      }
    }

    if (totalEmFalta > 0) {
      resultado.push({
        tenantId: t.id,
        tenantName: t.name,
        fraction: t.fraction,
        totalEmFalta,
        mesesFalta,
        quotaMensal,
      });
    }
  }

  resultado.sort((a, b) => b.totalEmFalta - a.totalEmFalta);
  return resultado;
}

/**
 * Prestações em atraso de planos ativos.
 * Considera prestações com estado != 'paga' e valor > 0.
 */
export async function prestacoesAtraso() {
  const planos = await store.listDocs('planos');
  const prestacoes = await store.listDocs('prestacoes');
  const tenants = await store.listDocs('tenants');
  const tenantMap = {};
  tenants.forEach(t => { tenantMap[t.id] = t; });

  const resultado = [];
  for (const plano of planos) {
    if (plano.estado !== 'ativo') continue;
    const prestPlano = prestacoes.filter(p => p.planoId === plano.id);

    // Agrupar por tenant
    const porTenant = {};
    prestPlano.forEach(p => {
      if (!porTenant[p.tenantId]) porTenant[p.tenantId] = { pendentes: [], totalPendente: 0 };
      if (p.estado !== 'paga' && (p.valor_centimos || 0) > 0) {
        porTenant[p.tenantId].pendentes.push(p);
        porTenant[p.tenantId].totalPendente += p.valor_centimos;
      }
    });

    for (const [tid, info] of Object.entries(porTenant)) {
      if (info.totalPendente <= 0) continue;
      const t = tenantMap[tid];
      resultado.push({
        planoId: plano.id,
        planoNome: plano.nome,
        tenantId: tid,
        tenantName: t?.name || '?',
        fraction: t?.fraction || '',
        totalPendente: info.totalPendente,
        nPrestacoes: info.pendentes.length,
      });
    }
  }

  resultado.sort((a, b) => b.totalPendente - a.totalPendente);
  return resultado;
}

/**
 * Atualizar / remover dívida arrastada (após pagamento).
 */
export async function limparDividaArrastada(ano, tenantId) {
  const config = await store.getDoc('meta', 'config');
  if (!config?.dividasAnoAnterior?.[String(ano)]?.[tenantId]) return;
  delete config.dividasAnoAnterior[String(ano)][tenantId];
  // Limpar ano se vazio
  if (Object.keys(config.dividasAnoAnterior[String(ano)]).length === 0) {
    delete config.dividasAnoAnterior[String(ano)];
  }
  await store.setDoc('meta', config);
}
