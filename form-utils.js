/**
 * form-utils.js — Utilitários compartilhados entre todos os formulários
 */

// ── Restrição de horário ─────────────────────────────────────────────────────

/**
 * Verifica se o horário atual está dentro do permitido (07:30–18:30).
 * Usa o horário LOCAL do dispositivo do analista.
 */
function verificarHorarioPermitido() {
  const agora     = new Date();
  const horas     = agora.getHours();
  const minutos   = agora.getMinutes();
  const totalMin  = horas * 60 + minutos;
  const inicioMin = 7 * 60 + 30;   // 07:30
  const fimMin    = 18 * 60 + 30;  // 18:30
  return totalMin >= inicioMin && totalMin <= fimMin;
}

/**
 * Se estiver fora do horário, substitui o conteúdo do container pelo aviso
 * e retorna false. Se estiver no horário, retorna true.
 */
function bloquearForaDoHorario(containerSelector) {
  if (verificarHorarioPermitido()) return true;

  const container = document.querySelector(containerSelector);
  if (!container) return false;

  const agora   = new Date();
  const hAtual  = String(agora.getHours()).padStart(2, '0');
  const mAtual  = String(agora.getMinutes()).padStart(2, '0');

  container.innerHTML = `
    <div style="text-align:center;padding:48px 24px;">
      <div style="font-size:3rem;margin-bottom:16px;">🔒</div>
      <h2 style="color:var(--text,#1a1a2e);margin-bottom:8px;">Fora do Horário</h2>
      <p style="color:var(--text-muted,#666);font-size:.95rem;max-width:320px;margin:0 auto 8px;">
        O preenchimento está disponível apenas das <strong>07:30</strong> às <strong>18:30</strong>.
      </p>
      <p style="color:var(--text-muted,#666);font-size:.85rem;">
        Horário atual: <strong>${hAtual}:${mAtual}</strong>
      </p>
    </div>`;
  return false;
}

// ── Validação de comentário (mínimo 5 chars, sem spam de teclado) ────────────

/**
 * Valida se o comentário tem qualidade mínima:
 * - Mínimo 5 caracteres
 * - Não pode ser só uma letra repetida (aaaa, ssss)
 * - Não pode ser sequência de teclado (asdf, qwer, zxcv, etc.)
 */
function validarComentario(texto) {
  const t = (texto || '').trim();
  if (t.length < 5) return false;

  // Só caracteres repetidos: aaa, 111, ...
  if (/^(.)\1+$/.test(t)) return false;

  // Sequências comuns de teclado
  const sequencias = [
    'qwer','wert','erty','rtyu','tyui','yuio','uiop',
    'asdf','sdfg','dfgh','fghj','ghjk','hjkl',
    'zxcv','xcvb','cvbn','vbnm',
    'qwerty','asdfg','zxcvb','qwertyuiop','asdfghjkl',
    'abcd','bcde','cdef','defg','efgh','fghi',
    '1234','2345','3456','4567','5678','6789',
    'aaaa','bbbb','cccc','dddd','eeee','ffff',
    'aaaa','asas','lala',
  ];
  const tLower = t.toLowerCase();
  if (sequencias.some(s => tLower.includes(s))) return false;

  // Menos de 2 palavras distintas (só uma palavra repetida)
  const palavras = tLower.split(/\s+/).filter(Boolean);
  if (palavras.length >= 2) {
    const unicas = new Set(palavras);
    if (unicas.size === 1) return false; // "ok ok ok ok ok"
  }

  return true;
}
const AppStorage = {
  _key: (k) => `visita_oficina__${k}`,
  set(k, v)  { try { sessionStorage.setItem(this._key(k), JSON.stringify(v)); } catch(_){} },
  get(k)     { try { const r = sessionStorage.getItem(this._key(k)); return r ? JSON.parse(r) : null; } catch(_){ return null; } },
  remove(k)  { try { sessionStorage.removeItem(this._key(k)); } catch(_){} },
};

// ── Backup local do formulário (localStorage — sobrevive a fechar o app/navegador) ──
// Guardado logo antes do envio; só é apagado quando temos confirmação real de que
// a planilha foi gravada. Isso permite reenviar sem redigitar tudo se a conexão
// cair ou o app for fechado no meio do envio.
const LocalBackup = {
  KEY: 'unidas_visita_pendente_v1',
  salvar({ actionUrl, campos, tipoOficina, nomeOficina, envioId }) {
    try {
      const dados = { criadoEm: new Date().toISOString(), actionUrl, campos, tipoOficina, nomeOficina, envioId };
      localStorage.setItem(this.KEY, JSON.stringify(dados));
    } catch (err) { console.warn('Falha ao salvar backup local:', err); }
  },
  obter() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  },
  limpar() {
    try { localStorage.removeItem(this.KEY); } catch (err) {}
  },
};

function gerarEnvioId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

