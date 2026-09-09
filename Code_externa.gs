// ============================================================
//  Unidas — Registro de Visita Oficina Externa
//  Google Apps Script (Code.gs)
//  ATUALIZADO: doPost fica rápido sempre (independente da
//  quantidade de placas/fotos) — fotos, PDF e e-mail são
//  processados em segundo plano por processarFilaVisitas().
//  FIX (novo, mesmo padrão aplicado na Interna/Móvel):
//  - Links de foto do MODO MANUAL agora são gravados na coluna
//    Veículos (JSON), igual já acontecia no modo SAC — antes as
//    fotos eram salvas no Drive mas o link nunca era persistido
//    em nenhuma coluna.
//  - Coluna "Foto Fachada" agora é sempre atualizada com o link
//    real — antes nunca era escrita depois do "Processando…"
//    inicial, ficando presa nesse texto pra sempre.
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1qrj_f2vYjpSEUtCYOgxhqB7ryeh-VnUZ9rTK481EWCw',
  SHEET_NAME:     '',
  EMAIL_TO:       'augusto.oliveira@unidas.com.br',
  // ID da pasta no Google Drive onde as fotos das visitas serão organizadas.
  DRIVE_FOTOS_FOLDER_ID: '10jn0gx2hx4SabUoQRn9kSyxbkTNjcZY9',
  // ID da pasta no Google Drive onde os laudos em PDF serão salvos.
  DRIVE_LAUDOS_FOLDER_ID: '1abW7Ci60p4A-mSYBvAeqxRbfxjRS5IPi',
  // Máximo de fotos anexadas diretamente no corpo do e-mail (as demais ficam só no Drive).
  MAX_FOTOS_EMAIL: 10,
  // Limite de fotos embutidas no PDF (Base64 direto na conversão HTML→PDF).
  MAX_FOTOS_PDF: 20,
};

// Colunas da planilha principal (1-indexado) que o processamento em segundo
// plano atualiza depois de gerar as fotos/PDF de fato.
// ATENÇÃO: "Foto Veículo 1/2/3" foram removidas manualmente da planilha
// (eram legado, já sem uso) — os números abaixo refletem o layout atual.
const COL = {
  VEICULOS_JSON: 46, // AT
  PASTA_FOTOS: 47,   // AU
  LAUDO_PDF: 48,     // AV
  ENVIO_ID: 49,      // AW
  FOTO_FACHADA: 50,  // AX
  ACOES_MANUAL: 51,  // AY — descontinuada, ação já vem dentro do Veículos (JSON)
};

