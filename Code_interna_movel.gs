// ============================================================
//  Unidas — Registro de Visita Oficina Interna / Móvel
//  Google Apps Script (Code_interna_movel.gs)
//  ATUALIZADO: doPost fica rápido sempre (independente da
//  quantidade de placas/fotos) — fotos, PDF e e-mail são
//  processados em segundo plano por processarFilaVisitasIM().
//  FIX: enfileiramento protegido com try/catch + reparo automático
//  de "coluna com tipo" na Fila_Visitas.
//  FIX 2 (novo): links de foto do MODO MANUAL agora são gravados na
//  coluna Veículos (JSON), igual já acontecia no modo SAC — antes só
//  a foto da fachada tinha link salvo em algum lugar.
// ============================================================

const CONFIG_IM = {
  SPREADSHEET_ID: '1-RoQvUWG4a0qWYb81kf1YfnDoPLFwqRlsPWs3B9ocHA',
  // Nome fixo da aba principal — NUNCA usar getActiveSheet() num script de
  // fundo/gatilho: ele depende de qual aba estava aberta no navegador e pode
  // ficar apontando pra um gid excluído (foi a causa do bug "Sheet ... not
  // found" quando a aba Fila_Visitas foi recriada estando ativa).
  SHEET_NAME:     'Respostas ao formulário 1',
  EMAIL_TO:       'augusto.oliveira@unidas.com.br',
  // Pasta no Drive onde as fotos das visitas serão organizadas.
  DRIVE_FOTOS_FOLDER_ID: '1gZbK9IS2xd0fCy85Xa9uwPwz-gCVO8cS',
  // Mesma pasta "Laudos" usada pelo script da Oficina Externa (pasta do Drive
  // não pertence a um projeto de Apps Script específico, então pode ser reaproveitada).
  DRIVE_LAUDOS_FOLDER_ID: '1abW7Ci60p4A-mSYBvAeqxRbfxjRS5IPi',
  // Máximo de fotos anexadas diretamente no corpo do e-mail (as demais ficam só no Drive/PDF).
  MAX_FOTOS_EMAIL: 10,
  // Limite de fotos embutidas no PDF (Base64 direto na conversão HTML→PDF).
  MAX_FOTOS_PDF: 20,
};

// Colunas da planilha principal (1-indexado) que o processamento em segundo
// plano atualiza depois de gerar as fotos/PDF de fato.
// ATENÇÃO: "Foto Veículo 1/2/3" foram removidas manualmente da planilha
// (eram legado, já sem uso) — os números abaixo refletem o layout atual.
const COL_IM = {
  RESUMO_PLACAS: 29,   // AC
  PASTA_FOTOS: 30,     // AD
  CNPJ: 31,            // AE
  VEICULOS_JSON: 44,   // AR
  LAUDO_PDF: 45,       // AS
  ENVIO_ID: 46,        // AT
  FOTO_FACHADA: 47,    // AU (legado)
  ACOES_MANUAL: 48,    // AV (descontinuada)
};

