document.addEventListener('DOMContentLoaded', () => {
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
    const homeButton = document.getElementById('home-btn');
    const submitButton = document.querySelector('.submit-btn');


    let currentCardIndex = 0;

   
    // Encontra o input hidden no formulário desta página
   const tipoOficinaSalvo = localStorage.getItem('tipo_oficina');
    const tipoOficinaHiddenInput = document.getElementById('tipo-oficina-hidden');

    if (tipoOficinaSalvo && tipoOficinaHiddenInput) {
        tipoOficinaHiddenInput.value = tipoOficinaSalvo;
        console.log('Tipo de Oficina carregado:', tipoOficinaHiddenInput.value);
    }

    // Recupera a cidade do localStorage
    const cidadeSalva = localStorage.getItem('cidade');
    const cidadeInput = document.getElementById('cidade-input');
    
    if (cidadeSalva && cidadeInput) {
        cidadeInput.value = cidadeSalva;
        console.log('Cidade carregada:', cidadeInput.value);
    }



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


    const validateCard = (card) => {
        const inputs = card.querySelectorAll('[required]');
        let isValid = true;
        inputs.forEach(input => {
            if (input.tagName === 'SELECT') {
                const selectedOptions = Array.from(input.options).filter(option => option.selected && option.value !== "");
                if (selectedOptions.length === 0) {
                    isValid = false;
                    input.style.border = '1px solid red';
                } else {
                    input.style.border = '';
                }
            } else {
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

    showCard(1);

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

    nextButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentCard = cards[currentCardIndex];
            const currentCardId = currentCard.id.replace('card-', '');
            const nextCardId = button.dataset.card;

            if (!validateCard(currentCard)) {
                alert('Por favor, preencha todos os campos obrigatórios.');
                return;
            }

            if (currentCardId === '15') {
                const veiculosTotalInput = document.getElementById('veiculos-total');
                const veiculosorcamentoInput = document.getElementById('veiculos-orcamento');
                const veiculosPendentesInput = document.getElementById('veiculos-pendentes');
                const veiculosAprovadosInput = document.getElementById('veiculos-aprovados');
                const veiculosAguardandoInput = document.getElementById('veiculos-aguardando');
                const veiculosFSInput = document.getElementById('veiculos-FS');

                const total = parseInt(veiculosTotalInput.value);
                const orcamento = parseInt(veiculosorcamentoInput.value);
                const pendentes = parseInt(veiculosPendentesInput.value);
                const aprovados = parseInt(veiculosAprovadosInput.value);
                const aguardando = parseInt(veiculosAguardandoInput.value);
                const FS = parseInt(veiculosFSInput.value);

                const soma = orcamento + pendentes + aprovados + aguardando + FS;

                if (soma !== total) {
                    alert(`A soma dos veículos (${soma}) não corresponde ao total de veículos em manutenção (${total}). Por favor, corrija os valores.`);
                    veiculosTotalInput.style.border = '1px solid red';
                    veiculosorcamentoInput.style.border = '1px solid red';
                    veiculosPendentesInput.style.border = '1px solid red';
                    veiculosAprovadosInput.style.border = '1px solid red';
                    veiculosAguardandoInput.style.border = '1px solid red';
                    veiculosFSInput.style.border = '1px solid red';
                    return;
                } else {
                    veiculosTotalInput.style.border = '';
                    veiculosorcamentoInput.style.border = '';
                    veiculosPendentesInput.style.border = '';
                    veiculosAprovadosInput.style.border = '';
                    veiculosAguardandoInput.style.border = '';
                    veiculosFSInput.style.border = '';
                }
            }

            if (currentCardId === '16') {
                const veiculosTotalInput = document.getElementById('veiculos-total');
                const veiculosEntreguesInput = document.getElementById('veiculos-entregues');
                const total = parseInt(veiculosTotalInput.value);
                const entregues = parseInt(veiculosEntreguesInput.value);
                if (entregues > total) {
                    alert(`O número de veículos a serem entregues (${entregues}) não pode ser maior que o total de veículos em manutenção (${total}).`);
                    veiculosEntreguesInput.style.border = '1px solid red';
                    return;
                } else {
                    veiculosEntreguesInput.style.border = '';
                }
            }


            showCard(nextCardId);
        });
    });

    prevButtons.forEach(button => {
        button.addEventListener('click', () => {
            const prevCardId = button.dataset.card;
            showCard(prevCardId);
        });
    });

    simNaoButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentCard = button.closest('.card');
            const currentCardId = currentCard.id.replace('card-', '');
            const resposta = button.dataset.value;
            const nextCardId = button.dataset.next;
            const comentarioInput = currentCard.querySelector('textarea');
            const hiddenInput = currentCard.querySelector('input[type="hidden"]');
            let isValid = true;
            if (currentCardId === '8') {
                if (resposta === 'Sim' && comentarioInput && !comentarioInput.value.trim()) {
                    alert('Por favor, preencha o campo de comentário para continuar, pois sua resposta foi "Sim".');
                    comentarioInput.style.border = '1px solid red';
                    isValid = false;
                } else if (comentarioInput) {
                    comentarioInput.style.border = '';
                }
            }
            const cardsComComentarioObrigatorioNao = ['4', '5', '6', '7'];
            if (comentarioInput && cardsComComentarioObrigatorioNao.includes(currentCardId) && resposta === 'Nao' && !comentarioInput.value.trim()) {
                alert('Por favor, preencha o campo de comentário para continuar, pois sua resposta foi "Não".');
                comentarioInput.style.border = '1px solid red';
                isValid = false;
            } else if (comentarioInput && cardsComComentarioObrigatorioNao.includes(currentCardId)) {
                comentarioInput.style.border = '';
            }

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

            if (isValid) {
                if (hiddenInput) {
                    hiddenInput.value = resposta;
                }
                showCard(nextCardId);
            }
        });
    });

    if (homeButton) {
        homeButton.addEventListener('click', () => {
            window.location.href = 'index_visita_oficina.html';
        });
    }

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



// ... seu código existente ...

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

                                    // --- NOVO CÓDIGO AQUI ---
                                    let cidade = '';
                                    if (data.address.city) {
                                        cidade = data.address.city;
                                    } else if (data.address.town) {
                                        cidade = data.address.town;
                                    } else if (data.address.village) {
                                        cidade = data.address.village;
                                    }
                                    
                                    // Preenche o campo oculto com o valor da cidade
                                    if (cidadeInput) {
                                        cidadeInput.value = cidade;
                                    }
                                    // --- FIM DO NOVO CÓDIGO ---

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

            // --- NOVO CÓDIGO AQUI ---
            let cidade = '';
            if (prediction.address.city) {
                cidade = prediction.address.city;
            } else if (prediction.address.town) {
                cidade = prediction.address.town;
            } else if (prediction.address.village) {
                cidade = prediction.address.village;
            }
            
            // Preenche o campo oculto da cidade
            if (cidadeInput) {
                cidadeInput.value = cidade;
            }
            // --- FIM DO NOVO CÓDIGO ---
        });
        autocompleteList.appendChild(li);
    });
}

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