// ============================================================
//  doPost — CAMINHO RÁPIDO. Só grava o essencial e enfileira o
//  resto (fotos, PDF, e-mail) para processamento em segundo plano.
//  Isso mantém o tempo de resposta baixo e constante, não importa
//  se a visita tem 1 ou 100 placas.
// ============================================================
function doPost(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (errLock) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'erro', planilha: 'erro', email: 'erro', pdf: 'erro',
      erro: 'Timeout ao aguardar lock: ' + errLock.message,
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const p  = (e && e.parameter)  ? e.parameter  : {};
    const ps = (e && e.parameters) ? e.parameters : {};

    // ── Dados básicos ─────────────────────────────────────────
    const tipoOficina    = p['entry.1234567'] || '';
    const presencialTel  = p['presencial_telefone'] || '';
    const nomeAnalista   = p['entry.277269067'] || '';
    const cnpjDigits     = p['entry.2772692101'] ? String(p['entry.2772692101']).replace(/\D/g, '') : '';
    const cnpjAsText     = cnpjDigits ? ("'" + cnpjDigits) : '';
    const nomeOficina    = p['entry.2145891507'] || '';
    const dataVisita     = formatarData(p['entry.324297223']) || formatarData(new Date().toISOString().slice(0,10));
    const horarioVisita  = p['entry.557213050'] || '';
    const endereco       = p['entry.222603552'] || '';
    const cidade         = p['entry.498456657'] || '';
    const tipoServico    = joinArray(ps['entry.406949507']);
    const modalidade     = joinArray(ps['entry.406949508']);
    const motivoVisita   = joinArray(ps['entry.406949569']);
    const visitaCompleta = p['visita_completa'] || '';
    const envioId        = p['envio_id'] || '';

    // ── Planilha (abrimos já aqui para poder checar duplicidade antes de tudo) ──
    const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : ss.getActiveSheet();
    if (!sheet) throw new Error('Aba não encontrada.');

    // Reenvio do mesmo envio_id (ex: analista clicou "Tentar novamente" depois que
    // o original já tinha sido salvo/enfileirado) — não duplica a linha nem a fila.
    if (envioId && envioJaProcessado(sheet, envioId)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'ok', planilha: 'ok', email: 'processando', pdf: 'processando', erro: '',
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── Auditoria Área 1 ──────────────────────────────────────
    const fachada       = p['entry.1763396896'] || '';
    const fachadaComent = p['entry.1921291190'] || '';
    const guarda        = p['entry.902843739']  || '';
    const guardaComent  = p['entry.1921291191'] || '';
    const equipe        = p['entry.588727595']  || '';
    const equipeComent  = p['entry.1362293703'] || '';

    // ── Auditoria Área 2 ──────────────────────────────────────
    const cabine       = p['entry.1998980664'] || '';
    const cabineComent = p['entry.1679082496'] || '';
    const salaEspera   = p['entry.1982999332'] || '';
    const salaComent   = p['entry.467759870']  || '';

    // ── Contagem de veículos ──────────────────────────────────
    const vtTotal     = p['entry.1586662502'] || '0';
    const vtOrcamento = p['entry.1519304362'] || '0';
    const vtAprovacao = p['entry.1518304283'] || '0';
    const vtServico   = p['entry.1495825427'] || '0';
    const vtPecas     = p['entry.940201240']  || '0';
    const vtFS        = p['entry.940201145']  || '0';
    const vtEntregues = p['entry.185208252']  || '0';

    // ── Fornecedores ──────────────────────────────────────────
    const fornecedores = p['entry.1359946908'] || '';
    const qtdFornec    = p['entry.1986006638'] || '';

    // ── Veículos: modo SAC (JSON) ou modo manual (3 placas) ───
    const veiculosJson = p['entry.veiculos_json'] || '';
    let sacVeiculos = [];
    let usandoSAC   = false;
    if (veiculosJson) {
      try { sacVeiculos = JSON.parse(veiculosJson); usandoSAC = true; }
      catch (err) { Logger.log('Erro ao parsear veiculos_json: ' + err); }
    }

    // Modo manual (campos legacy)
    const placa1      = p['placa1']      || '';
    const observacao1 = p['observacao1'] || '';
    const data1       = p['data1']       || '';
    const status1      = p['status1']    || '';
    const placa2      = p['placa2']      || '';
    const observacao2 = p['observacao2'] || '';
    const data2       = p['data2']       || '';
    const status2      = p['status2']    || '';
    const placa3      = p['placa3']      || '';
    const observacao3 = p['observacao3'] || '';
    const data3       = p['data3']       || '';
    const status3      = p['status3']    || '';

    // Ações do modo manual (temporário, só usado aqui pra montar o array
    // unificado abaixo — não é mais salvo numa coluna separada).
    const acoesManualJson = p['entry.acoes_manual_json'] || '[]';

    // ── 1) Gravar a linha principal AGORA (rápido, sem esperar fotos/PDF/e-mail) ──
    // Veículos do modo SAC e do modo manual vão pro MESMO array/coluna, cada
    // item marcado com "origem" (Planilha ou Manual) — o JSON é salvo por
    // enquanto sem os links de foto (ainda não foram geradas); a fila de
    // processamento atualiza essa mesma célula depois (nos DOIS modos).
    let veiculosUnificados;
    if (usandoSAC) {
      veiculosUnificados = sacVeiculos.map(v => {
        const { foto, fotos, ...resto } = v;
        return Object.assign({ origem: 'Planilha' }, resto);
      });
    } else {
      const mapaAcoesManual = mapearAcoesManual(acoesManualJson);
      veiculosUnificados = [
        { placa: placa1, observacao: observacao1, entrega: data1, status: status1, acao: mapaAcoesManual[String(placa1).trim().toUpperCase()] || '', origem: 'Manual' },
        { placa: placa2, observacao: observacao2, entrega: data2, status: status2, acao: mapaAcoesManual[String(placa2).trim().toUpperCase()] || '', origem: 'Manual' },
        { placa: placa3, observacao: observacao3, entrega: data3, status: status3, acao: mapaAcoesManual[String(placa3).trim().toUpperCase()] || '', origem: 'Manual' },
      ].filter(v => v.placa);
    }
    const veiculosJsonInicial = JSON.stringify(veiculosUnificados);

    const agora = new Date();
    const carimbo = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

    const rowData = [
      carimbo, nomeAnalista, presencialTel, nomeOficina, tipoOficina, tipoServico,
      dataVisita, horarioVisita, endereco, fachada, fachadaComent, guarda, guardaComent,
      equipe, equipeComent, cabine, cabineComent, salaEspera, salaComent,
      vtTotal, vtOrcamento, vtAprovacao, vtServico, vtPecas, vtFS, vtEntregues,
      fornecedores, qtdFornec, '', modalidade, motivoVisita, cidade,
      usandoSAC ? '' : placa1, usandoSAC ? '' : observacao1, usandoSAC ? '' : data1, usandoSAC ? '' : status1,
      usandoSAC ? '' : placa2, usandoSAC ? '' : observacao2, usandoSAC ? '' : data2, usandoSAC ? '' : status2,
      usandoSAC ? '' : placa3, usandoSAC ? '' : observacao3, usandoSAC ? '' : data3, usandoSAC ? '' : status3,
      cnpjAsText,
      veiculosJsonInicial,   // AT — SAC e Manual, unificados, com "origem"
      'Processando…',        // AU — Pasta de Fotos
      'Processando…',        // AV — Laudo PDF
      envioId,                // AW — ID de Envio
      'Processando…',        // AX — Foto Fachada (legado)
      '',                     // AY — Ações (Manual), descontinuada
    ];

    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);

    // ── 2) Enfileirar fotos + PDF + e-mail para processamento em segundo plano ──
    enfileirarProcessamentoVisita({
      tipoOficina, presencialTel, nomeAnalista, cnpjDigits, nomeOficina, dataVisita,
      horarioVisita, endereco, cidade, tipoServico, modalidade, motivoVisita, visitaCompleta,
      fachada, fachadaComent, guarda, guardaComent, equipe, equipeComent,
      cabine, cabineComent, salaEspera, salaComent,
      vtTotal, vtOrcamento, vtAprovacao, vtServico, vtPecas, vtFS, vtEntregues,
      fornecedores, qtdFornec,
      usandoSAC, sacVeiculos,
      placa1, observacao1, data1, status1, placa2, observacao2, data2, status2, placa3, observacao3, data3, status3,
      acoesManualJson,
      fotos1: p['fotos1'] || '[]', fotos2: p['fotos2'] || '[]', fotos3: p['fotos3'] || '[]',
      fotosfachada: p['fotosfachada'] || '[]',
      linhaPlanilha: nextRow,
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok', planilha: 'ok', email: 'processando', pdf: 'processando', erro: '',
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (errFatal) {
    // Rede de segurança: qualquer erro não previsto ainda devolve um JSON válido
    // (em vez do Apps Script gerar uma página de erro genérica, que quebra a
    // leitura no app e faz parecer que nada foi salvo).
    Logger.log('Erro fatal não tratado: ' + (errFatal && errFatal.stack ? errFatal.stack : errFatal));
    return ContentService.createTextOutput(JSON.stringify({
      status: 'erro', planilha: 'erro', email: 'erro', pdf: 'erro',
      erro: 'Erro inesperado no servidor: ' + (errFatal.message || String(errFatal)),
    })).setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}

/**
 * Preenche o título das colunas AT–BB (46–54) na linha 1. Rode esta função
 * UMA VEZ pelo editor do Apps Script (selecione ela no menu e clique em
 * "Executar") — pode rodar de novo sempre que os títulos mudarem, é seguro.
 */
function configurarCabecalhosPlanilha() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : ss.getActiveSheet();

  const titulos = {
    [COL.VEICULOS_JSON]: 'Veículos (JSON) — Planilha ou Manual, com campo "origem"',
    [COL.PASTA_FOTOS]:   'Pasta de Fotos',
    [COL.LAUDO_PDF]:     'Laudo PDF',
    [COL.ENVIO_ID]:      'ID de Envio',
    [COL.FOTO_FACHADA]:  'Foto Fachada (legado — ver Pasta de Fotos)',
    [COL.ACOES_MANUAL]:  'Ações (Manual) — descontinuada, ver Veículos (JSON)',
  };

  Object.keys(titulos).forEach(col => {
    sheet.getRange(1, Number(col)).setValue(titulos[col]);
  });

  Logger.log('Cabeçalhos configurados com sucesso.');
}

// ============================================================
//  Fila de visitas (fotos + PDF + e-mail em segundo plano)
// ============================================================
const FILA_VISITAS_SHEET_NAME = 'Fila_Visitas';
const MAX_TENTATIVAS_VISITA   = 10;
// Deixa margem antes do limite de execução do Apps Script (~6 min).
const TEMPO_MAX_EXECUCAO_MS   = 4.5 * 60 * 1000;

function obterOuCriarSheetFilaVisitas() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(FILA_VISITAS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FILA_VISITAS_SHEET_NAME);
    sheet.appendRow(['Data', 'Linha na Planilha Principal', 'ID do Arquivo (Drive)', 'Tentativas', 'Status']);
  }
  return sheet;
}