// ── Validação e máscara de CNPJ ──────────────────────────────────────────────
function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  // Pesos conforme algoritmo da Receita Federal
  const p1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const p2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];

  let soma = 0;
  for (let i = 0; i < 12; i++) soma += parseInt(cnpj[i]) * p1[i];
  let r = soma % 11;
  const d1 = r < 2 ? 0 : 11 - r;

  soma = 0;
  for (let i = 0; i < 13; i++) soma += parseInt(cnpj[i]) * p2[i];
  r = soma % 11;
  const d2 = r < 2 ? 0 : 11 - r;

  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13]);
}

function aplicarMascaraCNPJ(input) {
  if (!input) return;
  input.setAttribute('maxlength', '18');
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('placeholder', '00.000.000/0000-00');
  input.dataset.cnpjInput = 'true'; // marca para validarCard identificar

  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 14);
    if (v.length > 12)     v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4}).*/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3}).*/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3}).*/, '$1.$2');
    input.value = v;
    input.classList.remove('error'); // limpa erro enquanto digita
  });

  input.addEventListener('blur', () => {
    const digits = input.value.replace(/\D/g, '');
    if (digits.length > 0 && !validarCNPJ(digits)) {
      input.classList.add('error');
    } else {
      input.classList.remove('error');
    }
  });
}

// ── Geolocalização + Geocoding reverso ──────────────────────────────────────
async function obterLocalizacao({ enderecoInput, latitudeInput, longitudeInput, cidadeInput }) {
  if (!navigator.geolocation) { alert('A geolocalização não é suportada neste navegador.'); return; }
  enderecoInput.value = 'Obtendo localização…';
  enderecoInput.disabled = true;
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      latitudeInput.value = coords.latitude;
      longitudeInput.value = coords.longitude;
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1&zoom=18`;
        const data = await fetchJSON(url);
        enderecoInput.value = data.display_name ?? 'Endereço não encontrado';
        if (cidadeInput) cidadeInput.value = extrairCidade(data.address);
        alert('Localização obtida com sucesso!');
      } catch { enderecoInput.value = 'Erro ao buscar endereço'; }
      finally { enderecoInput.disabled = false; }
    },
    (err) => {
      enderecoInput.value = '';
      enderecoInput.disabled = false;
      console.error(err);
      alert('Não foi possível obter sua localização. Por favor, digite o endereço manualmente.');
    }
  );
}

function inicializarAutocomplete({ enderecoInput, latitudeInput, longitudeInput, cidadeInput }) {
  const list = document.createElement('ul');
  list.id = 'autocomplete-list';
  enderecoInput.parentNode.appendChild(list);
  let timer = null;
  enderecoInput.addEventListener('input', () => {
    clearTimeout(timer);
    const q = enderecoInput.value.trim();
    if (q.length < 3) { list.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=br`;
        const results = await fetchJSON(url);
        list.innerHTML = '';
        results.forEach(p => {
          const li = document.createElement('li');
          li.textContent = p.display_name;
          li.addEventListener('click', () => {
            enderecoInput.value = p.display_name;
            latitudeInput.value = p.lat;
            longitudeInput.value = p.lon;
            if (cidadeInput) cidadeInput.value = extrairCidade(p.address);
            list.innerHTML = '';
          });
          list.appendChild(li);
        });
      } catch (e) { console.error('Autocomplete error:', e); }
    }, 500);
  });
  document.addEventListener('click', (e) => { if (!enderecoInput.contains(e.target)) list.innerHTML = ''; });
}

