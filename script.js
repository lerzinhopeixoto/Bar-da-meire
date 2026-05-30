// ── Configuração Supabase ──────────────────────────────────────────────────
const SUPABASE_URL = "https://cepuonzbidiivvliemvy.supabase.co";
const SUPABASE_KEY = "sb_publishable_AkeZSzcHWkfzYNR6qkfwGg_EmcKwCR8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Localização do Bar da Meire (Rua Padre Samuel Fritz, 7A — SP) ──────────
const BAR_LAT = -23.6178;
const BAR_LNG = -46.7401;

// ── Faixas de entrega ──────────────────────────────────────────────────────
const FAIXAS_ENTREGA = [
  { min: 0,  max: 3,  taxa: 5.00,  label: 'até 3km — R$ 5,00'  },
  { min: 3,  max: 6,  taxa: 8.00,  label: '3 a 6km — R$ 8,00'  },
  { min: 6,  max: 10, taxa: 12.00, label: '6 a 10km — R$ 12,00' },
];
const FORA_DA_AREA = 10;

// ── Estado Global ──────────────────────────────────────────────────────────
let cart        = [];
let orderDone   = false;
let pedidoMode  = 'mesa';
let taxaEntrega = 0;
let distanciaKm = null;

// ── Navegação ──────────────────────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  ['cardapio', 'semana', 'pedido'].forEach((t, i) => {
    if (t === tab) document.querySelectorAll('.nav-btn')[i].classList.add('active');
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
  const card  = btn.closest('.menu-card');
  const name  = card.dataset.name;
  const price = parseFloat(card.dataset.price);
  const desc  = card.dataset.desc;
  const existing = cart.find(i => i.name === name);
  if (existing) { existing.qty++; }
  else { cart.push({ name, price, desc, qty: 1 }); }
  updateBadge();
  btn.textContent = '✓ Adicionado';
  btn.classList.add('added');
  setTimeout(() => { btn.textContent = '+ Adicionar'; btn.classList.remove('added'); }, 1500);
}

function updateBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const b = document.getElementById('cbadge');
  b.textContent = total;
  total > 0 ? b.classList.add('show') : b.classList.remove('show');
}

function changeQty(name, delta) {
  const item = cart.find(i => i.name === name);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.name !== name);
  updateBadge();
  renderPedido();
}

function setMode(mode) {
  pedidoMode  = mode;
  taxaEntrega = 0;
  distanciaKm = null;
  renderPedido();
}

function selecionarPagamento(btn, forma) {
  document.querySelectorAll('.pagamento-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('f-pagamento').value = forma;
}

// ── Cálculo de distância (Haversine) ───────────────────────────────────────
function calcularDistancia(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dL/2)**2 +
             Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dG/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTaxaPorKm(km) {
  const faixa = FAIXAS_ENTREGA.find(f => km >= f.min && km < f.max);
  return faixa ? faixa.taxa : null;
}

// ── Busca coordenadas pelo CEP ─────────────────────────────────────────────
async function buscarCEP() {
  const cepInput = document.getElementById('f-cep');
  const statusEl = document.getElementById('frete-status');
  const cep = cepInput.value.replace(/\D/g, '');

  if (cep.length !== 8) {
    statusEl.innerHTML = '<span style="color:#e74c3c">⚠️ Digite um CEP válido com 8 dígitos.</span>';
    return;
  }

  statusEl.innerHTML = '<span style="color:#888">🔍 Calculando frete...</span>';
  taxaEntrega = 0;
  distanciaKm = null;

  try {
    const viaCep = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados  = await viaCep.json();
    if (dados.erro) throw new Error('CEP não encontrado');

    const enderecoCompleto = `${dados.logradouro}, ${dados.bairro}, ${dados.localidade}, ${dados.uf}, Brasil`;

    const geo = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(enderecoCompleto)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const geoData = await geo.json();
    if (!geoData.length) throw new Error('Endereço não encontrado');

    const lat = parseFloat(geoData[0].lat);
    const lng = parseFloat(geoData[0].lon);
    const km  = calcularDistancia(BAR_LAT, BAR_LNG, lat, lng);
    distanciaKm = km;

    const taxa = getTaxaPorKm(km);

    if (taxa === null) {
      statusEl.innerHTML = `<span style="color:#e74c3c">😕 Fora da área de entrega (${km.toFixed(1)}km). Entregamos até ${FORA_DA_AREA}km.</span>`;
      taxaEntrega = 0;
    } else {
      taxaEntrega = taxa;
      const faixa = FAIXAS_ENTREGA.find(f => km >= f.min && km < f.max);
      statusEl.innerHTML = `<span style="color:#27ae60">✅ ${km.toFixed(1)}km de distância — Taxa: <strong>R$ ${taxa.toFixed(2).replace('.',',')}</strong> (${faixa.label})</span>`;
    }

    atualizarTotal();

  } catch (err) {
    statusEl.innerHTML = `<span style="color:#e74c3c">⚠️ ${err.message || 'Erro ao calcular. Verifique o CEP.'}</span>`;
  }
}

function atualizarTotal() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total    = subtotal + taxaEntrega;
  const el = document.getElementById('total-valor');
  const lb = document.getElementById('total-label');
  if (el) el.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  if (lb) lb.textContent = taxaEntrega > 0
    ? `Total + taxa de entrega (R$ ${taxaEntrega.toFixed(2).replace('.',',')})`
    : 'Total';
}

