/**
 * Geração de PDF · Declaração de Não Dívida ao Condomínio
 * (art. 1424.º-A do Código Civil · Lei n.º 8/2022)
 *
 * Reutiliza o CARIMBO e o estilo visual do gerador de recibos (export-pdf.js):
 * carimbo azul rotacionado -8° com Condomínio + morada + NIF.
 *
 * Gera e DESCARREGA o PDF (doc.save), como os recibos. O envio é manual
 * (o admin anexa o PDF ao email no iPhone).
 *
 * Nome do ficheiro: declaracao_XXX_YYYY_FRACAO.pdf
 */

import * as store from '../store/local-store.js';
import * as condominioInfo from './condominio-info.js';

const COR_AZUL = [30, 84, 199];
const COR_PRETA = [20, 26, 46];

/**
 * Gera e descarrega o PDF da declaração.
 * @param {Object} dados - conteúdo já confirmado pelo admin
 *   { numero, ano, fracao, andar, nomeCondomino, quotaMensalTxt,
 *     pagasAte, semDividas (bool), dividasTexto, extraordinariaTexto,
 *     operatorName }
 * @returns {string} nome do ficheiro
 */
export async function gerarDeclaracaoPDF(dados) {
  if (!window.jspdf) {
    throw new Error('jsPDF não disponível. Verifica vendor/jspdf.umd.min.js.');
  }
  const { jsPDF } = window.jspdf;
  const cond = await condominioInfo.obter();
  const doc = new jsPDF('p', 'mm', 'a4');

  desenharDeclaracao(doc, dados, cond);

  const fracaoSlug = (dados.fracao || '').replace(/[^a-zA-Z0-9]/g, '');
  const numStr = String(dados.numero).padStart(3, '0');
  const filename = `declaracao_${numStr}_${dados.ano}_${fracaoSlug}.pdf`;
  doc.save(filename);
  return filename;
}

