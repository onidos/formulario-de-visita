/**
 * script_oficina_interna_movel.js
 * Depende de: form-utils.js, form-engine.js
 */

document.addEventListener('DOMContentLoaded', () => {
  const form   = document.getElementById('agendamento-form');
  const engine = new FormEngine(form, {
    onBeforeNext:    validacaoEspecifica,
    onBeforeSimNao:  validacaoSimNaoEspecifica,
  });
  engine.init();

  preencherDataHora(
    document.getElementById('data-visita'),
    document.getElementById('horario-visita')
  );

  const enderecoInput  = document.getElementById('endereco');
  const latitudeInput  = document.getElementById('latitude');
  const longitudeInput = document.getElementById('longitude');

  document.getElementById('get-location')?.addEventListener('click', () =>
    obterLocalizacao({ enderecoInput, latitudeInput, longitudeInput })
  );
  if (enderecoInput) {
    inicializarAutocomplete({ enderecoInput, latitudeInput, longitudeInput });
  }

  document.getElementById('home-btn')?.addEventListener('click', () => {
    window.location.href = 'index_visita_oficina.html';
  });

  // ── Card 4b: lógica de prospecção e visita completa ──────
  form.querySelectorAll('.visita-completa-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      const resposta = btn.dataset.value;
      if (isProspeccao()) {
        // Prospecção: vai à auditoria normalmente (card 5)
        engine.showCard('5');
      } else {
        // Normal: Sim = auditoria completa, Não = pula para card 9-alt
        engine.showCard(resposta === 'Sim' ? '5' : '9-alt');
      }
    }, true);
  });

  // ── Submit: principal e prospecção ───────────────────────
  function setupSubmit(btn) {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const card = engine.currentCard();
      if (!validarCard(card)) {
        engine._shakeCard(card);
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
      }
      enviarFormulario(form, btn);
    });
  }
  setupSubmit(document.getElementById('submit-btn'));
  setupSubmit(document.getElementById('submit-btn-prospeccao'));

  // ── Toggles veículos 2 e 3 ──────────────────────────────
  document.querySelectorAll('.veiculo-skip-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleVeiculo(cb.dataset.target, cb.checked));
  });

  // ── Validações ───────────────────────────────────────────
  function validacaoEspecifica(card) {
    const cardId = card.id.replace('card-', '');

    if (cardId === '15-alt') {
      const total    = parseInt(document.getElementById('veiculos-manutencao')?.value) || 0;
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
    // 4b: tratado pelo listener acima, bloqueia o engine
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

    // Card 8-alt: se prospecção → vai para card-8-fim
    if (cardId === '8-alt' && isProspeccao()) {
      engine.showCard('8-fim');
      return false;
    }
  }

  function isProspeccao() {
    const sel = document.getElementById('motivo');
    if (!sel) return false;
    return Array.from(sel.selectedOptions).some(o => o.value === 'Prospecção');
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
});
