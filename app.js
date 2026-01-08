const state = {
  shop: null,
  products: [],
  oembedCache: new Map(),
};

const CART_KEY = "hd_cart_v1";
const OEMBED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function $(id){ return document.getElementById(id); }

function getCart(){
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch { return {}; }
}
function setCart(cart){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}
function updateCartCount(){
  const cart = getCart();
  const count = Object.values(cart).reduce((a,b)=>a+b,0);
  const el = document.querySelectorAll("#cartCount");
  el.forEach(n=> n.textContent = String(count));
}

function moneyOrFallback(p){
  return p ?? "See Etsy";
}

function listingUrl(id){
  return `https://www.etsy.com/listing/${encodeURIComponent(id)}`;
}

function readLocalOembed(id){
  try{
    const raw = localStorage.getItem(`hd_oembed_${id}`);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !data.fetchedAt) return null;
    if(Date.now() - data.fetchedAt > OEMBED_TTL_MS) return null;
    return data.payload || null;
  } catch {
    return null;
  }
}
function writeLocalOembed(id, payload){
  try{
    localStorage.setItem(`hd_oembed_${id}`, JSON.stringify({fetchedAt: Date.now(), payload}));
  } catch {}
}

async function fetchOembed(id){
  const cached = state.oembedCache.get(id) || readLocalOembed(id);
  if(cached){
    state.oembedCache.set(id, cached);
    return cached;
  }

  // Etsy oEmbed endpoint. If it fails (CORS or network), we just return null and use placeholders.
  const url = `https://www.etsy.com/oembed?url=${encodeURIComponent(listingUrl(id))}`;
  try{
    const res = await fetch(url, { method: "GET" });
    if(!res.ok) throw new Error("oEmbed failed");
    const json = await res.json();
    state.oembedCache.set(id, json);
    writeLocalOembed(id, json);
    return json;
  } catch {
    return null;
  }
}

