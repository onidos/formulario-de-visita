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
function enviarFormulario(form, btn) {
  btn.classList.add('loading');
  btn.disabled = true;
  const iframeName = 'submit-target-' + Date.now();
  const iframe = document.createElement('iframe');
  iframe.name = iframeName;
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  const fallbackTimer = setTimeout(() => {
    AppStorage.set('submit_result', { planilha: 'desconhecido', email: 'desconhecido' });
    window.location.href = 'sucesso.html';
  }, 20000);
  iframe.addEventListener('load', () => {
    clearTimeout(fallbackTimer);
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const texto = iframeDoc.body ? iframeDoc.body.innerText.trim() : '';
      const json  = JSON.parse(texto);
      AppStorage.set('submit_result', {
        planilha: json.planilha || (json.status === 'ok' ? 'ok' : 'erro'),
        email:    json.email    || (json.status === 'ok' ? 'ok' : 'desconhecido'),
        erro:     json.erro     || json.message || '',
      });
    } catch (_) {
      AppStorage.set('submit_result', { planilha: 'ok', email: 'desconhecido' });
    }
    window.location.href = 'sucesso.html';
  });
  form.target = iframeName;
  form.submit();
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

/**
 * Renderiza a lista paginada de veículos no container indicado.
 * @param {object} opts
 * @param {string}   opts.containerId   - ID do elemento onde renderizar
 * @param {string}   opts.hiddenInputId - ID do hidden input que receberá o JSON
 * @param {boolean}  opts.servicoObrig  - se true, Tipo de Serviço é obrigatório
 * @param {object[]} opts.veiculos      - lista de veículos processados
 */
function inicializarTabelaVeiculos({ containerId, hiddenInputId, veiculos }) {
  // Tipo de Serviço e Comentário sempre obrigatórios
  const container   = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenInputId);
  if (!container) return;

  let paginaAtual = 0;
  const totalPaginas = Math.ceil(veiculos.length / POR_PAGINA);

  const estado = veiculos.map(v => ({ ...v, comentario: v.comentario || '' }));

  function salvarJSON() {
    if (!hiddenInput) return;
    hiddenInput.value = JSON.stringify(estado.map(v => ({
      placa:      v.placa,
      status:     v.status || v.etapaOriginal,
      entrega:    v.entrega,
      servico:    v.servico || '',
      comentario: v.comentario || '',
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
        <table style="width:100%;border-collapse:collapse;font-size:.82rem;min-width:560px;">
          <thead>
            <tr>
              <th style="${estiloTh}width:28px;">#</th>
              <th style="${estiloTh}white-space:nowrap;">Placa</th>
              <th style="${estiloTh}">Status</th>
              <th style="${estiloTh}">Entrega</th>
              <th style="${estiloTh}">Serviço <span style="color:#ffd">*</span></th>
              <th style="${estiloTh}min-width:140px;">Comentário <span style="color:#ffd">*</span></th>
            </tr>
          </thead>
          <tbody>
            ${pagina.map((v, i) => {
              const idx = inicio + i;
              const bg = i % 2 === 0 ? '#fff' : '#f8faff';
              return `
              <tr style="background:${bg};">
                <td style="${estiloTd}color:#999;text-align:center;">${idx + 1}</td>
                <td style="${estiloTd}font-weight:700;white-space:nowrap;">${v.placa}</td>
                <td style="${estiloTd}">
                  <select data-idx="${idx}" data-field="status"
                    style="font-size:.78rem;padding:4px 2px;border:1px solid #ccc;border-radius:5px;width:100%;min-width:110px;background:#fff;">
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
                  <input type="text" data-idx="${idx}" data-field="comentario"
                    value="${(v.comentario||'').replace(/"/g,'&quot;')}"
                    placeholder="Mín. 5 car."
                    style="font-size:.78rem;padding:4px 6px;border:1px solid #ccc;border-radius:5px;width:100%;min-width:140px;box-sizing:border-box;">
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
      });
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.addEventListener('input', () => {
          estado[parseInt(el.dataset.idx)][el.dataset.field] = el.value;
          salvarJSON();
        });
      }
    });

    container.querySelector('#sac-prev-btn')?.addEventListener('click', () => { paginaAtual--; renderizar(); });
    container.querySelector('#sac-next-btn')?.addEventListener('click', () => { paginaAtual++; renderizar(); });
  }

  // Validação completa exposta para o submit
  container._validarTodos = () => {
    let valido = true;
    const erros = [];
    estado.forEach((v, idx) => {
      if (!v.servico) { erros.push(`Veículo ${idx+1} (${v.placa}): Tipo de Serviço obrigatório.`); valido = false; }
      if (!validarComentario(v.comentario)) { erros.push(`Veículo ${idx+1} (${v.placa}): Comentário inválido (mín. 5 caracteres, sem atalhos de teclado).`); valido = false; }
    });
    if (!valido) {
      const idxErro = estado.findIndex(v => !v.servico || !validarComentario(v.comentario));
      if (idxErro >= 0) { paginaAtual = Math.floor(idxErro / POR_PAGINA); renderizar(); }
      alert('Corrija os campos antes de enviar:\n\n' + erros.slice(0,3).join('\n') + (erros.length > 3 ? `\n...e mais ${erros.length-3} erro(s).` : ''));
    }
    return valido;
  };

  renderizar();
  salvarJSON();
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