/**
 * Salva todo o payload da visita (inclui as fotos em Base64) num único
 * arquivo no Drive e adiciona uma linha na fila — rápido, independente da
 * quantidade de fotos, porque é UMA gravação em vez de várias chamadas.
 */
function enfileirarProcessamentoVisita(payload) {
  const jsonStr = JSON.stringify(payload);
  const blob    = Utilities.newBlob(jsonStr, 'application/json', 'visita_pendente_' + Date.now() + '.json');
  const pasta   = DriveApp.getFolderById(CONFIG.DRIVE_FOTOS_FOLDER_ID);
  const arquivo = pasta.createFile(blob);

  const sheetFila = obterOuCriarSheetFilaVisitas();
  sheetFila.appendRow([new Date(), payload.linhaPlanilha, arquivo.getId(), 0, 'pendente']);
}

/**
 * Processa a fila de visitas pendentes: salva as fotos no Drive, gera o PDF,
 * envia o e-mail, e atualiza a linha já gravada na planilha com os links reais.
 *
 * Configure um gatilho de tempo para chamar esta função periodicamente — rode
 * `configurarTriggerFilaVisitas` UMA VEZ pelo editor do Apps Script (selecione
 * a função no menu e clique em "Executar") para criar o gatilho automaticamente.
 */
function processarFilaVisitas() {
  const inicioExecucao = Date.now();
  const sheetFila = obterOuCriarSheetFilaVisitas();
  const dados = sheetFila.getDataRange().getValues();

  const ssPrincipal    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetPrincipal = CONFIG.SHEET_NAME ? ssPrincipal.getSheetByName(CONFIG.SHEET_NAME) : ssPrincipal.getActiveSheet();

  for (let i = 1; i < dados.length; i++) { // pula o cabeçalho
    if (Date.now() - inicioExecucao > TEMPO_MAX_EXECUCAO_MS) break; // resto fica pro próximo ciclo

    const [, linhaPlanilha, driveFileId, tentativas, status] = dados[i];
    if (status !== 'pendente') continue;

    try {
      processarUmaVisita(sheetPrincipal, linhaPlanilha, driveFileId);
      sheetFila.getRange(i + 1, 5).setValue('concluido');
      try { DriveApp.getFileById(driveFileId).setTrashed(true); } catch (errLixo) {}
    } catch (err) {
      const novaTentativa = (tentativas || 0) + 1;
      sheetFila.getRange(i + 1, 4).setValue(novaTentativa);
      if (novaTentativa >= MAX_TENTATIVAS_VISITA) sheetFila.getRange(i + 1, 5).setValue('falhou_definitivo');
      Logger.log('Falha ao processar visita da fila (linha ' + (i + 1) + '): ' + (err && err.stack ? err.stack : err));
    }
  }
}

/** Transforma o JSON [{placa, acao}] do modo manual num mapa {placaNormalizada: acao}. */
function mapearAcoesManual(acoesManualJson) {
  const mapa = {};
  try {
    const lista = JSON.parse(acoesManualJson || '[]');
    (lista || []).forEach(item => {
      if (item && item.placa) mapa[String(item.placa).trim().toUpperCase()] = item.acao || '';
    });
  } catch (err) { Logger.log('Erro ao parsear acoes_manual_json: ' + err); }
  return mapa;
}