// ============================================================
//  doPost — CAMINHO RÁPIDO. Só grava o essencial e enfileira o
//  resto (fotos, PDF, e-mail) para processamento em segundo plano.
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

    // ── Dados básicos ──────────────────────────────────────────
    const tipoOficinaRaw = p['entry.1234567']       || '';
    const tipoOficina    = tipoOficinaRaw === 'Movel' ? 'Móvel' : tipoOficinaRaw;
    const presencialTel  = p['presencial_telefone'] || '';
    const nomeAnalista   = p['entry.736701652']     || '';
    const cnpjOficina    = p['entry.2772692101']    || '';
    const nomeOficina    = p['entry.976127741']     || '';
    const dataVisita     = formatarDataIM(p['entry.1423595019']) || formatarDataIM(new Date().toISOString().slice(0,10));
    const horarioVisita  = p['entry.1730838108']    || '';
    const endereco       = p['entry.783598008']     || '';
    const visitaCompleta = p['visita_completa']     || '';
    const envioId        = p['envio_id']            || '';

    const sheet = SpreadsheetApp.openById(CONFIG_IM.SPREADSHEET_ID).getSheetByName(CONFIG_IM.SHEET_NAME);
    if (!sheet) throw new Error('Aba "' + CONFIG_IM.SHEET_NAME + '" não encontrada.');

    // Reenvio do mesmo envio_id — não duplica a linha nem a fila.
    if (envioId && envioJaProcessadoIM(sheet, envioId)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'ok', planilha: 'ok', email: 'processando', pdf: 'processando', erro: '',
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── Campos múltiplos ───────────────────────────────────────
    const tipoServico  = joinArrayIM(ps['entry.1310088869']);
    const modalidade   = joinArrayIM(ps['entry.406949508']);
    const motivoVisita = joinArrayIM(ps['entry.406949569']);

    // ── Auditoria Área 1 ───────────────────────────────────────
    const fachada        = p['entry.1340241431'] || '';
    const fachadaComent  = p['entry.1294732012'] || '';
    const guarda         = p['entry.2115532596'] || '';
    const guardaComent   = p['entry.2007962701'] || '';
    const equipe         = p['entry.39418910']   || '';
    const equipeComent   = p['entry.1911175375'] || '';

    // ── Auditoria Área 2 ───────────────────────────────────────
    const processos       = p['entry.1145570993'] || '';
    const processosComent = p['entry.1825664990'] || '';

    // ── Contagem de veículos ───────────────────────────────────
    const vtTotal     = p['entry.243474358']  || '0';
    const vtFS        = p['entry.1542147720'] || '0';
    const vtAprovacao = p['entry.1147423564'] || '0';
    const vtServico   = p['entry.1953860915'] || '0';
    const vtPecas     = p['entry.1055686739'] || '0';
    const vtOrcamento = p['entry.1056386731'] || '0';
    const vtEntregues = p['entry.1528463567'] || '0';

    // ── Fornecedores ───────────────────────────────────────────
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

    // Resumo das placas (top 3) — não depende de fotos, dá pra montar já
    const resumoPlacas = usandoSAC
      ? sacVeiculos.slice(0, 3).map(v => v.placa).filter(Boolean).join(', ')
      : [placa1, placa2, placa3].filter(Boolean).join(', ');

    // ── 1) Gravar a linha principal AGORA (rápido, sem esperar fotos/PDF/e-mail) ──
    let veiculosUnificados;
    if (usandoSAC) {
      veiculosUnificados = sacVeiculos.map(v => {
        const { foto, fotos, ...resto } = v;
        return Object.assign({ origem: 'Planilha' }, resto);
      });
    } else {
      const mapaAcoesManual = mapearAcoesManualIM(acoesManualJson);
      veiculosUnificados = [
        { placa: placa1, observacao: observacao1, entrega: data1, status: status1, acao: mapaAcoesManual[String(placa1).trim().toUpperCase()] || '', origem: 'Manual' },
        { placa: placa2, observacao: observacao2, entrega: data2, status: status2, acao: mapaAcoesManual[String(placa2).trim().toUpperCase()] || '', origem: 'Manual' },
        { placa: placa3, observacao: observacao3, entrega: data3, status: status3, acao: mapaAcoesManual[String(placa3).trim().toUpperCase()] || '', origem: 'Manual' },
      ].filter(v => v.placa);
    }
    const veiculosJsonInicial = JSON.stringify(veiculosUnificados);

    const rowData = [
      new Date(),          // A
      nomeAnalista,        // B
      presencialTel,       // C
      nomeOficina,         // D
      modalidade,          // E
      motivoVisita,        // F
      tipoOficina,         // G
      tipoServico,         // H
      dataVisita,          // I
      horarioVisita,       // J
      endereco,            // K
      fachada,             // L
      fachadaComent,       // M
      guarda,              // N
      guardaComent,        // O
      equipe,              // P
      equipeComent,        // Q
      processos,           // R
      processosComent,     // S
      vtTotal,             // T
      vtFS,                // U
      vtAprovacao,         // V
      vtServico,           // W
      vtPecas,             // X
      vtOrcamento,         // Y
      vtEntregues,         // Z
      fornecedores,        // AA
      qtdFornec,           // AB
      resumoPlacas,        // AC
      'Processando…',      // AD — pastaFotosUrl
      cnpjOficina,         // AE
      usandoSAC ? '' : placa1,      // AF
      usandoSAC ? '' : observacao1, // AG
      usandoSAC ? '' : data1,       // AH
      usandoSAC ? '' : status1,     // AI
      usandoSAC ? '' : placa2,      // AJ
      usandoSAC ? '' : observacao2, // AK
      usandoSAC ? '' : data2,       // AL
      usandoSAC ? '' : status2,     // AM
      usandoSAC ? '' : placa3,      // AN
      usandoSAC ? '' : observacao3, // AO
      usandoSAC ? '' : data3,       // AP
      usandoSAC ? '' : status3,     // AQ
      veiculosJsonInicial,       // AR — SAC e Manual, unificados, com "origem"
      'Processando…',           // AS — Laudo PDF
      envioId,                   // AT — ID de Envio
      'Processando…',           // AU — Foto Fachada (legado)
      '',                        // AV — Ações (Manual), descontinuada
    ];

    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);

    try {
      const cnpjCell = sheet.getRange(nextRow, COL_IM.CNPJ);
      cnpjCell.setNumberFormat('@');
      cnpjCell.setValue(cnpjOficina);
    } catch (errFormato) {
      Logger.log('Aviso: não foi possível formatar a célula do CNPJ como texto: ' + errFormato);
    }

    let erroFila = '';
    try {
      enfileirarProcessamentoVisitaIM({
        tipoOficina, presencialTel, nomeAnalista, cnpjOficina, nomeOficina, dataVisita,
        horarioVisita, endereco, visitaCompleta,
        tipoServico, modalidade, motivoVisita,
        fachada, fachadaComent, guarda, guardaComent,
        equipe, equipeComent, processos, processosComent,
        vtTotal, vtFS, vtAprovacao, vtServico, vtOrcamento, vtPecas, vtEntregues,
        fornecedores, qtdFornec,
        usandoSAC, sacVeiculos,
        placa1, observacao1, data1, status1, placa2, observacao2, data2, status2, placa3, observacao3, data3, status3,
        acoesManualJson,
        fotos1: p['fotos1'] || '[]', fotos2: p['fotos2'] || '[]', fotos3: p['fotos3'] || '[]',
        fotosfachada: p['fotosfachada'] || '[]',
        envioId: envioId,
        linhaPlanilha: nextRow,
      });
    } catch (err) {
      erroFila = err && err.message ? err.message : String(err);
      Logger.log('ERRO AO ENFILEIRAR (linha ' + nextRow + '): ' + (err && err.stack ? err.stack : err));
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok', planilha: 'ok',
      email: erroFila ? 'erro' : 'processando',
      pdf: erroFila ? 'erro' : 'processando',
      erro: erroFila ? ('Fila: ' + erroFila) : '',
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (errFatal) {
    Logger.log('Erro fatal não tratado: ' + (errFatal && errFatal.stack ? errFatal.stack : errFatal));
    return ContentService.createTextOutput(JSON.stringify({
      status: 'erro', planilha: 'erro', email: 'erro', pdf: 'erro',
      erro: 'Erro inesperado no servidor: ' + (errFatal.message || String(errFatal)),
    })).setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}

function configurarCabecalhosPlanilhaIM() {
  const sheet = SpreadsheetApp.openById(CONFIG_IM.SPREADSHEET_ID).getSheetByName(CONFIG_IM.SHEET_NAME);

  const titulos = {
    [COL_IM.PASTA_FOTOS]:   'Pasta de Fotos',
    [COL_IM.VEICULOS_JSON]: 'Veículos (JSON) — Planilha ou Manual, com campo "origem"',
    [COL_IM.LAUDO_PDF]:     'Laudo PDF',
    [COL_IM.ENVIO_ID]:      'ID de Envio',
    [COL_IM.FOTO_FACHADA]:  'Foto Fachada (legado — ver Pasta de Fotos)',
    [COL_IM.ACOES_MANUAL]:  'Ações (Manual) — descontinuada, ver Veículos (JSON)',
  };

  Object.keys(titulos).forEach(col => {
    sheet.getRange(1, Number(col)).setValue(titulos[col]);
  });

  Logger.log('Cabeçalhos configurados com sucesso.');
}

// ============================================================
//  Fila de visitas (fotos + PDF + e-mail em segundo plano)
//  ATUALIZADO (definitivo): a fila NÃO mora mais numa aba do Sheets — mora
//  num arquivo JSON no Drive. Isso elimina de vez o erro "Não é possível
//  definir o formato de número das células em uma coluna com tipo", que
//  voltava mesmo recriando a aba (indício de que a restrição vinha de uma
//  configuração da planilha inteira, não da aba em si). Sem aba, sem
//  "coluna com tipo", sem reparo automático, sem aba de backup.
// ============================================================
const MAX_TENTATIVAS_VISITA_IM   = 10;
const TEMPO_MAX_EXECUCAO_MS_IM   = 4.5 * 60 * 1000;
const NOME_INDICE_FILA_VISITAS_IM = 'fila_visitas_index.json';

/** Lê o índice da fila (array de itens) do arquivo JSON no Drive. */
function lerIndiceFilaVisitasIM() {
  const pasta = DriveApp.getFolderById(CONFIG_IM.DRIVE_FOTOS_FOLDER_ID);
  const arquivos = pasta.getFilesByName(NOME_INDICE_FILA_VISITAS_IM);
  if (!arquivos.hasNext()) return { arquivo: null, dados: [] };
  const arquivo = arquivos.next();
  let dados = [];
  try { dados = JSON.parse(arquivo.getBlob().getDataAsString() || '[]'); } catch (err) { dados = []; }
  if (!Array.isArray(dados)) dados = [];
  return { arquivo, dados };
}

/**
 * Salva o índice da fila. Drive não permite sobrescrever o conteúdo de um
 * arquivo diretamente pelo serviço básico, então recria o arquivo (mesmo
 * nome) e apaga o antigo — arquivo pequeno, custo irrelevante.
 */
function salvarIndiceFilaVisitasIM(dados, arquivoAntigo) {
  const pasta = DriveApp.getFolderById(CONFIG_IM.DRIVE_FOTOS_FOLDER_ID);
  const blob = Utilities.newBlob(JSON.stringify(dados), 'application/json', NOME_INDICE_FILA_VISITAS_IM);
  const novo = pasta.createFile(blob);
  if (arquivoAntigo) {
    try { arquivoAntigo.setTrashed(true); } catch (errTrash) {
      Logger.log('Aviso: não foi possível descartar índice antigo da fila: ' + errTrash);
    }
  }
  return novo;
}

/** Atualiza (merge) os campos de UM item da fila, identificado pelo arquivoId. */
function atualizarItemFilaVisitasIM(arquivoId, mudancas) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const { arquivo, dados } = lerIndiceFilaVisitasIM();
    const item = dados.find(function(d) { return d.arquivoId === arquivoId; });
    if (item) Object.assign(item, mudancas);
    salvarIndiceFilaVisitasIM(dados, arquivo);
  } catch (err) {
    Logger.log('Erro ao atualizar item da fila (arquivoId ' + arquivoId + '): ' + err);
  } finally {
    lock.releaseLock();
  }
}

