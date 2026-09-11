/**
 * script_oficina_interna_movel.js
 * Depende de: form-utils.js, form-engine.js
 */

// ── Configuração: permitir "Preenchimento Manual"? ──────────────
// false = esconde o botão "Preenchimento Manual" na tela de escolha,
// deixando só "Importar Placas do Portal" disponível. Pra reativar o modo
// manual, é só voltar isso pra true — não precisa mexer em mais nada.
const PERMITIR_MODO_MANUAL = true;

document.addEventListener('DOMContentLoaded', () => {
  const form   = document.getElementById('agendamento-form');
  const engine = new FormEngine(form, {
    onBeforeNext:   validacaoEspecifica,
    onBeforeSimNao: validacaoSimNaoEspecifica,
    onCardChange:   (cardId) => salvarRascunho(cardId),
  });
  engine.init();

  if (!PERMITIR_MODO_MANUAL) {
    const btnManual = document.getElementById('btn-modo-manual');
    if (btnManual) btnManual.style.display = 'none';
  }

  // Popula os selects de "Ação" do modo manual com a lista permitida pro
  // status atual daquele veículo (mesma regra da tabela SAC — algumas ações
  // só valem pra um status específico, ex: "Fora de Serviço").
  function popularAcoesManual(n, manterSelecionado) {
    const sel = document.getElementById(`acao${n}`);
    const statusSel = form.querySelector(`[name="status${n}"]`);
    if (!sel) return;
    const statusAtual = statusSel?.value || '';
    const valorAnterior = manterSelecionado ? sel.value : '';

    sel.innerHTML = '';
    const optVazia = document.createElement('option');
    optVazia.value = '';
    optVazia.textContent = 'Selecione';
    sel.appendChild(optVazia);

    acoesDisponiveisParaStatus(statusAtual).forEach(a => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      sel.appendChild(opt);
    });

    // Só mantém a seleção anterior se ela ainda for uma opção válida pro
    // status atual — senão volta pra "Selecione" (evita ação escondida).
    sel.value = Array.from(sel.options).some(o => o.value === valorAnterior) ? valorAnterior : '';
  }

  [1, 2, 3].forEach(n => {
    popularAcoesManual(n, false);
    form.querySelector(`[name="status${n}"]`)?.addEventListener('change', () => popularAcoesManual(n, true));
  });

  preencherDataHora(
    document.getElementById('data-visita'),
    document.getElementById('horario-visita')
  );

  aplicarMascaraCNPJ(document.getElementById('CNPJ_Oficina'));

  const enderecoInput  = document.getElementById('endereco');
  const latitudeInput  = document.getElementById('latitude');
  const longitudeInput = document.getElementById('longitude');

  document.getElementById('get-location')?.addEventListener('click', () =>
    obterLocalizacao({ enderecoInput, latitudeInput, longitudeInput })
  );
  if (enderecoInput) inicializarAutocomplete({ enderecoInput, latitudeInput, longitudeInput });

  document.getElementById('home-btn')?.addEventListener('click', () => {
    window.location.href = 'index_visita_oficina.html';
  });

  // ── Card 0b ───────────────────────────────────────────────
  document.getElementById('btn-presencial')?.addEventListener('click', () => {
    document.getElementById('presencial-telefone').value = 'Presencial';
    engine.showCard('2');
  });
  document.getElementById('btn-telefone')?.addEventListener('click', () => {
    document.getElementById('presencial-telefone').value = 'Telefone';
    engine.showCard('2');
  });

  // ── Card 4b: visita completa ──────────────────────────────
  form.querySelectorAll('.visita-completa-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      const resposta = btn.dataset.value;
      const destino = isProspeccao() ? '5' : (resposta === 'Sim' ? '5' : '9b-alt');
      document.getElementById('visita-completa-hidden').value = (destino === '5') ? 'Sim' : 'Nao';
      engine.showCard(destino);
    }, true);
  });

  // ── Card 9b-alt: escolha de modo (importar ou manual) ────
  document.getElementById('btn-modo-importar')?.addEventListener('click', () => {
    AppStorage.remove('modo_manual_ativo');
    document.getElementById('input-import-sac-vol')?.click();
  });

  document.getElementById('btn-modo-manual')?.addEventListener('click', () => {
    // O Total (e o resto da "Quantidade de Veículos") ainda não foi
    // preenchido aqui — essa tela vem DEPOIS (cards 9-alt a 15-alt). Só
    // marca que o modo escolhido foi manual; a tabela em branco é gerada
    // mais adiante (renderizarImprodutivos), quando o Total já estiver
    // preenchido de verdade.
    AppStorage.remove('sac_dados');
    AppStorage.set('modo_manual_ativo', true);
    atualizarPrevFornecedores();
    engine.showCard('9-alt');
  });

  // Usado tanto na importação inicial (preenche os totais a partir do XLSX)
  // quanto depois, na tabela de veículos, pra manter as contagens
  // sincronizadas conforme o analista edita o status de cada placa.
  const idMapContagemVeiculos = {
    total:     'veiculos-manutencao',
    fs:        'veiculos-fs',
    aprovacao: 'veiculos-aprovacao',
    servico:   'veiculos-servico',
    pecas:     'veiculos-pecas',
    orcamento: 'veiculos-orcamento',
  };

  inicializarImportSACVolume({
    btnId:    'btn-import-sac-vol',
    inputId:  'input-import-sac-vol',
    statusId: 'import-sac-vol-status',
    idMap: idMapContagemVeiculos,
    onImportado: (dados) => {
      atualizarPrevFornecedores();
      const statusEl = document.getElementById('import-sac-vol-status');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = '#f0faf4';
        statusEl.style.border = '1px solid #a3d9b1';
        statusEl.style.color = '#1a5c30';
        statusEl.textContent = dados.duplicatasRemovidas > 0
          ? `✅ ${dados.total} veículos importados (${dados.duplicatasRemovidas} placa(s) duplicada(s) no arquivo foram ignoradas). Avançando...`
          : `✅ ${dados.total} veículos importados. Avançando...`;
      }
      setTimeout(() => engine.showCard('16-alt'), 1200);
    },
  });

  // Atualiza o Anterior do card de fornecedores dinamicamente
  function atualizarPrevFornecedores() {
    const btn = document.getElementById('prev-btn-16-alt');
    if (!btn) return;
    const sacImportado = AppStorage.get('sac_dados');
    btn.dataset.card = sacImportado ? '9b-alt' : '15-alt';
  }

  atualizarPrevFornecedores();

  // ── Submit ────────────────────────────────────────────────
  function setupSubmit(btn) {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const card = engine.currentCard();

      const tabelaContainer = document.getElementById('tabela-improdutivos');
      const modoSAC = document.getElementById('modo-sac');
      if (modoSAC && modoSAC.style.display !== 'none' && tabelaContainer?._validarTodos) {
        if (!tabelaContainer._validarTodos()) return;
      } else {
        if (!validarCard(card)) { engine._shakeCard(card); alert('Por favor, preencha todos os campos obrigatórios.'); return; }

        // Modo manual: exige foto de cada veículo preenchido (só em visitas
        // presenciais) — exceto quando o status é "Fora de Serviço", já que
        // o carro ainda não está fisicamente na oficina pra fotografar.
        if (isPresencial()) {
          const veiculosAtivos = [1, 2, 3].filter(n => {
            const placaInput = form.querySelector(`[name="placa${n}"]`);
            return placaInput && !placaInput.disabled && placaInput.value.trim();
          });
          const semFoto = veiculosAtivos.find(n => {
            const statusInput = form.querySelector(`[name="status${n}"]`);
            const foraDeServico = statusInput && statusInput.value === 'Fora de Serviço';
            return !foraDeServico && fotosManuais[n].length === 0;
          });
          if (semFoto) {
            alert(`Por favor, adicione uma foto do Veículo ${semFoto} (obrigatória para visitas presenciais).`);
            return;
          }
        }

        coletarAcoesManual();
      }

      enviarFormulario(form, btn);
    });
  }
  setupSubmit(document.getElementById('submit-btn'));
  setupSubmit(document.getElementById('submit-btn-prospeccao'));

  // ── Validações ────────────────────────────────────────────
  function validacaoEspecifica(card) {
    const cardId = card.id.replace('card-', '');

    // Card 2: foto da fachada obrigatória apenas em visitas presenciais
    if (cardId === '2') {
      if (isPresencial() && fotosManuais.fachada.length === 0) {
        alert('Por favor, adicione uma foto da fachada da oficina (obrigatória para visitas presenciais).');
        return false;
      }
    }

    // Card 9-alt: se total = 0 pula direto para fornecedores
    if (cardId === '9-alt') {
      const total = parseInt(document.getElementById('veiculos-manutencao')?.value) || 0;
      if (total === 0) {
        ['veiculos-fs','veiculos-aprovacao','veiculos-servico',
         'veiculos-pecas','veiculos-orcamento','veiculos-entregues'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '0';
        });
        AppStorage.remove('sac_dados');
        engine.showCard('16-alt');
        return false;
      }
    }

    if (cardId === '15-alt') {
      const total     = parseInt(document.getElementById('veiculos-manutencao')?.value) || 0;
      const entregues = parseInt(document.getElementById('veiculos-entregues')?.value) || 0;
      if (entregues > total) {
        document.getElementById('veiculos-entregues')?.classList.add('error');
        alert(`Veículos a entregar (${entregues}) não pode ser maior que o total (${total}).`);
        return false;
      }
      document.getElementById('veiculos-entregues')?.classList.remove('error');
    }
  }

  function validacaoSimNaoEspecifica(card, cardId, resposta) {
    if (cardId === '4b') return false;

    if (cardId === '16-alt' && resposta === 'Sim') {
      const qtd = card.querySelector('#necessidade-aumento-fornecedores');
      if (qtd && !qtd.value.trim()) {
        qtd.classList.add('error');
        alert('Por favor, informe o número de fornecedores necessários.');
        return false;
      }
      qtd?.classList.remove('error');
    }

    const comComentNao = ['5','6','7','8-alt'];
    if (comComentNao.includes(cardId) && resposta === 'Nao') {
      const ta = card.querySelector('textarea');
      if (ta && !ta.value.trim()) {
        ta.classList.add('error');
        alert('Por favor, descreva o que precisa ser melhorado.');
        return false;
      }
      if (ta) ta.classList.remove('error');
    }

    if (cardId === '8-alt' && isProspeccao()) { engine.showCard('8-fim'); return false; }

    // Ao sair do card de fornecedores (16-alt), renderiza a tabela antes de mostrar card 17-alt
    if (cardId === '16-alt') {
      setTimeout(() => renderizarImprodutivos(), 50);
    }
  }

  // ── Toggles veículos manuais (modo sem SAC) ──────────────
  document.querySelectorAll('.veiculo-skip-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleVeiculo(cb.dataset.target, cb.checked));
  });

  // ── Fotos dos veículos manuais (múltiplas por veículo) ────
  const fotosManuais = { 1: [], 2: [], 3: [], fachada: [] };

  function renderizarFotosManuais(n) {
    const container = document.getElementById(`fotos-preview-${n}`);
    if (!container) return;
    container.innerHTML = fotosManuais[n].map((f, i) => `
      <div style="position:relative;display:inline-block;flex-shrink:0;">
        <img src="data:${f.mime};base64,${f.base64}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #dde3ee;">
        <button type="button" class="foto-manual-remover-btn" data-target="${n}" data-fotoidx="${i}" title="Remover"
          style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;line-height:18px;border-radius:50%;border:none;background:#c0392b;color:#fff;font-size:.7rem;cursor:pointer;padding:0;">✕</button>
      </div>
    `).join('');
    container.querySelectorAll('.foto-manual-remover-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        fotosManuais[n].splice(parseInt(btn.dataset.fotoidx), 1);
        atualizarHiddenFotos(n);
        renderizarFotosManuais(n);
        atualizarBotoesFoto(n);
        salvarRascunho(cardIdAtual());
      });
    });
    atualizarBotoesFoto(n);
  }

  function atualizarBotoesFoto(n) {
    const atingiuLimite = fotosManuais[n].length >= MAX_FOTOS_POR_VEICULO;
    document.querySelectorAll(`.foto-manual-camera-btn[data-target="${n}"], .foto-manual-galeria-btn[data-target="${n}"]`)
      .forEach(btn => { btn.style.display = atingiuLimite ? 'none' : ''; });
  }

  function atualizarHiddenFotos(n) {
    const hidden = form.querySelector(`[name="fotos${n}"]`);
    if (hidden) hidden.value = JSON.stringify(fotosManuais[n]);
  }

  function salvarFotoManual(n, dados) {
    if (fotosManuais[n].length >= MAX_FOTOS_POR_VEICULO) {
      alert(`Máximo de ${MAX_FOTOS_POR_VEICULO} fotos por veículo.`);
      return;
    }
    fotosManuais[n].push(dados);
    atualizarHiddenFotos(n);
    renderizarFotosManuais(n);
    salvarRascunho(cardIdAtual());
  }
  const erroFotoManual = (msg) => alert('Erro ao processar a foto: ' + msg);

  document.querySelectorAll('.foto-manual-camera-btn').forEach(btn => {
    ativarCapturaFoto(btn, (dados) => salvarFotoManual(btn.dataset.target, dados), erroFotoManual, { capture: 'environment' });
  });
  document.querySelectorAll('.foto-manual-galeria-btn').forEach(btn => {
    ativarCapturaFoto(btn, (dados) => salvarFotoManual(btn.dataset.target, dados), erroFotoManual);
  });

  // ── Scanner de placa (câmera dedicada, ao lado do campo) ──
  // A foto tirada aqui também é salva como foto do veículo (junto com as
  // demais), mesmo que o OCR não consiga ler a placa — o analista não
  // precisa tirar a mesma foto de novo depois.
  async function lerPlacaEPreencher(n, dados) {
    salvarFotoManual(n, dados);

    const statusEl = document.getElementById(`ocr-status-${n}`);
    if (statusEl) statusEl.textContent = '🔎 Lendo a placa na foto…';
    const placa = await tentarLerPlaca(dados.base64, dados.mime);
    if (!statusEl) return;
    if (placa) {
      const placaInput = form.querySelector(`[name="placa${n}"]`);
      if (placaInput) {
        placaInput.value = placa;
        placaInput.style.background = '#fff9e0';
        setTimeout(() => { placaInput.style.background = ''; }, 4000);
      }
      statusEl.textContent = `🔎 Placa lida: ${placa} — confira antes de enviar.`;
    } else {
      statusEl.textContent = '⚠️ Não foi possível ler a placa. Digite manualmente.';
    }
  }

  document.querySelectorAll('.scan-placa-btn').forEach(btn => {
    ativarCapturaFoto(btn,
      (dados) => lerPlacaEPreencher(btn.dataset.target, dados),
      (msg) => alert('Erro ao processar a foto: ' + msg),
      { capture: 'environment' }
    );
  });

  function limparFotoManual(n) {
    fotosManuais[n] = [];
    atualizarHiddenFotos(n);
    renderizarFotosManuais(n);
  }

  // Monta um array com a ação de cada veículo preenchido no modo manual e
  // salva num único campo oculto (uma célula só na planilha) — mesmo padrão
  // já usado pro veiculos_json do modo SAC.
  function coletarAcoesManual() {
    const acoes = [];
    [1, 2, 3].forEach(n => {
      const placaInput = form.querySelector(`[name="placa${n}"]`);
      const acaoSelect = document.getElementById(`acao${n}`);
      if (!placaInput || placaInput.disabled || !placaInput.value.trim()) return;
      if (!acaoSelect || !acaoSelect.value) return;
      acoes.push({ placa: placaInput.value.trim(), acao: acaoSelect.value });
    });
    const hidden = document.getElementById('acoes-manual-json');
    if (hidden) hidden.value = JSON.stringify(acoes);
  }

  // ── Tabela de improdutivos (card 17-alt) ──────────────────
  function obterVeiculosParaTabela(dadosImportados) {
    // Se a tabela já foi preenchida antes (analista navegou pra outro card
    // e voltou), restaura o estado atual do hidden — senão TODOS os campos
    // (status, serviço, ação, fotos) seriam perdidos a cada ida e volta.
    const hiddenAtual = document.getElementById('veiculos-json')?.value;
    if (hiddenAtual) {
      try {
        const restaurado = JSON.parse(hiddenAtual);
        if (Array.isArray(restaurado) && restaurado.length) return restaurado;
      } catch (err) { /* segue com o import original */ }
    }
    // Primeira vez que a tabela é montada nesta visita: mantém tudo do
    // import, mas zera o status pra obrigar o analista a revisar e
    // escolher ativamente (em vez de aceitar sem olhar o valor importado).
    return dadosImportados.veiculos.map(v => ({ ...v, status: '' }));
  }

  function renderizarImprodutivos() {
    let dados        = AppStorage.get('sac_dados');
    const modoSAC    = document.getElementById('modo-sac');
    const modoManual = document.getElementById('modo-manual');
    const aviso      = document.getElementById('aviso-servico-obrig');

    // Modo manual: até aqui só sabíamos QUE era manual (flag marcada no
    // clique do botão) — agora, chegando neste ponto do fluxo, o Total já
    // foi preenchido de verdade (cards 9-alt a 15-alt, logo antes de
    // Fornecedores). Gera as linhas em branco agora, na quantidade certa.
    if (!dados && AppStorage.get('modo_manual_ativo')) {
      const total = parseInt(document.getElementById('veiculos-manutencao')?.value, 10) || 0;
      if (total > 0) {
        const veiculosVazios = Array.from({ length: total }, () => ({
          origem: 'Manual', placa: '', status: '', entrega: '', observacao: '', acao: '', fotos: [],
        }));
        dados = { veiculos: veiculosVazios, manual: true };
        AppStorage.set('sac_dados', dados);
      }
    }

    if (dados && dados.veiculos && dados.veiculos.length > 0) {
      if (modoSAC)    modoSAC.style.display    = 'block';
      if (modoManual) modoManual.style.display  = 'none';

      const veiculosParaTabela = obterVeiculosParaTabela(dados);
      const totalVeiculos = veiculosParaTabela.length;
      // Com mais de 25 placas, foto por veículo deixa de ser obrigatória —
      // só a foto da fachada continua exigida em visita presencial.
      const fotoObrigatoriaPorVeiculo = isPresencial() && totalVeiculos <= 25;

      if (aviso) {
        aviso.textContent = totalVeiculos > 25
          ? '⚠️ Placa, Status, Dt. Prev. Entrega e Ação são obrigatórios para todos os veículos. Com mais de 25 placas, a foto por veículo NÃO é obrigatória — só a foto da fachada continua exigida.'
          : '⚠️ Placa, Status, Dt. Prev. Entrega e Ação são obrigatórios para todos os veículos. Foto é obrigatória em visitas presenciais, exceto para veículos "Fora de Serviço".';
        aviso.style.display = 'block';
      }

      inicializarTabelaVeiculos({
        containerId:   'tabela-improdutivos',
        hiddenInputId: 'veiculos-json',
        veiculos:      veiculosParaTabela,
        exigirFoto:    fotoObrigatoriaPorVeiculo,
        idMap:         idMapContagemVeiculos,
        placaEditavel: !!dados.manual,
        onChange:      () => salvarRascunho('17-alt'),
      });
    } else {
      if (modoSAC)    modoSAC.style.display    = 'none';
      if (modoManual) modoManual.style.display  = 'block';
      if (aviso)      aviso.style.display       = 'none';
    }
  }

  function toggleVeiculo(n, desabilitar) {
    const body  = document.getElementById(`veiculo-body-${n}`);
    const placa = document.querySelector(`[name="placa${n}"]`);
    const scanBtn = document.querySelector(`.scan-placa-btn[data-target="${n}"]`);
    const card  = document.getElementById(`veiculo-card-${n}`);
    if (!body || !placa) return;
    placa.disabled = desabilitar;
    if (scanBtn) scanBtn.disabled = desabilitar;
    if (desabilitar) placa.value = '';
    body.style.display = desabilitar ? 'none' : 'block';
    body.querySelectorAll('input, select').forEach(el => {
      el.disabled = desabilitar;
      if (desabilitar) el.value = '';
    });
    if (desabilitar) limparFotoManual(n);
    card?.classList.toggle('vehicle-card--disabled', desabilitar);
  }

  function isProspeccao() {
    const sel = document.getElementById('motivo');
    if (!sel) return false;
    return Array.from(sel.selectedOptions).some(o => o.value === 'Prospecção');
  }

  function isPresencial() {
    return document.getElementById('presencial-telefone')?.value === 'Presencial';
  }

  function cardIdAtual() {
    return engine.currentCard()?.id.replace('card-', '') || '';
  }

  // ============================================================
  //  Rascunho automático — protege contra tela travando, app indo pra
  //  segundo plano por muito tempo, ou voltar sem querer no celular.
  //  Salva a cada troca de card e a cada foto adicionada; restaura sozinho
  //  na abertura da página, se achar um rascunho da mesma oficina com
  //  menos de 24h.
  // ============================================================
  function salvarRascunho(cardId) {
    RascunhoVisita.salvar({
      tipoOficina: AppStorage.get('tipo_oficina') || '',
      cardAtual:   cardId,
      valores:     coletarValoresForm(form),
    });
  }

  function mostrarAvisoRascunhoRestaurado() {
    const aviso = document.createElement('div');
    aviso.textContent = '✅ Seu progresso anterior foi restaurado automaticamente.';
    aviso.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#0051AA;color:#fff;padding:10px 18px;border-radius:8px;font-size:.85rem;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:92%;text-align:center;';
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 5000);
  }

  function restaurarRascunhoSeExistir() {
    const tipoOficina = AppStorage.get('tipo_oficina') || '';
    const rascunho = RascunhoVisita.obter(tipoOficina);
    if (!rascunho || !rascunho.valores) return;

    restaurarValoresForm(form, rascunho.valores);

    // Reconstrói fotosManuais (1/2/3/fachada) a partir dos hidden
    // restaurados, pra manter as miniaturas e os próximos "adicionar foto"
    // consistentes com o que já tinha sido salvo.
    ['1', '2', '3', 'fachada'].forEach(n => {
      const nomeCampo = n === 'fachada' ? 'fotosfachada' : `fotos${n}`;
      const hidden = form.querySelector(`[name="${nomeCampo}"]`);
      if (!hidden || !hidden.value) return;
      try {
        const lista = JSON.parse(hidden.value);
        if (Array.isArray(lista) && lista.length) {
          fotosManuais[n] = lista;
          renderizarFotosManuais(n);
        }
      } catch (err) {}
    });

    // Se havia uma tabela SAC preenchida, garante que "sac_dados" também
    // reflita isso — renderizarImprodutivos() usa esse dado (sessionStorage)
    // pra decidir se mostra a tabela, e ele pode não ter sobrevivido à mesma
    // interrupção que este rascunho (localStorage) está protegendo.
    const veiculosJsonRestaurado = rascunho.valores['entry.veiculos_json'];
    if (veiculosJsonRestaurado && !AppStorage.get('sac_dados')) {
      try {
        const veiculos = JSON.parse(veiculosJsonRestaurado);
        if (Array.isArray(veiculos) && veiculos.length) AppStorage.set('sac_dados', { veiculos });
      } catch (err) {}
    }

    engine.showCard(rascunho.cardAtual);
    if (rascunho.cardAtual === '17-alt') renderizarImprodutivos();

    mostrarAvisoRascunhoRestaurado();
  }

  restaurarRascunhoSeExistir();
});