/** Faz o trabalho pesado de uma visita: fotos no Drive, PDF, e-mail. */
function processarUmaVisita(sheetPrincipal, linhaPlanilha, driveFileId) {
  const arquivo = DriveApp.getFileById(driveFileId);
  const payload = JSON.parse(arquivo.getBlob().getDataAsString());

  const {
    tipoOficina, presencialTel, nomeAnalista, cnpjDigits, nomeOficina, dataVisita,
    horarioVisita, endereco, cidade, tipoServico, modalidade, motivoVisita, visitaCompleta,
    fachada, fachadaComent, guarda, guardaComent, equipe, equipeComent,
    cabine, cabineComent, salaEspera, salaComent,
    vtTotal, vtOrcamento, vtAprovacao, vtServico, vtPecas, vtFS, vtEntregues,
    fornecedores, qtdFornec,
    usandoSAC, placa1, observacao1, data1, status1, placa2, observacao2, data2, status2, placa3, observacao3, data3, status3,
  } = payload;
  let sacVeiculos = payload.sacVeiculos || [];
  const mapaAcoesManual = mapearAcoesManual(payload.acoesManualJson);

  // ── Fotos: salvar no Drive e preparar anexos de e-mail/PDF ──
  let pastaFotos = null;
  const fotosParaEmail = []; // [{ placa, blob, fileId }]
  let pastaFotosUrl = '';
  function garantirPastaFotos() {
    if (!pastaFotos) pastaFotos = obterOuCriarPastaVisita(nomeOficina, dataVisita);
    pastaFotosUrl = pastaFotos.getUrl();
    return pastaFotos;
  }

  // Fotos do modo SAC — embute os links dentro de cada item ("fotosUrls")
  if (usandoSAC && sacVeiculos.length) {
    sacVeiculos = sacVeiculos.map(v => {
      const listaFotos = v && Array.isArray(v.fotos) ? v.fotos : (v && v.foto ? [v.foto] : []);
      if (listaFotos.length) {
        const pasta = garantirPastaFotos();
        const urls = [];
        listaFotos.forEach((f, i) => {
          if (!f || !f.base64) return;
          const salvo = salvarFotoNoDrive(f.base64, f.mime, (v.placa || 'veiculo') + '_' + (i + 1) + '.jpg', pasta);
          if (salvo) {
            urls.push(salvo.url);
            fotosParaEmail.push({ placa: v.placa || '—', blob: salvo.blob, fileId: salvo.fileId });
          }
        });
        const { foto, fotos, ...resto } = v;
        return Object.assign({ origem: 'Planilha' }, resto, { fotosUrls: urls });
      }
      return Object.assign({ origem: 'Planilha' }, v);
    });
  }

  // Fotos do modo MANUAL (placa1/2/3) — agora monta um array unificado com
  // "fotosUrls" embutido em cada item, igual ao modo SAC. Antes as fotos
  // eram salvas no Drive normalmente, mas o link ficava só em
  // "fotosManuaisUrls" (variável local nunca gravada em nenhuma célula) —
  // por isso a coluna Veículos (JSON) nunca recebia foto de placa no modo
  // manual, e a atualização abaixo era pulada por inteiro (só "if (usandoSAC)").
  let manualVeiculos = [];
  if (!usandoSAC) {
    const placas = [
      { placa: placa1, observacao: observacao1, entrega: data1, status: status1, chave: 1 },
      { placa: placa2, observacao: observacao2, entrega: data2, status: status2, chave: 2 },
      { placa: placa3, observacao: observacao3, entrega: data3, status: status3, chave: 3 },
    ].filter(v => v.placa);

    manualVeiculos = placas.map(v => {
      let listaFotos = [];
      try { listaFotos = JSON.parse(payload['fotos' + v.chave] || '[]'); } catch (err) { listaFotos = []; }

      const urls = [];
      if (listaFotos.length) {
        const pasta = garantirPastaFotos();
        listaFotos.forEach((f, i) => {
          if (!f || !f.base64) return;
          const nome = f.nome || ('veiculo' + v.chave + '_' + (i + 1) + '.jpg');
          const salvo = salvarFotoNoDrive(f.base64, f.mime, nome, pasta);
          if (salvo) {
            urls.push(salvo.url);
            fotosParaEmail.push({ placa: v.placa, blob: salvo.blob, fileId: salvo.fileId });
          }
        });
      }

      return {
        origem: 'Manual',
        placa: v.placa,
        observacao: v.observacao,
        entrega: v.entrega,
        status: v.status,
        acao: mapaAcoesManual[String(v.placa).trim().toUpperCase()] || '',
        fotosUrls: urls,
      };
    });
  }

  // veiculosJsonLimpo agora é montado nos DOIS modos, sempre com fotosUrls.
  const veiculosJsonLimpo = usandoSAC ? JSON.stringify(sacVeiculos) : JSON.stringify(manualVeiculos);

  // Foto da fachada
  let fotosFachadaUrl = '';
  const fotosFachadaParaEmail = [];
  {
    let listaFachada = [];
    try { listaFachada = JSON.parse(payload['fotosfachada'] || '[]'); } catch (err) { listaFachada = []; }
    if (listaFachada.length) {
      const pasta = garantirPastaFotos();
      const urls = [];
      listaFachada.forEach((f, i) => {
        if (!f || !f.base64) return;
        const nome = f.nome || ('fachada_' + (i + 1) + '.jpg');
        const salvo = salvarFotoNoDrive(f.base64, f.mime, nome, pasta);
        if (salvo) {
          urls.push(salvo.url);
          fotosFachadaParaEmail.push({ blob: salvo.blob, fileId: salvo.fileId });
        }
      });
      fotosFachadaUrl = urls.join('\n');
    }
  }

  // ── Gerar e salvar o laudo em PDF ──
  let laudoPdfUrl = 'Falha ao gerar';
  try {
    const veiculosPdf = usandoSAC ? sacVeiculos.slice(0, 10) : manualVeiculos;

    const fotosParaPdfLimitadas = fotosParaEmail.slice(0, CONFIG.MAX_FOTOS_PDF);
    const fotosPdfTemplate = fotosParaPdfLimitadas.map(f => ({
      placa: f.placa,
      src: 'data:' + f.blob.getContentType() + ';base64,' + Utilities.base64Encode(f.blob.getBytes()),
    }));
    const fotosExtrasPdf = Math.max(0, fotosParaEmail.length - fotosParaPdfLimitadas.length);
    const fotosFachadaPdfTemplate = fotosFachadaParaEmail.map(f => (
      'data:' + f.blob.getContentType() + ';base64,' + Utilities.base64Encode(f.blob.getBytes())
    ));

    const htmlRelatorio = montarEmailExterno({
      tipoOficina, presencialTel, nomeAnalista, cnpjOficina: cnpjDigits,
      nomeOficina, dataVisita, horarioVisita, endereco, cidade,
      tipoServico, modalidade, motivoVisita, visitaCompleta,
      fachada, fachadaComent, guarda, guardaComent,
      equipe, equipeComent, cabine, cabineComent, salaEspera, salaComent,
      vtTotal, vtOrcamento, vtAprovacao, vtServico, vtPecas, vtFS, vtEntregues,
      fornecedores, qtdFornec,
      veiculosEmail: veiculosPdf,
      totalVeiculosSAC: usandoSAC ? sacVeiculos.length : 0,
      fotos: fotosPdfTemplate,
      fotosExtras: fotosExtrasPdf,
      pastaFotosUrl: pastaFotosUrl,
      fotosFachada: fotosFachadaPdfTemplate,
    });

    const nomeArquivoPdf = 'Laudo - ' + (nomeOficina || 'Oficina') + ' - ' + (nomeAnalista || 'Analista') + ' - ' + dataVisita.replace(/\//g, '-') + '.pdf';
    const pdfBlob = Utilities.newBlob(htmlRelatorio, 'text/html', 'laudo.html').getAs('application/pdf').setName(nomeArquivoPdf);

    const pastaLaudos = DriveApp.getFolderById(CONFIG.DRIVE_LAUDOS_FOLDER_ID);
    const arquivoPdf  = pastaLaudos.createFile(pdfBlob);
    arquivoPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    laudoPdfUrl = arquivoPdf.getUrl();
  } catch (errPdf) {
    Logger.log('Erro PDF (processamento em segundo plano): ' + errPdf);
  }

  // ── Atualiza a linha já gravada com os links reais ──
  // Agora SEMPRE atualiza Veículos (JSON) e Foto Fachada, nos dois modos —
  // antes VEICULOS_JSON só acontecia "if (usandoSAC)" (manual ficava sem
  // foto) e FOTO_FACHADA nunca era escrita aqui (ficava "Processando…" pra
  // sempre, em qualquer modo).
  sheetPrincipal.getRange(linhaPlanilha, COL.VEICULOS_JSON).setValue(veiculosJsonLimpo);
  sheetPrincipal.getRange(linhaPlanilha, COL.PASTA_FOTOS).setValue(pastaFotosUrl || 'Sem fotos recebidas');
  sheetPrincipal.getRange(linhaPlanilha, COL.LAUDO_PDF).setValue(laudoPdfUrl);
  sheetPrincipal.getRange(linhaPlanilha, COL.FOTO_FACHADA).setValue(
    fotosFachadaUrl || pastaFotosUrl || 'Sem foto de fachada'
  );

  // ── Enviar e-mail ──
  // Monta o e-mail ANTES de checar a cota — se a cota já estiver zerada,
  // o e-mail ainda vai pra fila de reenvio corretamente (antes, a checagem
  // vinha primeiro e o "throw" acontecia antes de subject/htmlBody
  // existirem, então o catch abaixo não tinha o que enfileirar e a visita
  // ficava sem e-mail pra sempre, sem nunca tentar de novo).
  let subject  = 'Visita Oficina ' + tipoOficina + ' — ' + nomeOficina + ' (' + dataVisita + ')';
  let htmlBody = '';
  // Mapa cid → fileId (não uma lista simples) — cobre fotos de veículo E de
  // fachada com o nome de cid certo, pra o reenvio automático (Fila_Email)
  // conseguir reconstruir TODAS as imagens embutidas, não só as de veículo.
  let cidParaFileIdFila = {};
  try {
    const veiculosEmail = usandoSAC ? sacVeiculos.slice(0, 10) : manualVeiculos;

    const fotosLimitadas = fotosParaEmail.slice(0, CONFIG.MAX_FOTOS_EMAIL);
    const inlineImages = {};
    const fotosParaTemplate = fotosLimitadas.map((f, i) => {
      const cid = 'foto_' + i;
      inlineImages[cid] = f.blob;
      if (f.fileId) cidParaFileIdFila[cid] = f.fileId;
      return { placa: f.placa, src: 'cid:' + cid };
    });
    const fotosExtras = Math.max(0, fotosParaEmail.length - fotosLimitadas.length);

    const fotosFachadaTemplate = fotosFachadaParaEmail.map((f, i) => {
      const cid = 'fachada_' + i;
      inlineImages[cid] = f.blob;
      if (f.fileId) cidParaFileIdFila[cid] = f.fileId;
      return 'cid:' + cid;
    });

    htmlBody = montarEmailExterno({
      tipoOficina, presencialTel, nomeAnalista, cnpjOficina: cnpjDigits,
      nomeOficina, dataVisita, horarioVisita, endereco, cidade,
      tipoServico, modalidade, motivoVisita, visitaCompleta,
      fachada, fachadaComent, guarda, guardaComent,
      equipe, equipeComent, cabine, cabineComent, salaEspera, salaComent,
      vtTotal, vtOrcamento, vtAprovacao, vtServico, vtPecas, vtFS, vtEntregues,
      fornecedores, qtdFornec,
      veiculosEmail,
      totalVeiculosSAC: usandoSAC ? sacVeiculos.length : 0,
      fotos: fotosParaTemplate,
      fotosExtras: fotosExtras,
      pastaFotosUrl: pastaFotosUrl,
      fotosFachada: fotosFachadaTemplate,
    });

    if (MailApp.getRemainingDailyQuota() <= 0) throw new Error('Cota de e-mail esgotada.');

    const opcoesEmail = { to: CONFIG.EMAIL_TO, subject: subject, htmlBody: htmlBody };
    if (Object.keys(inlineImages).length) opcoesEmail.inlineImages = inlineImages;

    MailApp.sendEmail(opcoesEmail);
  } catch (errMail) {
    Logger.log('Erro e-mail (processamento em segundo plano): ' + errMail);
    if (htmlBody) enfileirarEmailFalho(subject, htmlBody, cidParaFileIdFila);
    else Logger.log('E-mail não pôde ser montado — nada a enfileirar para a visita da linha ' + linhaPlanilha + '.');
  }
}

/**
 * Rode esta função UMA VEZ pelo editor do Apps Script para criar o gatilho
 * automático que chama processarFilaVisitas() a cada 1 minuto.
 */
function configurarTriggerFilaVisitas() {
  const jaExiste = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processarFilaVisitas');
  if (jaExiste) { Logger.log('Trigger já existe — nada a fazer.'); return; }
  ScriptApp.newTrigger('processarFilaVisitas').timeBased().everyMinutes(1).create();
  Logger.log('Trigger criado com sucesso: processarFilaVisitas a cada 1 min.');
}

// ------------------------------------------------------------
//  Deduplicação de envios (evita linha duplicada em reenvios)
// ------------------------------------------------------------
function envioJaProcessado(sheet, envioId) {
  try {
    const ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 2) return false;
    const valores = sheet.getRange(2, COL.ENVIO_ID, ultimaLinha - 1, 1).getValues();
    return valores.some(row => row[0] === envioId);
  } catch (err) {
    Logger.log('Erro ao checar envio_id (seguindo sem checar): ' + err);
    return false;
  }
}

