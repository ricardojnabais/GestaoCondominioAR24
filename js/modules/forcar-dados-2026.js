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
import * as saldoBanco from './saldo-banco.js';

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

// As 9 rúbricas necessárias (id canónico + nome). O mapa de despesas só mostra
// uma rúbrica se existir o DOCUMENTO da rúbrica; se faltar, as despesas ficam
// "órfãs" e invisíveis (era o caso de Schindler, Allianz e Despesas Bancárias).
const RUBRICAS_NECESSARIAS = [
  { id: 'rub_edp',             nome: 'EDP Eletricidade',          categoria: 'energia',  fixa: false },
  { id: 'rub_agua',            nome: 'Água',                      categoria: 'agua',     fixa: false },
  { id: 'rub_elevador',        nome: 'Schindler Elevador',        categoria: 'manut',    fixa: true  },
  { id: 'rub_seguros',         nome: 'Allianz Seguros',           categoria: 'seguros',  fixa: true  },
  { id: 'rub_limpeza',         nome: 'Limpeza',                   categoria: 'limpeza',  fixa: true  },
  { id: 'rub_banco',           nome: 'Despesas Bancárias',        categoria: 'banco',    fixa: true  },
  { id: 'rub_plano_schindler', nome: 'Plano Pagamento Schindler', categoria: 'manut',    fixa: true  },
  { id: 'rub_intervencoes',    nome: 'Intervenções Condomínio',   categoria: 'obras',    fixa: false },
  { id: 'rub_outras',          nome: 'Outras',                    categoria: 'diversos', fixa: false },
];

// Hard-code do saldo bancário (pedido explícito).
const SALDO_DATA_INICIO   = '2026-05-27';
const SALDO_INICIAL_CENT  = 815019; // 8.150,19 €  (anula a diferença)
const SALDO_REAL_HOJE_CENT = 702825; // 7.028,25 €  (saldo real à data)
const SALDO_REAL_DATA     = '2026-05-31';


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
 * @param {boolean} [opts.limparRecibos=true]  - apaga recibos 2026 não-canónicos (incl. "H0xx") e repõe os 64
 * @param {boolean} [opts.forcarSaldo=true]    - hard-code do saldo (8.150,19 € a 27/05 · real 7.028,25 €)
 * @param {boolean} [opts.reporDespesas=false] - SÓ se quiseres repor as despesas pelo ficheiro (substitui as existentes)
 * @param {function} [opts.log]
 */