function placeholderDataUri(text){
  const safe = (text || "HermelabyDesign").slice(0, 28).replace(/[<>]/g,"");
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="675">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#1b1f2d" offset="0"/>
        <stop stop-color="#0f1119" offset="1"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="52%" text-anchor="middle" font-family="Arial" font-size="44" fill="#d7d9ff" font-weight="700">${safe}</text>
    <text x="50%" y="60%" text-anchor="middle" font-family="Arial" font-size="18" fill="#b7bcc7">Click to view on Etsy</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function productCardHTML(p, enriched){
  const img = enriched?.thumbnail_url || p.image || placeholderDataUri(p.title);
  const title = enriched?.title || p.title;
  const cat = p.category || "Topper";
  return `
  <a class="card" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="${escapeHtml(title)}">
    <img class="card-img" src="${img}" alt="${escapeHtml(title)}" loading="lazy" />
    <div class="card-body">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-meta">
        <div class="price">${escapeHtml(moneyOrFallback(p.price_display))}</div>
        <div class="tag">${escapeHtml(cat)}</div>
      </div>
    </div>
  </a>`;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function loadData(){
  const res = await fetch("data/products.json");
  const json = await res.json();
  state.shop = json.shop;
  state.products = json.products || [];

  // Brand bits
  document.querySelectorAll("[data-shop-name]").forEach(el => el.textContent = state.shop?.name || "HermelabyDesign");
  document.querySelectorAll("[data-shop-tagline]").forEach(el => el.textContent = state.shop?.tagline || "");
  const year = document.querySelectorAll("#year");
  year.forEach(el => el.textContent = new Date().getFullYear());
  updateCartCount();

  return json;
}

async function enrichSome(products){
  // Lightweight concurrency limit to avoid hammering the endpoint
  const limit = 4;
  const out = new Map();
  let i = 0;
  async function worker(){
    while(i < products.length){
      const idx = i++;
      const p = products[idx];
      const data = await fetchOembed(p.id);
      if(data) out.set(p.id, data);
    }
  }
  const workers = Array.from({length: limit}, () => worker());
  await Promise.all(workers);
  return out;
}

function bySort(sortKey){
  return (a,b) => {
    const pa = parseFloat(String(a.price_display||"").replace(/[^0-9.]/g,"")) || Number.POSITIVE_INFINITY;
    const pb = parseFloat(String(b.price_display||"").replace(/[^0-9.]/g,"")) || Number.POSITIVE_INFINITY;
    if(sortKey === "price_asc") return pa - pb;
    if(sortKey === "price_desc") return pb - pa;
    if(sortKey === "featured") return (b.featured?1:0) - (a.featured?1:0);
    return 0;
  };
}

async function renderFeatured(){
  const grid = $("featuredGrid");
  if(!grid) return;
  const featured = state.products.filter(p => p.featured).slice(0, 8);
  const enriched = await enrichSome(featured);
  grid.innerHTML = featured.map(p => productCardHTML(p, enriched.get(p.id))).join("");
}

async function renderShop(){
  const grid = $("shopGrid");
  if(!grid) return;

  const categorySelect = $("categorySelect");
  const sortSelect = $("sortSelect");
  const searchInput = $("searchInput");

  const categories = Array.from(new Set(state.products.map(p => p.category).filter(Boolean))).sort();
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });

  const apply = async () => {
    const q = (searchInput.value || "").trim().toLowerCase();
    const cat = categorySelect.value || "all";
    const sort = sortSelect.value || "featured";

    let list = state.products.slice();

    if(cat !== "all"){
      list = list.filter(p => (p.category || "") === cat);
    }

    if(q){
      list = list.filter(p => {
        const hay = `${p.title} ${(p.tags||[]).join(" ")} ${p.category||""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    list.sort(bySort(sort));

    const enriched = await enrichSome(list.slice(0, 24));
    grid.innerHTML = list.map(p => productCardHTML(p, enriched.get(p.id))).join("");
  };

  ["change","input"].forEach(evt => {
    categorySelect.addEventListener(evt, apply);
    sortSelect.addEventListener(evt, apply);
    searchInput.addEventListener(evt, apply);
  });

  await apply();
}

async function renderProduct(){
  const wrap = $("productView");
  if(!wrap) return;

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const p = state.products.find(x => x.id === id);
  if(!p){
    wrap.innerHTML = `<p class="muted">Product not found.</p>`;
    return;
  }

  const enriched = await fetchOembed(p.id);
  const title = enriched?.title || p.title;
  const img = enriched?.thumbnail_url || p.image || placeholderDataUri(p.title);

  wrap.innerHTML = `
    <div>
      <img class="product-img" src="${img}" alt="${escapeHtml(title)}" />
    </div>
    <div class="product-panel">
      <h1 class="product-title">${escapeHtml(title)}</h1>
      <div class="kv">
        <span class="badge">Category: ${escapeHtml(p.category || "Topper")}</span>
        <span class="badge">Price: ${escapeHtml(moneyOrFallback(p.price_display))}</span>
        <span class="badge">Made to order</span>
        <span class="badge">Ships from Australia</span>
      </div>
      <p class="muted">
        This website is a catalogue for HermelabyDesign. To purchase, you’ll be redirected to Etsy checkout.
      </p>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <a class="btn primary" href="${listingUrl(p.id)}" target="_blank" rel="noopener">Buy on Etsy</a>
        <button class="btn" id="addToCartBtn">Add to cart</button>
        <a class="btn ghost" href="shop.html">Back to shop</a>
      </div>
      <div class="notice">
        Tip: Use the “Custom Orders” page for wording requests, special sizing, or rush orders.
      </div>
    </div>
  `;

  $("addToCartBtn").addEventListener("click", () => {
    const cart = getCart();
    cart[p.id] = (cart[p.id] || 0) + 1;
    setCart(cart);
  });
}

async function renderCart(){
  const wrap = $("cartWrap");
  if(!wrap) return;

  const cart = getCart();
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ product: state.products.find(p => p.id === id), qty }))
    .filter(x => x.product && x.qty > 0);

  if(items.length === 0){
    wrap.innerHTML = `
      <div class="cart">
        <p class="muted">Your cart is empty.</p>
        <a class="btn primary" href="shop.html">Browse products</a>
      </div>`;
    return;
  }

  const enriched = await enrichSome(items.map(x => x.product));
  const rows = items.map(({product:p, qty}) => {
    const e = enriched.get(p.id);
    const title = e?.title || p.title;
    const img = e?.thumbnail_url || p.image || placeholderDataUri(p.title);
    return `
      <div class="cart-row">
        <img class="cart-thumb" src="${img}" alt="${escapeHtml(title)}"/>
        <div>
          <div class="cart-title">${escapeHtml(title)}</div>
          <div class="muted">${escapeHtml(moneyOrFallback(p.price_display))} • <a class="link" href="${listingUrl(p.id)}" target="_blank" rel="noopener">Open on Etsy</a></div>
        </div>
        <div class="cart-actions">
          <div class="qty">
            <button data-dec="${p.id}">−</button>
            <span>${qty}</span>
            <button data-inc="${p.id}">+</button>
          </div>
          <button class="btn small" data-remove="${p.id}">Remove</button>
        </div>
      </div>`;
  }).join("");

  wrap.innerHTML = `
    <div class="cart">
      ${rows}
      <div class="totals">
        <div class="muted">Checkout happens on Etsy (this site doesn’t process payments).</div>
        <a class="btn primary" href="${state.shop?.etsy_shop_url || '#'}" target="_blank" rel="noopener">Go to Etsy shop</a>
      </div>
      <div class="notice">
        If you have multiple items, open each product link above to add them to your Etsy cart, then checkout on Etsy.
      </div>
    </div>
  `;

  wrap.querySelectorAll("[data-inc]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-inc");
      const c = getCart();
      c[id] = (c[id] || 0) + 1;
      setCart(c);
      renderCart();
    });
  });
  wrap.querySelectorAll("[data-dec]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-dec");
      const c = getCart();
      c[id] = Math.max(0, (c[id] || 0) - 1);
      if(c[id] === 0) delete c[id];
      setCart(c);
      renderCart();
    });
  });
  wrap.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      const c = getCart();
      delete c[id];
      setCart(c);
      renderCart();
    });
  });
}

function wireCustomForm(){
  const form = $("customForm");
  if(!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());

    const subject = `Custom Cake Topper Request – ${payload.occasion || "Order"}`;
    const body = [
      `Name: ${payload.name || ""}`,
      `Email: ${payload.email || ""}`,
      `Occasion: ${payload.occasion || ""}`,
      `Needed by: ${payload.neededBy || ""}`,
      `Wording (exact): ${payload.wording || ""}`,
      `Size: ${payload.size || ""}`,
      `Colour/finish: ${payload.colour || ""}`,
      ``,
      `Notes:`,
      `${payload.notes || ""}`,
      ``,
      `Etsy shop: ${state.shop?.etsy_shop_url || ""}`
    ].join("\n");

    // No email address provided here — opens a draft for the user to choose the recipient.
    // They can also message on Etsy via the button on the page.
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  });
}

async function init(){
  await loadData();
  await renderFeatured();
  await renderShop();
  await renderProduct();
  await renderCart();
  wireCustomForm();
}
init();
