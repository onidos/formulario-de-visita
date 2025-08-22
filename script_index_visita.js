document.addEventListener('DOMContentLoaded', () => {
    // Seletor para o botão "Iniciar"
    const startButton = document.querySelector('.start-btn');
    // Seletor para o campo de seleção do tipo de oficina
    const tipoOficinaSelect = document.getElementById('tipo-oficina');

    // Adiciona um evento de clique ao botão "Iniciar"
    if (startButton && tipoOficinaSelect) {
        startButton.addEventListener('click', () => {
            const tipoOficinaSelecionado = tipoOficinaSelect.value;

            // Validação para garantir que uma opção foi selecionada
            if (tipoOficinaSelecionado === "") {
                alert("Por favor, selecione um tipo de oficina para iniciar.");
                tipoOficinaSelect.style.border = '1px solid red';
                return;
            } else {
                tipoOficinaSelect.style.border = '';
            }

            // Lógica de redirecionamento com base na opção selecionada
            if (tipoOficinaSelecionado === 'Externa') {
                window.location.href = 'oficina_externa.html';
            } else if (tipoOficinaSelecionado === 'Interna' || tipoOficinaSelecionado === 'Movel') {
                window.location.href = 'oficina_interna_movel.html';
            }
        });
    }
});