function desenharDeclaracao(doc, d, cond) {
  const margemX = 22;
  const larguraUtil = 210 - margemX * 2;
  let y = 26;

  // ── Cabeçalho do condomínio ──
  doc.setTextColor(...COR_AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CONDOMÍNIO', 105, y, { align: 'center' });
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COR_PRETA);
  doc.text(`${cond.morada} · ${cond.codigoPostal} ${capitalize(cond.localidade)}`, 105, y, { align: 'center' });
  y += 4.5;
  doc.text(`NIF: ${formatarNif(cond.nif)}`, 105, y, { align: 'center' });
  y += 10;

  // linha separadora
  doc.setDrawColor(...COR_AZUL);
  doc.setLineWidth(0.4);
  doc.line(margemX, y, 210 - margemX, y);
  y += 12;

  // ── Título ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COR_PRETA);
  doc.text('DECLARAÇÃO', 105, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(90, 94, 114);
  doc.text('(para efeitos do art. 1424.º-A do Código Civil)', 105, y, { align: 'center' });
  y += 12;

  // ── Nº e data (linha) ──
  doc.setTextColor(...COR_PRETA);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const numStr = String(d.numero).padStart(3, '0');
  doc.text(`Declaração n.º ${numStr}/${d.ano}`, margemX, y);
  doc.text(`Amadora, ${d.dataEmissaoTxt}`, 210 - margemX, y, { align: 'right' });
  y += 10;

  // ── Assunto ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const assunto = `Assunto: Declaração para efeitos da alienação da fração autónoma designada pela letra "${d.fracao}"${d.andar ? `, correspondente ao ${d.andar}` : ''}.`;
  y = escreverParagrafo(doc, assunto, margemX, y, larguraUtil, 4.6);
  y += 6;

  // ── Corpo ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Exmos. Senhores,', margemX, y);
  y += 8;

  const intro = `Para efeitos de alienação da fração autónoma designada pela letra "${d.fracao}"${d.andar ? `, correspondente ao ${d.andar}` : ''}, do prédio sito na ${cond.morada}, ${cond.codigoPostal} ${capitalize(cond.localidade)}, de que é proprietário(a) ${d.nomeCondomino}, nos termos do art. 1424.º-A do Código Civil, declara-se o seguinte:`;
  y = escreverParagrafo(doc, intro, margemX, y, larguraUtil, 5);
  y += 6;

  // Pontos numerados
  const pontos = [];

  pontos.push(`1. As quotas ordinárias desta fração encontram-se pagas até ${d.pagasAte}.`);

  if (d.semDividas) {
    pontos.push(`2. Na data de emissão desta declaração, não existem quaisquer dívidas ao condomínio por parte da fração "${d.fracao}".`);
  } else {
    pontos.push(`2. Na data de emissão desta declaração, existem as seguintes dívidas ao condomínio por parte da fração "${d.fracao}": ${d.dividasTexto || '(a especificar)'}.`);
  }

  pontos.push(`3. Os encargos do condomínio da fração "${d.fracao}", à data de emissão desta declaração, são constituídos por quotas ordinárias de pagamento mensal, no valor de ${d.quotaMensalTxt} cada, as quais se vencem no primeiro dia do mês a que respeitam e devem ser pagas até ao dia 8 desse mesmo mês.`);

  if (d.extraordinariaTexto && d.extraordinariaTexto.trim()) {
    pontos.push(`4. ${d.extraordinariaTexto.trim()}`);
  }

  doc.setFontSize(10);
  for (const p of pontos) {
    y = escreverParagrafo(doc, p, margemX, y, larguraUtil, 5);
    y += 4;
  }

  y += 8;
  doc.text('Por ser verdade, passo a presente declaração.', margemX, y);
  y += 16;

  // ── Assinatura + operador ──
  doc.setLineWidth(0.3);
  doc.setDrawColor(...COR_PRETA);
  doc.line(margemX, y, margemX + 70, y);
  y += 5;
  doc.setFontSize(9.5);
  doc.text('A Administração do Condomínio', margemX, y);
  if (d.operatorName) {
    y += 4.5;
    doc.setTextColor(90, 94, 114);
    doc.text(d.operatorName, margemX, y);
    doc.setTextColor(...COR_PRETA);
  }

  // ── Carimbo (canto inferior direito) · mesmo dos recibos ──
  desenharCarimbo(doc, cond, 150, y - 2);
}

// ── helpers de texto ──
function escreverParagrafo(doc, texto, x, y, largura, lineHeight) {
  const linhas = doc.splitTextToSize(texto, largura);
  linhas.forEach(l => { doc.text(l, x, y); y += lineHeight; });
  return y;
}

// ── carimbo · réplica exata do export-pdf.js dos recibos ──
function desenharCarimbo(doc, cond, centerX, centerY) {
  const ANGLE_DEG = -8;
  const w = 52, h = 18;
  doc.setDrawColor(...COR_AZUL);
  doc.setTextColor(...COR_AZUL);
  doc.setLineWidth(0.5);
  retanguloRotacionado(doc, centerX, centerY, w, h, ANGLE_DEG);
  retanguloRotacionado(doc, centerX, centerY, w - 1.8, h - 1.8, ANGLE_DEG);

  const linhas = [
    { texto: 'CONDOMÍNIO', bold: true, size: 7.5 },
    { texto: cond.morada, bold: false, size: 7 },
    { texto: `${cond.codigoPostal} ${capitalize(cond.localidade)}`, bold: false, size: 7 },
    { texto: `NIF: ${formatarNif(cond.nif)}`, bold: true, size: 7 },
  ];
  const rad = ANGLE_DEG * Math.PI / 180;
  const sinA = Math.sin(rad), cosA = Math.cos(rad);
  const lineHeight = 2.9;
  const startOffset = -((linhas.length - 1) * lineHeight) / 2;
  linhas.forEach((linha, i) => {
    const offY = startOffset + i * lineHeight;
    const x = centerX - offY * sinA;
    const yy = centerY + offY * cosA;
    doc.setFont('helvetica', linha.bold ? 'bold' : 'normal');
    doc.setFontSize(linha.size);
    doc.text(linha.texto, x, yy, { angle: -ANGLE_DEG, align: 'center' });
  });
  doc.setTextColor(...COR_PRETA);
  doc.setDrawColor(...COR_PRETA);
}

function retanguloRotacionado(doc, cx, cy, w, h, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const corners = [[-w/2,-h/2],[+w/2,-h/2],[+w/2,+h/2],[-w/2,+h/2]]
    .map(([x, y]) => [cx + x*c - y*s, cy + x*s + y*c]);
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    doc.line(a[0], a[1], b[0], b[1]);
  }
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function formatarNif(nif) {
  if (!nif) return '';
  const s = String(nif).replace(/\s/g, '');
  if (s.length !== 9) return s;
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)}`;
}