export async function forcarTudo({ limparRecibos = true, forcarSaldo = true, reporDespesas = false, log = () => {} } = {}) {
  const resumo = {};

  // ── 0. LIMPEZA DURA dos recibos 2026 (incl. "H0xx" com ano string) ─────────
  if (limparRecibos) {
    // Varredura própria robusta: apaga qualquer recibo de 2026 que NÃO seja canónico,
    // detectando 2026 por ano (string OU número), por nº (…/ADM2026) ou pela data.
    // Isto apanha os "H0xx/ADM2026" que tinham ano:"2026" (string) e escapavam ao filtro antigo.
    const canon = await carregarCanonicos();
    const idsCanon = new Set(canon.map(r => r.id));
    const todos = await store.listDocs('receipts');
    let apagados = 0;
    for (const r of todos) {
      if (idsCanon.has(r.id)) continue;
      const e2026 =
        String(r.ano) === ANO ||
        /ADM2026/i.test(r.recibo_numero || '') ||
        (typeof r.data === 'string' && r.data.startsWith(ANO));
      if (e2026) { await store.deleteDoc('receipts', r.id); apagados++; }
    }
    // Reescrever os 64 canónicos (auditoria-only)
    let escritos = 0;
    for (const r of canon) {
      await store.setDoc('receipts', { ...r, ano: 2026, auditoria: true, excluirDeContagem: true, excluirDoSaldo: true });
      escritos++;
    }
    resumo.recibosApagados = apagados;
    resumo.recibosCanonicos = escritos;
    log(`✓ Recibos 2026 limpos · apagados ${apagados} (incl. H0xx) · repostos ${escritos} canónicos (RCB 001–064)`);
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

  // ── 3. Garantir os 9 documentos de rúbrica ────────────────────────────────
  // Sem o doc da rúbrica, as despesas dessa rúbrica não aparecem no mapa
  // (era o caso de Schindler, Allianz e Despesas Bancárias).
  let rubCriadas = 0;
  for (const r of RUBRICAS_NECESSARIAS) {
    const existe = await store.getDoc('rubricas', r.id);
    if (!existe) {
      await store.setDoc('rubricas', { ...r, criadaEm: 1577836800000, terminadaEm: null, criadaPor: 'forçar-dados-2026' });
      rubCriadas++;
    } else if (existe.terminadaEm) {
      // reactivar para voltar a aparecer no mapa
      existe.terminadaEm = null; existe.terminadaPor = null;
      await store.setDoc('rubricas', existe);
    }
  }
  log(`✓ Rúbricas garantidas · ${RUBRICAS_NECESSARIAS.length} (criadas agora: ${rubCriadas})`);

  // ── 4. (Opcional) Repor despesas 2026 pelo ficheiro ───────────────────────
  if (reporDespesas) {
    const todas = await store.listDocs('pagamentosDespesa');
    const antigas2026 = todas.filter(d => String(d.ano) === ANO || (d.data && d.data.startsWith(ANO)));
    for (const d of antigas2026) await store.deleteDoc('pagamentosDespesa', d.id);
    let totalDesp = 0, n = 0;
    for (const item of DESPESAS_2026) {
      const id = `desp_2026_${item.rubricaId}_${item.mes.replace('-', '')}`;
      await store.setDoc('pagamentosDespesa', {
        id, rubricaId: item.rubricaId, rubricaNome: item.rubricaNome, ano: ANO,
        data: `${item.mes}-15`, // dia 15 · fica antes do marco de 27/05 (não afecta o saldo)
        valor_centimos: item.valor_centimos,
        descricao: `${item.rubricaNome} · ${item.mes}`, fornecedor: item.rubricaNome,
        metodoPagamento: 'transferencia', cancelada: false, estornoDe: null,
        registadoPor: 'forçar-dados-2026', origem: 'Contas_Condominio · Despesas 2026', createdAt: Date.now(),
      });
      totalDesp += item.valor_centimos; n++;
    }
    resumo.despesas_centimos = totalDesp; resumo.nDespesas = n;
    log(`✓ Despesas 2026 repostas · ${n} lançamentos · total = ${eur(totalDesp)}`);
  } else {
    log('· Despesas 2026 mantidas (não repostas). Rúbricas garantidas acima fazem-nas aparecer no mapa.');
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

  // ── 7. HARD-CODE do saldo bancário ────────────────────────────────────────
  if (forcarSaldo) {
    // saldo inicial 8.150,19 € à data 27/05 + marca movimentos anteriores como excluirDoSaldo.
    await saldoBanco.marcarInicioGestao(SALDO_DATA_INICIO, SALDO_INICIAL_CENT);
    // saldo real conhecido (BPI) = 7.028,25 € → headline "Saldo Real BPI" e diferença = 0.
    await saldoBanco.atualizarSaldoConhecido({
      dataISO: SALDO_REAL_DATA,
      total_centimos: SALDO_REAL_HOJE_CENT,
      contaOrdem_centimos: SALDO_REAL_HOJE_CENT,
      contaPoupanca_centimos: null,
      fonte: 'hard-code',
      notas: 'Saldo forçado a pedido · 7.028,25 € · método de cálculo normal a partir de 27/05',
    });
    resumo.saldoInicial_centimos = SALDO_INICIAL_CENT;
    resumo.saldoReal_centimos = SALDO_REAL_HOJE_CENT;
    log(`✓ Saldo: inicial ${eur(SALDO_INICIAL_CENT)} @ ${SALDO_DATA_INICIO} · real BPI ${eur(SALDO_REAL_HOJE_CENT)}`);
  }

  // ── 8. Garantir 64 canónicos auditoria-only ───────────────────────────────
  const recs = await store.queryDocs('receipts', { ano: 2026 });
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

/** Carrega os 64 recibos canónicos do dataset bundled. */
async function carregarCanonicos() {
  const res = await fetch('./data/recibos-auditoria-2026.json');
  if (!res.ok) throw new Error('Não foi possível carregar recibos-auditoria-2026.json');
  return res.json();
}

function eur(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }

if (typeof window !== 'undefined') {
  // Permite correr pela consola: await window.__forcarDados2026()
  window.__forcarDados2026 = (opts) => forcarTudo({ log: (m) => console.log(m), ...opts });
}
