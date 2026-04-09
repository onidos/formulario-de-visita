/**
 * form-engine.js — Motor de navegação entre cards
 * Importar APÓS form-utils.js e ANTES do script específico da página.
 *
 * Uso:
 *   const engine = new FormEngine(form);
 *   engine.init();
 */

class FormEngine {
  /**
   * @param {HTMLFormElement} form
   * @param {object} options
   * @param {function} options.onBeforeNext - (currentCard, nextId) => boolean (false = bloqueia)
   * @param {function} options.onBeforeSimNao - (card, cardId, resposta, nextId) => boolean
   */
  constructor(form, options = {}) {
    this.form = form;
    this.options = options;
    this.cards = Array.from(form.querySelectorAll('.card'));
    this.currentIndex = 0;
  }

  init() {
    this._mostrarPrimeiroCard();
    this._bindNextButtons();
    this._bindPrevButtons();
    this._bindSimNaoButtons();
    this._bindEnterKey();
    this._carregarTipoOficina();
  }

  // ── Exibição ──────────────────────────────────────────────────────────────

  showCard(cardId) {
    const target = this.form.querySelector(`#card-${cardId}`);
    if (!target) { console.warn(`Card #card-${cardId} não encontrado.`); return; }

    this.cards.forEach(c => (c.style.display = 'none'));
    target.style.display = 'block';
    this.currentIndex = this.cards.indexOf(target);

    // Foco no primeiro input editável
    const first = target.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea');
    if (first) setTimeout(() => first.focus(), 50);

    // Scroll suave ao topo do container
    this.form.closest('.container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  currentCard() {
    return this.cards[this.currentIndex];
  }

  // ── Bindings ──────────────────────────────────────────────────────────────

  _mostrarPrimeiroCard() {
    const first = this.cards[0];
    if (!first) return;
    this.cards.forEach(c => (c.style.display = 'none'));
    first.style.display = 'block';
  }

  _bindNextButtons() {
    this.form.querySelectorAll('.next-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = this.currentCard();
        const nextId = btn.dataset.card;

        if (!validarCard(card)) {
          this._shakeCard(card);
          alert('Por favor, preencha todos os campos obrigatórios.');
          return;
        }

        // Hook externo (validações específicas por página)
        if (this.options.onBeforeNext) {
          const ok = this.options.onBeforeNext(card, nextId);
          if (ok === false) return;
        }

        this.showCard(nextId);
      });
    });
  }

  _bindPrevButtons() {
    this.form.querySelectorAll('.prev-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showCard(btn.dataset.card));
    });
  }

  _bindSimNaoButtons() {
    this.form.querySelectorAll('.sim-nao-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.card');
        const cardId = card.id.replace('card-', '');
        const resposta = btn.dataset.value;
        const nextId = btn.dataset.next;
        const hiddenInput = card.querySelector('input[type="hidden"]');
        const comentario = card.querySelector('textarea');

        // Validação padrão: comentário obrigatório quando "Não"
        const cardsComComentarioObrigNao = ['4', '5', '6', '7', '7-alt'];
        if (cardsComComentarioObrigNao.includes(cardId) && resposta === 'Nao') {
          if (comentario && !comentario.value.trim()) {
            comentario.classList.add('error');
            alert('Por favor, descreva o que precisa ser melhorado.');
            return;
          }
        }
        if (comentario) comentario.classList.remove('error');

        // Hook externo
        if (this.options.onBeforeSimNao) {
          const ok = this.options.onBeforeSimNao(card, cardId, resposta, nextId);
          if (ok === false) return;
        }

        // Salva resposta no hidden input ANTES de navegar
        if (hiddenInput) hiddenInput.value = resposta;

        // Limpa o textarea se a resposta for "Sim" (não obriga comentário)
        if (comentario && resposta === 'Sim') comentario.classList.remove('error');

        this.showCard(nextId);
      });
    });
  }

  _bindEnterKey() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const card = this.currentCard();
      if (!card) return;

      // Não disparar dentro de textarea
      if (document.activeElement?.tagName === 'TEXTAREA') return;

      e.preventDefault();
      const nextBtn = card.querySelector('.next-btn');
      const simBtn = card.querySelector('.sim-nao-btn[data-value="Sim"]');
      const submitBtn = card.querySelector('.submit-btn');
      (nextBtn || submitBtn || simBtn)?.click();
    });
  }

  _carregarTipoOficina() {
    const tipo = localStorage.getItem('tipo_oficina');
    const hidden = this.form.querySelector('#tipo-oficina-hidden');
    if (tipo && hidden) hidden.value = tipo;
  }

  _shakeCard(card) {
    card.style.animation = 'none';
    card.offsetHeight; // reflow
    card.style.animation = 'shake .35s ease';
  }
}

// Animação de shake (injetada uma vez)
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-6px)}
    40%{transform:translateX(6px)}
    60%{transform:translateX(-4px)}
    80%{transform:translateX(4px)}
  }
`;
document.head.appendChild(shakeStyle);