// ── Data / Hora ─────────────────────────────────────────────────────────────
function preencherDataHora(dataInput, horarioInput) {
  const now = new Date();
  if (dataInput) {
    dataInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  if (horarioInput) {
    horarioInput.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
}

// ── Validação ────────────────────────────────────────────────────────────────
function validarCard(card) {
  let valido = true;
  card.querySelectorAll('[required]').forEach(input => {
    if (input.disabled) return;
    if (input.closest('[style*="display:none"], [style*="display: none"]')) return;

    let ok = input.tagName === 'SELECT'
      ? Array.from(input.options).some(o => o.selected && o.value !== '')
      : input.value.trim() !== '';

    // Validação de comprimento mínimo
    if (ok && input.dataset.minlength) {
      ok = input.value.trim().length >= parseInt(input.dataset.minlength);
    }

    // Validação: somente letras e espaços (sem números)
    if (ok && input.dataset.onlyletters === 'true') {
      ok = /^[a-zA-ZÀ-ÿ\s]+$/.test(input.value.trim());
    }

    // Validação extra para campos CNPJ

    // Validação extra para campos CNPJ
    if (ok && input.dataset.cnpjInput === 'true') {
      const digits = input.value.replace(/\D/g, '');
      ok = digits.length === 14 && validarCNPJ(digits);
    }

    input.classList.toggle('error', !ok);
    if (!ok) valido = false;
  });
  return valido;
}

// ── Envio de formulário ──────────────────────────────────────────────────────
/**
 * POST via fetch(). Nunca "assume sucesso": se o tempo esgotar, a rede falhar,
 * ou a resposta não vier em JSON válido, retorna confirmado:false — quem
 * chamar decide o que fazer (ex: manter o backup local para reenviar).
 *
 * Usa fetch() em vez de iframe: a resposta do Apps Script é sempre redirecionada
 * para script.googleusercontent.com (outro domínio), e o navegador bloqueia por
 * segurança a leitura de um iframe de domínio diferente — então a confirmação
 * nunca chegava a ser lida por esse método. fetch() consegue ler porque o Google
 * libera esse acesso via CORS para essa rota. O formato do corpo continua sendo
 * application/x-www-form-urlencoded (igual a um <form> normal), então o doPost
 * não precisa mudar nada em como lê e.parameter/e.parameters.
 */
async function postFormulario(actionUrl, camposEntries, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const corpo = new URLSearchParams();
    camposEntries.forEach(([nome, valor]) => corpo.append(nome, valor));

    const resposta = await fetch(actionUrl, { method: 'POST', body: corpo, signal: controller.signal });
    clearTimeout(timer);

    const texto = await resposta.text();
    const json  = JSON.parse(texto);
    return {
      confirmado: true,
      planilha: json.planilha || (json.status === 'ok' ? 'ok' : 'erro'),
      email:    json.email    || (json.status === 'ok' ? 'ok' : 'erro'),
      pdf:      json.pdf      || 'desconhecido',
      erro:     json.erro || json.message || '',
    };
  } catch (err) {
    clearTimeout(timer);
    // Rede falhou, tempo esgotou (AbortError), ou a resposta não veio em JSON válido —
    // não dá pra confirmar nada. (A versão antiga assumia "planilha: ok" aqui, o que
    // podia esconder falhas reais.)
    return {
      confirmado: false, planilha: 'desconhecido', email: 'desconhecido', pdf: 'desconhecido',
      erro: err.name === 'AbortError' ? 'Tempo esgotado aguardando resposta do servidor.' : 'Resposta inesperada do servidor.',
    };
  }
}

/** Tenta reenviar o backup local salvo (se houver). Retorna null se não há nada pendente. */
async function tentarReenviarBackup() {
  const dados = LocalBackup.obter();
  if (!dados) return null;
  const resultado = await postFormulario(dados.actionUrl, dados.campos, 45000);
  if (resultado.confirmado && resultado.planilha === 'ok') LocalBackup.limpar();
  return resultado;
}

async function enviarFormulario(form, btn) {
  btn.classList.add('loading');
  btn.disabled = true;
  btn.dataset.textoOriginal = btn.textContent;
  btn.textContent = 'Enviando…';

  // ID único deste envio: se cair a conexão e o analista reenviar depois, o
  // servidor usa esse ID pra reconhecer que já processou e não duplicar a linha.
  const envioId = gerarEnvioId();
  const campos  = Array.from(new FormData(form).entries());
  campos.push(['envio_id', envioId]);

  LocalBackup.salvar({
    actionUrl:   form.action,
    campos,
    tipoOficina: AppStorage.get('tipo_oficina') || '',
    nomeOficina: form.querySelector('#loja')?.value || '',
    envioId,
  }); // guarda ANTES de enviar — cobre queda de conexão, app fechado, etc.

  const resultado = await postFormulario(form.action, campos, 45000);

  // Só apaga o backup quando temos confirmação real de que a planilha foi gravada.
  if (resultado.confirmado && resultado.planilha === 'ok') LocalBackup.limpar();

  AppStorage.set('submit_result', resultado);
  window.location.href = 'sucesso.html';
}

// ── SAC: Mapeamento de etapas ────────────────────────────────────────────────
const MAPA_ETAPAS_FORM = {
  'Orçamento':       'Pend. Orçamento',
  'Parada Veículo':  'Fora de Serviço',
  'Iniciar Serviço': 'Em Serviço',
  'Em Serviço':      'Em Serviço',
  'Aguardando Peça': 'Pend. Peça',
  'Pend. Peça':      'Pend. Peça',
  'Aprovação':       'Pend. Aprovação',
  'Pend. Aprovação': 'Pend. Aprovação',
  'Fora de Serviço': 'Fora de Serviço',
  'Erro Material':   'Erro Material',
};

// Mapeamento etapa → campo de contagem no formulário
const MAPA_ETAPAS_CONTAGEM = {
  'Orçamento':       'orcamento',
  'Parada Veículo':  'fs',
  'Iniciar Serviço': 'servico',
  'Em Serviço':      'servico',
  'Aguardando Peça': 'pecas',
  'Pend. Peça':      'pecas',
  'Aprovação':       'aprovacao',
  'Pend. Aprovação': 'aprovacao',
  'Fora de Serviço': 'fs',
  'Erro Material':   'fs',
};

// Mesmo agrupamento de MAPA_ETAPAS_CONTAGEM, mas a partir do rótulo já
// exibido no <select> de status da tabela (não do texto bruto do XLSX).
// Usado para manter as contagens ("Quantidade de Veículos") sincronizadas
// com o status que o analista está vendo/editando na tabela — a edição do
// analista é mais confiável que o valor importado do arquivo.
const MAPA_STATUS_CONTAGEM = {
  'Pend. Orçamento':  'orcamento',
  'Fora de Serviço':  'fs',
  'Em Serviço':       'servico',
  'Pend. Peça':       'pecas',
  'Pend. Aprovação':  'aprovacao',
  'Erro Material':    'fs',
};

/**
 * Recalcula as contagens por categoria (orçamento/fs/serviço/peças/aprovação)
 * a partir do status ATUAL de cada veículo na tabela, e atualiza os campos
 * numéricos correspondentes (via idMap) — silenciosamente, sem alerta e sem
 * exigir que o analista abra outra tela. "Total" e "Entregues no dia" não
 * são tocados aqui: total é sempre a contagem de linhas da tabela (não muda
 * por edição de status) e "entregues" é uma pergunta separada, não um status.
 *
 * Se NENHUM veículo tiver status escolhido ainda (ex: tabela recém-aberta,
 * status começa em branco de propósito), não sobrescreve nada — mantém os
 * valores importados do XLSX até o analista começar a confirmar de verdade.
 */
function recalcularContagemPorStatus(estado, idMap) {
  if (!idMap) return;
  const contagem = { orcamento: 0, fs: 0, servico: 0, pecas: 0, aprovacao: 0 };
  let algumStatusDefinido = false;
  (estado || []).forEach(v => {
    const campo = MAPA_STATUS_CONTAGEM[v.status];
    if (campo && contagem[campo] !== undefined) {
      contagem[campo]++;
      algumStatusDefinido = true;
    }
  });
  if (!algumStatusDefinido) return;
  Object.keys(contagem).forEach(campo => {
    const id = idMap[campo];
    const el = id && document.getElementById(id);
    if (el) el.value = contagem[campo];
  });
}

function mapearEtapaForm(etapa = '') {
  if (MAPA_ETAPAS_FORM[etapa]) return MAPA_ETAPAS_FORM[etapa];
  const low = etapa.toLowerCase();
  for (const [k, v] of Object.entries(MAPA_ETAPAS_FORM)) {
    if (low.includes(k.toLowerCase())) return v;
  }
  return '';
}

function mapearEtapaContagem(etapa = '') {
  if (MAPA_ETAPAS_CONTAGEM[etapa]) return MAPA_ETAPAS_CONTAGEM[etapa];
  const low = etapa.toLowerCase();
  for (const [k, v] of Object.entries(MAPA_ETAPAS_CONTAGEM)) {
    if (low.includes(k.toLowerCase())) return v;
  }
  return 'outros';
}

function formatarDataParaInput(dataStr = '') {
  const match = dataStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parsearDataParaOrdenacao(dataStr = '') {
  // Retorna timestamp para ordenação; '-' ou vazio = muito recente (vai para o fim)
  if (!dataStr || dataStr === '-') return Infinity;
  const match = dataStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2})?/);
  if (!match) return Infinity;
  return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4] || '00:00'}`).getTime();
}

// ── SAC: Motor principal ─────────────────────────────────────────────────────

/**
 * Lê o arquivo SAC, processa, salva em AppStorage e dispara callbacks.
 * @param {File} file
 * @param {object} opts
 * @param {function} opts.onSuccess - (dadosSAC) => void
 * @param {function} opts.onError   - (msg) => void
 */
function processarArquivoSAC(file, { onSuccess, onError }) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) { onError('Nenhum veículo encontrado no arquivo.'); return; }

      // Ordenar pelo mais improdutivo: Parada Veículo mais antiga primeiro
      // fallback: Previsão Parada
      const ordenados = [...rows].sort((a, b) => {
        const tA = parsearDataParaOrdenacao(String(a['Parada Veículo'] || a['Previsão Parada'] || ''));
        const tB = parsearDataParaOrdenacao(String(b['Parada Veículo'] || b['Previsão Parada'] || ''));
        return tA - tB;
      });

      // Montar lista de veículos processados
      const veiculos = ordenados.map(row => ({
        placa:    String(row['Placa'] || '').trim(),
        veiculo:  String(row['Veículo'] || '').trim(),
        entrega:  formatarDataParaInput(String(row['Previsão Entrega'] || '')),
        etapaOriginal: String(row['Etapas do Processo'] || '').trim(),
        status:   mapearEtapaForm(String(row['Etapas do Processo'] || '')),
        parada:   String(row['Parada Veículo'] || '-').trim(),
      }));

      // Contagens por status
      const contagem = { total: veiculos.length, orcamento: 0, fs: 0, servico: 0, pecas: 0, aprovacao: 0, outros: 0 };
      veiculos.forEach(v => {
        const campo = mapearEtapaContagem(v.etapaOriginal);
        if (contagem[campo] !== undefined) contagem[campo]++;
        else contagem.outros++;
      });

      // JSON completo para salvar na planilha
      const jsonPlanilha = JSON.stringify(veiculos.map(v => ({
        placa:   v.placa,
        status:  v.status || v.etapaOriginal,
        entrega: v.entrega,
      })));

      const dadosSAC = { veiculos, contagem, jsonPlanilha, total: veiculos.length };

      // Persiste para uso no card de improdutivos
      AppStorage.set('sac_dados', dadosSAC);

      onSuccess(dadosSAC);
    } catch (err) {
      console.error('Erro SAC:', err);
      onError('Erro ao ler o arquivo. Certifique-se de exportar o Relatório SAC em .xlsx.');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── SAC: Preencher campos de contagem ───────────────────────────────────────
/**
 * Preenche os campos de contagem de veículos no formulário com base nos dados SAC.
 * @param {object} contagem  - objeto com total, orcamento, fs, servico, pecas, aprovacao
 * @param {object} idMap     - mapa { total, orcamento, fs, servico, pecas, aprovacao, entregues } → IDs dos inputs
 */
function preencherContagemSAC(contagem, idMap) {
  Object.entries(idMap).forEach(([campo, id]) => {
    const el = document.getElementById(id);
    if (el && contagem[campo] !== undefined) {
      el.value = contagem[campo];
    }
  });
}

// ── SAC: Paginação de veículos ───────────────────────────────────────────────

const POR_PAGINA = 10;

// ── Lista de ações disponíveis por veículo (tabela de improdutivos) ──────────
// Limite de fotos por veículo, escalonado pelo total de placas da visita:
// até 10 → 3 fotos | 11 a 20 → 2 fotos | acima de 20 → 1 foto.
// Usado na tabela SAC (total variável) e no modo manual (sempre ≤3 veículos, logo sempre 3).
function limiteFotosPorTotal(totalVeiculos) {
  if (totalVeiculos > 20) return 1;
  if (totalVeiculos > 10) return 2;
  return 3;
}
const MAX_FOTOS_POR_VEICULO = 3; // usado no modo manual (sempre ≤3 veículos)

const ACOES_VEICULO = [
  'Aguardando entrega da peça',
  'Carro pronto para retirada (Fleet e Livre)',
  'Carro pronto, orientado devolução em loja',
  'Cobrado celeridade na finalização do serviço',
  'Desmobilização',
  'Direcionado aprovação Fleet/Livre',
  'Direcionado aprovação RAC',
  'Fornecedor orientado enviar o orçamento',
  'Implantação',
  'Orientado a retirar o carro em loja',
  'Prevenção á fraude',
  'Sem agendamento Fleet/Livre',
  'Solicitado redirecionamento guincho',
];

/**
 * Renderiza a lista paginada de veículos no container indicado.
 * @param {object} opts
 * @param {string}   opts.containerId   - ID do elemento onde renderizar
 * @param {string}   opts.hiddenInputId - ID do hidden input que receberá o JSON
 * @param {boolean}  opts.servicoObrig  - se true, Tipo de Serviço é obrigatório
 * @param {object[]} opts.veiculos      - lista de veículos processados
 * @param {boolean}  [opts.exigirFoto]  - se true, exige ao menos 1 foto por veículo
 */
function inicializarTabelaVeiculos({ containerId, hiddenInputId, veiculos, exigirFoto = false, idMap = null }) {
  // Tipo de Serviço e Comentário sempre obrigatórios
  const container   = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenInputId);
  if (!container) return;

  const limiteFotos = limiteFotosPorTotal(veiculos.length);

  let paginaAtual = 0;
  const totalPaginas = Math.ceil(veiculos.length / POR_PAGINA);

  const estado = veiculos.map(v => ({
    ...v,
    acao: v.acao || v.comentario || '',
    fotos: v.fotos || (v.foto ? [v.foto] : []),
  }));

  function salvarJSON() {
    if (!hiddenInput) return;
    hiddenInput.value = JSON.stringify(estado.map(v => ({
      placa:   v.placa,
      status:  v.status || v.etapaOriginal,
      entrega: v.entrega,
      servico: v.servico || '',
      acao:    v.acao || '',
      fotos:   (v.fotos || []).map(f => ({ base64: f.base64, mime: f.mime, nome: f.nome })),
    })));
  }

  function renderizar() {
    const inicio = paginaAtual * POR_PAGINA;
    const fim    = Math.min(inicio + POR_PAGINA, estado.length);
    const pagina = estado.slice(inicio, fim);

    const estiloTh = 'padding:8px 10px;border:1px solid #dde3ee;background:#0051AA;color:#fff;font-size:.78rem;text-align:left;white-space:nowrap;';
    const estiloTd = 'padding:7px 8px;border:1px solid #e8edf5;vertical-align:middle;';

    container.innerHTML = `
      <div style="font-size:.82rem;color:#666;margin-bottom:10px;">
        Mostrando ${inicio + 1}–${fim} de ${estado.length} veículos
        ${estado.length > POR_PAGINA ? ` — Página ${paginaAtual + 1} de ${totalPaginas}` : ''}
      </div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e0e0e0;">
        <table style="width:100%;border-collapse:collapse;font-size:.82rem;min-width:740px;">
          <thead>
            <tr>
              <th style="${estiloTh}width:28px;">#</th>
              <th style="${estiloTh}white-space:nowrap;">Placa</th>
              <th style="${estiloTh}">Status <span style="color:#ffd">*</span></th>
              <th style="${estiloTh}">Entrega</th>
              <th style="${estiloTh}">Serviço <span style="color:#ffd">*</span></th>
              <th style="${estiloTh}min-width:210px;">Ação <span style="color:#ffd">*</span></th>
              <th style="${estiloTh}width:120px;text-align:center;">Fotos (máx. ${limiteFotos}) ${exigirFoto ? '<span style="color:#ffd">*</span>' : ''}</th>
            </tr>
          </thead>
          <tbody>
            ${pagina.map((v, i) => {
              const idx = inicio + i;
              const bg = i % 2 === 0 ? '#fff' : '#f8faff';
              return `
              <tr style="background:${bg};">
                <td style="${estiloTd}color:#999;text-align:center;">${idx + 1}</td>
                <td style="${estiloTd}font-weight:700;white-space:nowrap;">
                  ${v.placa}
                  ${(v.fotos || []).length < limiteFotos ? `
                    <button type="button" class="foto-placa-btn" data-idx="${idx}" title="Tirar foto da placa"
                      style="border:none;border-radius:5px;padding:2px 5px;cursor:pointer;font-size:.78rem;background:#f0f0f0;margin-left:4px;">📷</button>
                  ` : ''}
                </td>
                <td style="${estiloTd}">
                  <select data-idx="${idx}" data-field="status"
                    style="font-size:.78rem;padding:4px 2px;border:1px solid #ccc;border-radius:5px;width:100%;min-width:110px;background:#fff;">
                    <option value="">— Selecione —</option>
                    ${['Fora de Serviço','Pend. Orçamento','Pend. Aprovação','Erro Material','Pend. Peça','Em Serviço']
                      .map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </td>
                <td style="${estiloTd}">
                  <input type="date" data-idx="${idx}" data-field="entrega"
                    value="${v.entrega}"
                    style="font-size:.78rem;padding:4px 2px;border:1px solid #ccc;border-radius:5px;width:100%;min-width:110px;box-sizing:border-box;">
                </td>
                <td style="${estiloTd}">
                  <select data-idx="${idx}" data-field="servico"
                    style="font-size:.78rem;padding:4px 2px;border:1px solid #ccc;border-radius:5px;width:100%;min-width:90px;background:#fff;">
                    <option value="">—</option>
                    ${['Preventiva','Corretiva','Sinistro']
                      .map(s => `<option value="${s}" ${v.servico === s ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </td>
                <td style="${estiloTd}">
                  <select data-idx="${idx}" data-field="acao"
                    style="font-size:.78rem;padding:4px 6px;border:1px solid #ccc;border-radius:5px;width:100%;min-width:200px;box-sizing:border-box;background:#fff;">
                    <option value="">— Selecione —</option>
                    ${ACOES_VEICULO.map(a => `<option value="${a}" ${v.acao === a ? 'selected' : ''}>${a}</option>`).join('')}
                  </select>
                </td>
                <td style="${estiloTd}text-align:center;min-width:120px;">
                  <div style="display:flex;gap:4px;justify-content:center;margin-bottom:4px;">
                    ${(v.fotos || []).length < limiteFotos ? `
                      <button type="button" class="foto-camera-btn" data-idx="${idx}" title="Tirar foto"
                        style="border:none;border-radius:5px;padding:4px 6px;cursor:pointer;font-size:.85rem;background:#f0f0f0;">📷</button>
                      <button type="button" class="foto-galeria-btn" data-idx="${idx}" title="Escolher da galeria"
                        style="border:none;border-radius:5px;padding:4px 6px;cursor:pointer;font-size:.85rem;background:#f0f0f0;">🖼️</button>
                    ` : `<span style="font-size:.68rem;color:#999;">Limite de ${limiteFotos} atingido</span>`}
                  </div>
                  <div style="display:flex;flex-wrap:nowrap;overflow-x:auto;gap:3px;justify-content:center;height:34px;">
                    ${(v.fotos || []).map((f, fi) => `
                      <div style="position:relative;display:inline-block;flex-shrink:0;">
                        <img src="data:${f.mime};base64,${f.base64}" style="width:28px;height:28px;object-fit:cover;border-radius:4px;border:1px solid #dde3ee;">
                        <button type="button" class="foto-remover-item-btn" data-idx="${idx}" data-fotoidx="${fi}" title="Remover"
                          style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;line-height:14px;border-radius:50%;border:none;background:#c0392b;color:#fff;font-size:.6rem;cursor:pointer;padding:0;">✕</button>
                      </div>
                    `).join('')}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${totalPaginas > 1 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
        <button type="button" id="sac-prev-btn" ${paginaAtual === 0 ? 'disabled' : ''}
          style="padding:8px 18px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;font-size:.9rem;">
          ← Anterior
        </button>
        <span style="font-size:.85rem;color:#666;">${paginaAtual + 1} / ${totalPaginas}</span>
        <button type="button" id="sac-next-btn" ${paginaAtual === totalPaginas - 1 ? 'disabled' : ''}
          style="padding:8px 18px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;font-size:.9rem;">
          Próxima →
        </button>
      </div>` : ''}
    `;

    // Eventos de edição
    container.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        estado[parseInt(el.dataset.idx)][el.dataset.field] = el.value;
        salvarJSON();
        // Status editado pelo analista prevalece sobre o valor importado do
        // XLSX — atualiza os campos de contagem na hora, sem alerta.
        if (el.dataset.field === 'status') recalcularContagemPorStatus(estado, idMap);
      });
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.addEventListener('input', () => {
          estado[parseInt(el.dataset.idx)][el.dataset.field] = el.value;
          salvarJSON();
        });
      }
    });

    const adicionarFotoIdx = (idx, dados) => {
      if (!estado[idx].fotos) estado[idx].fotos = [];
      if (estado[idx].fotos.length >= limiteFotos) {
        alert(`Máximo de ${limiteFotos} foto(s) por veículo (o limite diminui quando há muitas placas).`);
        return;
      }
      estado[idx].fotos.push(dados);
      salvarJSON();
      renderizar();
    };
    const erroFoto = (msg) => alert('Erro ao processar a foto: ' + msg);

    container.querySelectorAll('.foto-camera-btn').forEach(btn => {
      ativarCapturaFoto(btn, (dados) => adicionarFotoIdx(parseInt(btn.dataset.idx), dados), erroFoto, { capture: 'environment' });
    });
    container.querySelectorAll('.foto-galeria-btn').forEach(btn => {
      ativarCapturaFoto(btn, (dados) => adicionarFotoIdx(parseInt(btn.dataset.idx), dados), erroFoto);
    });
    // Botão de câmera junto da placa: mesma função de salvar foto do
    // veículo, sem OCR (a placa já veio do arquivo, não precisa ser lida).
    container.querySelectorAll('.foto-placa-btn').forEach(btn => {
      ativarCapturaFoto(btn, (dados) => adicionarFotoIdx(parseInt(btn.dataset.idx), dados), erroFoto, { capture: 'environment' });
    });
    container.querySelectorAll('.foto-remover-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const fotoIdx = parseInt(btn.dataset.fotoidx);
        estado[idx].fotos.splice(fotoIdx, 1);
        salvarJSON();
        renderizar();
      });
    });

    container.querySelector('#sac-prev-btn')?.addEventListener('click', () => { paginaAtual--; renderizar(); });
    container.querySelector('#sac-next-btn')?.addEventListener('click', () => { paginaAtual++; renderizar(); });
  }

  // Validação completa exposta para o submit
  container._validarTodos = () => {
    let valido = true;
    const erros = [];
    estado.forEach((v, idx) => {
      if (!v.status) { erros.push(`Veículo ${idx+1} (${v.placa}): Status obrigatório.`); valido = false; }
      if (!v.servico) { erros.push(`Veículo ${idx+1} (${v.placa}): Tipo de Serviço obrigatório.`); valido = false; }
      if (!v.acao) { erros.push(`Veículo ${idx+1} (${v.placa}): Ação obrigatória.`); valido = false; }
      if (exigirFoto && (!v.fotos || v.fotos.length === 0)) { erros.push(`Veículo ${idx+1} (${v.placa}): Foto obrigatória.`); valido = false; }
    });
    if (!valido) {
      const idxErro = estado.findIndex(v => !v.status || !v.servico || !v.acao || (exigirFoto && (!v.fotos || v.fotos.length === 0)));
      if (idxErro >= 0) { paginaAtual = Math.floor(idxErro / POR_PAGINA); renderizar(); }
      alert('Corrija os campos antes de enviar:\n\n' + erros.slice(0,3).join('\n') + (erros.length > 3 ? `\n...e mais ${erros.length-3} erro(s).` : ''));
    }
    return valido;
  };

  renderizar();
  salvarJSON();
  // Sincroniza a contagem já na abertura da tabela, usando o status real de
  // cada veículo importado (em vez de confiar só no total bruto do XLSX).
  recalcularContagemPorStatus(estado, idMap);
}

