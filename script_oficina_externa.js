document.addEventListener('DOMContentLoaded', () => {
    // Seletores
    const form = document.getElementById('agendamento-form');
    const cards = document.querySelectorAll('.card');
    const prevButtons = document.querySelectorAll('.prev-btn');
    const nextButtons = document.querySelectorAll('.next-btn');
    const simNaoButtons = document.querySelectorAll('.sim-nao-btn');
    const dataInput = document.getElementById('data-visita');
    const horarioInput = document.getElementById('horario-visita');
    const getLocationButton = document.getElementById('get-location');
    const enderecoInput = document.getElementById('endereco');
    const latitudeInput = document.getElementById('latitude');
    const longitudeInput = document.getElementById('longitude');

    let currentCardIndex = 0;

    // Função para exibir um card específico
    const showCard = (cardId) => {
        const targetCard = document.getElementById(`card-${cardId}`);
        if (!targetCard) return;

        cards.forEach(card => card.style.display = 'none');
        targetCard.style.display = 'block';

        currentCardIndex = Array.from(cards).indexOf(targetCard);
    };

    // Função para validar campos obrigatórios
    const validateCard = (card) => {
        const inputs = card.querySelectorAll('[required]');
        let isValid = true;
        inputs.forEach(input => {
            if (input.tagName === 'SELECT') {
                // Validação para campos <select>
                const selectedOptions = Array.from(input.options).filter(option => option.selected && option.value !== "");
                if (selectedOptions.length === 0) {
                    isValid = false;
                    input.style.border = '1px solid red';
                } else {
                    input.style.border = '';
                }
            } else {
                // Validação para campos de texto, data, etc.
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.border = '1px solid red';
                } else {
                    input.style.border = '';
                }
            }
        });
        return isValid;
    };

    // Inicializa a exibição do primeiro card
    showCard(1);

    // Preenche data e hora atuais
    if (dataInput && horarioInput) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');

        dataInput.value = `${year}-${month}-${day}`;
        horarioInput.value = `${hours}:${minutes}`;
    }

    // Eventos de clique para botões "Próximo"
    nextButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentCard = cards[currentCardIndex];
            const nextCardId = button.dataset.card;

            if (validateCard(currentCard)) {
                showCard(nextCardId);
            } else {
                alert('Por favor, preencha todos os campos obrigatórios.');
            }
        });
    });

    // Eventos de clique para botões "Anterior"
    prevButtons.forEach(button => {
        button.addEventListener('click', () => {
            const prevCardId = button.dataset.card;
            showCard(prevCardId);
        });
    });

    // Eventos de clique para botões "Sim/Não"
    simNaoButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentCard = button.closest('.card');
            const currentCardId = currentCard.id.replace('card-', '');
            const resposta = button.dataset.value;
            const nextCardId = button.dataset.next;
            
            const comentarioInput = currentCard.querySelector('textarea');
            const hiddenInput = currentCard.querySelector('input[type="hidden"]');
            
            let isValid = true;

            // Lógica de validação específica para campos de comentário
            if (comentarioInput) {
                // Validação de comentário obrigatório para "Não" (Cards 4, 5, 6, 7, 8)
                const cardsComComentarioObrigatorioNao = ['4', '5', '6', '7', '8'];
                if (cardsComComentarioObrigatorioNao.includes(currentCardId) && resposta === 'Nao' && !comentarioInput.value.trim()) {
                    alert('Por favor, preencha o campo de comentário para continuar, pois sua resposta foi "Não".');
                    comentarioInput.style.border = '1px solid red';
                    isValid = false;
                } else {
                    comentarioInput.style.border = '';
                }
            }

            // Validação de campo de quantidade para "Sim" (Card 14)
            if (currentCardId === '14' && resposta === 'Sim') {
                const quantidadeInput = currentCard.querySelector('#necessidade-aumento-fornecedores');
                if (quantidadeInput && !quantidadeInput.value.trim()) {
                    alert('Por favor, preencha o campo "Número de Fornecedores" para continuar.');
                    quantidadeInput.style.border = '1px solid red';
                    isValid = false;
                } else if (quantidadeInput) {
                    quantidadeInput.style.border = '';
                }
            }
            
            // Se a validação passou, atualiza o campo oculto e avança
            if (isValid) {
                if (hiddenInput) {
                    hiddenInput.value = resposta;
                }
                showCard(nextCardId);
            }
        });
    });

    // Lógica de geolocalização e autocomplete
    if (getLocationButton) {
        getLocationButton.addEventListener('click', () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        latitudeInput.value = latitude;
                        longitudeInput.value = longitude;
                        enderecoInput.value = 'Buscando endereço...';
                        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&zoom=18`;
                        fetch(nominatimUrl)
                            .then(response => response.json())
                            .then(data => {
                                if (data.display_name) {
                                    enderecoInput.value = data.display_name;
                                    alert('Localização obtida com sucesso!');
                                } else {
                                    enderecoInput.value = 'Endereço não encontrado';
                                }
                            })
                            .catch(error => {
                                console.error('Erro na API de geocodificação:', error);
                                enderecoInput.value = 'Erro ao buscar o endereço';
                            });
                    },
                    (error) => {
                        console.error('Erro ao obter a localização:', error);
                        alert('Não foi possível obter sua localização. Por favor, digite seu endereço manualmente.');
                    }
                );
            } else {
                alert('A geolocalização não é suportada por este navegador.');
            }
        });
    }

    // Lógica de Autocomplete
    let autocompleteTimeout = null;
    const autocompleteList = document.createElement('ul');
    autocompleteList.id = 'autocomplete-list';
    if (enderecoInput) {
        enderecoInput.parentNode.appendChild(autocompleteList);
        enderecoInput.addEventListener('input', () => {
            clearTimeout(autocompleteTimeout);
            const query = enderecoInput.value;
            if (query.length < 3) {
                autocompleteList.innerHTML = '';
                return;
            }
            autocompleteTimeout = setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=br`)
                    .then(response => response.json())
                    .then(data => displayAutocompleteSuggestions(data))
                    .catch(error => console.error('Erro na API de Autocompletar:', error));
            }, 500);
        });
    }

    function displayAutocompleteSuggestions(predictions) {
        autocompleteList.innerHTML = '';
        predictions.forEach(prediction => {
            const li = document.createElement('li');
            li.textContent = prediction.display_name;
            li.addEventListener('click', () => {
                enderecoInput.value = prediction.display_name;
                latitudeInput.value = prediction.lat;
                longitudeInput.value = prediction.lon;
                autocompleteList.innerHTML = '';
            });
            autocompleteList.appendChild(li);
        });
    }
    
    // Evento de submissão do formulário FINAL
    form.addEventListener('submit', (event) => {
        event.preventDefault(); // Impede o envio padrão

        const formUrl = form.action;
        const formData = new FormData(form);

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
});