// ── Montagem da mensagem WhatsApp ──────────────────────────────────────────
function buildWhatsAppMsg(fields) {
  const items    = cart.map(i => `• ${i.name} x${i.qty} — R$ ${(i.price*i.qty).toFixed(2).replace('.',',')}`).join('\n');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total    = subtotal + taxaEntrega;

  let msg = `🍽️ *Pedido — Bar da Meire*\n\n`;
  if (pedidoMode === 'mesa') {
    msg += `📍 *Mesa:* ${fields.mesa}\n\n`;
  } else {
    msg += `🛵 *Delivery*\n👤 Nome: ${fields.nome}\n📍 Endereço: ${fields.end}\n📮 CEP: ${fields.cep}\n📱 WhatsApp: ${fields.tel}\n`;
    if (distanciaKm) msg += `📏 Distância: ${distanciaKm.toFixed(1)}km\n`;
    msg += '\n';
  }
  msg += `*Itens:*\n${items}\n\n`;
  if (taxaEntrega > 0) msg += `Taxa de entrega: R$ ${taxaEntrega.toFixed(2).replace('.',',')}\n`;
  msg += `*Total: R$ ${total.toFixed(2).replace('.',',')}*`;
  msg += `\n💳 *Pagamento: ${fields.pagamento}*`;
  if (fields.obs) msg += `\n\n📝 Obs: ${fields.obs}`;
  return encodeURIComponent(msg);
}

