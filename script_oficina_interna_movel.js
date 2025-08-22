document.addEventListener('DOMContentLoaded', () => {
    // Seletores de elementos específicos para esta página
    const cards = document.querySelectorAll('.card');
    const progressDots = document.querySelectorAll('.progress-dot');
    const prevButtons = document.querySelectorAll('.prev-btn');
    const nextButtons = document.querySelectorAll('.next-btn');
    const simNaoButtons = document.querySelectorAll('.sim-nao-btn');
    const form = document.getElementById('agendamento-form');
    const submitButton = document.querySelector('.submit-btn');

    // Elementos de data, hora e geolocalização
    const dataInput = document.getElementById('data-visita');
    const horarioInput = document.getElementById('horario-visita');
    const getLocationButton = document.getElementById('get-location');
    const enderecoInput = document.getElementById('endereco');
    const latitudeInput = document.getElementById('latitude');
    const longitudeInput = document.getElementById('longitude');
    
    // Autocomplete
    const autocompleteList = document.createElement('ul');
    autocompleteList.id = 'autocomplete-list';
    if (enderecoInput) {
        enderecoInput.parentNode.appendChild(autocompleteList);
    }

    let currentCardIndex = 0;

    // Função para mostrar o cartão atual e esconder os outros
    const showCard = (cardId) => {
        let newIndex = 0;
        cards.forEach((card, i) => {
            if (card.id === `card-${cardId}`) {
                card.style.display = 'block';
                newIndex = i;
            } else {
                card.style.display = 'none';
            }
        });
        
        if (progressDots.length > 0) {
            progressDots.forEach((dot, i) => {
                if (i === newIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }
        currentCardIndex = newIndex;
    };

    // Inicializa a exibição do primeiro card
    const firstCardOnPage = document.querySelector('.card');
    if (firstCardOnPage) {
        const firstCardId = firstCardOnPage.id.replace('card-', '');
        showCard(firstCardId);
    } else {
        console.error("Nenhum card encontrado na página. Verifique o HTML.");
    }

    // Puxa a data e hora atuais
    if (dataInput) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        dataInput.value = `${year}-${month}-${day}`;
    }
    if (horarioInput) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        horarioInput.value = `${hours}:${minutes}`;
    }

    // Eventos dos botões "Próximo"
    nextButtons.forEach(button => {
        button.addEventListener('click', () => {
            const nextCardId = button.dataset.card;
            const currentCard = cards[currentCardIndex];
            
            const inputs = currentCard.querySelectorAll('[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                if (input.tagName === 'SELECT' && input.multiple) {
                    const selectedValidOptions = Array.from(input.options).filter(option => option.selected && option.value !== '');
                    if (selectedValidOptions.length === 0) {
                        isValid = false;
                        input.style.border = '1px solid red';
                    } else {
                        input.style.border = '';
                    }
                } else if (!input.value.trim()) {
                    isValid = false;
                    input.style.border = '1px solid red';
                } else {
                    input.style.border = '';
                }
            });

            if (isValid) {
                showCard(nextCardId);
            } else {
                alert('Por favor, preencha todos os campos obrigatórios.');
            }
        });
    });

    // Eventos dos botões "Anterior"
    prevButtons.forEach(button => {
        button.addEventListener('click', () => {
            const prevCardId = button.dataset.card;
            showCard(prevCardId);
        });
    });

    // Lógica para os botões "Sim" e "Não"
    if (simNaoButtons.length > 0) {
        simNaoButtons.forEach(button => {
            button.addEventListener('click', function() {
                const resposta = this.getAttribute('data-value');
                const proximoCardId = this.getAttribute('data-next');
                
                const currentCard = this.closest('.card');
                const currentCardId = currentCard.id.replace('card-', '');
                
                const comentarioInput = currentCard.querySelector('textarea');
                const hiddenInput = currentCard.querySelector('input[type="hidden"]');
                
                const cardsComComentarioObrigatorioNao = ['4', '5', '6', '7-alt'];
                if (cardsComComentarioObrigatorioNao.includes(currentCardId) && resposta === 'Nao') {
                    if (comentarioInput && !comentarioInput.value.trim()) {
                        alert('Por favor, preencha o campo de comentário para continuar, pois sua resposta foi "Não".');
                        comentarioInput.style.border = '1px solid red';
                        return;
                    } else if (comentarioInput) {
                        comentarioInput.style.border = '';
                    }
                } else if (cardsComComentarioObrigatorioNao.includes(currentCardId) && resposta === 'Sim') {
                    if (comentarioInput) {
                        comentarioInput.value = '';
                        comentarioInput.style.border = '';
                    }
                }
                
                if (hiddenInput) {
                    hiddenInput.value = resposta;
                }
                
                showCard(proximoCardId);
            });
        });
    }

    // Lógica para o botão de envio do formulário
    if (submitButton) {
        submitButton.addEventListener('click', (event) => {
            event.preventDefault(); // Impede o envio padrão do formulário

            const currentCard = document.querySelector('.card:not([style*="display: none"])');
            const inputs = currentCard.querySelectorAll('[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.border = '1px solid red';
                } else {
                    input.style.border = '';
                }
            });

            if (!isValid) {
                alert('Por favor, preencha todos os campos obrigatórios.');
                return;
            }

            // Início da lógica de envio
            const formData = new FormData(form);
            const formUrl = form.action;

            fetch(formUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: formData
            })
            .then(response => {
                window.location.href = 'sucesso.html';
            })
            .catch(error => {
                console.error('Erro ao enviar o formulário:', error);
                alert('Ocorreu um erro ao enviar o formulário. Por favor, tente novamente.');
            });
        });
    }
    
    // Lógica para geolocalização e autocomplete (não está no trecho, mas deve ser mantida)
    if (getLocationButton) {
        // ... (código da geolocalização) ...
    }

    let autocompleteTimeout = null;
    if (enderecoInput) {
        // ... (código do autocomplete) ...
    }
    function displayAutocompleteSuggestions(predictions) {
        // ... (código da função de autocomplete) ...
    }

    // Botão Home
    const homeButton = document.querySelector('.home-btn');
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            window.location.reload(); 
        });
    }
});