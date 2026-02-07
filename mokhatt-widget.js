(() => {
  const cfg = window.mokhattConfig || {};
  if (!cfg.webhookUrl) {
    console.error("mokhattConfig.webhookUrl is required");
    return;
  }

  // ===== Persistent visitor/session id =====
  const LS_KEY = "mokhatt_visitor_id";
  let visitorId = localStorage.getItem(LS_KEY);
  if (!visitorId) {
    visitorId = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + "-" + Math.random());
    localStorage.setItem(LS_KEY, visitorId);
  }

  // ===== Config =====
  const title = cfg.title || "مُخَطّط";
  const pos = (cfg.position || "right").toLowerCase() === "left" ? "left" : "right";
  const primary = cfg.primaryColor || "#0f5b3e";
  const welcome = String(cfg.welcomeMessage || "").trim();
  const assistantLogoSrc = cfg.assistantLogoSrc || ""; // optional

  // launcher: {type:"image", src:"...", alt:"..."} OR default emoji button
  const launcher = cfg.launcher || null;
  const launcherIsImage = launcher && launcher.type === "image" && launcher.src;

  // ===== Helpers =====
  const qs = (sel, el = document) => el.querySelector(sel);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ===== Styles =====
  const style = document.createElement("style");
  style.textContent = `
    :root{
      --mk-primary: ${primary};
      --mk-bg: #ffffff;
      --mk-muted: #f6f7f9;
      --mk-ink: #0f172a;
      --mk-stroke: rgba(15, 23, 42, .10);
      --mk-shadow: 0 18px 60px rgba(2, 6, 23, .22);
      --mk-radius: 18px;
    }

    .mk-launcher{
      position:fixed; bottom:18px; ${pos}:18px;
      width:60px; height:60px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.35);
      background: linear-gradient(135deg, rgba(255,255,255,.9), rgba(255,255,255,.75));
      box-shadow: 0 18px 45px rgba(2,6,23,.24);
      cursor:pointer; z-index:999999;
      display:flex; align-items:center; justify-content:center;
      overflow:hidden;
      transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .mk-launcher:hover{
      transform: translateY(-1px);
      box-shadow: 0 22px 60px rgba(2,6,23,.28);
      filter: saturate(1.05);
    }
    .mk-launcher:active{ transform: translateY(0px) scale(.99); }
    .mk-launcher img{
      width:100%; height:100%;
      object-fit: cover;
      transform: scale(1.03);
    }
    .mk-launcher .mk-emoji{
      width:100%; height:100%;
      display:flex; align-items:center; justify-content:center;
      font-size: 24px;
      color: #fff;
      background: var(--mk-primary);
    }

    .mk-panel{
      position:fixed; bottom:90px; ${pos}:18px;
      width:390px; max-width:calc(100vw - 36px);
      height:560px; max-height:calc(100vh - 150px);
      background: var(--mk-bg);
      border-radius: 20px;
      border:1px solid var(--mk-stroke);
      box-shadow: var(--mk-shadow);
      overflow:hidden; z-index:999999;
      display:flex; flex-direction:column;
      opacity: 0;
      transform: translateY(10px) scale(.98);
      pointer-events:none;
      transition: opacity .18s ease, transform .18s ease;
      font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
      direction: rtl;
    }
    .mk-panel.open{
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events:auto;
    }

    .mk-header{
      background: linear-gradient(135deg, var(--mk-primary), #0b3d91);
      color:#fff;
      padding: 12px 12px;
      display:flex; align-items:center; justify-content:space-between;
      gap:10px;
    }
    .mk-header-left{
      display:flex; align-items:center; gap:10px;
      min-width: 0;
    }
    .mk-brand{
      width:32px; height:32px; border-radius: 12px;
      background: rgba(255,255,255,.95);
      border: 1px solid rgba(255,255,255,.35);
      display:flex; align-items:center; justify-content:center;
      overflow:hidden;
      flex:0 0 auto;
    }
    .mk-brand img{ width:100%; height:100%; object-fit: contain; padding:5px; }
    .mk-title{
      display:flex; flex-direction:column;
      min-width:0;
      line-height: 1.1;
    }
    .mk-title b{
      font-size: 13.5px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .mk-title span{
      font-size: 11.5px;
      opacity:.88;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }

    .mk-close{
      background: rgba(255,255,255,.16);
      border: 1px solid rgba(255,255,255,.22);
      color:#fff; cursor:pointer;
      width:34px; height:34px; border-radius: 12px;
      display:flex; align-items:center; justify-content:center;
      font-size: 18px;
      flex:0 0 auto;
    }

    .mk-body{
      padding: 12px 12px 10px;
      background: radial-gradient(700px 450px at 50% 0%, rgba(15,91,62,.08), transparent 60%),
                  linear-gradient(180deg, var(--mk-muted), #ffffff);
      flex:1; overflow:auto;
      scroll-behavior:smooth;
    }

    .mk-msg{ margin: 10px 0; display:flex; }
    .mk-msg.user{ justify-content:flex-start; } /* RTL: user on left feels natural in Arabic chat */
    .mk-msg.bot{ justify-content:flex-end; }

    .mk-bubble{
      max-width: 82%;
      padding: 10px 12px;
      border-radius: 16px;
      line-height: 1.7;
      font-size: 14px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .mk-msg.user .mk-bubble{
      background: #ffffff;
      border: 1px solid rgba(15, 23, 42, .10);
      color: var(--mk-ink);
      border-bottom-left-radius: 8px;
      box-shadow: 0 10px 25px rgba(2,6,23,.08);
    }
    .mk-msg.bot .mk-bubble{
      background: linear-gradient(135deg, rgba(15,91,62,.10), rgba(11,61,145,.08));
      border: 1px solid rgba(15, 23, 42, .08);
      color: var(--mk-ink);
      border-bottom-right-radius: 8px;
    }

    /* Welcome card (logo + text) */
    .mk-welcome{
      display:flex; gap:10px; align-items:flex-start;
    }
    .mk-welcome .mk-wlogo{
      width:36px; height:36px; border-radius: 14px;
      background:#fff;
      border:1px solid rgba(15,23,42,.10);
      display:flex; align-items:center; justify-content:center;
      overflow:hidden;
      flex:0 0 auto;
      box-shadow: 0 10px 25px rgba(2,6,23,.12);
    }
    .mk-welcome .mk-wlogo img{
      width:100%; height:100%; object-fit:contain;
      padding:6px;
    }
    .mk-welcome .mk-wtext{ min-width:0; }

    .mk-footer{
      padding: 10px;
      background: rgba(255,255,255,.9);
      border-top: 1px solid rgba(15,23,42,.08);
      display:flex; gap:8px;
    }
    .mk-input{
      flex:1;
      border: 1px solid rgba(15,23,42,.12);
      border-radius: 14px;
      padding: 10px 12px;
      font-size: 14px;
      outline: none;
      background: #fff;
    }
    .mk-input:focus{
      border-color: rgba(15,91,62,.35);
      box-shadow: 0 0 0 4px rgba(15,91,62,.10);
    }
    .mk-send{
      background: var(--mk-primary);
      color:#fff;
      border:none;
      border-radius: 14px;
      padding: 0 14px;
      cursor:pointer;
      font-weight: 700;
      transition: opacity .15s ease, transform .15s ease;
    }
    .mk-send:active{ transform: scale(.99); }
    .mk-send:disabled{ opacity:.6; cursor:not-allowed; }

    /* typing dots */
    .mk-dots{
      display:inline-flex; align-items:center; gap:4px;
      padding: 2px 0;
    }
    .mk-dots i{
      width:6px; height:6px; border-radius:99px;
      background: rgba(15, 23, 42, .45);
      display:inline-block;
      animation: mkBounce 1s infinite ease-in-out;
    }
    .mk-dots i:nth-child(2){ animation-delay:.12s; }
    .mk-dots i:nth-child(3){ animation-delay:.24s; }
    @keyframes mkBounce{
      0%, 80%, 100%{ transform: translateY(0); opacity:.5; }
      40%{ transform: translateY(-3px); opacity:1; }
    }
  `;
  document.head.appendChild(style);

  // ===== UI =====
  const btn = document.createElement("button");
  btn.className = "mk-launcher";
  btn.type = "button";
  btn.title = "فتح الدردشة";

  if (launcherIsImage) {
    const img = document.createElement("img");
    img.alt = launcher.alt || "فتح الدردشة";
    img.src = launcher.src;
    btn.appendChild(img);
  } else {
    const emoji = document.createElement("div");
    emoji.className = "mk-emoji";
    emoji.textContent = "💬";
    btn.appendChild(emoji);
  }

  const panel = document.createElement("div");
  panel.className = "mk-panel";

  const header = document.createElement("div");
  header.className = "mk-header";

  const headerLeft = document.createElement("div");
  headerLeft.className = "mk-header-left";

  const brand = document.createElement("div");
  brand.className = "mk-brand";
  if (assistantLogoSrc) {
    const bi = document.createElement("img");
    bi.alt = "شعار مُخَطّط";
    bi.src = assistantLogoSrc;
    brand.appendChild(bi);
  } else {
    brand.textContent = "🤖";
  }

  const hTitle = document.createElement("div");
  hTitle.className = "mk-title";
  hTitle.innerHTML = `<b>${escapeHtml(title)}</b><span>المساعد الرقمي الذكي</span>`;

  const close = document.createElement("button");
  close.className = "mk-close";
  close.type = "button";
  close.title = "إغلاق";
  close.textContent = "✕";

  headerLeft.appendChild(brand);
  headerLeft.appendChild(hTitle);
  header.appendChild(headerLeft);
  header.appendChild(close);

  const body = document.createElement("div");
  body.className = "mk-body";

  const footer = document.createElement("div");
  footer.className = "mk-footer";

  const input = document.createElement("input");
  input.className = "mk-input";
  input.placeholder = "اكتب رسالتك…";
  input.dir = "rtl";
  input.autocomplete = "off";

  const send = document.createElement("button");
  send.className = "mk-send";
  send.type = "button";
  send.textContent = "إرسال";

  footer.appendChild(input);
  footer.appendChild(send);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const scrollToBottom = () => {
    body.scrollTop = body.scrollHeight;
  };

  const addMsgRow = (who) => {
    const row = document.createElement("div");
    row.className = `mk-msg ${who}`;
    const bubble = document.createElement("div");
    bubble.className = "mk-bubble";
    row.appendChild(bubble);
    body.appendChild(row);
    scrollToBottom();
    return bubble;
  };

  const addUserMsg = (text) => {
    const bubble = addMsgRow("user");
    bubble.textContent = String(text);
  };

  const addBotMsgTyped = async (text, opts = {}) => {
    const speed = clamp(Number(opts.speed ?? 14), 6, 30); // ms per char
    const bubble = addMsgRow("bot");

    // Welcome style with logo
    if (opts.isWelcome) {
      bubble.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "mk-welcome";

      const logo = document.createElement("div");
      logo.className = "mk-wlogo";
      if (assistantLogoSrc) {
        const img = document.createElement("img");
        img.alt = "شعار مُخَطّط";
        img.src = assistantLogoSrc;
        logo.appendChild(img);
      } else {
        logo.textContent = "🤖";
      }

      const txt = document.createElement("div");
      txt.className = "mk-wtext";
      wrap.appendChild(logo);
      wrap.appendChild(txt);
      bubble.appendChild(wrap);

      await typewriter(txt, String(text), speed);
      return;
    }

    await typewriter(bubble, String(text), speed);
  };

  const typewriter = async (el, text, msPerChar) => {
    el.textContent = "";
    // سرعة تعتمد على طول النص (تسريع بسيط للنصوص الطويلة)
    const n = text.length || 1;
    const speed = clamp(msPerChar - Math.floor(n / 220), 6, 22);

    for (let i = 0; i < text.length; i++) {
      el.textContent += text[i];
      if (i % 2 === 0) scrollToBottom();
      await sleep(speed);
    }
    scrollToBottom();
  };

  const showTyping = () => {
    const bubble = addMsgRow("bot");
    const dots = document.createElement("span");
    dots.className = "mk-dots";
    dots.innerHTML = "<i></i><i></i><i></i>";
    bubble.appendChild(dots);
    return bubble;
  };

  // ===== Open / Close =====
  let firstOpen = true;

  const setOpen = async (open) => {
    if (open) {
      panel.classList.add("open");
      if (firstOpen) {
        firstOpen = false;
        if (welcome) {
          await addBotMsgTyped(welcome, { isWelcome: true, speed: 14 });
        }
      }
      // focus after animation tick
      setTimeout(() => input.focus(), 50);
    } else {
      panel.classList.remove("open");
    }
  };

  btn.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  close.addEventListener("click", () => setOpen(false));

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) setOpen(false);
  });

  // Expose small API for the page
  window.MokhattWidget = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!panel.classList.contains("open")),
  };

  // ===== Send logic =====
  const sendMessage = async () => {
    const text = (input.value || "").trim();
    if (!text) return;

    addUserMsg(text);
    input.value = "";
    send.disabled = true;
    input.disabled = true;

    const typingBubble = showTyping();

    try {
      const res = await fetch(cfg.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          visitor_id: visitorId,
          meta: {
            page: location.href,
            userAgent: navigator.userAgent,
          },
        }),
      });

      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      // remove typing
      typingBubble.closest(".mk-msg")?.remove();

      // expected { reply: "..." } or { replies: ["..."] }
      if (Array.isArray(data.replies)) {
        for (const r of data.replies) {
          await addBotMsgTyped(String(r));
        }
      } else {
        const reply = String(data.reply ?? data.output ?? "تم استلام الرسالة، لكن ماكو رد.");
        await addBotMsgTyped(reply);
      }
    } catch (e) {
      console.error(e);
      typingBubble.closest(".mk-msg")?.remove();
      await addBotMsgTyped("صار خطأ بالاتصال. حاول مرة ثانية.");
    } finally {
      send.disabled = false;
      input.disabled = false;
      input.focus();
    }
  };

  send.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
})();