function enfileirarProcessamentoVisitaIM(payload) {
  let arquivo = null;

  try {
    if (!payload || !payload.linhaPlanilha) {
      throw new Error('Payload ou linha da planilha principal não informado.');
    }

    const jsonStr = JSON.stringify(payload);
    const nomeArquivo = 'visita_pendente_' + payload.linhaPlanilha + '_' + Date.now() + '.json';
    const blob = Utilities.newBlob(jsonStr, 'application/json', nomeArquivo);
    const pasta = DriveApp.getFolderById(CONFIG_IM.DRIVE_FOTOS_FOLDER_ID);
    arquivo = pasta.createFile(blob);

    // doPost já mantém o ScriptLock durante toda a execução (é reentrante
    // na mesma execução), então não precisa de um lock extra aqui.
    const { arquivo: arquivoIndice, dados } = lerIndiceFilaVisitasIM();
    dados.push({
      linhaPlanilha: Number(payload.linhaPlanilha),
      arquivoId: arquivo.getId(),
      tentativas: 0,
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    });
    salvarIndiceFilaVisitasIM(dados, arquivoIndice);

    Logger.log(
      'Visita enfileirada com sucesso. Linha principal: ' + payload.linhaPlanilha +
      '. Arquivo: ' + arquivo.getId()
    );

    return { status: 'ok', arquivoId: arquivo.getId() };
  } catch (err) {
    if (arquivo) {
      try { arquivo.setTrashed(true); } catch (errLixeira) {
        Logger.log('Não foi possível remover o JSON órfão: ' + errLixeira);
      }
    }
    Logger.log('Erro ao enfileirar visita: ' + (err && err.stack ? err.stack : err));
    throw err;
  }
}

