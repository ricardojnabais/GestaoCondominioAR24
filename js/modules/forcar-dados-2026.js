/**
 * Forçar Dados 2026 · v1.0.34
 *
 * Operação ADMIN, idempotente, que põe o estado de 2026 a coincidir
 * EXACTAMENTE com o ficheiro de Contas (folhas "Quotas 2026", "Despesas 2026",
 * "Exercício 2026") e com a numeração canónica de recibos.
 *
 * O que faz (tudo verificável nos totais devolvidos):
 *  1. Quotas 2026 → ledger forçado (total recebido 2.351,00 €).
 *  2. Corrige a quota mensal do cond_03 (47 € → 48 €) em tenants.
 *  3. Despesas 2026 por rúbrica → repõe pagamentosDespesa para o total 7.147,44 €
 *     (cria as rúbricas "Plano Pagamento Schindler" e "Intervenções Condomínio").
 *  4. Recebimento CMA (Reabilita+ · 6.519,00 €) → entra em outrosRecebimentos
 *     para aparecer na Análise (RCB 027 fica auditoria-only no histórico).
 *  5. Contador de recibos 2026 → próximo número = 65.
 *  6. Garante que os 64 recibos canónicos ficam auditoria-only
 *     (excluirDeContagem + excluirDoSaldo).
 *
 * ATENÇÃO (passo 3): repõe TODAS as despesas de 2026. Se já criaste pagamentos
 * manuais para 2026 (ex.: os 3 lançamentos recentes), serão substituídos por
 * este conjunto canónico para garantir o total 7.147,44 € sem duplicações.
 * Para os manter por cima, usa { reporDespesas: false }.
 */

import * as store from '../store/local-store.js';
import * as quotasLedger from './quotas-ledger.js';
import * as auditoria from './auditoria-recibos.js';

const ANO = '2026';

