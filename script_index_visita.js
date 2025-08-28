document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.querySelector('.start-btn');
    const tipoOficinaSelect = document.getElementById('tipo-oficina');

    if (startButton && tipoOficinaSelect) {
        startButton.addEventListener('click', () => {
            const tipoOficinaSelecionado = tipoOficinaSelect.value;

            if (tipoOficinaSelecionado === "") {
                alert("Por favor, selecione um tipo de oficina para iniciar.");
                tipoOficinaSelect.style.border = '1px solid red';
                return;
            } else {
                tipoOficinaSelect.style.border = '';
            }

            // Salva a opção selecionada no localStorage
            localStorage.setItem('tipo_oficina', tipoOficinaSelecionado);

            if (tipoOficinaSelecionado === 'Externa') {
                window.location.href = 'oficina_externa.html';
            } else if (tipoOficinaSelecionado === 'Interna' || tipoOficinaSelecionado === 'Movel') {
                window.location.href = 'oficina_interna_movel.html';
            }
        });
    }
});