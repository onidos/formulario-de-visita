document.addEventListener('DOMContentLoaded', () => {
    // Seletores de elementos
    const form = document.getElementById('agendamento-form');
    const cards = document.querySelectorAll('.card');
    const progressDots = document.querySelectorAll('.progress-dot');
    const prevButtons = document.querySelectorAll('.prev-btn');
    const nextButtons = document.querySelectorAll('.next-btn');
    const simNaoButtons = document.querySelectorAll('.sim-nao-btn');
    const submitButton = document.querySelector('.submit-btn');
    const homeButton = document.getElementById('home-btn'); // Seletor do botão de início

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

    const tipoOficinaSalvo = localStorage.getItem('tipo_oficina');
    const tipoOficinaHiddenInput = document.getElementById('tipo-oficina-hidden');

    if (tipoOficinaSalvo && tipoOficinaHiddenInput) {
        tipoOficinaHiddenInput.value = tipoOficinaSalvo;
        console.log('Tipo de Oficina carregado:', tipoOficinaHiddenInput.value);
    }

    // Função para mostrar um card específico e atualizar os pontos de progresso
    const showCard = (cardId) => {
        const targetCard = document.getElementById(`card-${cardId}`);
        if (!targetCard) {
            return;
        }
        cards.forEach(card => card.style.display = 'none');
        targetCard.style.display = 'block';
        currentCardIndex = Array.from(cards).indexOf(targetCard);

        switch (cardId) {
            case 1:
                document.getElementById('nome').focus();
                break;
            case 2:
                document.getElementById('loja').focus();
                break;
            case 3:
                document.getElementById('endereco').focus();
                break;
            default:
                const firstInput = targetCard.querySelector('input, select');
                if (firstInput) {
                    firstInput.focus();
                }
                break;
        }
    };

    // Função para validar campos obrigatórios
    const validateCard = (card) => {
        const inputs = card.querySelectorAll('[required]');
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
        return isValid;
    };

    // Inicializa a exibição do primeiro card
    const firstCardOnPage = document.querySelector('.card');
    if (firstCardOnPage) {
        const firstCardId = firstCardOnPage.id.replace('card-', '');
        showCard(firstCardId);
    } else {
        console.error("Nenhum card encontrado na página. Verifique o HTML.");
    }

    // Preenche a data e hora atuais
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

    // Eventos dos botões "Próximo"
    nextButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentCard = cards[currentCardIndex];
            const nextCardId = button.dataset.card;

            if (!validateCard(currentCard)) {
                alert('Por favor, preencha todos os campos obrigatórios.');
                return;
            }

            showCard(nextCardId);
        });
    });

    // Eventos dos botões "Anterior"
    prevButtons.forEach(button => {
        button.addEventListener('click', () => {
            const prevCardId = button.dataset.card;
            showCard(prevCardId);
        });
    });

    // Eventos dos botões "Sim" e "Não"
    simNaoButtons.forEach(button => {
        button.addEventListener('click', function() {
            const resposta = this.getAttribute('data-value');
            const proximoCardId = this.getAttribute('data-next');
            const currentCard = this.closest('.card');
            const currentCardId = currentCard.id.replace('card-', '');
            const comentarioInput = currentCard.querySelector('textarea');
            const hiddenInput = currentCard.querySelector('input[type="hidden"]');
            let isValid = true;

            const cardsComComentarioObrigatorioNao = ['4', '5', '6', '7-alt'];

            // Lógica de validação: comentário é obrigatório APENAS se a resposta for 'Não'
            if (cardsComComentarioObrigatorioNao.includes(currentCardId) && resposta === 'Nao') {
                if (comentarioInput && !comentarioInput.value.trim()) {
                    alert('Por favor, preencha o campo de comentário para continuar, pois sua resposta foi "Não".');
                    comentarioInput.style.border = '1px solid red';
                    isValid = false;
                } else if (comentarioInput) {
                    comentarioInput.style.border = '';
                }
            }
            
            // --- NOVO CÓDIGO: Validação específica para o card 14-alt ---
            if (currentCardId === '14-alt' && resposta === 'Sim') {
                const quantidadeInput = currentCard.querySelector('#necessidade-aumento-fornecedores');
                if (quantidadeInput && !quantidadeInput.value.trim()) {
                    alert('Por favor, preencha o campo "Número de Fornecedores" para continuar.');
                    quantidadeInput.style.border = '1px solid red';
                    isValid = false;
                } else if (quantidadeInput) {
                    quantidadeInput.style.border = '';
                }
            }
            
            // Atualiza o valor do campo hidden com a resposta (Sim ou Nao)
            if (hiddenInput) {
                hiddenInput.value = resposta;
            }

            if (isValid) {
                // Se o card tem um campo de comentário, salva o valor antes de avançar
                if (comentarioInput) {
                    const comentarioHiddenInput = document.createElement('input');
                    comentarioHiddenInput.type = 'hidden';
                    comentarioHiddenInput.name = comentarioInput.name;
                    comentarioHiddenInput.value = comentarioInput.value;
                    form.appendChild(comentarioHiddenInput);
                }
                
                showCard(proximoCardId);
            }
        });
    });

    document.addEventListener('keydown', (e) => {
    // Verifica se a tecla pressionada é a tecla Enter (código 13)
    if (e.key === 'Enter' || e.keyCode === 13) {
            // Encontra o card visível
            const visibleCard = document.querySelector('.card[style*="display: block"]');
            if (visibleCard) {
                // Encontra o botão 'Próximo' dentro do card visível
                const nextButton = visibleCard.querySelector('.next-btn');
                // Encontra o botão 'Sim' para cards de pergunta
                const simButton = visibleCard.querySelector('.sim-nao-btn[data-value="Sim"]');
                
                // Impede o envio do formulário padrão ao pressionar Enter
                e.preventDefault();

                // Prioriza o botão "Próximo"
                if (nextButton) {
                    nextButton.click();
                } 
                // Se não houver botão "Próximo", tenta o botão "Sim"
                else if (simButton) {
                    simButton.click();
                }
            }
        }
    });

    // Evento do botão de envio do formulário
    if (submitButton) {
        submitButton.addEventListener('click', (event) => {
            event.preventDefault();

            const currentCard = document.querySelector('.card:not([style*="display: none"])');
            if (!validateCard(currentCard)) {
                alert('Por favor, preencha todos os campos obrigatórios.');
                return;
            }

            const formData = new FormData(form);
            const formUrl = form.action;

            fetch(formUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: formData
            })
            .then(() => {
                window.location.href = 'sucesso.html';
            })
            .catch(error => {
                console.error('Erro ao enviar o formulário:', error);
                alert('Ocorreu um erro ao enviar o formulário. Por favor, tente novamente.');
            });
        });
    }
    
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

    let autocompleteTimeout = null;
    if (enderecoInput) {
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

    // Lógica do botão de "Início" que redireciona para a página principal
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            window.location.href = 'index_visita_oficina.html';
        });
    }


    // Evento de clique para o botão de envio
    if (submitButton) {
        submitButton.addEventListener('click', (event) => {
            event.preventDefault(); // Impede o envio padrão do formulário
            const currentCard = cards[currentCardIndex];
            if (validateCard(currentCard)) {
                // Se a validação do último card passar, envia o formulário
                form.submit();
            } else {
                alert('Por favor, preencha todos os campos obrigatórios no último card.');
            }
        });
    }

});