// ── Botão de importação SAC no card de volume ────────────────────────────────
/**
 * Inicializa o botão de importação do SAC no card de contagem de veículos.
 * Ao importar, preenche os campos de contagem e armazena os dados para o card de improdutivos.
 */
function inicializarImportSACVolume({ btnId, inputId, statusId, idMap, onImportado }) {
  const btn    = document.getElementById(btnId);
  const input  = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  if (!input) return; // btn é opcional agora

  if (btn) btn.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    mostrarStatus(status, '⏳ Processando arquivo…', 'info');

    processarArquivoSAC(file, {
      onSuccess: (dados) => {
        preencherContagemSAC(dados.contagem, idMap);
        mostrarStatus(status,
          `✅ ${dados.total} veículos importados.`,
          'ok'
        );
        if (onImportado) onImportado(dados);
      },
      onError: (msg) => mostrarStatus(status, `❌ ${msg}`, 'erro'),
    });

    input.value = '';
  });
}

// ── Fotos de veículos: captura, compressão e helpers Base64 ──────────────────
const FOTO_MAX_LARGURA = 1000; // px — reduz tamanho antes de enviar
const FOTO_QUALIDADE   = 0.6;  // 0–1 (JPEG)

/**
 * Lê um arquivo de imagem, redimensiona/comprime via canvas e retorna
 * { base64, mime, nome } — base64 sem o prefixo "data:...;base64,".
 */
