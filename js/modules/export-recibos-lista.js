/**
 * Export · Lista de Recibos (admin) para Excel
 * ---------------------------------------------------------------
 * Exporta a lista de recibos que está a ser vista na página de admin,
 * respeitando os filtros aplicados (ano, condómino, tipo, cancelados).
 *
 * Independente do export anual (export-excel.js): NÃO tem a trava
 * ANO_AUDITORIA_MIN, por isso exporta também recibos antigos (2024/2025)
 * importados da ferramenta anterior.
 *
 * Colunas (conforme formato de referência):
 *   Nº Recibo · Data(s) recebimento · Data Recibo · Valor · Descritivo ·
 *   Nome · Fração · Estado
 */

const EUR_FMT = '#,##0.00 €';

const C = {
  PRIMARY: '1E54C7',
  WHITE:   'FFFFFF',
  GRAY_50: 'F8FAFC',
  GRAY_300:'CBD5E1',
  TEXT:    '14182E'
};

function centavosToEur(c) { return Math.round(c || 0) / 100; }

function estadoRecibo(r) {
  if (r.estornoDe) return 'Estorno';
  if (r.cancelado) return 'Cancelado';
  return 'Emitido';
}

function mesesTxt(r) {
  if (Array.isArray(r.mesReferencia) && r.mesReferencia.length) {
    return r.mesReferencia.join(', ');
  }
  return '';
}

/**
 * @param {Array} recibos · lista JÁ filtrada (o que está no ecrã)
 * @param {Object} info · { ano, tenantNome, tipo } para o nome do ficheiro
 */
export async function exportarRecibos(recibos, info = {}) {
  if (!window.ExcelJS) {
    throw new Error('Biblioteca ExcelJS não carregada.');
  }
  if (!recibos || recibos.length === 0) {
    throw new Error('Não há recibos para exportar com os filtros atuais.');
  }

  const wb = new window.ExcelJS.Workbook();
  const ws = wb.addWorksheet('Recibos');

  // Cabeçalho
  const headers = [
    'Nº Recibo', 'Data(s) recebimento', 'Data Recibo', 'Valor',
    'Descritivo', 'Nome', 'Fração', 'Estado'
  ];
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF' + C.WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.PRIMARY } };
    cell.alignment = { vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF' + C.GRAY_300 } }
    };
  });
  headerRow.height = 20;

  // Ordenar por data desc (mais recente primeiro), como na app
  const ordenados = [...recibos].sort((a, b) =>
    (b.data || '').localeCompare(a.data || '') ||
    (b.recibo_seq || 0) - (a.recibo_seq || 0)
  );

  // Linhas
  for (const r of ordenados) {
    // Os recibos têm um único campo 'data'. Usamos essa data tanto para a
    // data de recebimento como para a data do recibo (a ferramenta não
    // distingue as duas). Os meses referência vão no descritivo se existirem.
    const desc = r.descricao || '';
    const meses = mesesTxt(r);
    const descCompleto = meses ? `${desc}${desc ? ' · ' : ''}(${meses})` : desc;

    const row = ws.addRow([
      r.recibo_numero || '',
      r.data || '',
      r.data || '',
      centavosToEur(r.valor_centimos),
      descCompleto,
      r.tenantName || '',
      r.fraction || '',
      estadoRecibo(r)
    ]);
    // Formato moeda na coluna Valor (4ª)
    row.getCell(4).numFmt = EUR_FMT;
  }

  // Larguras das colunas
  ws.getColumn(1).width = 18;  // Nº Recibo
  ws.getColumn(2).width = 18;  // Data(s) recebimento
  ws.getColumn(3).width = 14;  // Data Recibo
  ws.getColumn(4).width = 14;  // Valor
  ws.getColumn(5).width = 42;  // Descritivo
  ws.getColumn(6).width = 24;  // Nome
  ws.getColumn(7).width = 14;  // Fração
  ws.getColumn(8).width = 12;  // Estado

  // Autofilter + congelar cabeçalho
  ws.autoFilter = { from: 'A1', to: 'H1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Linha de total
  const totalCentimos = ordenados.reduce((s, r) => s + (r.valor_centimos || 0), 0);
  const totalRow = ws.addRow(['', '', 'TOTAL', centavosToEur(totalCentimos), '', '', '', '']);
  totalRow.getCell(3).font = { bold: true };
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(4).numFmt = EUR_FMT;

  // Nome do ficheiro
  const partes = ['recibos'];
  if (info.ano && info.ano !== 'todos') partes.push(info.ano);
  else partes.push('todos');
  if (info.tenantNome) partes.push(info.tenantNome.replace(/[^a-zA-Z0-9]/g, '_'));
  if (info.tipo) partes.push(info.tipo);
  const filename = partes.join('-') + '.xlsx';

  // Download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}