// ------------------------------------------------------------
//  Fotos: Drive
// ------------------------------------------------------------
/**
 * Decodifica uma foto em Base64 e salva como arquivo dentro da pasta informada.
 * Retorna { url, blob, fileId } ou null em caso de falha.
 */
function salvarFotoNoDrive(base64, mime, nomeArquivo, pastaVisita) {
  if (!base64 || !pastaVisita) return null;
  try {
    const bytes = Utilities.base64Decode(base64);
    const blob  = Utilities.newBlob(bytes, mime || 'image/jpeg', nomeArquivo || 'foto.jpg');
    const file  = pastaVisita.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { url: file.getUrl(), blob: blob, fileId: file.getId() };
  } catch (err) {
    Logger.log('Erro ao salvar foto no Drive: ' + err);
    return null;
  }
}

/**
 * Cria a subpasta da visita dentro da pasta raiz configurada em
 * CONFIG.DRIVE_FOTOS_FOLDER_ID.
 */
function obterOuCriarPastaVisita(nomeOficina, dataVisita) {
  const raiz = DriveApp.getFolderById(CONFIG.DRIVE_FOTOS_FOLDER_ID);
  const carimbo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss');
  const nomePasta = 'Visita - ' + (nomeOficina || 'Oficina') + ' - ' + dataVisita + ' ' + carimbo;
  return raiz.createFolder(nomePasta);
}

