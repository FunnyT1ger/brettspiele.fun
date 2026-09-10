(function () {
  const CONFIG = window.BrettConfig || {};
  const isHomePage = () => {
    const page = document.documentElement?.dataset?.page;
    if (page === 'home') return true;
    const path = location.pathname.replace(/\/index\.html$/i, '/');
    return !path.includes('/games/');
  };
  if (!isHomePage()) return;

  (function injectDonateCss(){
    if (document.getElementById('brett-donate-css')) return;
    const st = document.createElement('style'); st.id='brett-donate-css';
    st.textContent = `
      .donate-slot{display:inline-flex}
      .donate-button{border:1px solid color-mix(in oklab,var(--accent,#f59e0b) 55%,transparent);border-radius:999px;padding:10px 14px;background:linear-gradient(135deg,var(--accent,#f59e0b),#fbbf24);color:#111827;font:950 13px/1 system-ui,sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 10px 24px rgba(245,158,11,.18)}
      .donate-button:hover{transform:translateY(-1px);filter:brightness(1.04)}
      .donate-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.58);backdrop-filter:blur(10px)}
      .donate-modal{width:min(500px,100%);border:1px solid var(--line,var(--hairline,rgba(255,255,255,.16)));border-radius:28px;background:var(--panel-strong,var(--paper,#111827));color:var(--text,var(--ink,#f8fafc));box-shadow:0 34px 110px rgba(0,0,0,.48);padding:26px;position:relative;overflow:hidden}
      .donate-modal::before{content:'🍺';position:absolute;right:24px;top:18px;font-size:64px;opacity:.15;transform:rotate(-12deg)}
      .donate-modal h2{margin:0 44px 14px 0;font-size:clamp(28px,4vw,44px);letter-spacing:-.05em;line-height:.95}
      .donate-modal p{color:var(--muted,#9ca3af);line-height:1.5}.donate-modal button{border:0;border-radius:999px;padding:11px 15px;font-weight:900;cursor:pointer;background:var(--accent,#f59e0b);color:#111827}.donate-x{position:absolute;right:14px;top:14px;width:34px;height:34px;padding:0!important;background:var(--paper-2,rgba(255,255,255,.08))!important;color:var(--text,var(--ink,#f8fafc))!important}.donate-muted{font-size:13px}
    `;
    document.head.appendChild(st);
  })();
  const i18n = window.BFI18N;
  const L = {
    de:{donate:'Spendier mir ein Bier',title:'Spendier mir ein Bier',text:'Wenn diese Brettspielseite deinen Abend gerettet hat, darfst du dem Server freiwillig ein digitales Bier hinstellen. Prost, und keine Sorge: Die Würfel trinken nicht mit.',go:'Bier spendieren',missing:'Noch keine Spendenadresse konfiguriert. Setze in Ansible brettspiele_donation_url.',close:'Schließen'},
    en:{donate:'Buy me a beer',title:'Buy me a beer',text:'If this board-game page saved your evening, you can voluntarily put a digital beer on the server table. Cheers — the dice will stay sober.',go:'Buy a beer',missing:'No donation URL configured yet. Set brettspiele_donation_url in Ansible.',close:'Close'},
    fr:{donate:'Offre-moi une bière',title:'Offre-moi une bière',text:'Si cette page de jeux a sauvé ta soirée, tu peux poser une bière numérique sur la table du serveur. Santé — les dés restent sobres.',go:'Offrir une bière',missing:'Aucune URL de don configurée.',close:'Fermer'},
    es:{donate:'Invítame a una cerveza',title:'Invítame a una cerveza',text:'Si esta página de juegos salvó tu noche, puedes dejar una cerveza digital en la mesa del servidor. Salud — los dados no beben.',go:'Invitar una cerveza',missing:'No hay URL de donación configurada.',close:'Cerrar'},
    it:{donate:'Offrimi una birra',title:'Offrimi una birra',text:'Se questa pagina di giochi ha salvato la serata, puoi lasciare una birra digitale sul tavolo del server. Cin cin — i dadi restano sobri.',go:'Offri una birra',missing:'URL donazione non configurato.',close:'Chiudi'},
    ru:{donate:'Угости меня пивом',title:'Угости меня пивом',text:'Если эта страница спасла игровой вечер, можно поставить серверу цифровое пиво. За здоровье — кубики останутся трезвыми.',go:'Угостить пивом',missing:'URL доната не настроен.',close:'Закрыть'},
    zh:{donate:'请我喝杯啤酒',title:'请我喝杯啤酒',text:'如果这个桌游页面拯救了你的夜晚，可以给服务器放上一杯数字啤酒。干杯——骰子不会偷喝。',go:'请杯啤酒',missing:'尚未配置捐助链接。',close:'关闭'},
    ja:{donate:'ビールをおごる',title:'ビールをおごる',text:'このボードゲームページが夜を救ったなら、サーバーのテーブルにデジタルビールを一杯どうぞ。乾杯。ダイスは飲みません。',go:'ビールをおごる',missing:'寄付URLが未設定です。',close:'閉じる'}
  };
  const lang = () => (i18n?.getLanguage?.() || navigator.language || 'de').slice(0,2).toLowerCase();
  const t = (k) => (L[lang()] || L.en)[k] || L.en[k] || k;
  function ensureSlots() {
    if (CONFIG.donationEnabled === false) return;
    const nav = document.querySelector('.nav-actions');
    if (nav && !nav.querySelector('[data-donate-slot]')) {
      const span = document.createElement('span'); span.dataset.donateSlot = '1'; span.className = 'donate-slot';
      const play = nav.querySelector('.btn-primary'); nav.insertBefore(span, play || null);
    }
  }
  function render() {
    if (!isHomePage()) return;
    document.querySelectorAll('[data-donate-slot]').forEach((slot) => {
      slot.innerHTML = `<button class="donate-button" type="button" data-donate-open>🍺 ${escapeHtml(t('donate'))}</button>`;
    });
    document.querySelectorAll('[data-donate-open]').forEach((b) => {
      if (b.dataset.donateBound === '1') return;
      b.dataset.donateBound = '1';
      b.addEventListener('click', open);
    });
  }
  function open() {
    const url = String(CONFIG.donationUrl || '').trim();
    if (url && url !== '#') { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    document.querySelector('.donate-backdrop')?.remove();
    const el = document.createElement('div'); el.className = 'donate-backdrop';
    el.innerHTML = `<section class="donate-modal" role="dialog" aria-modal="true"><button class="donate-x" data-donate-close aria-label="${escapeHtml(t('close'))}">×</button><h2>${escapeHtml(t('title'))}</h2><p>${escapeHtml(t('text'))}</p><p class="donate-muted">${escapeHtml(t('missing'))}</p><button type="button" data-donate-close>${escapeHtml(t('close'))}</button></section>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.matches('[data-donate-close]')) el.remove(); });
  }
  function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function init() { ensureSlots(); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('brettspiele-language-change', init);
})();