// ── Renderização do pedido ─────────────────────────────────────────────────
function renderPedido() {
  const el = document.getElementById('pedido-content');

  if (orderDone) {
    const num = Math.floor(Math.random() * 900 + 100);
    el.innerHTML = `
      <div class="success-wrap">
        <div class="success-icon">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2>Pedido confirmado!</h2>
        <p>${pedidoMode === 'mesa'
          ? 'Pedido anotado! Em breve chegamos até você na mesa.'
          : 'Recebemos seu pedido! A entrega está sendo preparada.'}</p>
        <div class="order-num"><span>Número do pedido</span><strong>#${num}</strong></div>
        <button class="new-btn" onclick="resetPedido()">↺ Novo pedido</button>
      </div>`;
    return;
  }

  let html = `
    <div class="mode-toggle">
      <button class="mode-btn ${pedidoMode === 'mesa' ? 'active' : ''}" onclick="setMode('mesa')">
        <svg viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        Comer aqui
      </button>
      <button class="mode-btn ${pedidoMode === 'delivery' ? 'active' : ''}" onclick="setMode('delivery')">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        Delivery
      </button>
    </div>`;

  if (cart.length === 0) {
    html += `
      <div class="empty-cart">
        <svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <p>Nenhum item ainda.<br>Escolha no cardápio ou na semana!</p>
      </div>`;
    el.innerHTML = html;
    return;
  }

  cart.forEach(item => {
    const safeName = item.name.replace(/'/g, "\\'");
    html += `
      <div class="cart-item">
        <div class="ci-info">
          <h4>${item.name}</h4>
          <p>${item.desc} &nbsp;·&nbsp; R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</p>
        </div>
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="changeQty('${safeName}', -1)">−</button>
          <span class="qty-n">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${safeName}', 1)">+</button>
        </div>
      </div>`;
  });

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total    = subtotal + taxaEntrega;

  html += `<div class="total-bar">
    <span id="total-label">${taxaEntrega > 0 ? `Total + taxa de entrega (R$ ${taxaEntrega.toFixed(2).replace('.',',')})` : 'Total'}</span>
    <strong id="total-valor">R$ ${total.toFixed(2).replace('.', ',')}</strong>
  </div>`;

  if (pedidoMode === 'mesa') {
    html += `
      <div style="margin-top:14px">
        <div class="field-group">
          <div class="field-label">
            <svg viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            Número da mesa
          </div>
          <input class="field-input" id="f-mesa" type="text" placeholder="Ex: Mesa 5">
        </div>
        <div class="field-group">
          <div class="field-label">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Observações (opcional)
          </div>
          <textarea class="field-textarea" id="f-obs" rows="2" placeholder="Sem cebola, bem passado..."></textarea>
        </div>
      </div>`;
  } else {
    html += `
      <div style="margin-top:14px">
        <div class="field-group">
          <div class="field-label">
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Seu nome
          </div>
          <input class="field-input" id="f-nome" type="text" placeholder="Nome completo">
        </div>
        <div class="field-group">
          <div class="field-label">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Endereço de entrega
          </div>
          <input class="field-input" id="f-end" type="text" placeholder="Rua, número, bairro">
        </div>
        <div class="field-group">
          <div class="field-label">
            <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            CEP
          </div>
          <input class="field-input" id="f-cep" type="tel" placeholder="00000-000"
            oninput="this.value=this.value.replace(/\D/g,'').replace(/(\d{5})(\d)/,'\$1-\$2').substring(0,9); if(this.value.replace(/\D/g,'').length===8) buscarCEP();">
          <div id="frete-status" style="margin-top:7px;font-size:12px;line-height:1.5"></div>
          <div style="margin-top:8px;font-size:11px;color:#555;background:#1a1a1a;border-radius:8px;padding:8px 10px;border:1px solid #2a2a2a">
            🛵 Faixas de entrega:<br>
            &nbsp;• até 3km → R$ 5,00<br>
            &nbsp;• 3 a 6km → R$ 8,00<br>
            &nbsp;• 6 a 10km → R$ 12,00
          </div>
        </div>
        <div class="field-group">
          <div class="field-label">
            <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.61 5.61l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.01z"/></svg>
            WhatsApp para contato
          </div>
          <input class="field-input" id="f-tel" type="tel" placeholder="(11) 9xxxx-xxxx">
        </div>
        <div class="field-group">
          <div class="field-label">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Observações (opcional)
          </div>
          <textarea class="field-textarea" id="f-obs" rows="2" placeholder="Sem cebola, ponto da carne..."></textarea>
        </div>
      </div>`;
  }

  html += `
    <div style="margin-top:14px">
      <div class="field-label" style="margin-bottom:8px">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        Forma de pagamento
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <button class="pagamento-btn" onclick="selecionarPagamento(this,'Pix')">💚 Pix</button>
        <button class="pagamento-btn" onclick="selecionarPagamento(this,'Cartão de crédito')">💳 Crédito</button>
        <button class="pagamento-btn" onclick="selecionarPagamento(this,'Cartão de débito')">💳 Débito</button>
        <button class="pagamento-btn" onclick="selecionarPagamento(this,'Dinheiro')">💵 Dinheiro</button>
      </div>
      <input type="hidden" id="f-pagamento" value="">
    </div>
    <button class="confirm-btn" onclick="confirmarPedido()">
      <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      Confirmar pedido
    </button>
    <div class="whats-strip">
      <div class="whats-icon">
        <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.1 21.9l4.837-1.312A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
      </div>
      <div>
        <div class="wt">Ou peça direto pelo WhatsApp</div>
        <div class="wn">(11) 96606-2666</div>
      </div>
      <a href="https://wa.me/5511966062666" target="_blank">Abrir ↗</a>
    </div>`;

  el.innerHTML = html;
}

// ── Confirmação do pedido ──────────────────────────────────────────────────
async function confirmarPedido() {
  const pagamento = document.getElementById('f-pagamento')?.value;
  if (!pagamento) { alert('Selecione a forma de pagamento!'); return; }

  let fields = {
    obs: document.getElementById('f-obs')?.value.trim() || '',
    pagamento
  };

  if (pedidoMode === 'mesa') {
    fields.mesa = document.getElementById('f-mesa')?.value.trim();
    if (!fields.mesa) { alert('Por favor, informe o número da mesa!'); return; }
  } else {
    fields.nome = document.getElementById('f-nome')?.value.trim();
    fields.end  = document.getElementById('f-end')?.value.trim();
    fields.cep  = document.getElementById('f-cep')?.value.trim();
    fields.tel  = document.getElementById('f-tel')?.value.trim();

    if (!fields.nome || !fields.end || !fields.cep || !fields.tel) {
      alert('Preencha nome, endereço, CEP e WhatsApp!'); return;
    }
    if (taxaEntrega === 0 && distanciaKm === null) {
      alert('Digite seu CEP para calcular o frete!'); return;
    }
    if (distanciaKm !== null && getTaxaPorKm(distanciaKm) === null) {
      alert('Endereço fora da área de entrega.'); return;
    }
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total    = subtotal + taxaEntrega;

  const pedido = {
    tipo:            pedidoMode,
    itens:           JSON.stringify(cart),
    total:           total,
    observacoes:     fields.obs || '',
    mesa:            fields.mesa || '',
    nome:            fields.nome || '',
    endereco:        fields.end || '',
    cep:             fields.cep || '',
    whatsapp:        fields.tel || '',
    taxa_entrega:    taxaEntrega,
    distancia_km:    distanciaKm ? parseFloat(distanciaKm.toFixed(2)) : 0,
    forma_pagamento: pagamento
  };

  await supabaseClient.from('pedidos').insert([pedido]);

  const msg = buildWhatsAppMsg(fields);
  window.open('https://wa.me/5511966062666?text=' + msg, '_blank');

  orderDone   = true;
  taxaEntrega = 0;
  distanciaKm = null;
  cart        = [];
  updateBadge();
  renderPedido();
}

function resetPedido() {
  orderDone   = false;
  taxaEntrega = 0;
  distanciaKm = null;
  renderPedido();
}

// ── Init ───────────────────────────────────────────────────────────────────
renderPedido();