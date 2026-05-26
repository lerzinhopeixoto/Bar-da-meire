// ── Configuração Supabase ──────────────────────────────────────────────────
const SUPABASE_URL = "https://cepuonzbidiivvliemvy.supabase.co";
const SUPABASE_KEY = "sb_publishable_AkeZSzcHWkfzYNR6qkfwGg_EmcKwCR8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Localização do Bar da Meire ────────────────────────────────────────────
const BAR_LAT = -23.6178;
const BAR_LNG = -46.7401;

// ── Faixas de entrega ──────────────────────────────────────────────────────
const FAIXAS_ENTREGA = [
  { min: 0, max: 3, taxa: 5.00, label: 'até 3km — R$ 5,00' },
  { min: 3, max: 6, taxa: 8.00, label: '3 a 6km — R$ 8,00' },
  { min: 6, max: 10, taxa: 12.00, label: '6 a 10km — R$ 12,00' }
];

const FORA_DA_AREA = 10;

// ── Estado Global ──────────────────────────────────────────────────────────
let cart = [];
let orderDone = false;
let pedidoMode = 'mesa';
let taxaEntrega = 0;
let distanciaKm = null;

// ── Navegação ──────────────────────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('tab-' + tab).classList.add('active');

  ['cardapio', 'semana', 'pedido'].forEach((t, i) => {
    if (t === tab) {
      document.querySelectorAll('.nav-btn')[i].classList.add('active');
    }
  });

  if (tab === 'pedido') renderPedido();
}

function showDay(day, btn) {
  document.querySelectorAll('.day-content').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.day-tab').forEach(b => b.classList.remove('active'));

  document.getElementById('day-' + day).classList.add('active');
  btn.classList.add('active');
}

// ── Carrinho ───────────────────────────────────────────────────────────────
function addItem(btn) {
  const card = btn.closest('.menu-card');

  const name = card.dataset.name;
  const price = parseFloat(card.dataset.price);
  const desc = card.dataset.desc;

  const existing = cart.find(i => i.name === name);

  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      name,
      price,
      desc,
      qty: 1
    });
  }

  updateBadge();

  btn.textContent = '✓ Adicionado';
  btn.classList.add('added');

  setTimeout(() => {
    btn.textContent = '+ Adicionar';
    btn.classList.remove('added');
  }, 1500);
}

function updateBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);

  const b = document.getElementById('cbadge');

  b.textContent = total;

  if (total > 0) {
    b.classList.add('show');
  } else {
    b.classList.remove('show');
  }
}

function changeQty(name, delta) {
  const item = cart.find(i => i.name === name);

  if (!item) return;

  item.qty += delta;

  if (item.qty <= 0) {
    cart = cart.filter(i => i.name !== name);
  }

  updateBadge();
  renderPedido();
}

function setMode(mode) {
  pedidoMode = mode;
  taxaEntrega = 0;
  distanciaKm = null;

  renderPedido();
}

