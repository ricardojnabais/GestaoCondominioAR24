/**
 * Avisos de Atraso · envio por email via EmailJS + registo de prova
 * ------------------------------------------------------------------
 * Semi-automático: o admin abre a página, seleciona os condóminos em atraso
 * (com email) e envia. Os avisos saem via EmailJS. Cada envio é registado no
 * Firestore (coleção 'avisosAtraso') como prova de que foi avisado.
 *
 * Só envia para condóminos:
 *   - com quotas em atraso (via em-aberto.quotasAtrasoAnoCorrente)
 *   - COM email (quem não tem email é excluído · ex.: Sr. João Vaz)
 *
 * EmailJS · chaves públicas do lado do cliente (por design):
 */
const EMAILJS_PUBLIC_KEY = 'jl5l6-RDNB8FWHpWc';
const EMAILJS_SERVICE_ID = 'service_nvaamhr';
const EMAILJS_TEMPLATE_ID = 'template_dd9tudp';

import * as store from '../store/local-store.js';
import * as emAberto from './em-aberto.js';
import { formatMoney, currentMonthRef } from '../utils/format.js';

let emailjsPronto = false;

async function garantirEmailJS() {
  if (emailjsPronto && window.emailjs) return;
  if (!window.emailjs) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Não foi possível carregar o EmailJS (verifica a ligação).'));
      document.head.appendChild(s);
    });
  }
  window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  emailjsPronto = true;
}

/**
 * Lista de condóminos em atraso, cruzada com o email do tenant.
 * @returns {Promise<Array>} [{ tenantId, nome, fracao, email, temEmail, totalEmFalta, valorFormatado }]
 */
export async function listarParaAviso() {
  const atrasos = await emAberto.quotasAtrasoAnoCorrente();
  const tenants = await store.listDocs('tenants');
  const mapaTenant = {};
  tenants.forEach(t => { mapaTenant[t.id] = t; });

  return atrasos.map(a => {
    const t = mapaTenant[a.tenantId] || {};
    const email = (t.email || '').trim();
    return {
      tenantId: a.tenantId,
      nome: a.tenantName,
      fracao: a.fraction,
      email,
      temEmail: !!email,
      totalEmFalta: a.totalEmFalta,
      valorFormatado: formatMoney(a.totalEmFalta),
    };
  });
}

/**
 * Conjunto de tenantIds já avisados no mês corrente (evita duplicados).
 */
export async function jaAvisadosEsteMes() {
  const mes = currentMonthRef();
  const registos = await store.listDocs('avisosAtraso');
  const set = new Set();
  registos.forEach(r => { if (r.mes === mes) set.add(r.tenantId); });
  return set;
}

/**
 * Envia o aviso a UM condómino e regista a prova.
 */
export async function enviarAviso(item, operatorName) {
  if (!item.temEmail) throw new Error('Condómino sem email.');
  await garantirEmailJS();

  const params = {
    email_destino: item.email,
    nome: item.nome,
    fracao: item.fracao || '',
    valor_atraso: item.valorFormatado,
  };
  await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);

  const mes = currentMonthRef();
  const registo = {
    id: `aviso_${item.tenantId}_${mes}`,
    tenantId: item.tenantId,
    tenantNome: item.nome,
    fracao: item.fracao || '',
    email: item.email,
    valorEmFalta_centimos: item.totalEmFalta,
    mes,
    enviadoEm: Date.now(),
    enviadoPor: operatorName || null,
  };
  await store.setDoc('avisosAtraso', registo);
  return registo;
}

/**
 * Histórico de avisos enviados (prova), mais recentes primeiro.
 */
export async function historicoAvisos() {
  const registos = await store.listDocs('avisosAtraso');
  registos.sort((a, b) => (b.enviadoEm || 0) - (a.enviadoEm || 0));
  return registos;
}