// ------------------------------------------------------------
//  Fila de reenvio de e-mail (ex: cota diária do MailApp esgotada)
// ------------------------------------------------------------
const FILA_EMAIL_SHEET_NAME = 'Fila_Email';
const MAX_TENTATIVAS_EMAIL  = 48; // ~1 dia, rodando a cada 30 min

function obterOuCriarSheetFila() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(FILA_EMAIL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FILA_EMAIL_SHEET_NAME);
    sheet.appendRow(['Data', 'Assunto', 'Para', 'HTML', 'IDs das Fotos (JSON)', 'Tentativas', 'Status']);
  }
  return sheet;
}

/** Guarda um e-mail que falhou ao enviar, para tentar de novo depois.
 * cidParaFileId: mapa { "foto_0": "driveFileId", "fachada_0": "driveFileId", ... } —
 * cobre TODAS as imagens embutidas (veículo + fachada) com o cid certo. */
function enfileirarEmailFalho(subject, htmlBody, cidParaFileId) {
  try {
    const sheet = obterOuCriarSheetFila();
    sheet.appendRow([new Date(), subject, CONFIG.EMAIL_TO, htmlBody, JSON.stringify(cidParaFileId || {}), 0, 'pendente']);
  } catch (err) {
    Logger.log('Erro ao enfileirar e-mail: ' + err);
  }
}

/**
 * Reenvia e-mails pendentes da fila. As fotos são recarregadas do Drive pelo
 * ID salvo (o corpo do e-mail já guardado não contém as imagens em si, só as
 * referências "cid:" que apontam pra elas).
 *
 * Configure um gatilho de tempo para chamar esta função periodicamente —
 * rode `configurarTriggerFilaEmail` UMA VEZ pelo editor do Apps Script
 * (selecione a função no menu e clique em "Executar") para criar o gatilho
 * automaticamente a cada 30 minutos.
 */
const EMAIL_COOLDOWN_PROP = 'email_cooldown_ate';

function processarFilaEmail() {
  const props = PropertiesService.getScriptProperties();
  const cooldownAte = props.getProperty(EMAIL_COOLDOWN_PROP);
  if (cooldownAte && new Date() < new Date(cooldownAte)) {
    return; // ainda esperando a cota resetar — nem abre a planilha
  }

  const sheet = obterOuCriarSheetFila();
  const dados = sheet.getDataRange().getValues();
  let quotaEsgotada = false;

  for (let i = dados.length - 1; i >= 1; i--) { // pula o cabeçalho (linha 0)
    const [, subject, para, htmlBody, cidParaFileIdJson, tentativas, status] = dados[i];
    if (status !== 'pendente') continue;

    if (MailApp.getRemainingDailyQuota() <= 0) {
      quotaEsgotada = true;
      break; // sem cota — não adianta continuar tentando as próximas linhas agora
    }

    try {
      // Compatível com o formato antigo (array simples, só fotos de
      // veículo) e o novo (mapa cid → fileId, cobre fachada também).
      let cidParaFileId = {};
      try {
        const parsed = JSON.parse(cidParaFileIdJson || '{}');
        if (Array.isArray(parsed)) {
          parsed.forEach((id, idx) => { cidParaFileId['foto_' + idx] = id; });
        } else if (parsed && typeof parsed === 'object') {
          cidParaFileId = parsed;
        }
      } catch (errParse) {}

      const inlineImages = {};
      Object.keys(cidParaFileId).forEach(cid => {
        try { inlineImages[cid] = DriveApp.getFileById(cidParaFileId[cid]).getBlob(); } catch (errBlob) {}
      });

      const opcoes = { to: para, subject: subject, htmlBody: htmlBody };
      if (Object.keys(inlineImages).length) opcoes.inlineImages = inlineImages;

      MailApp.sendEmail(opcoes);
      sheet.getRange(i + 1, 7).setValue('enviado');
    } catch (err) {
      const novaTentativa = (tentativas || 0) + 1;
      sheet.getRange(i + 1, 6).setValue(novaTentativa);
      if (novaTentativa >= MAX_TENTATIVAS_EMAIL) sheet.getRange(i + 1, 7).setValue('falhou_definitivo');
      Logger.log('Falha ao reenviar e-mail da fila (linha ' + (i + 1) + '): ' + err);
    }
  }

  if (quotaEsgotada) {
    // A cota do MailApp reseta por volta da meia-noite no horário do Pacífico (EUA).
    // 07:00 do dia seguinte (horário do script) dá uma margem segura de sobra.
    const proximaTentativa = new Date();
    proximaTentativa.setDate(proximaTentativa.getDate() + 1);
    proximaTentativa.setHours(7, 0, 0, 0);
    props.setProperty(EMAIL_COOLDOWN_PROP, proximaTentativa.toISOString());
    Logger.log('Cota de e-mail esgotada — próxima tentativa às ' + proximaTentativa.toLocaleString());
  } else {
    props.deleteProperty(EMAIL_COOLDOWN_PROP);
  }
}

