/* ============================================
   BLOOMING COFFEE — SHARED DATA LAYER
   All pages include this file for localStorage integration.
   ============================================ */
const BC = {
  /* ---------- CART ---------- */
  getCart() {
    try { return JSON.parse(localStorage.getItem('bc_cart') || '[]'); }
    catch { return []; }
  },
  setCart(cart) { localStorage.setItem('bc_cart', JSON.stringify(cart)); },
  addToCart(item) {
    const cart = this.getCart();
    // Normalize: ensure price field is set
    const normalizedItem = { ...item };
    if (!normalizedItem.price && normalizedItem.unitPrice) normalizedItem.price = normalizedItem.unitPrice;
    if (!normalizedItem.unitPrice && normalizedItem.price) normalizedItem.unitPrice = normalizedItem.price;
    const key = normalizedItem.name + '|' + (normalizedItem.options || '');
    const idx = cart.findIndex(c => (c.name + '|' + (c.options || '')) === key);
    if (idx >= 0) {
      cart[idx].qty += (normalizedItem.qty || 1);
      if (cart[idx].qty > 10) cart[idx].qty = 10;
    } else {
      cart.push({ ...normalizedItem, qty: normalizedItem.qty || 1 });
    }
    this.setCart(cart);
    this.updateAllBadges();
    return cart;
  },
  removeFromCart(index) {
    const cart = this.getCart();
    cart.splice(index, 1);
    this.setCart(cart);
    this.updateAllBadges();
    return cart;
  },
  updateCartQty(index, qty) {
    const cart = this.getCart();
    if (cart[index]) cart[index].qty = Math.max(1, Math.min(10, qty));
    this.setCart(cart);
    this.updateAllBadges();
    return cart;
  },
  clearCart() {
    localStorage.setItem('bc_cart', '[]');
    this.updateAllBadges();
  },
  getCartCount() { return this.getCart().reduce((s, i) => s + i.qty, 0); },
  getCartTotal() { return this.getCart().reduce((s, i) => s + i.price * i.qty, 0); },

  /* ---------- ORDERS ---------- */
  getOrders() {
    try { return JSON.parse(localStorage.getItem('bc_orders') || '[]'); }
    catch { return []; }
  },
  addOrder(order) {
    const orders = this.getOrders();
    orders.unshift(order);
    if (orders.length > 50) orders.length = 50;
    localStorage.setItem('bc_orders', JSON.stringify(orders));
    // points
    const earned = Math.floor(order.total * 0.01);
    this.setPoints(this.getPoints() + earned);
    // stamps
    this.setStamps(this.getStamps() + 1);
    return { earned, order };
  },

  /* ---------- POINTS ---------- */
  getPoints() { return parseInt(localStorage.getItem('bc_points') || '2450'); },
  setPoints(p) { localStorage.setItem('bc_points', String(Math.max(0, p))); },

  /* ---------- STAMPS ---------- */
  getStamps() { return parseInt(localStorage.getItem('bc_stamps') || '7'); },
  setStamps(s) {
    const v = s >= 10 ? s - 10 : s;
    localStorage.setItem('bc_stamps', String(Math.max(0, v)));
  },

  /* ---------- COUPONS ---------- */
  _defaultCoupons: [
    { id:'coupon1', name:'웰컴 쿠폰', discount:2000, type:'fixed', desc:'첫 주문 시 사용 가능', expiry:'~3/31', icon:'🎉' },
    { id:'coupon2', name:'커피 10% 할인', discount:0.1, type:'percent', desc:'커피 메뉴 한정', expiry:'~4/15', icon:'☕' },
    { id:'coupon3', name:'생일 쿠폰', discount:3000, type:'fixed', desc:'생일 축하 특별 쿠폰', expiry:'~12/31', icon:'🎂' }
  ],
  getCoupons() {
    try {
      const raw = localStorage.getItem('bc_coupons');
      return raw ? JSON.parse(raw) : [...this._defaultCoupons];
    } catch { return [...this._defaultCoupons]; }
  },
  saveCoupons(c) { localStorage.setItem('bc_coupons', JSON.stringify(c)); },
  useCoupon(id) {
    let c = this.getCoupons();
    c = c.filter(x => x.id !== id);
    this.saveCoupons(c);
  },

  /* ---------- FAVORITES ---------- */
  getFavorites() {
    try { return JSON.parse(localStorage.getItem('bc_favorites') || '[]'); }
    catch { return []; }
  },
  toggleFavorite(item) {
    const favs = this.getFavorites();
    const idx = favs.findIndex(f => f.name === item.name);
    let added;
    if (idx >= 0) { favs.splice(idx, 1); added = false; }
    else { favs.push(item); added = true; }
    localStorage.setItem('bc_favorites', JSON.stringify(favs));
    return added;
  },
  isFavorite(name) { return this.getFavorites().some(f => f.name === name); },

  /* ---------- BADGES ---------- */
  updateAllBadges() {
    const count = this.getCartCount();
    document.querySelectorAll('.cart-badge, .nav-badge, .floating-cart-badge, [data-cart-badge]').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? '' : 'none';
    });
  },

  /* ---------- INIT ---------- */
  init() {
    if (!localStorage.getItem('bc_initialized')) {
      localStorage.setItem('bc_initialized', 'true');
      localStorage.setItem('bc_points', '2450');
      localStorage.setItem('bc_stamps', '7');
      this.saveCoupons([...this._defaultCoupons]);
    }
    this.updateAllBadges();
  },

  /* ---------- MENU DATABASE ---------- */
  menuDB: {
    'cafe-latte':       { name:'카페라떼',      engName:'Caffè Latte',    basePrice:5000, img:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80', category:'coffee', temp:'both' },
    'americano':        { name:'아메리카노',    engName:'Americano',      basePrice:4500, img:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80', category:'coffee', temp:'both' },
    'cappuccino':       { name:'카푸치노',      engName:'Cappuccino',     basePrice:5000, img:'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800&q=80', category:'coffee', temp:'both' },
    'cold-brew':        { name:'콜드브루',      engName:'Cold Brew',      basePrice:5000, img:'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80', category:'coffee', temp:'ice' },
    'vanilla-latte':    { name:'바닐라라떼',    engName:'Vanilla Latte',  basePrice:5500, img:'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80', category:'coffee', temp:'both' },
    'caramel-macchiato':{ name:'카라멜마끼아또',engName:'Caramel Macchiato',basePrice:5800, img:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80', category:'coffee', temp:'both' },
    'flat-white':       { name:'플랫화이트',    engName:'Flat White',     basePrice:5000, img:'https://images.unsplash.com/photo-1514432324607-a09d9b4aefda?w=800&q=80', category:'coffee', temp:'both' },
    'green-tea-latte':  { name:'녹차라떼',      engName:'Green Tea Latte',basePrice:5600, img:'https://images.unsplash.com/photo-1534778101976-62847782c213?w=800&q=80', category:'non-coffee', temp:'both' },
    'croissant':        { name:'크루아상',      engName:'Croissant',      basePrice:4900, img:'https://images.unsplash.com/photo-1555507036-ab1f4038024a?w=800&q=80', category:'dessert', temp:'none' },
    'tiramisu':         { name:'티라미수',      engName:'Tiramisu',       basePrice:6800, img:'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80', category:'dessert', temp:'none' },
    'macaron-set':      { name:'마카롱세트',    engName:'Macaron Set',    basePrice:8500, img:'https://images.unsplash.com/photo-1558024920-b41e1887dc32?w=800&q=80', category:'dessert', temp:'none' },
    'blooming-special': { name:'블루밍 스페셜', engName:'Blooming Special',basePrice:6500, img:'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=800&q=80', category:'coffee', temp:'both' },
    'einspanner':       { name:'아인슈페너',    engName:'Einspänner',     basePrice:6000, img:'https://images.unsplash.com/photo-1514432324607-a09d9b4aefda?w=800&q=80', category:'coffee', temp:'ice' },
    'chai-latte':       { name:'차이라떼',      engName:'Chai Latte',     basePrice:5500, img:'https://images.unsplash.com/photo-1557006021-b85faa2bc5e2?w=800&q=80', category:'non-coffee', temp:'both' },
    'espresso':         { name:'에스프레소',    engName:'Espresso',       basePrice:4800, img:'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=800&q=80', category:'coffee', temp:'hot' },
    'mocha':            { name:'모카',          engName:'Caffè Mocha',    basePrice:5900, img:'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=800&q=80', category:'coffee', temp:'both' },
    'grapefruit-ade':   { name:'자몽에이드',    engName:'Grapefruit Ade', basePrice:5300, img:'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80', category:'non-coffee', temp:'ice' },
    'strawberry-smoothie':{ name:'딸기스무디',  engName:'Strawberry Smoothie',basePrice:6100,img:'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=800&q=80', category:'non-coffee', temp:'ice' },
    'choco-latte':      { name:'초코라떼',      engName:'Chocolate Latte',basePrice:5700, img:'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=800&q=80', category:'non-coffee', temp:'both' },
    'cheesecake':       { name:'치즈케이크',    engName:'Cheesecake',     basePrice:7200, img:'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80', category:'dessert', temp:'none' },
    'cherry-blossom-latte':{ name:'체리 블라썸 라떼',engName:'Cherry Blossom Latte',basePrice:6800,img:'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=800&q=80', category:'coffee', temp:'both' },
    'signature-blend':  { name:'시그니처 블렌드',engName:'Signature Blend',basePrice:4500, img:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80', category:'coffee', temp:'both' },
    'matcha-latte':     { name:'말차 라떼',     engName:'Matcha Latte',   basePrice:5800, img:'https://images.unsplash.com/photo-1534778101976-62847782c213?w=800&q=80', category:'non-coffee', temp:'both' }
  },
  getMenuItem(id) { return this.menuDB[id] || null; },
  findMenuByName(name) {
    // Exact match first
    const exact = Object.entries(this.menuDB).find(([, v]) => v.name === name);
    if (exact) return exact;
    // Fuzzy: remove spaces and compare
    const clean = name.replace(/\s/g, '');
    return Object.entries(this.menuDB).find(([, v]) => v.name.replace(/\s/g, '') === clean);
  }
};

BC.init();



/* ============================================
   FORMAT HELPERS
   ============================================ */
function formatPrice(n) { return n.toLocaleString('ko-KR') + '원'; }
function formatPriceNoUnit(n) { return n.toLocaleString('ko-KR'); }
