/**
 * script_oficina_externa.js
 * Depende de: form-utils.js, form-engine.js
 */

document.addEventListener('DOMContentLoaded', () => {
  const form   = document.getElementById('agendamento-form');
  const engine = new FormEngine(form, {
    onBeforeNext:   validacaoEspecifica,
    onBeforeSimNao: validacaoSimNaoEspecifica,
  });
  engine.init();

  preencherDataHora(
    document.getElementById('data-visita'),
    document.getElementById('horario-visita')
  );

  aplicarMascaraCNPJ(document.getElementById('CNPJ_Oficina'));

  const enderecoInput  = document.getElementById('endereco');
  const latitudeInput  = document.getElementById('latitude');
  const longitudeInput = document.getElementById('longitude');
  const cidadeInput    = document.getElementById('cidade-input');

  document.getElementById('get-location')?.addEventListener('click', () =>
    obterLocalizacao({ enderecoInput, latitudeInput, longitudeInput, cidadeInput })
  );
  if (enderecoInput) inicializarAutocomplete({ enderecoInput, latitudeInput, longitudeInput, cidadeInput });

  document.getElementById('home-btn')?.addEventListener('click', () => {
    window.location.href = 'index_visita_oficina.html';
  });

  // ── Card 0b ───────────────────────────────────────────────
  document.getElementById('btn-presencial')?.addEventListener('click', () => {
    document.getElementById('presencial-telefone').value = 'Presencial';
    engine.showCard('100');
  });
  document.getElementById('btn-telefone')?.addEventListener('click', () => {
    document.getElementById('presencial-telefone').value = 'Telefone';
    engine.showCard('100');
  });

  // ── Card 4b: visita completa ──────────────────────────────
  form.querySelectorAll('.visita-completa-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      const resposta = btn.dataset.value;
      engine.showCard(isProspeccao() ? '5' : (resposta === 'Sim' ? '5' : '10b'));
    }, true);
  });

  // ── Card 10b: escolha de modo (importar ou manual) ───────
  document.getElementById('btn-modo-importar')?.addEventListener('click', () => {
    document.getElementById('input-import-sac-vol')?.click();
  });

  document.getElementById('btn-modo-manual')?.addEventListener('click', () => {
    AppStorage.remove('sac_dados');
    atualizarPrevFornecedores();
    engine.showCard('10');
  });

  inicializarImportSACVolume({
    btnId:    'btn-import-sac-vol',
    inputId:  'input-import-sac-vol',
    statusId: 'import-sac-vol-status',
    idMap: {
      total:     'veiculos-total',
      orcamento: 'veiculos-orcamento',
      aprovacao: 'veiculos-pendentes',
      servico:   'veiculos-aprovados',
      pecas:     'veiculos-aguardando',
      fs:        'veiculos-FS',
    },
    onImportado: (dados) => {
      atualizarPrevFornecedores();
      // Mostra feedback no card-10b antes de navegar
      const statusEl = document.getElementById('import-sac-vol-status');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = '#f0faf4';
        statusEl.style.border = '1px solid #a3d9b1';
        statusEl.style.color = '#1a5c30';
        statusEl.textContent = `✅ ${dados.total} veículos importados. Avançando...`;
      }
      setTimeout(() => engine.showCard('17'), 1200);
    },
  });

  // Atualiza o Anterior do card de fornecedores dinamicamente
  function atualizarPrevFornecedores() {
    const btn = document.getElementById('prev-btn-17');
    if (!btn) return;
    const sacImportado = AppStorage.get('sac_dados');
    btn.dataset.card = sacImportado ? '10b' : '16';
  }

  // Chama ao iniciar (caso a página recarregue com dados em sessão)
  atualizarPrevFornecedores();

  // ── Submit ────────────────────────────────────────────────
  function setupSubmit(btn) {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const card = engine.currentCard();

      // Modo SAC: valida tabela (serviço + comentário obrigatórios)
      const tabelaContainer = document.getElementById('tabela-improdutivos');
      const modoSAC = document.getElementById('modo-sac');
      if (modoSAC && modoSAC.style.display !== 'none' && tabelaContainer?._validarTodos) {
        if (!tabelaContainer._validarTodos()) return;
      } else {
        if (!validarCard(card)) { engine._shakeCard(card); alert('Por favor, preencha todos os campos obrigatórios.'); return; }
      }

      enviarFormulario(form, btn);
    });
  }
  setupSubmit(document.getElementById('submit-btn'));
  setupSubmit(document.getElementById('submit-btn-prospeccao'));

  // ── Validações ────────────────────────────────────────────
  function validacaoEspecifica(card) {
    const cardId = card.id.replace('card-', '');

    // Card 10: se total = 0 pula direto para fornecedores (sem perguntar modo)
    if (cardId === '10') {
      const total = parseInt(document.getElementById('veiculos-total')?.value) || 0;
      if (total === 0) {
        ['veiculos-orcamento','veiculos-pendentes','veiculos-aprovados',
         'veiculos-aguardando','veiculos-FS','veiculos-entregues'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '0';
        });
        AppStorage.remove('sac_dados');
        engine.showCard('17');
        return false;
      }
    }

    if (cardId === '15') {
      const ids  = ['veiculos-total','veiculos-orcamento','veiculos-pendentes','veiculos-aprovados','veiculos-aguardando','veiculos-FS'];
      const vals = ids.map(id => parseInt(document.getElementById(id)?.value) || 0);
      const soma = vals[1] + vals[2] + vals[3] + vals[4] + vals[5];
      if (soma !== vals[0]) {
        ids.forEach(id => document.getElementById(id)?.classList.add('error'));
        alert(`A soma dos veículos (${soma}) não corresponde ao total (${vals[0]}).`);
        return false;
      }
      ids.forEach(id => document.getElementById(id)?.classList.remove('error'));
    }

    if (cardId === '16') {
      const total     = parseInt(document.getElementById('veiculos-total')?.value) || 0;
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

    if (cardId === '17' && resposta === 'Sim') {
      const qtd = card.querySelector('#necessidade-aumento-fornecedores');
      if (qtd && !qtd.value.trim()) {
        qtd.classList.add('error');
        alert('Por favor, informe o número de fornecedores necessários.');
        return false;
      }
      qtd?.classList.remove('error');
    }

    const comComentNao = ['5','6','7','8'];
    if (comComentNao.includes(cardId) && resposta === 'Nao') {
      const ta = card.querySelector('textarea');
      if (ta && !ta.value.trim()) {
        ta.classList.add('error');
        alert('Por favor, descreva o que precisa ser melhorado.');
        return false;
      }
      if (ta) ta.classList.remove('error');
    }

    if (cardId === '9' && isProspeccao()) { engine.showCard('9-fim'); return false; }

    // Ao sair do card de fornecedores (17), renderiza a tabela antes de mostrar card 18
    if (cardId === '17') {
      setTimeout(() => renderizarImprodutivos(), 50);
    }
  }

  // ── Toggles veículos manuais (modo sem SAC) ──────────────
  document.querySelectorAll('.veiculo-skip-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleVeiculo(cb.dataset.target, cb.checked));
  });

  // ── Tabela de improdutivos (card 18) ──────────────────────
  function renderizarImprodutivos() {
    const dados      = AppStorage.get('sac_dados');
    const modoSAC    = document.getElementById('modo-sac');
    const modoManual = document.getElementById('modo-manual');
    const aviso      = document.getElementById('aviso-servico-obrig');

    if (dados && dados.veiculos && dados.veiculos.length > 0) {
      if (modoSAC)    modoSAC.style.display    = 'block';
      if (modoManual) modoManual.style.display  = 'none';

      if (aviso) {
        aviso.textContent = '⚠️ Tipo de Serviço e Comentário são obrigatórios para todos os veículos.';
        aviso.style.display = 'block';
      }

      inicializarTabelaVeiculos({
        containerId:   'tabela-improdutivos',
        hiddenInputId: 'veiculos-json',
        veiculos:      dados.veiculos,
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
    const card  = document.getElementById(`veiculo-card-${n}`);
    if (!body || !placa) return;
    placa.disabled = desabilitar;
    if (desabilitar) placa.value = '';
    body.style.display = desabilitar ? 'none' : 'block';
    body.querySelectorAll('input, select').forEach(el => {
      el.disabled = desabilitar;
      if (desabilitar) el.value = '';
    });
    card?.classList.toggle('vehicle-card--disabled', desabilitar);
  }

  function isProspeccao() {
    const sel = document.getElementById('motivo');
    if (!sel) return false;
    return Array.from(sel.selectedOptions).some(o => o.value === 'Prospecção');
  }
});