// ── Distância (Haversine) ──────────────────────────────────────────────────
function calcularDistancia(lat1, lng1, lat2, lng2) {
  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ── Taxa por KM ────────────────────────────────────────────────────────────
function getTaxaPorKm(km) {
  const faixa = FAIXAS_ENTREGA.find(f =>
    km >= f.min && km <= f.max
  );

  return faixa ? faixa.taxa : null;
}

// ── Busca CEP ──────────────────────────────────────────────────────────────
async function buscarCEP() {
  const cepInput = document.getElementById('f-cep');
  const statusEl = document.getElementById('frete-status');

  const cep = cepInput.value.replace(/\D/g, '');

  if (cep.length !== 8) {
    statusEl.innerHTML =
      '<span style="color:#e74c3c">⚠️ CEP inválido.</span>';
    return;
  }

  statusEl.innerHTML =
    '<span style="color:#888">🔍 Calculando frete...</span>';

  taxaEntrega = 0;
  distanciaKm = null;

  try {

    // ── ViaCEP ─────────────────────────────────────
    const viaCep = await fetch(
      `https://viacep.com.br/ws/${cep}/json/`
    );

    const dados = await viaCep.json();

    if (dados.erro) {
      throw new Error('CEP não encontrado');
    }

    const enderecoCompleto = `
      ${dados.logradouro},
      ${dados.bairro},
      ${dados.localidade},
      ${dados.uf},
      Brasil
    `;

    // ── OpenStreetMap ──────────────────────────────
    const geo = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(enderecoCompleto)}&limit=1`
    );

    const geoData = await geo.json();

    if (!geoData.length) {
      throw new Error('Endereço não encontrado');
    }

    const lat = parseFloat(geoData[0].lat);
    const lng = parseFloat(geoData[0].lon);

    const km = calcularDistancia(
      BAR_LAT,
      BAR_LNG,
      lat,
      lng
    );

    distanciaKm = km;

    const taxa = getTaxaPorKm(km);

    console.log({
      enderecoCompleto,
      km,
      taxa,
      geoData
    });

    if (taxa === null) {

      statusEl.innerHTML = `
        <span style="color:#e74c3c">
          😕 Fora da área de entrega.
          (${km.toFixed(1)}km)
        </span>
      `;

      taxaEntrega = 0;

    } else {

      taxaEntrega = taxa;

      const faixa = FAIXAS_ENTREGA.find(f =>
        km >= f.min && km <= f.max
      );

      statusEl.innerHTML = `
        <span style="color:#27ae60">
          ✅ ${km.toFixed(1)}km de distância —
          Taxa:
          <strong>
            R$ ${taxa.toFixed(2).replace('.', ',')}
          </strong>
          (${faixa.label})
        </span>
      `;
    }

    atualizarTotal();

  } catch (err) {

    console.error(err);

    statusEl.innerHTML = `
      <span style="color:#e74c3c">
        ⚠️ ${err.message || 'Erro ao calcular frete'}
      </span>
    `;
  }
}

// ── Atualiza total ─────────────────────────────────────────────────────────
function atualizarTotal() {
  const subtotal = cart.reduce(
    (s, i) => s + i.price * i.qty,
    0
  );

  const total = subtotal + taxaEntrega;

  const el = document.getElementById('total-valor');
  const lb = document.getElementById('total-label');

  if (el) {
    el.textContent =
      `R$ ${total.toFixed(2).replace('.', ',')}`;
  }

  if (lb) {
    lb.textContent =
      taxaEntrega > 0
        ? `Total + entrega (R$ ${taxaEntrega.toFixed(2).replace('.', ',')})`
        : 'Total';
  }
}

// ── WhatsApp ───────────────────────────────────────────────────────────────
function buildWhatsAppMsg(fields) {

  const items = cart.map(i =>
    `• ${i.name} x${i.qty} — R$ ${(i.price * i.qty)
      .toFixed(2)
      .replace('.', ',')}`
  ).join('\n');

  const subtotal = cart.reduce(
    (s, i) => s + i.price * i.qty,
    0
  );

  const total = subtotal + taxaEntrega;

  let msg = `🍽️ *Pedido — Bar da Meire*\n\n`;

  if (pedidoMode === 'mesa') {

    msg += `📍 *Mesa:* ${fields.mesa}\n\n`;

  } else {

    msg += `
🛵 *Delivery*
👤 Nome: ${fields.nome}
📍 Endereço: ${fields.end}
📮 CEP: ${fields.cep}
📱 WhatsApp: ${fields.tel}
`;

    if (distanciaKm) {
      msg += `📏 Distância: ${distanciaKm.toFixed(1)}km\n`;
    }

    msg += '\n';
  }

  msg += `*Itens:*\n${items}\n\n`;

  if (taxaEntrega > 0) {
    msg += `Taxa de entrega: R$ ${taxaEntrega.toFixed(2).replace('.', ',')}\n`;
  }

  msg += `*Total: R$ ${total.toFixed(2).replace('.', ',')}*`;

  if (fields.obs) {
    msg += `\n\n📝 Obs: ${fields.obs}`;
  }

  return encodeURIComponent(msg);
}

// ── Confirmar Pedido ───────────────────────────────────────────────────────
async function confirmarPedido() {

  let fields = {
    obs: document.getElementById('f-obs')?.value.trim() || ''
  };

  if (pedidoMode === 'mesa') {

    fields.mesa =
      document.getElementById('f-mesa')?.value.trim();

    if (!fields.mesa) {
      alert('Informe o número da mesa!');
      return;
    }

  } else {

    fields.nome =
      document.getElementById('f-nome')?.value.trim();

    fields.end =
      document.getElementById('f-end')?.value.trim();

    fields.cep =
      document.getElementById('f-cep')?.value.trim();

    fields.tel =
      document.getElementById('f-tel')?.value.trim();

    if (
      !fields.nome ||
      !fields.end ||
      !fields.cep ||
      !fields.tel
    ) {
      alert('Preencha todos os campos!');
      return;
    }

    // ── CORREÇÃO PRINCIPAL ─────────────────────
    if (distanciaKm === null) {
      alert('Digite um CEP válido!');
      return;
    }

    if (getTaxaPorKm(distanciaKm) === null) {
      alert('Fora da área de entrega.');
      return;
    }
  }

  const subtotal = cart.reduce(
    (s, i) => s + i.price * i.qty,
    0
  );

  const total = subtotal + taxaEntrega;

  const pedido = {
    tipo: pedidoMode,
    itens: JSON.stringify(cart),
    total,
    observacoes: fields.obs || '',
    mesa: fields.mesa || '',
    nome: fields.nome || '',
    endereco: fields.end || '',
    cep: fields.cep || '',
    whatsapp: fields.tel || '',
    taxa_entrega: taxaEntrega,
    distancia_km: distanciaKm
      ? parseFloat(distanciaKm.toFixed(2))
      : 0
  };

  try {

    await supabaseClient
      .from('pedidos')
      .insert([pedido]);

  } catch (err) {

    console.error(err);

    alert('Erro ao salvar pedido.');
    return;
  }

  const msg = buildWhatsAppMsg(fields);

  window.open(
    'https://wa.me/5511966062666?text=' + msg,
    '_blank'
  );

  orderDone = true;
  taxaEntrega = 0;
  distanciaKm = null;
  cart = [];

  updateBadge();
  renderPedido();
}

// ── Reset ──────────────────────────────────────────────────────────────────
function resetPedido() {
  orderDone = false;
  taxaEntrega = 0;
  distanciaKm = null;

  renderPedido();
}

// ── Init ───────────────────────────────────────────────────────────────────
renderPedido();

// ── Máscara + cálculo automático do CEP ─────────────────────────
let cepTimeout;

function handleCEPInput(input) {

  input.value = input.value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .substring(0, 9);

  clearTimeout(cepTimeout);

  const cep = input.value.replace(/\D/g, '');

  if (cep.length === 8) {

    document.getElementById('frete-status').innerHTML =
      '<span style="color:#888">🔍 Calculando frete...</span>';

    cepTimeout = setTimeout(() => {
      buscarCEP();
    }, 500);

  }
}