// ── Configuração Supabase ─────────────────────────
const SUPABASE_URL = "https://cepuonzbidiivvliemvy.supabase.co";
const SUPABASE_KEY = "SUA_KEY";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Estado Global ─────────────────────────
let carrinho = [];
let pedidoMode = "mesa";
let taxaEntrega = 0;
let distanciaKm = null;
let orderDone = false;

// ── Coordenadas do bar ─────────────────────────
const BAR_LAT = -23.6178;
const BAR_LNG = -46.7401;

// ── Taxas ─────────────────────────
const FAIXAS_ENTREGA = [
  { min: 0, max: 3, taxa: 5 },
  { min: 3, max: 6, taxa: 8 },
  { min: 6, max: 10, taxa: 12 }
];

// ── Navegação ─────────────────────────
function showTab(tab) {
  document.querySelectorAll(".section").forEach(s => {
    s.classList.remove("active");
  });

  document.getElementById("tab-" + tab).classList.add("active");

  if (tab === "pedido") {
    renderPedido();
  }
}

function showDay(day, btn) {
  document.querySelectorAll(".day-content").forEach(d => {
    d.classList.remove("active");
  });

  document.querySelectorAll(".day-tab").forEach(b => {
    b.classList.remove("active");
  });

  document.getElementById("day-" + day).classList.add("active");
  btn.classList.add("active");
}

// ── Carrinho ─────────────────────────
function addItem(btn) {
  const card = btn.closest(".menu-card");

  const name = card.dataset.name;
  const price = parseFloat(card.dataset.price);
  const desc = card.dataset.desc;

  const existing = carrinho.find(i => i.name === name);

  if (existing) {
    existing.qty++;
  } else {
    carrinho.push({
      name,
      price,
      desc,
      qty: 1
    });
  }

  updateBadge();

  btn.textContent = "✓ Adicionado";

  setTimeout(() => {
    btn.textContent = "+ Adicionar";
  }, 1200);
}

function updateBadge() {
  const total = carrinho.reduce((s, i) => s + i.qty, 0);

  document.getElementById("cbadge").textContent = total;
}

function changeQty(name, delta) {
  const item = carrinho.find(i => i.name === name);

  if (!item) return;

  item.qty += delta;

  if (item.qty <= 0) {
    carrinho = carrinho.filter(i => i.name !== name);
  }

  updateBadge();
  renderPedido();
}

function setMode(mode) {
  pedidoMode = mode;
  renderPedido();
}

// ── Distância ─────────────────────────
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getTaxaPorKm(km) {
  const faixa = FAIXAS_ENTREGA.find(f => {
    return km >= f.min && km < f.max;
  });

  return faixa ? faixa.taxa : null;
}

// ── Buscar CEP ─────────────────────────
async function buscarCEP() {

  const cep = document
    .getElementById("f-cep")
    .value.replace(/\D/g, "");

  const status = document.getElementById("frete-status");

  if (cep.length !== 8) {
    return;
  }

  status.innerHTML = "Calculando entrega...";

  try {

    const viaCep = await fetch(
      `https://viacep.com.br/ws/${cep}/json/`
    );

    const dados = await viaCep.json();

    const endereco = `
      ${dados.logradouro},
      ${dados.localidade},
      ${dados.uf},
      Brasil
    `;

    const geo = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`
    );

    const geoData = await geo.json();

    if (!geoData.length) {
      throw new Error("CEP não encontrado");
    }

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);

    distanciaKm = calcularDistancia(
      BAR_LAT,
      BAR_LNG,
      lat,
      lon
    );

    taxaEntrega = getTaxaPorKm(distanciaKm);

    if (taxaEntrega === null) {

      status.innerHTML =
        "Fora da área de entrega";

      taxaEntrega = 0;

    } else {

      status.innerHTML =
        `Entrega: R$ ${taxaEntrega.toFixed(2)}`;

    }

    renderPedido();

  } catch (err) {

    status.innerHTML =
      "Erro ao calcular entrega";

  }
}

// ── Render Pedido ─────────────────────────
function renderPedido() {

  const el = document.getElementById("pedido-content");

  if (carrinho.length === 0) {

    el.innerHTML = `
      <div class="carrinho-vazio">
        Nenhum item no carrinho
      </div>
    `;

    return;
  }

  let html = "";

  carrinho.forEach(item => {

    html += `
      <div class="cart-item">
        <h4>${item.name}</h4>

        <p>
          ${item.qty}x —
          R$ ${(item.price * item.qty).toFixed(2)}
        </p>

        <button onclick="changeQty('${item.name}', -1)">-</button>
        <button onclick="changeQty('${item.name}', 1)">+</button>
      </div>
    `;
  });

  const subtotal = carrinho.reduce((s, i) => {
    return s + (i.price * i.qty);
  }, 0);

  const total = subtotal + taxaEntrega;

  html += `
    <div class="total-bar">
      <strong>
        Total: R$ ${total.toFixed(2)}
      </strong>
    </div>
  `;

  if (pedidoMode === "delivery") {

    html += `
      <input id="f-cep"
      placeholder="CEP"
      oninput="this.value=this.value.replace(/\\D/g,'').replace(/(\\d{5})(\\d)/,'$1-$2').substring(0,9); if(this.value.replace(/\\D/g,'').length===8) buscarCEP();">
      
      <div id="frete-status"></div>
    `;
  }

  html += `
    <button onclick="confirmarPedido()">
      Confirmar Pedido
    </button>
  `;

  el.innerHTML = html;
}

// ── Confirmar ─────────────────────────
async function confirmarPedido() {

  const subtotal = carrinho.reduce((s, i) => {
    return s + (i.price * i.qty);
  }, 0);

  const total = subtotal + taxaEntrega;

  const pedido = {
    tipo: pedidoMode,
    itens: JSON.stringify(carrinho),
    total: total,
    taxa_entrega: taxaEntrega
  };

  await supabaseClient
    .from("pedidos")
    .insert([pedido]);

  window.open(
    "https://wa.me/5511966062666",
    "_blank"
  );

  carrinho = [];
  taxaEntrega = 0;
  distanciaKm = null;

  updateBadge();

  renderPedido();

  alert("Pedido enviado!");
}

// ── Inicialização ─────────────────────────
renderPedido();