/**
 * Rode `configurarTriggerFilaVisitasIM` UMA VEZ pelo editor do Apps Script
 * para criar o gatilho automático (a cada 1 minuto).
 */
function processarFilaVisitasIM() {
  const inicioExecucao = Date.now();
  const { dados } = lerIndiceFilaVisitasIM();
  const sheetPrincipal = SpreadsheetApp.openById(CONFIG_IM.SPREADSHEET_ID).getSheetByName(CONFIG_IM.SHEET_NAME);

  for (let i = 0; i < dados.length; i++) {
    if (Date.now() - inicioExecucao > TEMPO_MAX_EXECUCAO_MS_IM) break;

    const item = dados[i];
    if (!item || item.status !== 'pendente') continue;

    try {
      processarUmaVisitaIM(sheetPrincipal, Number(item.linhaPlanilha), item.arquivoId);
      atualizarItemFilaVisitasIM(item.arquivoId, { status: 'concluido' });
      try { DriveApp.getFileById(item.arquivoId).setTrashed(true); } catch (errLixo) {}
    } catch (err) {
      const novaTentativa = (Number(item.tentativas) || 0) + 1;
      const novoStatus = novaTentativa >= MAX_TENTATIVAS_VISITA_IM ? 'falhou_definitivo' : 'pendente';
      atualizarItemFilaVisitasIM(item.arquivoId, { tentativas: novaTentativa, status: novoStatus });
      Logger.log('Falha ao processar visita da fila (arquivo ' + item.arquivoId + '): ' + (err && err.stack ? err.stack : err));
    }
  }
}


function mapearAcoesManualIM(acoesManualJson) {
  const mapa = {};
  try {
    const lista = JSON.parse(acoesManualJson || '[]');
    (lista || []).forEach(item => {
      if (item && item.placa) mapa[String(item.placa).trim().toUpperCase()] = item.acao || '';
    });
  } catch (err) { Logger.log('Erro ao parsear acoes_manual_json: ' + err); }
  return mapa;
}