/** Despesas 2026 mês-a-mês por rúbrica (cêntimos) · folha "Despesas 2026" (total 7.147,44 €). */
const DESPESAS_2026 = [
  { rubricaId: 'rub_elevador',        rubricaNome: 'Schindler Elevador',        mes: '2026-01', valor_centimos: 35608 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-01', valor_centimos: 1328  },
  { rubricaId: 'rub_limpeza',         rubricaNome: 'Limpeza',                    mes: '2026-01', valor_centimos: 19700 },
  { rubricaId: 'rub_banco',           rubricaNome: 'Despesas Bancárias',         mes: '2026-01', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Pagamento Schindler',  mes: '2026-01', valor_centimos: 60016 },
  { rubricaId: 'rub_edp',             rubricaNome: 'EDP Eletricidade',           mes: '2026-02', valor_centimos: 12669 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-02', valor_centimos: 2289  },
  { rubricaId: 'rub_banco',           rubricaNome: 'Despesas Bancárias',         mes: '2026-02', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Pagamento Schindler',  mes: '2026-02', valor_centimos: 42796 },
  { rubricaId: 'rub_elevador',        rubricaNome: 'Schindler Elevador',        mes: '2026-03', valor_centimos: 26457 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-03', valor_centimos: 2233  },
  { rubricaId: 'rub_limpeza',         rubricaNome: 'Limpeza',                    mes: '2026-03', valor_centimos: 20000 },
  { rubricaId: 'rub_banco',           rubricaNome: 'Despesas Bancárias',         mes: '2026-03', valor_centimos: 831   },
  { rubricaId: 'rub_seguros',         rubricaNome: 'Allianz Seguros',            mes: '2026-03', valor_centimos: 19835 },
  { rubricaId: 'rub_outras',          rubricaNome: 'Outras',                     mes: '2026-03', valor_centimos: 4599  },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Pagamento Schindler',  mes: '2026-03', valor_centimos: 42796 },
  { rubricaId: 'rub_edp',             rubricaNome: 'EDP Eletricidade',           mes: '2026-04', valor_centimos: 12595 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-04', valor_centimos: 1963  },
  { rubricaId: 'rub_limpeza',         rubricaNome: 'Limpeza',                    mes: '2026-04', valor_centimos: 10000 },
  { rubricaId: 'rub_banco',           rubricaNome: 'Despesas Bancárias',         mes: '2026-04', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Pagamento Schindler',  mes: '2026-04', valor_centimos: 42166 },
  { rubricaId: 'rub_intervencoes',    rubricaNome: 'Intervenções Condomínio',    mes: '2026-04', valor_centimos: 284286 },
  { rubricaId: 'rub_elevador',        rubricaNome: 'Schindler Elevador',        mes: '2026-05', valor_centimos: 26457 },
  { rubricaId: 'rub_banco',           rubricaNome: 'Despesas Bancárias',         mes: '2026-05', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Pagamento Schindler',  mes: '2026-05', valor_centimos: 42796 },
];

const RUBRICAS_EXTRA = [
  { id: 'rub_plano_schindler', nome: 'Plano Pagamento Schindler', categoria: 'manut',    fixa: true,  criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_intervencoes',    nome: 'Intervenções Condomínio',   categoria: 'obras',    fixa: false, criadaEm: 1577836800000, terminadaEm: null },
];

// Recebimento da CMA · Devolução Reabilita+ (folha "Exercício 2026", linha 9)
const CMA_RECEBIMENTO = {
  id: 'outrec_cma_reabilita_2026',
  ano: ANO,
  data: '2026-03-03',
  valor_centimos: 651900, // 6.519,00 €
  descricao: 'Devolução Reabilita+ · Processo 1124/+/2025 (CMA)',
  origem: 'entidade_cma',
  tipo: 'subsidio',
  excluirDoSaldo: false,
  cancelado: false,
  reciboAssociado: 'RCB 027/ADM2026',
  createdAt: Date.now(),
};

/**
 * Executa o forçar de dados.
 * @param {Object} opts
 * @param {boolean} [opts.reporDespesas=true] - repõe pagamentosDespesa 2026
 * @param {boolean} [opts.limparRecibos=true] - apaga recibos 2026 não-canónicos e repõe os 64 canónicos
 * @param {function} [opts.log] - callback de progresso
 */
export async function forcarTudo({ reporDespesas = true, limparRecibos = true, log = () => {} } = {}) {
  const resumo = {};

  // ── 0. LIMPEZA DURA dos recibos 2026 ──────────────────────────────────────
  // Apaga TUDO o que tem ano 2026 e não é canónico (ex.: os 86 recibos "H0xx"
  // importados do histórico) e repõe exactamente os 64 canónicos RCB 001–064.
  // Recibos de 2024/2025 não são tocados.
  if (limparRecibos) {
    try {
      const stats = await auditoria.alinharRecibos2026(() => {});
      resumo.recibosApagados = stats.apagados;
      resumo.recibosCanonicos = stats.escritos;
      log(`✓ Recibos 2026 limpos · apagados ${stats.apagados} (ex.: H0xx) · repostos ${stats.escritos} canónicos (RCB 001–064)`);
    } catch (e) {
      log(`⚠ Limpeza de recibos falhou: ${e.message}`);
    }
  }

  // ── 1. Ledger de quotas 2026 (OVERWRITE · limpa qualquer duplicação) ───────
  await quotasLedger.forcarMatriz();
  resumo.quotasRecebidas_centimos = await quotasLedger.totalRecebido2026();
  log(`✓ Quotas 2026 forçadas · recebido = ${eur(resumo.quotasRecebidas_centimos)}`);

  // ── 2. Corrigir quota mensal do cond_03 (47 → 48 €) ───────────────────────
  const cond03 = await store.getDoc('tenants', 'cond_03');
  if (cond03) {
    cond03.rentByYear = { ...(cond03.rentByYear || {}), [ANO]: quotasLedger.quotaMensal('cond_03') };
    await store.setDoc('tenants', cond03);
    log(`✓ Quota mensal cond_03 = ${eur(quotasLedger.quotaMensal('cond_03'))}`);
  }

  // ── 3. Rúbricas em falta ──────────────────────────────────────────────────
  for (const r of RUBRICAS_EXTRA) {
    const existe = await store.getDoc('rubricas', r.id);
    if (!existe) { await store.setDoc('rubricas', r); log(`✓ Rúbrica criada · ${r.nome}`); }
  }

  // ── 4. Despesas 2026 por rúbrica ──────────────────────────────────────────
  if (reporDespesas) {
    // Remover despesas 2026 anteriores (evita duplicação e garante o total exacto)
    const todas = await store.listDocs('pagamentosDespesa');
    const antigas2026 = todas.filter(d => (d.ano === ANO) || (d.data && d.data.startsWith(ANO)));
    for (const d of antigas2026) await store.deleteDoc('pagamentosDespesa', d.id);
    log(`· removidas ${antigas2026.length} despesas 2026 anteriores`);

    let totalDesp = 0;
    let n = 0;
    for (const item of DESPESAS_2026) {
      const id = `desp_2026_${item.rubricaId}_${item.mes.replace('-', '')}`;
      await store.setDoc('pagamentosDespesa', {
        id,
        rubricaId: item.rubricaId,
        rubricaNome: item.rubricaNome,
        ano: ANO,
        data: `${item.mes}-28`,
        valor_centimos: item.valor_centimos,
        descricao: `${item.rubricaNome} · ${item.mes}`,
        fornecedor: item.rubricaNome,
        metodoPagamento: 'transferencia',
        cancelada: false,
        estornoDe: null,
        registadoPor: 'forçar-dados-2026',
        origem: 'Contas_Condominio · Despesas 2026',
        createdAt: Date.now(),
      });
      totalDesp += item.valor_centimos; n++;
    }
    resumo.despesas_centimos = totalDesp;
    resumo.nDespesas = n;
    log(`✓ Despesas 2026 repostas · ${n} lançamentos · total = ${eur(totalDesp)}`);
  }

  // ── 5. Recebimento CMA na Análise ─────────────────────────────────────────
  await store.setDoc('outrosRecebimentos', CMA_RECEBIMENTO);
  resumo.recebimentoCMA_centimos = CMA_RECEBIMENTO.valor_centimos;
  log(`✓ Recebimento CMA Reabilita+ = ${eur(CMA_RECEBIMENTO.valor_centimos)} (aparece na Análise)`);

  // ── 6. Contador de recibos · próximo = 65 ─────────────────────────────────
  const meta = (await store.getDoc('meta', 'config')) || { id: 'config' };
  meta.nextNumberByYear = { ...(meta.nextNumberByYear || {}), [ANO]: 65 };
  await store.setDoc('meta', meta);
  log(`✓ Próximo recibo 2026 = RCB 065/ADM2026`);

  // ── 7. Garantir 64 canónicos auditoria-only ───────────────────────────────
  const recs = await store.queryDocs('receipts', { ano: ANO });
  let ajustados = 0;
  for (const r of recs) {
    if (r.auditoria && (!r.excluirDeContagem || !r.excluirDoSaldo)) {
      r.excluirDeContagem = true; r.excluirDoSaldo = true;
      await store.setDoc('receipts', r);
      ajustados++;
    }
  }
  if (ajustados) log(`· ${ajustados} recibos canónicos reconfirmados auditoria-only`);

  log('— CONCLUÍDO —');
  return resumo;
}

function eur(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }

if (typeof window !== 'undefined') {
  // Permite correr pela consola: await window.__forcarDados2026()
  window.__forcarDados2026 = (opts) => forcarTudo({ log: (m) => console.log(m), ...opts });
}