function comprimirFoto(file, { maxLargura = FOTO_MAX_LARGURA, qualidade = FOTO_QUALIDADE } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('Arquivo selecionado não é uma imagem.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
      img.onload = () => {
        const escala = Math.min(1, maxLargura / img.width);
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
        resolve({
          base64: dataUrl.split(',')[1],
          mime: 'image/jpeg',
          nome: (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg',
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Liga um clique em `elemento` a um seletor de imagem (câmera ou galeria,
 * o próprio SO do celular oferece a escolha) e chama onFoto({base64,mime,nome})
 * após comprimir. onErro(mensagem) em caso de falha.
 */
/**
 * @param {string} [opcoes.capture] - 'environment' força a câmera traseira a abrir
 *        direto (sem passar pelo seletor de galeria). Omitir abre o seletor padrão
 *        do sistema, que em muitos Android atuais só mostra a galeria.
 */
function ativarCapturaFoto(elemento, onFoto, onErro, opcoes = {}) {
  elemento.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (opcoes.capture) input.setAttribute('capture', opcoes.capture);
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.remove();
      if (!file) return;
      try {
        const dados = await comprimirFoto(file);
        onFoto(dados);
      } catch (err) {
        if (onErro) onErro(err.message);
      }
    });
    input.click();
  });
}

// ── OCR de placa (Tesseract.js) ───────────────────────────────────────────────
/**
 * Tenta ler a placa a partir de uma foto (Base64). Retorna a placa formatada
 * ("ABC-1234" ou "ABC1D23") ou null se não conseguir reconhecer nenhum padrão.
 * Requer a biblioteca Tesseract.js carregada na página (variável global Tesseract).
 */
async function tentarLerPlaca(base64, mime) {
  if (typeof Tesseract === 'undefined' || !base64) return null;
  let worker;
  try {
    worker = await Tesseract.createWorker('eng');
    await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
    const { data } = await worker.recognize(`data:${mime};base64,${base64}`);
    return extrairPlacaDoTexto(data.text);
  } catch (err) {
    console.warn('OCR de placa falhou:', err);
    return null;
  } finally {
    if (worker) { try { await worker.terminate(); } catch (_) {} }
  }
}

/**
 * Procura no texto reconhecido um padrão de placa brasileira:
 * antiga (AAA9999) ou Mercosul (AAA9A99).
 */
function extrairPlacaDoTexto(texto) {
  const limpo = (texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let m = limpo.match(/[A-Z]{3}\d[A-Z]\d{2}/); // Mercosul: ABC1D23
  if (m) return m[0];
  m = limpo.match(/[A-Z]{3}\d{4}/);            // Antiga: ABC1234
  if (m) return m[0].slice(0, 3) + '-' + m[0].slice(3);
  return null;
}

// ── Helpers internos ─────────────────────────────────────────────────────────
function extrairCidade(address = {}) {
  return address.city || address.town || address.village || '';
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function mostrarStatus(el, msg, tipo) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'inline-block';
  el.style.marginTop = '8px';
  el.style.color = tipo === 'ok'
    ? 'var(--success,#1a7a3f)'
    : tipo === 'erro'
      ? 'var(--danger,#c0392b)'
      : 'var(--text-muted,#666)';
}

// ── Validação do card de improdutivos (modo SAC) ─────────────────────────────
/**
 * Valida se todos os selects de serviço obrigatórios estão preenchidos na tabela SAC.
 * Retorna true se válido, false se não.
 */
function validarTabelaImprodutivos() {
  const selects = document.querySelectorAll('[data-field="servico"][data-servico-obrig="true"]');
  let valido = true;
  selects.forEach(sel => {
    if (!sel.value) {
      sel.style.border = '2px solid red';
      valido = false;
    } else {
      sel.style.border = '';
    }
  });
  if (!valido) alert('Por favor, selecione o Tipo de Serviço para todos os veículos obrigatórios.');
  return valido;
}