function processarUmaVisitaIM(sheetPrincipal, linhaPlanilha, driveFileId) {
  const arquivo = DriveApp.getFileById(driveFileId);
  const payload = JSON.parse(arquivo.getBlob().getDataAsString());

  const {
    tipoOficina, presencialTel, nomeAnalista, cnpjOficina, nomeOficina, dataVisita,
    horarioVisita, endereco, visitaCompleta,
    tipoServico, modalidade, motivoVisita,
    fachada, fachadaComent, guarda, guardaComent, equipe, equipeComent,
    processos, processosComent,
    vtTotal, vtFS, vtAprovacao, vtServico, vtOrcamento, vtPecas, vtEntregues,
    fornecedores, qtdFornec,
    usandoSAC, placa1, observacao1, data1, status1, placa2, observacao2, data2, status2, placa3, observacao3, data3, status3,
  } = payload;
  let sacVeiculos = payload.sacVeiculos || [];
  const mapaAcoesManual = mapearAcoesManualIM(payload.acoesManualJson);

  const pastaFotos = obterOuCriarPastaVisitaIM(
    nomeOficina,
    dataVisita,
    linhaPlanilha,
    payload.envioId || ''
  );
  const fotosParaEmail = [];
  const fotosFachadaParaEmail = [];
  const assinaturasFotosSalvas = {};
  const pastaFotosUrl = pastaFotos.getUrl();

  function garantirPastaFotos() {
    return pastaFotos;
  }

  function assinaturaFotoIM(foto) {
    if (!foto || !foto.base64) return '';
    return [
      String(foto.nome || ''),
      String(foto.mime || ''),
      String(foto.base64).length,
      String(foto.base64).slice(0, 80),
      String(foto.base64).slice(-80)
    ].join('|');
  }

  function registrarFotoSalvaIM(foto) {
    const assinatura = assinaturaFotoIM(foto);
    if (assinatura) assinaturasFotosSalvas[assinatura] = true;
  }

  function fotoJaFoiSalvaIM(foto) {
    const assinatura = assinaturaFotoIM(foto);
    return assinatura ? !!assinaturasFotosSalvas[assinatura] : true;
  }

  // ── Veículos SAC: salva fotos e embute os links dentro de cada item ──
  if (usandoSAC && sacVeiculos.length) {
    sacVeiculos = sacVeiculos.map(v => {
      const listaFotos = v && Array.isArray(v.fotos) ? v.fotos : (v && v.foto ? [v.foto] : []);
      if (listaFotos.length) {
        const pasta = garantirPastaFotos();
        const urls = [];
        listaFotos.forEach((f, i) => {
          if (!f || !f.base64) return;
          const salvo = salvarFotoNoDriveIM(f.base64, f.mime, (v.placa || 'veiculo') + '_' + (i + 1) + '.jpg', pasta);
          if (salvo) {
            registrarFotoSalvaIM(f);
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

  // ── Veículos MODO MANUAL: salva fotos e monta o array unificado com
  // "fotosUrls" embutido em cada item — igual já acontecia no modo SAC.
  // Antes esse link só ficava perdido em fotosManuaisUrls (variável nunca
  // gravada em nenhuma célula), por isso a coluna Veículos (JSON) nunca
  // recebia foto de placa no modo manual — só a fachada tinha link salvo.
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
          const salvo = salvarFotoNoDriveIM(f.base64, f.mime, nome, pasta);
          if (salvo) {
            registrarFotoSalvaIM(f);
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

  const veiculosJsonLimpo = usandoSAC ? JSON.stringify(sacVeiculos) : JSON.stringify(manualVeiculos);

  let fotosFachadaUrl = '';
  {
    let listaFachada = [];
    try { listaFachada = JSON.parse(payload['fotosfachada'] || '[]'); } catch (err) { listaFachada = []; }
    if (listaFachada.length) {
      const pasta = garantirPastaFotos();
      const urls = [];
      listaFachada.forEach((f, i) => {
        if (!f || !f.base64) return;
        const nome = f.nome || ('fachada_' + (i + 1) + '.jpg');
        const salvo = salvarFotoNoDriveIM(f.base64, f.mime, nome, pasta);
        if (salvo) {
          registrarFotoSalvaIM(f);
          urls.push(salvo.url);
          fotosFachadaParaEmail.push({ blob: salvo.blob, fileId: salvo.fileId });
        }
      });
      fotosFachadaUrl = urls.join('\n');
    }
  }

  const fotosAdicionais = coletarTodasFotosPayloadIM(payload);
  fotosAdicionais.forEach(function(item, indice) {
    const foto = item.foto;
    if (!foto || !foto.base64 || fotoJaFoiSalvaIM(foto)) return;

    const nomeBase = sanitizarNomeArquivoIM(
      foto.nome || item.caminho || ('foto_adicional_' + (indice + 1))
    );
    const extensao = obterExtensaoFotoIM(foto.mime, nomeBase);
    const nomeSemExtensao = nomeBase.replace(/\.[^.]+$/, '') || 'foto_adicional_' + (indice + 1);
    const nomeArquivo = nomeSemExtensao + '_' + (indice + 1) + extensao;

    const salvo = salvarFotoNoDriveIM(
      foto.base64,
      foto.mime,
      nomeArquivo,
      pastaFotos
    );

    if (salvo) {
      registrarFotoSalvaIM(foto);
      fotosParaEmail.push({
        placa: item.placa || 'Foto adicional',
        blob: salvo.blob,
        fileId: salvo.fileId
      });
    }
  });

  // ── PDF ──
  let laudoPdfUrl = 'Falha ao gerar';
  try {
    const veiculosPdf = usandoSAC ? sacVeiculos.slice(0, 10) : manualVeiculos;

    const fotosParaPdfLimitadas = fotosParaEmail.slice(0, CONFIG_IM.MAX_FOTOS_PDF);
    const fotosPdfTemplate = fotosParaPdfLimitadas.map(f => ({
      placa: f.placa,
      src: 'data:' + f.blob.getContentType() + ';base64,' + Utilities.base64Encode(f.blob.getBytes()),
    }));
    const fotosExtrasPdf = Math.max(0, fotosParaEmail.length - fotosParaPdfLimitadas.length);
    const fotosFachadaPdfTemplate = fotosFachadaParaEmail.map(f => (
      'data:' + f.blob.getContentType() + ';base64,' + Utilities.base64Encode(f.blob.getBytes())
    ));

    const htmlRelatorio = montarEmailIM({
      tipoOficina, presencialTel, nomeAnalista, cnpjOficina, nomeOficina,
      dataVisita, horarioVisita, endereco, visitaCompleta,
      tipoServico, modalidade, motivoVisita,
      fachada, fachadaComent, guarda, guardaComent,
      equipe, equipeComent, processos, processosComent,
      vtTotal, vtFS, vtAprovacao, vtServico, vtOrcamento, vtPecas, vtEntregues,
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

    const pastaLaudos = DriveApp.getFolderById(CONFIG_IM.DRIVE_LAUDOS_FOLDER_ID);
    const arquivoPdf  = pastaLaudos.createFile(pdfBlob);
    arquivoPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    laudoPdfUrl = arquivoPdf.getUrl();
  } catch (errPdf) {
    Logger.log('Erro PDF (processamento em segundo plano): ' + errPdf);
  }

  // Agora SEMPRE atualiza Veículos (JSON), nos dois modos — antes só
  // acontecia "if (usandoSAC)", deixando o modo manual sem link de foto.
  sheetPrincipal.getRange(linhaPlanilha, COL_IM.VEICULOS_JSON).setValue(veiculosJsonLimpo);
  const colunaPastaFotos = localizarColunaPorCabecalhoIM(
    sheetPrincipal,
    ['Pasta de Fotos', 'Pasta Fotos', 'Link da Pasta de Fotos'],
    COL_IM.PASTA_FOTOS
  );
  sheetPrincipal.getRange(linhaPlanilha, colunaPastaFotos).setValue(pastaFotosUrl || 'Sem fotos recebidas');
  sheetPrincipal.getRange(linhaPlanilha, COL_IM.LAUDO_PDF).setValue(laudoPdfUrl);
  sheetPrincipal.getRange(linhaPlanilha, COL_IM.FOTO_FACHADA).setValue(
    fotosFachadaUrl || pastaFotosUrl || 'Sem foto de fachada'
  );
  SpreadsheetApp.flush();

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

    const fotosLimitadas = fotosParaEmail.slice(0, CONFIG_IM.MAX_FOTOS_EMAIL);
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

    htmlBody = montarEmailIM({
      tipoOficina, presencialTel, nomeAnalista, cnpjOficina, nomeOficina,
      dataVisita, horarioVisita, endereco, visitaCompleta,
      tipoServico, modalidade, motivoVisita,
      fachada, fachadaComent, guarda, guardaComent,
      equipe, equipeComent, processos, processosComent,
      vtTotal, vtFS, vtAprovacao, vtServico, vtOrcamento, vtPecas, vtEntregues,
      fornecedores, qtdFornec,
      veiculosEmail,
      totalVeiculosSAC: usandoSAC ? sacVeiculos.length : 0,
      fotos: fotosParaTemplate,
      fotosExtras: fotosExtras,
      pastaFotosUrl: pastaFotosUrl,
      fotosFachada: fotosFachadaTemplate,
    });

    if (MailApp.getRemainingDailyQuota() <= 0) throw new Error('Cota de e-mail esgotada.');

    const opcoesEmail = { to: CONFIG_IM.EMAIL_TO, subject: subject, htmlBody: htmlBody };
    if (Object.keys(inlineImages).length) opcoesEmail.inlineImages = inlineImages;

    MailApp.sendEmail(opcoesEmail);
  } catch (errMail) {
    Logger.log('Erro e-mail (processamento em segundo plano): ' + errMail);
    if (htmlBody) enfileirarEmailFalhoIM(subject, htmlBody, cidParaFileIdFila);
    else Logger.log('E-mail não pôde ser montado — nada a enfileirar para a visita da linha ' + linhaPlanilha + '.');
  }
}

function configurarTriggerFilaVisitasIM() {
  const jaExiste = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processarFilaVisitasIM');
  if (jaExiste) { Logger.log('Trigger já existe — nada a fazer.'); return; }
  ScriptApp.newTrigger('processarFilaVisitasIM').timeBased().everyMinutes(1).create();
  Logger.log('Trigger criado com sucesso: processarFilaVisitasIM a cada 1 min.');
}

function envioJaProcessadoIM(sheet, envioId) {
  try {
    const ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 2) return false;
    const valores = sheet.getRange(2, COL_IM.ENVIO_ID, ultimaLinha - 1, 1).getValues();
    return valores.some(row => row[0] === envioId);
  } catch (err) {
    Logger.log('Erro ao checar envio_id (seguindo sem checar): ' + err);
    return false;
  }
}

function localizarColunaPorCabecalhoIM(sheet, nomesAceitos, fallback) {
  try {
    const ultimaColuna = Math.max(sheet.getLastColumn(), fallback || 1);
    const cabecalhos = sheet.getRange(1, 1, 1, ultimaColuna).getDisplayValues()[0];
    const normalizar = function(valor) {
      return String(valor || '').toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    };
    const aceitos = (nomesAceitos || []).map(normalizar);
    for (let i = 0; i < cabecalhos.length; i++) {
      if (aceitos.indexOf(normalizar(cabecalhos[i])) !== -1) return i + 1;
    }
  } catch (err) {
    Logger.log('Aviso ao localizar coluna por cabeçalho: ' + err);
  }
  return fallback;
}

function salvarFotoNoDriveIM(base64, mime, nomeArquivo, pastaVisita) {
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

function obterOuCriarPastaVisitaIM(nomeOficina, dataVisita, linhaPlanilha, envioId) {
  const raiz = DriveApp.getFolderById(CONFIG_IM.DRIVE_FOTOS_FOLDER_ID);
  const oficinaLimpa = sanitizarNomeArquivoIM(nomeOficina || 'Oficina');
  const dataLimpa = String(dataVisita || '').split('/').join('-');
  const idLimpo = sanitizarNomeArquivoIM(envioId || ('linha_' + linhaPlanilha));
  const nomePasta = 'Visita - ' + oficinaLimpa + ' - ' + dataLimpa + ' - ' + idLimpo;

  const existentes = raiz.getFoldersByName(nomePasta);
  if (existentes.hasNext()) return existentes.next();
  return raiz.createFolder(nomePasta);
}

function sanitizarNomeArquivoIM(valor) {
  return String(valor || '')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'arquivo';
}

function obterExtensaoFotoIM(mime, nome) {
  const nomeStr = String(nome || '');
  const achou = nomeStr.match(/\.(jpe?g|png|webp|gif|heic)$/i);
  if (achou) return '.' + achou[1].toLowerCase().replace('jpeg', 'jpg');

  const tipo = String(mime || '').toLowerCase();
  if (tipo.indexOf('png') !== -1) return '.png';
  if (tipo.indexOf('webp') !== -1) return '.webp';
  if (tipo.indexOf('gif') !== -1) return '.gif';
  if (tipo.indexOf('heic') !== -1) return '.heic';
  return '.jpg';
}

function coletarTodasFotosPayloadIM(payload) {
  const resultado = [];
  const visitados = [];

  function pareceFoto(obj) {
    return obj && typeof obj === 'object' &&
      typeof obj.base64 === 'string' && obj.base64.length > 0;
  }

  function tentarJson(valor) {
    if (typeof valor !== 'string') return null;
    const texto = valor.trim();
    if (!texto || (texto.charAt(0) !== '[' && texto.charAt(0) !== '{')) return null;
    try { return JSON.parse(texto); } catch (err) { return null; }
  }

  function percorrer(valor, caminho, placaContexto) {
    if (valor === null || valor === undefined) return;

    const convertido = tentarJson(valor);
    if (convertido !== null) {
      percorrer(convertido, caminho, placaContexto);
      return;
    }

    if (typeof valor !== 'object') return;
    if (visitados.indexOf(valor) !== -1) return;
    visitados.push(valor);

    if (pareceFoto(valor)) {
      resultado.push({
        foto: valor,
        caminho: caminho || 'foto',
        placa: placaContexto || valor.placa || ''
      });
      return;
    }

    const placaAtual = valor.placa || placaContexto || '';
    if (Array.isArray(valor)) {
      valor.forEach(function(item, i) {
        percorrer(item, caminho + '_' + (i + 1), placaAtual);
      });
      return;
    }

    Object.keys(valor).forEach(function(chave) {
      percorrer(valor[chave], caminho ? caminho + '_' + chave : chave, placaAtual);
    });
  }

  percorrer(payload, 'visita', '');
  return resultado;
}

const FILA_EMAIL_SHEET_NAME_IM = 'Fila_Email';
const MAX_TENTATIVAS_EMAIL_IM  = 48;

function obterOuCriarSheetFilaIM() {
  const ss = SpreadsheetApp.openById(CONFIG_IM.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(FILA_EMAIL_SHEET_NAME_IM);
  if (!sheet) {
    sheet = ss.insertSheet(FILA_EMAIL_SHEET_NAME_IM);
    sheet.appendRow(['Data', 'Assunto', 'Para', 'HTML', 'IDs das Fotos (JSON)', 'Tentativas', 'Status']);
  }
  return sheet;
}

/** cidParaFileId: mapa { "foto_0": "driveFileId", "fachada_0": "driveFileId", ... } —
 * cobre TODAS as imagens embutidas (veículo + fachada) com o cid certo,
 * pra reconstrução funcionar igual em qualquer combinação de fotos. */
function enfileirarEmailFalhoIM(subject, htmlBody, cidParaFileId) {
  try {
    const sheet = obterOuCriarSheetFilaIM();
    const carimbo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    const linha = [carimbo, subject, CONFIG_IM.EMAIL_TO, htmlBody, JSON.stringify(cidParaFileId || {}), '0', 'pendente'];

    const proximaLinha = sheet.getLastRow() + 1;
    const range = sheet.getRange(proximaLinha, 1, 1, linha.length);
    try { range.clearDataValidations(); } catch (errValid) {
      Logger.log('Aviso: não foi possível limpar validação de dados (Fila_Email): ' + errValid);
    }
    range.setValues([linha]);
  } catch (err) {
    Logger.log('Erro ao enfileirar e-mail: ' + err);
  }
}

const EMAIL_COOLDOWN_PROP_IM = 'email_cooldown_ate_im';

function processarFilaEmailIM() {
  const props = PropertiesService.getScriptProperties();
  const cooldownAte = props.getProperty(EMAIL_COOLDOWN_PROP_IM);
  if (cooldownAte && new Date() < new Date(cooldownAte)) {
    return;
  }

  const sheet = obterOuCriarSheetFilaIM();
  const dados = sheet.getDataRange().getValues();
  let quotaEsgotada = false;

  for (let i = dados.length - 1; i >= 1; i--) {
    const [, subject, para, htmlBody, cidParaFileIdJson, tentativas, status] = dados[i];
    if (status !== 'pendente') continue;

    if (MailApp.getRemainingDailyQuota() <= 0) {
      quotaEsgotada = true;
      break;
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
      const novaTentativa = (Number(tentativas) || 0) + 1;
      sheet.getRange(i + 1, 6).setValue(String(novaTentativa));
      if (novaTentativa >= MAX_TENTATIVAS_EMAIL_IM) sheet.getRange(i + 1, 7).setValue('falhou_definitivo');
      Logger.log('Falha ao reenviar e-mail da fila (linha ' + (i + 1) + '): ' + err);
    }
  }

  if (quotaEsgotada) {
    const proximaTentativa = new Date();
    proximaTentativa.setDate(proximaTentativa.getDate() + 1);
    proximaTentativa.setHours(7, 0, 0, 0);
    props.setProperty(EMAIL_COOLDOWN_PROP_IM, proximaTentativa.toISOString());
    Logger.log('Cota de e-mail esgotada — próxima tentativa às ' + proximaTentativa.toLocaleString());
  } else {
    props.deleteProperty(EMAIL_COOLDOWN_PROP_IM);
  }
}

function configurarTriggerFilaEmailIM() {
  const jaExiste = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processarFilaEmailIM');
  if (jaExiste) { Logger.log('Trigger já existe — nada a fazer.'); return; }
  ScriptApp.newTrigger('processarFilaEmailIM').timeBased().everyMinutes(30).create();
  Logger.log('Trigger criado com sucesso: processarFilaEmailIM a cada 30 min.');
}

function formatarDataIM(raw) {
  if (!raw) return '';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) {
      const [ano, mes, dia] = String(raw).trim().split('-');
      return dia + '/' + mes + '/' + ano;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(raw).trim())) return String(raw).trim();
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return String(d.getUTCDate()).padStart(2,'0') + '/' + String(d.getUTCMonth()+1).padStart(2,'0') + '/' + d.getUTCFullYear();
  } catch (e) { return raw; }
}

function joinArrayIM(arr) {
  if (typeof arr === 'string') return arr;
  return (arr && arr.length) ? arr.join(', ') : 'Não informado';
}

function orDash(val) { return (val && String(val).trim()) ? val : '—'; }

function badgeIM(val) {
  if (!val || !String(val).trim()) return '—';
  const sim = (val === 'Sim');
  return '<span style="background:' + (sim?'#d4edda':'#f8d7da') + ';color:' + (sim?'#155724':'#721c24') + ';padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">' + val + '</span>';
}

function badgeContatoIM(val) {
  if (!val || !String(val).trim()) return '—';
  const ok = (val === 'Presencial');
  return '<span style="background:' + (ok?'#d4edda':'#fff3cd') + ';color:' + (ok?'#155724':'#856404') + ';padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">' + val + '</span>';
}

function thIM(text) {
  return '<th style="padding:9px 12px;border:1px solid #dde3ee;background:#0051AA;color:#fff;font-size:13px;text-align:left;">' + text + '</th>';
}

function rowDetalhe(label, valor, alt) {
  const bg = alt ? '#f5f8ff' : '#ffffff';
  return '<tr><td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-weight:600;font-size:13px;width:45%;">' + label + '</td>'
    + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(valor) + '</td></tr>';
}

function rowAuditoria(num, pergunta, resp, coment) {
  return '<tr><td style="padding:8px 12px;border:1px solid #dde3ee;font-size:13px;width:48%;">' + num + '. ' + pergunta + '</td>'
    + '<td style="padding:8px 12px;border:1px solid #dde3ee;font-size:13px;">' + badgeIM(resp) + '</td>'
    + '<td style="padding:8px 12px;border:1px solid #dde3ee;font-size:13px;color:#555;">' + orDash(coment) + '</td></tr>';
}

function montarEmailIM(c) {
  let tabelaVeiculos = '';

  if (c.veiculosEmail && c.veiculosEmail.length > 0) {
    const titulo = c.totalVeiculosSAC > 0
      ? '&#9201; Veículos no Improdutivo (Top ' + c.veiculosEmail.length + ' de ' + c.totalVeiculosSAC + ' — lista completa na planilha)'
      : '&#9201; Top 3 Veículos no Improdutivo';

    tabelaVeiculos = '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">' + titulo + '</h3>'
      + '<table style="width:100%;border-collapse:collapse;"><thead><tr>'
      + thIM('Placa')
      + thIM('Observação')
      + thIM('Dt. Prev. Entrega')
      + thIM('Status')
      + thIM('Ação')
      + '</tr></thead><tbody>'
      + c.veiculosEmail.map(function(v, i) {
          const bg = i % 2 === 0 ? '#ffffff' : '#f5f8ff';

          return '<tr>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.placa) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.observacao) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(formatarDataIM(v.entrega)) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.status) + '</td>'
            + '<td style="padding:8px 12px;border:1px solid #dde3ee;background:' + bg + ';font-size:13px;">' + orDash(v.acao) + '</td>'
            + '</tr>';
      }).join('')
      + '</tbody></table>';

    if (c.totalVeiculosSAC > 10) {
      tabelaVeiculos += '<p style="font-size:12px;color:#6b7a99;margin-top:6px;">+ ' + (c.totalVeiculosSAC - 10) + ' veículo(s) adicionais registrados na planilha.</p>';
    }
  }

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

  let blocoAuditoria = '';
  if (c.visitaCompleta === 'Sim') {
    blocoAuditoria = '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#128269; Auditoria</h3>'
      + '<table style="width:100%;border-collapse:collapse;"><thead><tr>' + thIM('Pergunta') + thIM('Resposta') + thIM('Comentário') + '</tr></thead><tbody>'
      + rowAuditoria(1, 'Fachada e entrada em bom estado?',           c.fachada,   c.fachadaComent)
      + rowAuditoria(2, 'Guarda dos veículos dentro do padrão?',      c.guarda,    c.guardaComent)
      + rowAuditoria(3, 'Apresentação da equipe (uniformes e EPIs)?', c.equipe,    c.equipeComent)
      + rowAuditoria(4, 'Processos dentro do padrão da empresa?',     c.processos, c.processosComent)
      + '</tbody></table>';
  }

  const fornecedoresExtra = (c.fornecedores === 'Sim') ? rowDetalhe('Quantidade necessária', c.qtdFornec, true) : '';

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
    + rowDetalhe('Analista',         c.nomeAnalista,                 false)
    + rowDetalhe('Tipo de Contato',  badgeContatoIM(c.presencialTel), true)
    + rowDetalhe('CNPJ da Oficina',  c.cnpjOficina,                  false)
    + rowDetalhe('Oficina',          c.nomeOficina,                  true)
    + rowDetalhe('Tipo de Oficina',  c.tipoOficina,                  false)
    + rowDetalhe('Tipo de Serviço',  c.tipoServico,                  true)
    + rowDetalhe('Modalidade',       c.modalidade,                   false)
    + rowDetalhe('Motivo da Visita', c.motivoVisita,                 true)
    + rowDetalhe('Data',             c.dataVisita,                   false)
    + rowDetalhe('Horário',          c.horarioVisita,                true)
    + rowDetalhe('Endereço',         c.endereco,                     false)
    + '</table>'
    + blocoFachada
    + blocoAuditoria
    + '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#128663; Quantidade de Veículos</h3>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + rowDetalhe('Total em manutenção',    c.vtTotal,     false)
    + rowDetalhe('Fora de Serviço (FS)',   c.vtFS,        true)
    + rowDetalhe('Pendentes de aprovação', c.vtAprovacao, false)
    + rowDetalhe('Em serviço (aprovados)', c.vtServico,   true)
    + rowDetalhe('Aguardando peças',       c.vtPecas,     false)
    + rowDetalhe('Em orçamento',           c.vtOrcamento, true)
    + rowDetalhe('Entregues no dia',       c.vtEntregues, false)
    + '</table>'
    + '<h3 style="color:#0051AA;margin:28px 0 10px;font-size:15px;border-bottom:2px solid #0051AA;padding-bottom:6px;">&#127981; Fornecedores</h3>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + rowDetalhe('Necessidade de aumento?', badgeIM(c.fornecedores), false)
    + fornecedoresExtra
    + '</table>'
    + tabelaVeiculos
    + galeriaFotos
    + '</td></tr>'
    + '<tr><td style="background:#f5f8ff;border-top:1px solid #dde3ee;padding:16px 32px;text-align:center;">'
    + '<p style="margin:0;font-size:12px;color:#6b7a99;">Este e-mail foi gerado automaticamente pelo sistema de Registro de Visitas Unidas.</p>'
    + '</td></tr></table></td></tr></table></body></html>';
}
