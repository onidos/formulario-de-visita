document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.card');
    const progressDots = document.querySelectorAll('.progress-dot');
    const prevButtons = document.querySelectorAll('.prev-btn');
    const nextButtons = document.querySelectorAll('.next-btn');
    const form = document.getElementById('agendamento-form');

    let tipoOficinaSelecionado = '';

    // Adicione um evento para o select do tipo de oficina para capturar o valor
    const tipoOficinaSelect = document.getElementById('tipo-oficina');
    if (tipoOficinaSelect) {
        tipoOficinaSelect.addEventListener('change', (event) => {
            tipoOficinaSelecionado = event.target.value;
        });
    }

    // Elementos da geolocalização e autocompletar
    const getLocationButton = document.getElementById('get-location');
    const enderecoInput = document.getElementById('endereco');
    const latitudeInput = document.getElementById('latitude');
    const longitudeInput = document.getElementById('longitude');
    const autocompleteList = document.createElement('ul');
    autocompleteList.id = 'autocomplete-list';
    if (enderecoInput) {
        enderecoInput.parentNode.appendChild(autocompleteList);
    }

    // Elementos de data e horário
    const dataInput = document.getElementById('data-visita');
    const horarioInput = document.getElementById('horario-visita');

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

        // Atualiza a barra de progresso
        progressDots.forEach((dot, i) => {
            if (i === newIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
        currentCardIndex = newIndex;
    };

    const firstCardOnPage = document.querySelector('.card');
    if (firstCardOnPage) {
        const firstCardId = firstCardOnPage.id.replace('card-', '');
        showCard(firstCardId);
    } else {
        console.error("Nenhum card encontrado na página. Verifique o HTML.");
    }
    

    // Lógica: Puxar a data atual
    if (dataInput) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        dataInput.value = `${year}-${month}-${day}`;
    }

    // Lógica: Puxar a hora atual
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
            const currentCardId = currentCard.id.replace('card-', '');
            
            // Lógica de validação da soma para os cards de 9 a 12
            if (currentCardId === '12') {
                const veiculosTotalInput = document.getElementById('veiculos-total');
                const veiculosPendentesInput = document.getElementById('veiculos-pendentes');
                const veiculosAprovadosInput = document.getElementById('veiculos-aprovados');
                const veiculosAguardandoInput = document.getElementById('veiculos-aguardando');

                if (!veiculosTotalInput.value || !veiculosPendentesInput.value || !veiculosAprovadosInput.value || !veiculosAguardandoInput.value) {
                    alert('Por favor, preencha todos os campos obrigatórios antes de continuar.');
                    if (!veiculosTotalInput.value) veiculosTotalInput.style.border = '1px solid red';
                    if (!veiculosPendentesInput.value) veiculosPendentesInput.style.border = '1px solid red';
                    if (!veiculosAprovadosInput.value) veiculosAprovadosInput.style.border = '1px solid red';
                    if (!veiculosAguardandoInput.value) veiculosAguardandoInput.style.border = '1px solid red';
                    return;
                }
                
                const total = parseInt(veiculosTotalInput.value);
                const pendentes = parseInt(veiculosPendentesInput.value);
                const aprovados = parseInt(veiculosAprovadosInput.value);
                const aguardando = parseInt(veiculosAguardandoInput.value);
                
                const soma = pendentes + aprovados + aguardando;
                
                if (soma !== total) {
                    alert(`A soma dos veículos (${soma}) não corresponde ao total de veículos em manutenção (${total}). Por favor, corrija os valores.`);
                    veiculosTotalInput.style.border = '1px solid red';
                    veiculosPendentesInput.style.border = '1px solid red';
                    veiculosAprovadosInput.style.border = '1px solid red';
                    veiculosAguardandoInput.style.border = '1px solid red';
                    return;
                } else {
                    veiculosTotalInput.style.border = '';
                    veiculosPendentesInput.style.border = '';
                    veiculosAprovadosInput.style.border = '';
                    veiculosAguardandoInput.style.border = '';
                }
            }

            // NOVA LÓGICA: VALIDAÇÃO E ENVIO DO FORMULÁRIO DO CARD-13
            if (currentCardId === '13') {
                const veiculosTotalInput = document.getElementById('veiculos-total');
                const veiculosEntreguesInput = document.getElementById('veiculos-entregues');
            
                if (!veiculosTotalInput || !veiculosEntreguesInput || veiculosTotalInput.value === '' || veiculosEntreguesInput.value === '') {
                    alert('Por favor, preencha todos os campos obrigatórios.');
                    if (veiculosEntreguesInput) veiculosEntreguesInput.style.border = '1px solid red';
                    return;
                }
                
                const total = parseInt(veiculosTotalInput.value);
                const entregues = parseInt(veiculosEntreguesInput.value);
                
                if (entregues > total) {
                    alert(`O número de veículos a serem entregues (${entregues}) não pode ser maior que o total de veículos em manutenção (${total}).`);
                    veiculosEntreguesInput.style.border = '1px solid red';
                    return;
                } else {
                    veiculosEntreguesInput.style.border = '';
                }

                // Se a validação do CARD-13 passar, enviamos o formulário
                const formData = new FormData(form);
                const formUrl = form.action;

                fetch(formUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    body: formData
                })
                .then(response => {
                    // Se o envio for bem-sucedido, mostra a tela de sucesso (card-14)
                    showCard(14);
                })
                .catch(error => {
                    console.error('Erro ao enviar o formulário:', error);
                    alert('Ocorreu um erro ao enviar o formulário. Por favor, tente novamente.');
                });
                
                return; // Impede que o restante do código seja executado
            }
            
            // Lógica de validação geral para campos 'required'
            const inputs = currentCard.querySelectorAll('[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                let hasValue = true;
                
                if (input.tagName === 'SELECT' && input.multiple) {
                    const selectedValidOptions = Array.from(input.options).filter(option => option.selected && option.value !== '');
                    
                    if (selectedValidOptions.length === 0) {
                        hasValue = false;
                    }
                } else if (!input.value) {
                    hasValue = false;
                }

                if (!hasValue) {
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
    // Lógica para os botões "Sim" e "Não"
const simNaoButtons = document.querySelectorAll('.sim-nao-btn');
if (simNaoButtons.length > 0) {
    simNaoButtons.forEach(button => {
        button.addEventListener('click', function() {
            const resposta = this.getAttribute('data-value');
            const proximoCardId = this.getAttribute('data-next');
            
            const currentCard = this.closest('.card');
            const currentCardId = currentCard.id.replace('card-', '');
            
            const comentarioInput = currentCard.querySelector('textarea');
            const hiddenInput = currentCard.querySelector('input[type="hidden"]');
            
            // Válida o comentário para os CARDS 4, 5, 6 e 8, se a resposta for 'Nao'
            if ((currentCardId === '4' || currentCardId === '5' || currentCardId === '6' || currentCardId === '8') && resposta === 'Nao') {
                if (comentarioInput && !comentarioInput.value.trim()) {
                    alert('Por favor, preencha o campo de comentário para continuar, pois sua resposta foi "Não".');
                    comentarioInput.style.border = '1px solid red';
                    return;
                } else if (comentarioInput) {
                    comentarioInput.style.border = '';
                }
            } else if ((currentCardId === '4' || currentCardId === '5' || currentCardId === '6' || currentCardId === '8') && resposta === 'Sim') {
                // Se a resposta for "Sim", limpa o campo de comentário e remove a borda vermelha
                if (comentarioInput) {
                    comentarioInput.value = '';
                    comentarioInput.style.border = '';
                }
            }

            if (hiddenInput) {
                hiddenInput.value = resposta;
            }

            // Lógica de redirecionamento, se aplicável
            if (currentCardId === '6') {
                if (tipoOficinaSelecionado === 'Externa') {
                    window.location.href = 'oficina_externa.html';
                } else if (tipoOficinaSelecionado === 'Interna' || tipoOficinaSelecionado === 'Movel') {
                    window.location.href = 'oficina_interna_movel.html';
                } else {
                    showCard(proximoCardId);
                }
            } else {
                showCard(proximoCardId);
            }
        });
    });
}

    // LÓGICA PARA O BOTÃO DE GEOLOCALIZAÇÃO
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
                                    alert('Localização obtida, mas o endereço completo não foi encontrado.');
                                }
                            })
                            .catch(error => {
                                console.error('Erro na API de geocodificação reversa:', error);
                                enderecoInput.value = 'Erro ao buscar o endereço';
                                alert('Não foi possível obter o endereço. Por favor, digite manualmente.');
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

    // Lógica de Autocompletar
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
                    .then(data => {
                        displayAutocompleteSuggestions(data);
                    })
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

    // LÓGICA DE ENVIO DO FORMULÁRIO
    // Esta função foi movida e adaptada para ser chamada
    // especificamente a partir do clique do botão do card-13.
    // Ela não é mais acionada automaticamente pelo submit do formulário.

    const homeButton = document.querySelector('.home-btn');
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            window.location.reload(); 
        });
    }
});