/**
 * Rode esta função UMA VEZ pelo editor do Apps Script para criar o gatilho
 * automático que chama processarFilaEmail() a cada 30 minutos.
 */
function configurarTriggerFilaEmail() {
  const jaExiste = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processarFilaEmail');
  if (jaExiste) { Logger.log('Trigger já existe — nada a fazer.'); return; }
  ScriptApp.newTrigger('processarFilaEmail').timeBased().everyMinutes(30).create();
  Logger.log('Trigger criado com sucesso: processarFilaEmail a cada 30 min.');
}

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
function formatarData(raw) {
  if (!raw) return '';
  try {
    // Formato ISO: 2026-06-09
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      const [ano, mes, dia] = raw.trim().split('-');
      return dia + '/' + mes + '/' + ano;
    }
    // Formato já DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw.trim())) return raw.trim();
    // Fallback: tenta new Date
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return String(d.getUTCDate()).padStart(2,'0') + '/' + String(d.getUTCMonth()+1).padStart(2,'0') + '/' + d.getUTCFullYear();
  } catch(e) { return raw; }
}

function joinArray(arr) {
  if (typeof arr === 'string') return arr;
  return (arr && arr.length) ? arr.join(', ') : 'Não informado';
}

function orDash(val) { return (val && String(val).trim()) ? val : '—'; }

function badgeExt(val) {
  if (!val || !String(val).trim()) return '—';
  const sim = (val === 'Sim');
  return '<span style="background:' + (sim?'#d4edda':'#f8d7da') + ';color:' + (sim?'#155724':'#721c24') + ';padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">' + val + '</span>';
}

function badgeContato(val) {
  if (!val || !String(val).trim()) return '—';
  const ok = (val === 'Presencial');
  return '<span style="background:' + (ok?'#d4edda':'#fff3cd') + ';color:' + (ok?'#155724':'#856404') + ';padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">' + val + '</span>';
}

function thExt(text) {
  return '<th style="padding:9px 12px;border:1px solid #dde3ee;background:#0051AA;color:#fff;font-size:13px;text-align:left;">' + text + '</th>';
}

function rowDetalheExt(label, valor, alt) {
  const bg = alt ? '#f5f8ff' : '#ffffff';
  return '<tr><td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-weight:600;font-size:13px;width:45%;">' + label + '</td>'
    + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(valor) + '</td></tr>';
}

function rowAuditoriaExt(num, pergunta, resp, coment) {
  return '<tr><td style="padding:8px 12px;border:1px solid #dde3ee;font-size:13px;width:48%;">' + num + '. ' + pergunta + '</td>'
    + '<td style="padding:8px 12px;border:1px solid #dde3ee;font-size:13px;">' + badgeExt(resp) + '</td>'
    + '<td style="padding:8px 12px;border:1px solid #dde3ee;font-size:13px;color:#555;">' + orDash(coment) + '</td></tr>';
}

