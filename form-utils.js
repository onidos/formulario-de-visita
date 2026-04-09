/**
 * form-utils.js — Utilitários compartilhados entre todos os formulários
 */

// ── Geolocalização + Geocoding reverso ──────────────────────────────────────

async function obterLocalizacao({ enderecoInput, latitudeInput, longitudeInput, cidadeInput }) {
  if (!navigator.geolocation) {
    alert('A geolocalização não é suportada neste navegador.');
    return;
  }
  enderecoInput.value = 'Obtendo localização…';
  enderecoInput.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      latitudeInput.value = coords.latitude;
      longitudeInput.value = coords.longitude;
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1&zoom=18`;
        const data = await fetchJSON(url);
        enderecoInput.value = data.display_name ?? 'Endereço não encontrado';
        if (cidadeInput) cidadeInput.value = extrairCidade(data.address);
        alert('Localização obtida com sucesso!');
      } catch {
        enderecoInput.value = 'Erro ao buscar endereço';
      } finally {
        enderecoInput.disabled = false;
      }
    },
    (err) => {
      enderecoInput.value = '';
      enderecoInput.disabled = false;
      console.error(err);
      alert('Não foi possível obter sua localização. Por favor, digite o endereço manualmente.');
    }
  );
}

function inicializarAutocomplete({ enderecoInput, latitudeInput, longitudeInput, cidadeInput }) {
  const list = document.createElement('ul');
  list.id = 'autocomplete-list';
  enderecoInput.parentNode.appendChild(list);

  let timer = null;
  enderecoInput.addEventListener('input', () => {
    clearTimeout(timer);
    const q = enderecoInput.value.trim();
    if (q.length < 3) { list.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=br`;
        const results = await fetchJSON(url);
        list.innerHTML = '';
        results.forEach(p => {
          const li = document.createElement('li');
          li.textContent = p.display_name;
          li.addEventListener('click', () => {
            enderecoInput.value = p.display_name;
            latitudeInput.value = p.lat;
            longitudeInput.value = p.lon;
            if (cidadeInput) cidadeInput.value = extrairCidade(p.address);
            list.innerHTML = '';
          });
          list.appendChild(li);
        });
      } catch (e) { console.error('Autocomplete error:', e); }
    }, 500);
  });

  document.addEventListener('click', (e) => {
    if (!enderecoInput.contains(e.target)) list.innerHTML = '';
  });
}

// ── Data / Hora ─────────────────────────────────────────────────────────────

function preencherDataHora(dataInput, horarioInput) {
  const now = new Date();
  if (dataInput) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    dataInput.value = `${y}-${m}-${d}`;
  }
  if (horarioInput) {
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    horarioInput.value = `${h}:${min}`;
  }
}

// ── Validação ────────────────────────────────────────────────────────────────

function validarCard(card) {
  let valido = true;
  card.querySelectorAll('[required]').forEach(input => {
    if (input.disabled) return;
    const ok = input.tagName === 'SELECT'
      ? Array.from(input.options).some(o => o.selected && o.value !== '')
      : input.value.trim() !== '';
    input.classList.toggle('error', !ok);
    if (!ok) valido = false;
  });
  return valido;
}

// ── Envio de formulário ──────────────────────────────────────────────────────

/**
 * Envia via form.submit() nativo usando iframe oculto como target.
 * Lê a resposta JSON do GAS e passa o resultado para sucesso.html via localStorage.
 */
function enviarFormulario(form, btn) {
  btn.classList.add('loading');
  btn.disabled = true;

  const iframeName = 'submit-target-' + Date.now();
  const iframe = document.createElement('iframe');
  iframe.name = iframeName;
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  // Timeout de segurança: se o GAS não responder em 20s, vai para sucesso com status desconhecido
  const fallbackTimer = setTimeout(() => {
    localStorage.setItem('submit_result', JSON.stringify({
      planilha: 'desconhecido',
      email:    'desconhecido',
    }));
    window.location.href = 'sucesso.html';
  }, 20000);

  // Quando o GAS responder, lê o JSON e redireciona
  iframe.addEventListener('load', () => {
    clearTimeout(fallbackTimer);
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const texto = iframeDoc.body ? iframeDoc.body.innerText.trim() : '';
      const json  = JSON.parse(texto);

      localStorage.setItem('submit_result', JSON.stringify({
        planilha: json.planilha || (json.status === 'ok' ? 'ok' : 'erro'),
        email:    json.email    || (json.status === 'ok' ? 'ok' : 'desconhecido'),
        erro:     json.erro     || json.message || '',
      }));
    } catch (_) {
      // Se não conseguir ler o iframe (CORS do GAS), assume sucesso
      // pois o GAS roda em domínio diferente e pode bloquear a leitura
      localStorage.setItem('submit_result', JSON.stringify({
        planilha: 'ok',
        email:    'desconhecido',
      }));
    }
    window.location.href = 'sucesso.html';
  });

  form.target = iframeName;
  form.submit();
}

// ── Helpers internos ─────────────────────────────────────────────────────────

function extrairCidade(address = {}) {
  return address.city || address.town || address.village || '';
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