// ------------------------------------------------------------
//  E-mail / laudo em PDF
// ------------------------------------------------------------
function montarEmailExterno(c) {
  // Tabela de veículos (SAC ou manual)
  let tabelaVeiculos = '';
  if (c.veiculosEmail && c.veiculosEmail.length > 0) {
    const titulo = c.totalVeiculosSAC > 0
      ? '&#9201; Veículos no Improdutivo (Top ' + c.veiculosEmail.length + ' de ' + c.totalVeiculosSAC + ' — lista completa na planilha)'
      : '&#9201; Top 3 Veículos no Improdutivo';

    tabelaVeiculos = '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">' + titulo + '</h3>'
      + '<table style="width:100%;border-collapse:collapse;"><thead><tr>'
      + thExt('Placa') + thExt('Observação') + thExt('Dt. Prev. Entrega') + thExt('Status')+ thExt('Ação')
      + '</tr></thead><tbody>'
      + c.veiculosEmail.map(function(v, i) {     
          const bg = i % 2 === 0 ? '#ffffff' : '#f5f8ff';

          return '<tr>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.placa) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.observacao) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(formatarData(v.entrega)) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.status) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.acao) + '</td>'

            + '</tr>';
        }).join('')
      + '</tbody></table>';

    if (c.totalVeiculosSAC > 10) {
      tabelaVeiculos += '<p style="font-size:12px;color:#6b7a99;margin-top:6px;">+ ' + (c.totalVeiculosSAC - 10) + ' veículo(s) adicionais registrados na planilha.</p>';
    }
  }

  // Galeria de fotos — c.fotos = [{ placa, src }], onde src pode ser "cid:..." (e-mail)
  // ou "data:image/...;base64,..." (PDF). Organizada em linhas de até 4 fotos.
  let galeriaFotos = '';
  if (c.fotos && c.fotos.length > 0) {
    const POR_LINHA = 4;
    const linhas = [];
    for (let i = 0; i < c.fotos.length; i += POR_LINHA) linhas.push(c.fotos.slice(i, i + POR_LINHA));

    galeriaFotos = '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#128247; Fotos dos Veículos</h3>'
      + '<table style="width:100%;border-collapse:collapse;">'
      + linhas.map(function(linha) {
          return '<tr>' + linha.map(function(f) {
            return '<td style="padding:6px;text-align:center;vertical-align:top;width:' + Math.floor(100 / POR_LINHA) + '%;">'
              + '<img src="' + f.src + '" style="width:100%;max-width:140px;border-radius:8px;border:1px solid #dde3ee;">'
              + '<div style="font-size:11px;color:#555;margin-top:4px;">' + orDash(f.placa) + '</div>'
              + '</td>';
          }).join('') + '</tr>';
        }).join('')
      + '</table>';

    if (c.fotosExtras > 0 || c.pastaFotosUrl) {
      galeriaFotos += '<p style="font-size:12px;color:#6b7a99;margin-top:8px;">'
        + (c.fotosExtras > 0 ? '+ ' + c.fotosExtras + ' foto(s) adicionais. ' : '')
        + (c.pastaFotosUrl ? 'Veja todas em: <a href="' + c.pastaFotosUrl + '">' + c.pastaFotosUrl + '</a>' : '')
        + '</p>';
    }
  }

  // Bloco de Auditoria — só exibido quando a visita foi marcada como completa
  let blocoAuditoria = '';
  if (c.visitaCompleta === 'Sim') {
    blocoAuditoria = '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#128269; Auditoria</h3>'
      + '<table style="width:100%;border-collapse:collapse;"><thead><tr>' + thExt('Pergunta') + thExt('Resposta') + thExt('Comentário') + '</tr></thead><tbody>'
      + rowAuditoriaExt(1, 'Fachada e entrada em bom estado?',           c.fachada,    c.fachadaComent)
      + rowAuditoriaExt(2, 'Guarda dos veículos dentro do padrão?',      c.guarda,     c.guardaComent)
      + rowAuditoriaExt(3, 'Apresentação da equipe (uniformes e EPIs)?', c.equipe,     c.equipeComent)
      + rowAuditoriaExt(4, 'Cabine de pintura e maquinários adequados?', c.cabine,     c.cabineComent)
      + rowAuditoriaExt(5, 'Sala de espera disponível?',                 c.salaEspera, c.salaComent)
      + '</tbody></table>';
  }

  const fornecedoresExtra = (c.fornecedores === 'Sim') ? rowDetalheExt('Quantidade necessária', c.qtdFornec, true) : '';

  // Foto da fachada — evidência de visita presencial, exibida logo após os
  // dados da visita, separada da galeria de fotos dos veículos.
  let blocoFachada = '';
  if (c.fotosFachada && c.fotosFachada.length > 0) {
    blocoFachada = '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#128205; Foto da Fachada</h3>'
      + '<table style="width:100%;border-collapse:collapse;"><tr>'
      + c.fotosFachada.map(function(src) {
          return '<td style="padding:6px;text-align:center;vertical-align:top;width:' + Math.floor(100 / c.fotosFachada.length) + '%;">'
            + '<img src="' + src + '" style="width:100%;max-width:220px;border-radius:8px;border:1px solid #dde3ee;">'
            + '</td>';
        }).join('')
      + '</tr></table>';
  }

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;background:#f0f4fb;font-family:Segoe UI,Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4fb;padding:32px 0;"><tr><td align="center">'
    + '<table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,81,170,.12);">'
    + '<tr><td style="background:linear-gradient(135deg,#0051AA,#003c80);padding:28px 32px;">'
    + '<p style="margin:0;font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.1em;">Registro de Visita</p>'
    + '<h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">Oficina ' + c.tipoOficina + '</h1>'
    + '<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:14px;">' + c.nomeOficina + ' &mdash; ' + c.dataVisita + '</p>'
    + '</td></tr>'
    + '<tr><td style="padding:28px 32px;">'
    + '<h3 style="color:#0051AA;margin:0 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#128203; Informações da Visita</h3>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + rowDetalheExt('Analista',         c.nomeAnalista,              false)
    + rowDetalheExt('Tipo de Contato',  badgeContato(c.presencialTel), true)
    + rowDetalheExt('CNPJ da Oficina',  c.cnpjOficina,               false)
    + rowDetalheExt('Oficina',          c.nomeOficina,               true)
    + rowDetalheExt('Tipo de Oficina',  c.tipoOficina,               false)
    + rowDetalheExt('Tipo de Serviço',  c.tipoServico,               true)
    + rowDetalheExt('Modalidade',       c.modalidade,                false)
    + rowDetalheExt('Motivo da Visita', c.motivoVisita,              true)
    + rowDetalheExt('Data',             c.dataVisita,                false)
    + rowDetalheExt('Horário',          c.horarioVisita,             true)
    + rowDetalheExt('Endereço',         c.endereco,                  false)
    + rowDetalheExt('Cidade',           c.cidade,                    true)
    + '</table>'
    + blocoFachada
    + blocoAuditoria
    + '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#128663; Quantidade de Veículos</h3>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + rowDetalheExt('Total em manutenção',    c.vtTotal,     false)
    + rowDetalheExt('Pend. de orçamento',     c.vtOrcamento, true)
    + rowDetalheExt('Pend. de aprovação',     c.vtAprovacao, false)
    + rowDetalheExt('Em serviço (aprovados)', c.vtServico,   true)
    + rowDetalheExt('Aguardando peças',       c.vtPecas,     false)
    + rowDetalheExt('Fora de Serviço (FS)',   c.vtFS,        true)
    + rowDetalheExt('Entregues no dia',       c.vtEntregues, false)
    + '</table>'
    + '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#127981; Fornecedores</h3>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + rowDetalheExt('Necessidade de aumento?', badgeExt(c.fornecedores), false)
    + fornecedoresExtra
    + '</table>'
    + tabelaVeiculos
    + galeriaFotos
    + '</td></tr>'
    + '<tr><td style="background:#f5f8ff;border-top:1px solid #dde3ee;padding:16px 32px;text-align:center;">'
    + '<p style="margin:0;font-size:12px;color:#6b7a99;">Este e-mail foi gerado automaticamente pelo sistema de Registro de Visitas Unidas.</p>'
    + '</td></tr></table></td></tr></table></body></html>';
}
