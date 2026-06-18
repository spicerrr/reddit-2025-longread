const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const fmt = new Intl.NumberFormat("ru-RU");
const projectMonthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
let DATA;
let ASSETS;
let DOSSIERS = [];
let DOSSIER_BY_ID = new Map();
let DOSSIERS_LOADED = false;
let DOSSIERS_LOADING = null;

const projectLinks = Object.freeze({
  colab: "",
  github: "",
});

const DOSSIERS_URL = "data/thread_dossiers.json?v=5.0";

const communityNavVisuals = {
  CasualConversation: { label: "Разговоры", accent: "#ff5a1f", icon: "chat" },
  NoStupidQuestions: { label: "Вопросы", accent: "#7b6cff", icon: "question" },
  gaming: { label: "Игры", accent: "#ff4b16", icon: "gamepad" },
  movies: { label: "Кино", accent: "#d79a1c", icon: "film" },
  news: { label: "Новости", accent: "#ef4f32", icon: "news" },
  science: { label: "Наука", accent: "#36a88e", icon: "flask" },
  technology: { label: "Технологии", accent: "#8a54e8", icon: "chip" },
  worldnews: { label: "Мировые новости", accent: "#5b72c8", icon: "globe" },
};

function communityNavAsset(id, ext) {
  return `assets/community-nav/${String(id).toLowerCase()}.${ext}`;
}

const modeCopy = {
  newsroom: {
    label: "Внешние ссылки",
    title: "Публикации со внешними ссылками",
    body: "В r/worldnews, r/news, r/science и r/technology преобладают публикации со ссылками на внешние сайты. Эти сообщества чаще других используют новостные материалы, научные статьи и технологические публикации как отправную точку обсуждения.",
    cover: "assets/communities/worldnews.webp",
    metricKey: "external",
    metricLabel: "публикаций ведут на внешний сайт",
  },
  forum: {
    label: "Вопросы и текстовые публикации",
    title: "Публикации без внешних ссылок",
    body: "В r/CasualConversation и r/NoStupidQuestions доминируют вопросы и текстовые публикации без внешних ссылок. В них пользователи описывают личный опыт, задают бытовые вопросы и собирают ответы других участников.",
    cover: "assets/communities/casualconversation.webp",
    metricKey: "question",
    metricLabel: "публикаций сформулированы как вопрос",
  },
  fandom: {
    label: "Смешанный формат",
    title: "Ссылки соседствуют с пользовательскими обсуждениями",
    body: "В r/movies и r/gaming публикации со ссылками на трейлеры, релизы и новости соседствуют с рекомендациями, обсуждением франшиз и пользовательскими вопросами.",
    cover: "assets/communities/gaming.webp",
    metricKey: "external",
    metricLabel: "публикаций содержат внешние ссылки",
  },
};

const brandHints = {
  TikTok: "tiktok",
  DeepSeek: "deepseek",
  DOGE: null,
  Musk: "tesla",
  Signal: "signal",
  Google: "google",
  Microsoft: "microsoft",
  Apple: "apple",
  Tesla: "tesla",
  OpenAI: "openai",
  ChatGPT: "openai",
  Instagram: "instagram",
  WhatsApp: "whatsapp",
  Netflix: "netflix",
  Nintendo: "nintendo",
  Steam: "steam",
  Xbox: "xbox",
  PlayStation: "playstation",
  GTA: "rockstargames",
  Battlefield: "ea",
  Disney: "disney",
  Minecraft: "minecraft",
  Cyberpunk: "cdprojekt",
};

function hasEntityImage(name) {
  void name;
  return false;
}

function entityAvatarHtml(name) {
  return `<span>${initials(name)}</span>`;
}

async function init() {
  [DATA, ASSETS] = await Promise.all([
    fetch("data/site_data.json?v=5.0", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить site_data.json");
      return r.json();
    }),
    fetch("data/asset_registry.json?v=5.0", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить asset_registry.json");
      return r.json();
    }),
  ]);
  rebuildDossierIndex([]);

  initThreadReader();

  applyBrandImages(document);
  renderHero();
  renderModes();
  renderWorlds();
  initSemanticMap();
  renderYear();
  renderEntities();
  renderFandoms();
  renderSources();
  renderTopics();
  renderThreads();
  initReveal();
  initProgress();
  initLinks();
}

function formatProjectMonth(value = "") {
  const match = String(value).match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(`${match[1]}-${match[2]}-01T00:00:00Z`);
  return projectMonthFormatter.format(date);
}

function buildFallbackDossiers() {
  return (DATA.semantic_points || []).flatMap((point) => {
    const id = extractThreadId(point.reddit_url);
    if (!id) return [];
    return [
      {
        id,
        title: point.title || "Публикация Reddit",
        subreddit: point.subreddit || "",
        month: point.month || "",
        date: point.month ? `${point.month}-01` : "",
        body: "",
        body_status: "title_only",
        scene: "",
        topic_id: point.topic_id,
        topic_label: "",
        macro: point.macro || "",
        macro_label: macroById(point.macro)?.label || "",
        context:
          "Публикация входит в тематическую карту проекта. Карточка собрана из сохранённых метаданных выгрузки.",
        preview: communityCover(point.subreddit),
        original_url: point.reddit_url || "",
        external_url: "",
        domain: "reddit.com",
        community_title: "",
        related_ids: [],
      },
    ];
  });
}

function rebuildDossierIndex(items = []) {
  const map = new Map();
  items.forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  buildFallbackDossiers().forEach((item) => {
    if (!map.has(item.id)) map.set(item.id, item);
  });
  DOSSIERS = [...map.values()];
  DOSSIER_BY_ID = map;
}

async function ensureDossiersLoaded() {
  if (DOSSIERS_LOADED) return DOSSIERS;
  if (DOSSIERS_LOADING) return DOSSIERS_LOADING;
  DOSSIERS_LOADING = fetch(DOSSIERS_URL, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить thread_dossiers.json");
      return r.json();
    })
    .then((payload) => {
      rebuildDossierIndex(payload.dossiers || []);
      DOSSIERS_LOADED = true;
      return DOSSIERS;
    })
    .finally(() => {
      DOSSIERS_LOADING = null;
    });
  return DOSSIERS_LOADING;
}

function logoUrl(key) {
  return key ? ASSETS.brand_logos[key] || null : null;
}

function makeLogo(key, label, className = "") {
  const url = logoUrl(key);
  if (!url)
    return `<span class="logo-fallback ${className}">${escapeHtml(label)}</span>`;
  return `<img class="${className}" src="${url}" alt="${escapeHtml(label)}" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'logo-fallback ${className}',textContent:'${escapeJs(label)}'}))">`;
}

function applyBrandImages(root = document) {
  $$("[data-brand]", root).forEach((node) => {
    const key = node.dataset.brand;
    const url = logoUrl(key);
    if (url) node.src = url;
  });
}

function extractThreadId(url = "") {
  const match = String(url).match(/\/comments\/([a-z0-9]+)\//i);
  return match ? match[1] : "";
}

function internalThreadHref(url = "") {
  const id = extractThreadId(url);
  return id
    ? `href="#thread-${id}" data-thread-id="${id}"`
    : 'href="#threads" aria-disabled="true" tabindex="-1"';
}

function initThreadReader() {
  const reader = $("#threadReader");
  if (!reader) return;

  const preview = $("#readerPreview");
  const meta = $("#readerMeta");
  const title = $("#readerTitle");
  const badges = $("#readerBadges");
  const context = $("#readerContext");
  const body = $("#readerBody");
  const state = $("#readerSourceState");
  const related = $("#readerRelated");
  const original = $("#readerOriginal");
  const external = $("#readerExternalSource");

  function fallbackPreview(dossier) {
    return communityCover(dossier.subreddit);
  }

  function openShell() {
    reader.classList.add("is-open");
    reader.setAttribute("aria-hidden", "false");
    document.body.classList.add("reader-open");
  }

  function renderLoading(dossier) {
    preview.src = dossier.preview || fallbackPreview(dossier);
    preview.alt = `Превью публикации r/${dossier.subreddit || ""}`;
    meta.textContent = `${dossier.month || ""} · r/${dossier.subreddit || ""}`;
    title.textContent = dossier.title || "Публикация Reddit";
    badges.innerHTML = "<span>Загрузка карточки</span>";
    context.textContent =
      dossier.context ||
      "Сначала показываем сохранённые метаданные, затем догружаем полный архивный текст.";
    body.textContent =
      "Подгружаем thread_dossiers.json только по запросу, чтобы не тянуть полный архив при первом экране.";
    state.innerHTML =
      "<strong>Загрузка архива…</strong><span>Это первое открытие публикации в текущей сессии. Как только архив подгрузится, карточка обновится автоматически.</span>";
    related.innerHTML =
      '<div class="reader-related-empty">Связанные публикации появятся после загрузки архива.</div>';
    original.hidden = true;
    original.removeAttribute("href");
    external.hidden = true;
    external.removeAttribute("href");
  }

  function renderLoadError(dossier, error) {
    preview.src = dossier.preview || fallbackPreview(dossier);
    preview.alt = `Превью публикации r/${dossier.subreddit || ""}`;
    meta.textContent = `${dossier.month || ""} · r/${dossier.subreddit || ""}`;
    title.textContent = dossier.title || "Публикация Reddit";
    badges.innerHTML = "<span>Архив недоступен</span>";
    context.textContent =
      dossier.context ||
      "Карточка осталась на уровне метаданных, потому что архив досье не загрузился.";
    body.textContent =
      "Не удалось догрузить thread_dossiers.json. Остаются только заголовок, месяц и сообщество из основной выгрузки.";
    state.innerHTML = `<strong>Ошибка загрузки</strong><span>${escapeHtml(error.message || "Архив временно недоступен.")}</span>`;
    related.innerHTML =
      '<div class="reader-related-empty">Связанные публикации недоступны, пока файл архива не загрузится.</div>';
    original.hidden = !dossier.original_url;
    if (dossier.original_url) original.href = dossier.original_url;
    external.hidden = true;
    external.removeAttribute("href");
  }

  function renderDossier(dossier) {
    if (!dossier) return;
    preview.src = dossier.preview || fallbackPreview(dossier);
    preview.alt = `Превью публикации r/${dossier.subreddit}`;
    meta.textContent = `${dossier.month || ""} · r/${dossier.subreddit || ""}`;
    title.textContent = dossier.title || "Публикация Reddit";
    badges.innerHTML = [
      dossier.scene ? `<span>${escapeHtml(dossier.scene)}</span>` : "",
      dossier.topic_label
        ? `<span>${escapeHtml(dossier.topic_label)}</span>`
        : "",
      dossier.flair ? `<span>${escapeHtml(dossier.flair)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    context.textContent = dossier.context || "";
    if (dossier.body) {
      body.textContent = dossier.body;
      state.innerHTML =
        "<strong>Текст сохранён</strong><span>Фрагмент взят из выгруженного массива и доступен независимо от состояния оригинальной страницы.</span>";
    } else {
      body.textContent =
        dossier.domain && dossier.domain !== "reddit.com"
          ? `Этот пост вёл на внешний материал ${dossier.domain}. В выгрузке сохранились заголовок, дата, сообщество и контекст, но собственного текста поста не было.`
          : "В выгрузке сохранились заголовок и метаданные публикации, но основной текст отсутствовал или был недоступен уже в момент сбора.";
      state.innerHTML =
        "<strong>Сохранён только заголовок</strong><span>Карточка не восстанавливает удалённый текст и прямо отмечает пробел в архиве.</span>";
    }
    if (dossier.original_url) {
      original.hidden = false;
      original.href = dossier.original_url;
    } else {
      original.hidden = true;
      original.removeAttribute("href");
    }
    if (
      dossier.external_url &&
      dossier.domain &&
      !/reddit\.com$|redd\.it$/i.test(dossier.domain)
    ) {
      external.hidden = false;
      external.href = dossier.external_url;
      external.textContent = `Открыть материал на ${dossier.domain} ↗`;
    } else {
      external.hidden = true;
      external.removeAttribute("href");
    }
    related.innerHTML =
      (dossier.related_ids || [])
        .map((relatedId) => {
          const item = DOSSIER_BY_ID.get(relatedId);
          if (!item) return "";
          return `<a class="reader-related-card" href="#thread-${item.id}" data-thread-id="${item.id}"><small>${escapeHtml(item.month || "")} · r/${escapeHtml(item.subreddit || "")}</small><strong>${escapeHtml(item.title || "")}</strong><span>Открыть публикацию →</span></a>`;
        })
        .join("") ||
      '<div class="reader-related-empty">Для этой публикации связанные примеры пока не добавлены.</div>';
  }

  async function open(id, updateHash = true) {
    const fallback = DOSSIER_BY_ID.get(id);
    if (!fallback) return;
    if (updateHash && location.hash !== `#thread-${id}`) {
      history.pushState({ thread: id }, "", `#thread-${id}`);
    }
    renderLoading(fallback);
    openShell();
    $(".thread-reader-close", reader)?.focus({ preventScroll: true });
    try {
      await ensureDossiersLoaded();
      const dossier = DOSSIER_BY_ID.get(id) || fallback;
      renderDossier(dossier);
    } catch (error) {
      renderLoadError(fallback, error);
    }
  }

  function close(updateHash = true) {
    reader.classList.remove("is-open");
    reader.setAttribute("aria-hidden", "true");
    document.body.classList.remove("reader-open");
    if (updateHash && location.hash.startsWith("#thread-")) {
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}#threads`,
      );
    }
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-thread-id]");
    if (trigger) {
      event.preventDefault();
      open(trigger.dataset.threadId);
      return;
    }
    if (event.target.closest("[data-reader-close]")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && reader.classList.contains("is-open")) close();
  });
  window.addEventListener("popstate", () => {
    const match = location.hash.match(/^#thread-([a-z0-9]+)$/i);
    if (match) open(match[1], false);
    else close(false);
  });
  const initial = location.hash.match(/^#thread-([a-z0-9]+)$/i);
  if (initial) open(initial[1], false);

  window.openThreadDossier = open;
}

function renderHero() {
  const s = DATA.summary;
  $("#heroNumbers").innerHTML = [
    [fmt.format(s.balanced_posts), "постов в равном сравнении"],
    [fmt.format(s.discovery_posts), "публикаций в основном корпусе"],
    [s.communities, "сообществ"],
    [s.months, "месяцев"],
  ]
    .map(
      ([value, label]) =>
        `<div class="hero-number"><b>${value}</b><span>${label}</span></div>`,
    )
    .join("");

  $("#heroCommunityStrip").innerHTML = DATA.subreddits
    .map((item, index) => {
      const visual = communityNavVisuals[item.id] || {
        label: item.title || "Сообщество",
        accent: "#ff4500",
        icon: "chat",
      };
      const navCover = communityNavAsset(item.id, "webp");
      const icon = communityNavAsset(item.id, "svg");

      return `
        <a
          class="hero-community"
          href="#worlds"
          data-community-jump="${escapeHtml(item.id)}"
          style="--community-accent:${visual.accent};--community-icon:url('${escapeHtml(icon)}')"
          aria-label="Открыть r/${escapeHtml(item.id)}"
        >
          <img
            class="hero-community-cover"
            src="${navCover}"
            alt=""
            loading="${index < 4 ? "eager" : "lazy"}"
            decoding="async"
          >
          <span class="hero-community-panel" aria-hidden="true"></span>
          <span class="hero-community-glow"></span>
          <span class="hero-community-footer">
            <span class="hero-community-icon">
              <span class="hero-community-icon-shape" aria-hidden="true"></span>
            </span>
            <span class="hero-community-copy">
              <strong>r/${escapeHtml(item.id)}</strong>
              <span class="hero-community-label">${escapeHtml(
                visual.label,
              )}</span>
            </span>
          </span>
        </a>`;
    })
    .join("");

  $("#heroCommunityStrip").addEventListener("click", (event) => {
    const card = event.target.closest("[data-community-jump]");
    if (!card) return;
    const id = card.dataset.communityJump;
    requestAnimationFrame(() => {
      const target = $(`.world-nav-card[data-id="${CSS.escape(id)}"]`);
      target?.click();
    });
  });
}

function communityCover(subreddit = "") {
  return (
    ASSETS?.communities?.[subreddit]?.cover ||
    `assets/communities/${String(subreddit).toLowerCase()}.webp`
  );
}

function renderModes() {
  $("#modeStories").innerHTML = DATA.mode_cards
    .map((mode) => {
      const copy = modeCopy[mode.id];
      const metric = mode[copy.metricKey] ?? 0;
      const communityChips = mode.communities
        .map(
          (id) =>
            `<span class="mode-community-chip">${makeLogo("reddit", "Reddit")}r/${id}</span>`,
        )
        .join("");
      return `
      <article class="mode-story reveal">
        <div class="mode-story-media"><img src="${copy.cover}" alt="${escapeHtml(copy.title)}" loading="lazy" decoding="async"></div>
        <div class="mode-story-content">
          <div class="mode-label">${copy.label}</div>
          <h3>${copy.title}</h3>
          <p>${copy.body}</p>
          <div class="mode-community-row">${communityChips}</div>
          <div class="mode-metric"><b>${metric.toFixed(1)}%</b><span>${copy.metricLabel}</span></div>
        </div>
      </article>`;
    })
    .join("");
  applyBrandImages($("#modeStories"));
}

function macroById(id) {
  return DATA.macros.find((m) => m.id === id);
}

function renderWorlds() {
  const nav = $("#worldsNav");
  const display = $("#worldDisplay");
  const allThreads = DATA.semantic_points || [];
  const narrativeByMacro = {
    everyday:
      "В этом сообществе заметны личные истории, бытовые вопросы, отношения, работа, праздники и повседневные ситуации.",
    power:
      "В этом сообществе преобладают публикации о политике, международных конфликтах, государственных решениях и их последствиях.",
    technology:
      "В этом сообществе обсуждаются технологические компании, продукты, платформы, данные и последствия цифровых изменений.",
    culture:
      "В этом сообществе представлены релизы, франшизы, пользовательские рекомендации и обсуждения игр, фильмов и сериалов.",
    science:
      "В этом сообществе публикации чаще всего пересказывают исследования и обсуждают научные результаты, здоровье и доказательства.",
  };
  let activeId = DATA.subreddits[0]?.id;

  nav.innerHTML = DATA.subreddits
    .map((item, i) => {
      const cover = communityCover(item.id);
      return `<button class="world-nav-card ${i === 0 ? "is-active" : ""}" data-id="${item.id}">
      <img src="${cover}" alt="" loading="lazy" decoding="async">
      <div>
        <small>r/${item.id}</small>
        <strong>${item.title}</strong>
      </div>
    </button>`;
    })
    .join("");

  function metricPill(label, value, tone = "") {
    return `<div class="world-metric ${tone}"><span>${label}</span><b>${value}</b></div>`;
  }

  function renderDisplay(id) {
    activeId = id;
    $$(".world-nav-card", nav).forEach((node) =>
      node.classList.toggle("is-active", node.dataset.id === id),
    );
    const item = DATA.subreddits.find((s) => s.id === id);
    const cover = communityCover(item.id);
    const threads = allThreads.filter((t) => t.subreddit === id).slice(0, 4);
    const bars = [
      ["Внешние ссылки", item.external],
      ["Вопросы", item.question],
      ["Текстовые посты", item.text],
    ];
    display.innerHTML = `
      <div class="world-hero">
        <img class="world-cover" src="${cover}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
        <div class="world-veil"></div>
        <div class="world-copy">
          <div class="world-kicker">${macroById(item.top_macro).label}</div>
          <h3>r/${item.id}</h3>
          <p class="world-subtitle">${item.title}</p>
          <p class="world-text">${narrativeByMacro[item.top_macro] || ""}</p>
          <div class="world-metrics">
            ${metricPill("Постов в выборке", fmt.format(item.posts), "accent")}
            ${bars.map(([label, val]) => metricPill(label, `${Number(val).toFixed(1)}%`)).join("")}
          </div>
        </div>
      </div>
      <div class="world-bottom">
        <div class="world-bars">
          <div class="world-bars-title">Основные форматы публикаций</div>
          ${bars.map(([label, val]) => `<div class="world-bar-row"><span>${label}</span><div class="world-bar-track"><i style="width:${Math.max(4, Number(val))}%"></i></div><b>${Number(val).toFixed(1)}%</b></div>`).join("")}
        </div>
        <div class="world-threads">
          <div class="world-bars-title">Примеры публикаций</div>
          <div class="world-thread-grid">
            ${threads.map((t) => `<a class="world-thread" ${internalThreadHref(t.reddit_url)}><small>${t.month}</small><strong>${escapeHtml(t.title)}</strong><span>Открыть публикацию →</span></a>`).join("")}
          </div>
        </div>
      </div>`;
  }

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".world-nav-card");
    if (!btn) return;
    renderDisplay(btn.dataset.id);
  });

  renderDisplay(activeId);
}

function initSemanticMap() {
  const canvas = $("#semanticCanvas");
  const miniCanvas = $("#mapMiniCanvas");
  const stage = $("#semanticMapStage");
  const tooltip = $("#semanticTooltip");
  const chips = $("#macroChips");
  const pinned = $("#mapPinnedPosts");
  const zoomIn = $("#mapZoomIn");
  const zoomOut = $("#mapZoomOut");
  const resetButton = $("#mapReset");
  const zoomValue = $("#mapZoomValue");
  const zoomRange = $("#mapPanRange");
  const zoomRangeOut = $("#mapPanPrev");
  const zoomRangeIn = $("#mapPanNext");
  const stageHint = $(".map-stage-hint", stage);

  if (!canvas || !miniCanvas || !stage || !DATA?.semantic_points?.length)
    return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const miniCtx = miniCanvas.getContext("2d", { alpha: true });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const active = new Set(DATA.macros.map((macro) => macro.id));
  const WORLD = {
    width: Number(DATA.semantic_map_meta?.world_width) || 5700,
    height: Number(DATA.semantic_map_meta?.world_height) || 3300,
  };
  const camera = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    zoom: 0.22,
    vx: 0,
    vy: 0,
  };
  const view = { width: 1, height: 1, dpr: 1 };
  const pointer = {
    mode: null,
    id: null,
    node: null,
    moved: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    nodeOffsetX: 0,
    nodeOffsetY: 0,
  };

  let points = [];
  let edges = [];
  let adjacency = [];
  let hovered = null;
  let fitZoom = 0.2;
  let hasInitialCamera = false;
  let animationId = 0;
  let frameActive = true;
  let lastFrame = performance.now();
  let physicsAccumulator = 0;
  let collisionTick = 0;
  let needsDraw = true;
  const spriteCache = new Map();

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function redditMarkSvg() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M38.5 17.5 42 9l9 2.5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="53" cy="12" r="4" fill="currentColor"/>
      <ellipse cx="32" cy="35" rx="21" ry="16" fill="none" stroke="currentColor" stroke-width="4"/>
      <circle cx="10.5" cy="34" r="4.5" fill="currentColor"/>
      <circle cx="53.5" cy="34" r="4.5" fill="currentColor"/>
      <circle cx="24" cy="33" r="3" fill="currentColor"/>
      <circle cx="40" cy="33" r="3" fill="currentColor"/>
      <path d="M22 41c3 3 6.5 4.5 10 4.5S39 44 42 41" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    </svg>`;
  }

  function macroIconHtml(macro, extraClass = "") {
    return `<span class="map-macro-icon ${extraClass}" style="--macro-color:${macro.color}">${redditMarkSvg()}</span>`;
  }

  function safeRedditUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      if (!/^https?:$/.test(url.protocol)) return null;
      const host = url.hostname.toLowerCase();
      if (
        !(
          host === "reddit.com" ||
          host.endsWith(".reddit.com") ||
          host === "redd.it" ||
          host.endsWith(".redd.it")
        )
      )
        return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function hashString(value) {
    let hash = 2166136261;
    const input = String(value);
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function buildGraph() {
    points = DATA.semantic_points
      .map((point, index) => {
        const hash = hashString(`${point.reddit_url}|${index}`);
        const engagement = clamp(Number(point.engagement) || 0, 0, 1);
        const commentCount = Math.max(0, Number(point.num_comments) || 0);
        // Screen size is deliberately non-linear: zero-comment posts remain small,
        // while long threads become visibly larger even at the fitted view.
        const visualDiameter = 6 + Math.pow(engagement, 0.72) * 27;
        const collisionRadius = 24 + visualDiameter * 1.45;
        const anchorX = Number(point.anchor_x ?? point.map_x);
        const anchorY = Number(point.anchor_y ?? point.map_y);
        return {
          ...point,
          index,
          id: extractThreadId(point.reddit_url),
          url: safeRedditUrl(point.reddit_url),
          x: anchorX + (((hash >>> 8) % 1000) / 1000 - 0.5) * 8,
          y: anchorY + (((hash >>> 18) % 1000) / 1000 - 0.5) * 8,
          ax: anchorX,
          ay: anchorY,
          vx: (((hash >>> 4) % 1000) / 1000 - 0.5) * 0.16,
          vy: (((hash >>> 14) % 1000) / 1000 - 0.5) * 0.16,
          phase: ((hash % 10000) / 10000) * Math.PI * 2,
          radius: collisionRadius,
          visualDiameter,
          commentCount,
          mass: 0.9 + Math.pow(engagement, 0.55) * 2.8,
          engagement,
          screen: null,
          dragged: false,
        };
      })
      .filter(
        (point) =>
          point.url && Number.isFinite(point.x) && Number.isFinite(point.y),
      );

    adjacency = Array.from({ length: points.length }, () => []);
    edges = (DATA.semantic_edges || [])
      .map((edge) => ({
        source: Number(edge.source),
        target: Number(edge.target),
        similarity: clamp(Number(edge.similarity) || 0, 0, 1),
        crossMacro: Boolean(edge.cross_macro),
        shared: edge.shared || [],
      }))
      .filter((edge) => points[edge.source] && points[edge.target]);

    edges.forEach((edge, edgeIndex) => {
      adjacency[edge.source].push(edgeIndex);
      adjacency[edge.target].push(edgeIndex);
    });

    if (stageHint) {
      stageHint.innerHTML = `<span>✦</span> ${fmt.format(points.length)} публикаций · размер показывает относительную активность обсуждения · линии показывают общий словарь`;
    }
  }

  const macroCounts = new Map(
    DATA.macros.map((macro) => [
      macro.id,
      DATA.semantic_points.filter((point) => point.macro === macro.id).length,
    ]),
  );
  chips.innerHTML = DATA.macros
    .map(
      (macro) => `
    <button class="macro-chip macro-chip-v2 active" data-macro="${macro.id}" aria-pressed="true" style="--macro-color:${macro.color}">
      ${macroIconHtml(macro)}
      <span class="macro-chip-copy"><strong>${escapeHtml(macro.label)}</strong><small>${fmt.format(macroCounts.get(macro.id) || 0)}</small></span>
    </button>`,
    )
    .join("");

  function directPostHref(point) {
    return point?.url
      ? `href="${escapeHtml(point.url)}" target="_blank" rel="noopener noreferrer"`
      : 'href="#map" aria-disabled="true" tabindex="-1"';
  }

  function renderPinned(macroId = "technology") {
    const candidates = points
      .filter((point) => point.macro === macroId)
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 4);
    const macro = macroById(macroId) || DATA.macros[0];
    pinned.innerHTML = candidates
      .map(
        (point) => `
      <a class="map-pinned-post map-pinned-post-v2" ${directPostHref(point)} style="--macro-color:${macro.color}">
        ${macroIconHtml(macro)}
        <span class="map-pinned-copy">
          <small>r/${escapeHtml(point.subreddit)} · ${escapeHtml(point.date || point.month)} · ${fmt.format(point.num_comments || 0)} комм.</small>
          <strong>${escapeHtml(point.title)}</strong>
        </span>
      </a>`,
      )
      .join("");
  }

  function resizeCanvasElement(target, context, width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    target.width = Math.max(1, Math.round(width * dpr));
    target.height = Math.max(1, Math.round(height * dpr));
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return dpr;
  }

  function zoomLimits() {
    return { min: fitZoom * 0.88, max: Math.max(fitZoom * 10, 2.2) };
  }

  function cameraBounds() {
    const halfW = view.width / (2 * camera.zoom);
    const halfH = view.height / (2 * camera.zoom);
    const overscan = 260;
    return {
      minX: halfW >= WORLD.width / 2 ? WORLD.width / 2 : halfW - overscan,
      maxX:
        halfW >= WORLD.width / 2
          ? WORLD.width / 2
          : WORLD.width - halfW + overscan,
      minY: halfH >= WORLD.height / 2 ? WORLD.height / 2 : halfH - overscan,
      maxY:
        halfH >= WORLD.height / 2
          ? WORLD.height / 2
          : WORLD.height - halfH + overscan,
    };
  }

  function clampCamera() {
    const bounds = cameraBounds();
    camera.x = clamp(camera.x, bounds.minX, bounds.maxX);
    camera.y = clamp(camera.y, bounds.minY, bounds.maxY);
  }

  function zoomToSlider(zoom) {
    const limits = zoomLimits();
    const ratio =
      Math.log(zoom / limits.min) / Math.log(limits.max / limits.min);
    return Math.round(clamp(ratio, 0, 1) * 1000);
  }

  function sliderToZoom(value) {
    const limits = zoomLimits();
    const ratio = clamp(Number(value) / 1000, 0, 1);
    return limits.min * Math.pow(limits.max / limits.min, ratio);
  }

  function updateControls() {
    if (zoomRange) {
      const value = zoomToSlider(camera.zoom);
      zoomRange.value = String(value);
      zoomRange.style.setProperty("--zoom-progress", `${value / 10}%`);
    }
    if (zoomValue)
      zoomValue.value = `${Math.round((camera.zoom / fitZoom) * 100)}%`;
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    view.width = Math.max(640, rect.width);
    view.height = Math.max(720, rect.height);
    view.dpr = resizeCanvasElement(canvas, ctx, view.width, view.height);
    const miniRect = miniCanvas.getBoundingClientRect();
    resizeCanvasElement(
      miniCanvas,
      miniCtx,
      Math.max(160, miniRect.width),
      Math.max(95, miniRect.height),
    );
    fitZoom =
      Math.min(view.width / WORLD.width, view.height / WORLD.height) * 0.94;
    if (!hasInitialCamera) {
      camera.zoom = fitZoom * 1.03;
      camera.x = WORLD.width / 2;
      camera.y = WORLD.height / 2;
      hasInitialCamera = true;
    } else {
      const limits = zoomLimits();
      camera.zoom = clamp(camera.zoom, limits.min, limits.max);
    }
    clampCamera();
    updateControls();
    needsDraw = true;
  }

  function worldToScreen(node) {
    return {
      x: (node.x - camera.x) * camera.zoom + view.width / 2,
      y: (node.y - camera.y) * camera.zoom + view.height / 2,
    };
  }

  function screenToWorld(x, y) {
    return {
      x: camera.x + (x - view.width / 2) / camera.zoom,
      y: camera.y + (y - view.height / 2) / camera.zoom,
    };
  }

  function drawBackdrop() {
    ctx.clearRect(0, 0, view.width, view.height);
    const bg = ctx.createRadialGradient(
      view.width * 0.5,
      view.height * 0.47,
      0,
      view.width * 0.5,
      view.height * 0.47,
      Math.max(view.width, view.height) * 0.75,
    );
    bg.addColorStop(0, "#142946");
    bg.addColorStop(0.55, "#08182b");
    bg.addColorStop(1, "#020813");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  function spriteFor(color, diameter, emphasized = false) {
    const rounded = Math.max(5, Math.round(diameter * 2) / 2);
    const key = `${color}:${rounded}:${emphasized ? 1 : 0}`;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const dpr = 3;
    const padding = rounded * (emphasized ? 2.35 : 1.65);
    const cssSize = rounded + padding * 2;
    const sprite = document.createElement("canvas");
    sprite.width = Math.ceil(cssSize * dpr);
    sprite.height = Math.ceil(cssSize * dpr);
    const sctx = sprite.getContext("2d");
    sctx.scale(dpr, dpr);
    const cx = cssSize / 2;
    const cy = cssSize / 2;
    const r = rounded / 2;
    const halo = sctx.createRadialGradient(
      cx,
      cy,
      r * 0.1,
      cx,
      cy,
      r + padding * 0.88,
    );
    halo.addColorStop(0, hexToRgba(color, emphasized ? 0.95 : 0.72));
    halo.addColorStop(0.28, hexToRgba(color, emphasized ? 0.42 : 0.25));
    halo.addColorStop(1, hexToRgba(color, 0));
    sctx.fillStyle = halo;
    sctx.fillRect(0, 0, cssSize, cssSize);
    sctx.beginPath();
    sctx.arc(cx, cy, r, 0, Math.PI * 2);
    sctx.fillStyle = color;
    sctx.fill();
    sctx.strokeStyle = "rgba(255,255,255,.92)";
    sctx.lineWidth = Math.max(0.6, rounded * 0.072);
    sctx.stroke();
    const mark = rounded;
    sctx.strokeStyle = "rgba(255,255,255,.98)";
    sctx.fillStyle = "rgba(255,255,255,.98)";
    sctx.lineWidth = Math.max(0.7, mark * 0.085);
    sctx.lineCap = "round";
    sctx.beginPath();
    sctx.moveTo(cx + mark * 0.05, cy - mark * 0.2);
    sctx.lineTo(cx + mark * 0.18, cy - mark * 0.31);
    sctx.stroke();
    sctx.beginPath();
    sctx.arc(cx + mark * 0.23, cy - mark * 0.34, mark * 0.047, 0, Math.PI * 2);
    sctx.fill();
    sctx.beginPath();
    sctx.ellipse(
      cx,
      cy + mark * 0.035,
      mark * 0.265,
      mark * 0.2,
      0,
      0,
      Math.PI * 2,
    );
    sctx.stroke();
    sctx.beginPath();
    sctx.arc(cx - mark * 0.275, cy + mark * 0.01, mark * 0.052, 0, Math.PI * 2);
    sctx.arc(cx + mark * 0.275, cy + mark * 0.01, mark * 0.052, 0, Math.PI * 2);
    sctx.fill();
    sctx.beginPath();
    sctx.arc(cx - mark * 0.09, cy, mark * 0.031, 0, Math.PI * 2);
    sctx.arc(cx + mark * 0.09, cy, mark * 0.031, 0, Math.PI * 2);
    sctx.fill();
    sctx.beginPath();
    sctx.arc(cx, cy + mark * 0.03, mark * 0.13, 0.18, Math.PI - 0.18);
    sctx.stroke();
    const result = { canvas: sprite, cssSize };
    spriteCache.set(key, result);
    return result;
  }

  function visibleNode(node) {
    return active.has(node.macro);
  }

  function physicsStep(dt, now) {
    const step = clamp(dt / 16.667, 0.25, 1.65);
    const t = now * 0.001;

    // Very weak anchors keep the archipelago legible without turning it into five balls.
    for (const node of points) {
      if (!visibleNode(node) || node.dragged) continue;
      const homeStrength =
        (0.000075 + node.bridge_strength * 0.000018) / node.mass;
      node.vx += (node.ax - node.x) * homeStrength * step;
      node.vy += (node.ay - node.y) * homeStrength * step;
      if (!reducedMotion) {
        node.vx += Math.sin(t * 0.29 + node.phase) * 0.01 * step;
        node.vy += Math.cos(t * 0.23 + node.phase * 1.41) * 0.009 * step;
      }
    }

    // Semantic links only pull when posts are too far apart. They never compress
    // already-near nodes, so related posts form loose filaments and bridges.
    for (const edge of edges) {
      const a = points[edge.source];
      const b = points[edge.target];
      if (
        !a ||
        !b ||
        !visibleNode(a) ||
        !visibleNode(b) ||
        (a.dragged && b.dragged)
      )
        continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const rest = edge.crossMacro
        ? 360 + (1 - edge.similarity) * 220
        : 155 + (1 - edge.similarity) * 170;
      if (dist <= rest) continue;
      const stiffness = edge.crossMacro ? 0.000018 : 0.000038;
      const force =
        clamp(
          (dist - rest) * stiffness * (0.5 + edge.similarity),
          0,
          edge.crossMacro ? 0.025 : 0.035,
        ) * step;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.dragged) {
        a.vx += fx / a.mass;
        a.vy += fy / a.mass;
      }
      if (!b.dragged) {
        b.vx -= fx / b.mass;
        b.vy -= fy / b.mass;
      }
    }

    // Local soft repulsion creates air around every post. It acts beyond collision
    // distance, producing clouds with visible gaps instead of compact heaps.
    collisionTick += 1;
    if (collisionTick % 2 === 0) {
      const cellSize = 150;
      const grid = new Map();
      for (const node of points) {
        if (!visibleNode(node)) continue;
        const cx = Math.floor(node.x / cellSize);
        const cy = Math.floor(node.y / cellSize);
        const key = `${cx},${cy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(node);
      }
      for (const node of points) {
        if (!visibleNode(node) || node.dragged) continue;
        const cx = Math.floor(node.x / cellSize);
        const cy = Math.floor(node.y / cellSize);
        for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
          for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
            const bucket = grid.get(`${gx},${gy}`);
            if (!bucket) continue;
            for (const other of bucket) {
              if (other.index <= node.index || !visibleNode(other)) continue;
              let dx = other.x - node.x;
              let dy = other.y - node.y;
              let dist = Math.hypot(dx, dy);
              if (dist < 0.001) {
                const angle = (node.phase + other.phase) * 0.5;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
                dist = 1;
              }
              const hardDistance = node.radius + other.radius + 10;
              const softRange = hardDistance + 82;
              if (dist >= softRange) continue;
              const overlapRatio = clamp((softRange - dist) / softRange, 0, 1);
              const hardBoost = dist < hardDistance ? 1.8 : 1;
              const push =
                Math.pow(overlapRatio, 1.8) * 0.085 * hardBoost * step;
              const px = (dx / dist) * push;
              const py = (dy / dist) * push;
              if (!node.dragged) {
                node.vx -= px / node.mass;
                node.vy -= py / node.mass;
              }
              if (!other.dragged) {
                other.vx += px / other.mass;
                other.vy += py / other.mass;
              }
            }
          }
        }
      }
    }

    for (const node of points) {
      if (!visibleNode(node) || node.dragged) continue;
      const damping = Math.pow(0.955, step);
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx * step;
      node.y += node.vy * step;
      node.x = clamp(node.x, 90, WORLD.width - 90);
      node.y = clamp(node.y, 90, WORLD.height - 90);
    }
  }

  function drawEdges() {
    ctx.save();
    ctx.lineCap = "round";
    for (const edge of edges) {
      const a = points[edge.source];
      const b = points[edge.target];
      if (!a?.screen || !b?.screen || !visibleNode(a) || !visibleNode(b))
        continue;
      const highlighted =
        hovered && (hovered.index === a.index || hovered.index === b.index);
      const strongEnough = edge.similarity >= (edge.crossMacro ? 0.13 : 0.11);
      if (!highlighted && !strongEnough) continue;
      const alpha = highlighted
        ? 0.82
        : edge.crossMacro
          ? 0.13 + edge.similarity * 0.22
          : 0.035 + edge.similarity * 0.16;
      const color = highlighted
        ? macroById(hovered.macro)?.color || "#ffffff"
        : edge.crossMacro
          ? "#c7d7ef"
          : "#8eabc9";
      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.lineWidth = highlighted
        ? 1.6
        : edge.crossMacro
          ? 0.85
          : 0.45 + edge.similarity * 0.75;
      ctx.setLineDash(edge.crossMacro ? [5, 7] : []);
      ctx.beginPath();
      ctx.moveTo(a.screen.x, a.screen.y);
      const midX = (a.screen.x + b.screen.x) / 2;
      const midY =
        (a.screen.y + b.screen.y) / 2 -
        Math.min(22, Math.abs(a.screen.x - b.screen.x) * 0.025);
      ctx.quadraticCurveTo(midX, midY, b.screen.x, b.screen.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawNodes(time) {
    const connected = new Set();
    if (hovered) {
      for (const edgeIndex of adjacency[hovered.index] || []) {
        const edge = edges[edgeIndex];
        connected.add(
          edge.source === hovered.index ? edge.target : edge.source,
        );
      }
    }
    const zoomRatio = camera.zoom / Math.max(fitZoom, 0.001);
    const scaleFactor = clamp(Math.pow(zoomRatio, 0.38), 0.78, 1.95);
    for (const node of points) {
      node.screen = null;
      if (!visibleNode(node)) continue;
      const screen = worldToScreen(node);
      const pulse = reducedMotion
        ? 0
        : Math.sin(time * 0.0011 + node.phase) * 0.16;
      const emphasized =
        hovered?.index === node.index ||
        connected.has(node.index) ||
        node.engagement > 0.9;
      const diameter = clamp(
        node.visualDiameter * scaleFactor +
          pulse +
          (hovered?.index === node.index ? 3 : 0),
        5.5,
        58,
      );
      const margin = diameter * 4;
      if (
        screen.x < -margin ||
        screen.x > view.width + margin ||
        screen.y < -margin ||
        screen.y > view.height + margin
      )
        continue;
      const macro = macroById(node.macro);
      const sprite = spriteFor(macro.color, diameter, emphasized);
      ctx.globalAlpha = hovered && !emphasized ? 0.52 : 0.95;
      ctx.drawImage(
        sprite.canvas,
        screen.x - sprite.cssSize / 2,
        screen.y - sprite.cssSize / 2,
        sprite.cssSize,
        sprite.cssSize,
      );
      ctx.globalAlpha = 1;
      node.screen = {
        ...screen,
        diameter,
        hitSize: Math.max(8, diameter * 0.63),
      };
    }
  }

  function drawMiniMap() {
    const rect = miniCanvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    miniCtx.clearRect(0, 0, width, height);
    miniCtx.fillStyle = "#06111f";
    miniCtx.fillRect(0, 0, width, height);
    for (const node of points) {
      if (!visibleNode(node)) continue;
      const macro = macroById(node.macro);
      miniCtx.fillStyle = hexToRgba(macro.color, 0.72);
      miniCtx.beginPath();
      miniCtx.arc(
        (node.x / WORLD.width) * width,
        (node.y / WORLD.height) * height,
        1 + node.engagement * 1.2,
        0,
        Math.PI * 2,
      );
      miniCtx.fill();
    }
    const visibleWorldW = view.width / camera.zoom;
    const visibleWorldH = view.height / camera.zoom;
    const left = ((camera.x - visibleWorldW / 2) / WORLD.width) * width;
    const top = ((camera.y - visibleWorldH / 2) / WORLD.height) * height;
    const boxW = (visibleWorldW / WORLD.width) * width;
    const boxH = (visibleWorldH / WORLD.height) * height;
    miniCtx.fillStyle = "rgba(255,255,255,.035)";
    miniCtx.fillRect(left, top, boxW, boxH);
    miniCtx.strokeStyle = "rgba(255,255,255,.9)";
    miniCtx.lineWidth = 1.2;
    miniCtx.strokeRect(left, top, boxW, boxH);
  }

  function draw(timestamp = performance.now()) {
    drawBackdrop();
    // Screen coordinates are needed before edges are drawn.
    for (const node of points) {
      if (!visibleNode(node)) {
        node.screen = null;
        continue;
      }
      const screen = worldToScreen(node);
      const zoomRatio = camera.zoom / Math.max(fitZoom, 0.001);
      const diameter = clamp(
        node.visualDiameter * Math.pow(zoomRatio, 0.38),
        5.5,
        58,
      );
      node.screen = {
        ...screen,
        diameter,
        hitSize: Math.max(8, diameter * 0.63),
      };
    }
    drawEdges();
    drawNodes(timestamp);
    drawMiniMap();
  }

  function hitTest(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const node of points) {
      if (!visibleNode(node) || !node.screen) continue;
      const distance = Math.hypot(node.screen.x - x, node.screen.y - y);
      if (distance <= node.screen.hitSize && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  function showTooltip(node) {
    if (!node?.screen) {
      tooltip.hidden = true;
      return;
    }
    const macro = macroById(node.macro);
    const width = 360;
    const height = 196;
    let left = node.screen.x + 18;
    let top = node.screen.y + 18;
    if (left + width > view.width - 16) left = node.screen.x - width - 18;
    if (top + height > view.height - 86) top = node.screen.y - height - 18;
    left = clamp(left, 16, Math.max(16, view.width - width - 16));
    top = clamp(top, 16, Math.max(16, view.height - height - 16));
    const keywords = (node.keywords || []).slice(0, 3);
    tooltip.hidden = false;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.setProperty("--tooltip-color", macro.color);
    tooltip.innerHTML = `
      <div class="map-tooltip-header">
        ${macroIconHtml(macro, "map-tooltip-reddit")}
        <div class="map-tooltip-meta"><strong>r/${escapeHtml(node.subreddit)}</strong><time>${escapeHtml(node.date || node.month || "")}</time></div>
      </div>
      <div class="map-tooltip-title">${escapeHtml(node.title)}</div>
      <div class="map-tooltip-stats"><span><b>${fmt.format(node.num_comments || 0)}</b> комментариев</span><span><b>${fmt.format(node.score || 0)}</b> рейтинг</span></div>
      ${keywords.length ? `<div class="map-tooltip-keywords">${keywords.map((word) => `<span>${escapeHtml(word)}</span>`).join("")}</div>` : ""}
      <div class="map-tooltip-bottom"><span class="map-tooltip-world"><i style="background:${macro.color}"></i>${escapeHtml(macro.label)}</span><span class="map-tooltip-open">Открыть Reddit ↗</span></div>`;
  }

  function setZoom(
    nextZoom,
    anchorX = view.width / 2,
    anchorY = view.height / 2,
  ) {
    const oldZoom = camera.zoom;
    const worldAtAnchorX = camera.x + (anchorX - view.width / 2) / oldZoom;
    const worldAtAnchorY = camera.y + (anchorY - view.height / 2) / oldZoom;
    const limits = zoomLimits();
    camera.zoom = clamp(nextZoom, limits.min, limits.max);
    camera.x = worldAtAnchorX - (anchorX - view.width / 2) / camera.zoom;
    camera.y = worldAtAnchorY - (anchorY - view.height / 2) / camera.zoom;
    camera.vx = 0;
    camera.vy = 0;
    clampCamera();
    updateControls();
    needsDraw = true;
  }

  function resetView() {
    for (const node of points) {
      node.ax = Number(node.anchor_x ?? node.map_x);
      node.ay = Number(node.anchor_y ?? node.map_y);
      node.x = node.ax;
      node.y = node.ay;
      node.vx = 0;
      node.vy = 0;
    }
    camera.zoom = fitZoom * 1.03;
    camera.x = WORLD.width / 2;
    camera.y = WORLD.height / 2;
    camera.vx = 0;
    camera.vy = 0;
    hovered = null;
    tooltip.hidden = true;
    clampCamera();
    updateControls();
    needsDraw = true;
  }

  function openNode(node) {
    if (!node?.url) return;
    const opened = window.open(node.url, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
  }

  chips.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-macro]");
    if (!button) return;
    const id = button.dataset.macro;
    if (active.has(id) && active.size === 1) return;
    if (active.has(id)) active.delete(id);
    else active.add(id);
    button.classList.toggle("active", active.has(id));
    button.setAttribute("aria-pressed", String(active.has(id)));
    renderPinned(active.has(id) ? id : [...active][0]);
    hovered = null;
    tooltip.hidden = true;
    needsDraw = true;
  });

  zoomIn?.addEventListener("click", () => setZoom(camera.zoom * 1.25));
  zoomOut?.addEventListener("click", () => setZoom(camera.zoom / 1.25));
  resetButton?.addEventListener("click", resetView);
  zoomRange?.addEventListener("input", () =>
    setZoom(sliderToZoom(zoomRange.value)),
  );
  zoomRangeOut?.addEventListener("click", () => setZoom(camera.zoom / 1.18));
  zoomRangeIn?.addEventListener("click", () => setZoom(camera.zoom * 1.18));

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const node = hitTest(sx, sy);
    pointer.mode = node ? "node" : "camera";
    pointer.node = node;
    pointer.id = event.pointerId;
    pointer.moved = false;
    pointer.startX = pointer.lastX = event.clientX;
    pointer.startY = pointer.lastY = event.clientY;
    pointer.lastTime = performance.now();
    if (node) {
      const world = screenToWorld(sx, sy);
      pointer.nodeOffsetX = node.x - world.x;
      pointer.nodeOffsetY = node.y - world.y;
      node.dragged = true;
      node.vx = 0;
      node.vy = 0;
      canvas.classList.add("is-node-dragging");
    } else {
      camera.vx = 0;
      camera.vy = 0;
      canvas.classList.add("is-dragging");
    }
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    if (pointer.mode && event.pointerId === pointer.id) {
      event.preventDefault();
      const total = Math.hypot(
        event.clientX - pointer.startX,
        event.clientY - pointer.startY,
      );
      if (total > 4) pointer.moved = true;
      const now = performance.now();
      const dt = Math.max(8, now - pointer.lastTime);
      if (pointer.mode === "node" && pointer.node) {
        const world = screenToWorld(sx, sy);
        const nextX = world.x + pointer.nodeOffsetX;
        const nextY = world.y + pointer.nodeOffsetY;
        pointer.node.vx = (nextX - pointer.node.x) * (16.67 / dt);
        pointer.node.vy = (nextY - pointer.node.y) * (16.67 / dt);
        pointer.node.x = nextX;
        pointer.node.y = nextY;
        hovered = pointer.node;
        showTooltip(hovered);
      } else {
        const dx = event.clientX - pointer.lastX;
        const dy = event.clientY - pointer.lastY;
        camera.x -= dx / camera.zoom;
        camera.y -= dy / camera.zoom;
        camera.vx = (-dx / camera.zoom) * (16.67 / dt);
        camera.vy = (-dy / camera.zoom) * (16.67 / dt);
        clampCamera();
        hovered = null;
        tooltip.hidden = true;
      }
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.lastTime = now;
      needsDraw = true;
      return;
    }
    const next = hitTest(sx, sy);
    if (next?.index !== hovered?.index) {
      hovered = next;
      showTooltip(hovered);
      needsDraw = true;
    } else if (hovered) showTooltip(hovered);
    canvas.style.cursor = hovered ? "pointer" : "grab";
  });

  function finishPointer(event) {
    if (!pointer.mode || event.pointerId !== pointer.id) return;
    event.preventDefault();
    try {
      if (canvas.hasPointerCapture(pointer.id))
        canvas.releasePointerCapture(pointer.id);
    } catch {}
    const node = pointer.node;
    if (pointer.mode === "node" && node) {
      node.dragged = false;
      if (pointer.moved) {
        // The dropped position becomes a soft new home; physics keeps it alive rather than snapping back.
        node.ax = node.x;
        node.ay = node.y;
        node.vx *= 0.35;
        node.vy *= 0.35;
      } else {
        openNode(node);
        node.vx = 0;
        node.vy = 0;
      }
    }
    pointer.mode = null;
    pointer.node = null;
    canvas.classList.remove("is-dragging", "is-node-dragging");
    needsDraw = true;
  }
  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);
  canvas.addEventListener("lostpointercapture", () => {
    if (pointer.node) pointer.node.dragged = false;
    pointer.mode = null;
    pointer.node = null;
    canvas.classList.remove("is-dragging", "is-node-dragging");
  });
  canvas.addEventListener("pointerleave", () => {
    if (!pointer.mode) {
      hovered = null;
      tooltip.hidden = true;
      canvas.style.cursor = "grab";
      needsDraw = true;
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.00118);
      setZoom(
        camera.zoom * factor,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    { passive: false },
  );
  canvas.addEventListener("dblclick", (event) => {
    const rect = canvas.getBoundingClientRect();
    setZoom(
      camera.zoom * 1.5,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  });
  canvas.addEventListener("keydown", (event) => {
    const step = 100 / camera.zoom;
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "0",
      ].includes(event.key)
    )
      event.preventDefault();
    if (event.key === "ArrowLeft") camera.x -= step;
    if (event.key === "ArrowRight") camera.x += step;
    if (event.key === "ArrowUp") camera.y -= step;
    if (event.key === "ArrowDown") camera.y += step;
    if (event.key === "+" || event.key === "=")
      return setZoom(camera.zoom * 1.2);
    if (event.key === "-") return setZoom(camera.zoom / 1.2);
    if (event.key === "0") return resetView();
    clampCamera();
    needsDraw = true;
  });

  function moveCameraFromMini(event) {
    const rect = miniCanvas.getBoundingClientRect();
    camera.x =
      (clamp(event.clientX - rect.left, 0, rect.width) / rect.width) *
      WORLD.width;
    camera.y =
      (clamp(event.clientY - rect.top, 0, rect.height) / rect.height) *
      WORLD.height;
    camera.vx = 0;
    camera.vy = 0;
    clampCamera();
    updateControls();
    needsDraw = true;
  }
  miniCanvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    miniCanvas.setPointerCapture(event.pointerId);
    moveCameraFromMini(event);
  });
  miniCanvas.addEventListener("pointermove", (event) => {
    if (miniCanvas.hasPointerCapture(event.pointerId))
      moveCameraFromMini(event);
  });

  function loop(timestamp) {
    if (!frameActive) return;
    const dt = Math.min(45, timestamp - lastFrame || 16.67);
    lastFrame = timestamp;
    physicsAccumulator += dt;
    const physicsInterval = reducedMotion ? 80 : 33.34;
    while (physicsAccumulator >= physicsInterval) {
      physicsStep(physicsInterval, timestamp);
      physicsAccumulator -= physicsInterval;
      needsDraw = true;
    }
    if (
      !pointer.mode &&
      (Math.abs(camera.vx) > 0.03 || Math.abs(camera.vy) > 0.03)
    ) {
      camera.x += camera.vx;
      camera.y += camera.vy;
      camera.vx *= 0.9;
      camera.vy *= 0.9;
      clampCamera();
      needsDraw = true;
    }
    if (!reducedMotion) needsDraw = true;
    if (needsDraw) {
      draw(timestamp);
      updateControls();
      needsDraw = false;
    }
    animationId = requestAnimationFrame(loop);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  const visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      frameActive = entry.isIntersecting;
      cancelAnimationFrame(animationId);
      if (frameActive) {
        lastFrame = performance.now();
        animationId = requestAnimationFrame(loop);
      }
    },
    { threshold: 0.01 },
  );
  visibilityObserver.observe(stage);

  buildGraph();
  renderPinned();
  resize();
  animationId = requestAnimationFrame(loop);
}
function renderYear() {
  const steps = $("#monthSteps");
  const visual = $("#monthVisual");
  const image = $(".month-visual-image img", visual);
  const kicker = $(".month-visual-kicker", visual);
  const title = $("h3", visual);
  const brands = $(".month-brand-row", visual);
  const stats = $(".month-visual-stats", visual);
  image.loading = "lazy";
  image.decoding = "async";

  steps.innerHTML = DATA.months
    .map(
      (m, index) => `
    <article class="month-step ${index === 0 ? "is-active" : ""}" data-index="${index}">
      <div class="month-step-card">
        <div class="month-step-kicker">${m.month_name} 2025 · ${m.label}</div>
        <h3>${m.title}</h3>
        <p>${monthNarrative(m)}</p>
        <div class="month-step-posts">${m.examples
          .slice(0, 3)
          .map(
            (p) =>
              `<a class="month-step-post" ${internalThreadHref(p.url)}><small>r/${p.subreddit}</small><strong>${escapeHtml(p.title)}</strong></a>`,
          )
          .join("")}</div>
      </div>
    </article>`,
    )
    .join("");

  function update(index) {
    const m = DATA.months[index];
    $$(".month-step").forEach((node, i) =>
      node.classList.toggle("is-active", i === index),
    );
    visual.classList.add("is-changing");
    setTimeout(() => {
      image.src = m.art || `assets/months/${m.month}.webp`;
      image.alt = `${m.month_name}: ${m.title}`;
      kicker.textContent = `${m.month_name} 2025`;
      title.textContent = m.title;
      brands.innerHTML = brandChipsForScene(m);
      stats.innerHTML = `<span>${m.count || "—"} упоминаний в пике</span><span>${m.community_spread} сообществ</span>`;
      applyBrandImages(brands);
      visual.classList.remove("is-changing");
    }, 180);
  }
  update(0);

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) update(+visible.target.dataset.index);
    },
    { rootMargin: "-20% 0px -50% 0px", threshold: [0.15, 0.35, 0.6] },
  );
  $$(".month-step").forEach((step) => observer.observe(step));
}

function monthNarrative(month) {
  const narratives = {
    "2025-01":
      "В январе платформенные названия вышли за пределы технологических сообществ: TikTok обсуждали как политический объект, DeepSeek — как новый технологический вызов.",
    "2025-02":
      "DOGE оказался сразу в нескольких языках: в новостях — как политический проект, в технологиях — как управленческий эксперимент, в вопросах — как источник растерянности.",
    "2025-03":
      "Повестка распалась между геополитикой и безопасностью коммуникаций. Гренландия и Канада соседствовали с Signal и утечками сообщений.",
    "2025-04":
      "Один месяц вместил тарифы, смерть Папы Франциска и культурные релизы. Именно так общий Reddit превращается в несколько несинхронных календарей.",
    "2025-05":
      "В мае выросло число публикаций об Индии и Пакистане в новостных сообществах, а в r/gaming усилилось внимание к GTA и The Witcher.",
    "2025-06":
      "В июне публикации об Иране одновременно участились в r/worldnews, r/news и r/technology.",
    "2025-07":
      "В июле в культурных сообществах выросло число публикаций о Superman и Stop Killing Games.",
    "2025-08":
      "Переговоры и Battlefield показали две версии одного месяца: дипломатическую и игровую.",
    "2025-09":
      "Charlie Kirk и Borderlands стали параллельными центрами внимания, каждый внутри своей части платформы.",
    "2025-10":
      "Halloween, Nobel и Xbox сделали октябрь многослойным: ритуал, институт и платформа одновременно.",
    "2025-11":
      "В ноябре выросло число публикаций о Thanksgiving и социальных платформах.",
    "2025-12":
      "Christmas прошёл через семь сообществ и стал редким общим ритуалом, хотя каждый сабреддит говорил о нём по-своему.",
  };
  return (
    narratives[month.month] ||
    "Основные темы месяца собраны по реальным всплескам слов, названий и публикаций."
  );
}

function brandChipsForScene(month) {
  const terms = month.label.split(/\s*\+\s*|\s*–\s*|,\s*/).slice(0, 4);
  return terms
    .map((term) => {
      const key = Object.entries(brandHints).find(([name]) =>
        term.toLowerCase().includes(name.toLowerCase()),
      )?.[1];
      return `<span class="brand-chip">${makeLogo(key, term)}${escapeHtml(term)}</span>`;
    })
    .join("");
}

const entityDashboardState = {
  category: "all",
  showTrends: true,
  selected: null,
};

const entityCategoryCopy = {
  all: {
    title: "Все категории",
    copy: "Десять объектов с наибольшим числом упоминаний. Линия показывает помесячную динамику, круг — число упоминаний в конкретном месяце.",
  },
  person: {
    title: "Лица",
    copy: "Здесь показаны публичные фигуры, которые чаще других упоминались в выбранных сообществах в течение года.",
  },
  country: {
    title: "Страны и политические субъекты",
    copy: "В этой вкладке показаны страны, территории и политические субъекты, которые чаще упоминались в новостных и политических публикациях.",
  },
  platform: {
    title: "Платформы и технологические бренды",
    copy: "Здесь показаны платформы и технологические бренды, чьи упоминания росли из-за запусков, регулирования, обновлений и пользовательских обсуждений.",
  },
};

const personEntityNames = new Set([
  "Donald Trump",
  "Elon Musk",
  "Vladimir Putin",
]);

const platformEntityNames = new Set([
  "Google",
  "Microsoft",
  "TikTok",
  "Apple",
  "Tesla",
  "ChatGPT",
  "OpenAI",
]);

const countryFlags = {
  Ukraine: "🇺🇦",
  "United States": "🇺🇸",
  China: "🇨🇳",
  Russia: "🇷🇺",
  Israel: "🇮🇱",
  India: "🇮🇳",
  Iran: "🇮🇷",
  Canada: "🇨🇦",
  Japan: "🇯🇵",
  Pakistan: "🇵🇰",
  Gaza: "◉",
  Europe: "🇪🇺",
  Hamas: "H",
  "White House": "WH",
};

const platformBrandKeys = {
  Google: "google",
  Microsoft: "microsoft",
  TikTok: "tiktok",
  Apple: "apple",
  Tesla: "tesla",
  ChatGPT: "openai",
  OpenAI: "openai",
};

const entityMonthLabels = [
  "ЯНВ",
  "ФЕВ",
  "МАР",
  "АПР",
  "МАЙ",
  "ИЮН",
  "ИЮЛ",
  "АВГ",
  "СЕН",
  "ОКТ",
  "НОЯ",
  "ДЕК",
];

const entityMonthNames = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function getEntityCategory(entity) {
  if (personEntityNames.has(entity.entity)) return "person";
  if (
    platformEntityNames.has(entity.entity) ||
    entity.entity_type === "PLATFORM_OR_BRAND"
  )
    return "platform";
  return "country";
}

function entityItemsForCategory(category) {
  const sorted = [...DATA.entities].sort((a, b) => b.mentions - a.mentions);
  if (category === "all") return sorted.slice(0, 10);
  return sorted.filter((item) => getEntityCategory(item) === category);
}

function buildEntitySeriesMap() {
  const months = Array.from(
    { length: 12 },
    (_, i) => `2025-${String(i + 1).padStart(2, "0")}`,
  );
  const map = new Map(
    DATA.entities.map((item) => [item.entity, months.map(() => 0)]),
  );
  (DATA.entity_timeline || []).forEach((row) => {
    const monthIndex = months.indexOf(row.month);
    if (monthIndex < 0 || !map.has(row.entity)) return;
    map.get(row.entity)[monthIndex] += Number(row.mentions) || 0;
  });
  return { months, map };
}

function entityPalette(category, index) {
  const palettes = {
    person: ["#ff5a1f", "#8b5cf6", "#d9465f", "#f59e0b"],
    country: ["#315fbd", "#ef4444", "#0f9f75", "#f59e0b", "#64748b", "#2563eb"],
    platform: [
      "#7c3aed",
      "#22a447",
      "#111827",
      "#ef4444",
      "#0ea5e9",
      "#a855f7",
    ],
  };
  const key = category === "all" ? "country" : category;
  return palettes[key][index % palettes[key].length];
}

function entityColor(entity, index = 0) {
  const category = getEntityCategory(entity || {});
  return entityPalette(category, index);
}

function entityAvatarContent(item) {
  const category = getEntityCategory(item);
  if (category === "platform") {
    const key = platformBrandKeys[item.entity];
    return makeLogo(key, item.entity, "entity-brand-logo");
  }
  if (category === "country") {
    return `<span class="entity-flag">${countryFlags[item.entity] || initials(item.entity)}</span>`;
  }
  return entityAvatarHtml(item.entity);
}

function entitySeries(item, seriesMap) {
  return seriesMap.get(item.entity) || Array(12).fill(0);
}

function sparklineSvg(values, color, label = "") {
  const W = 210;
  const H = 52;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => ({
    x: 4 + (index * (W - 8)) / Math.max(values.length - 1, 1),
    y: H - 6 - (value / max) * (H - 16),
  }));
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points.at(-1).x.toFixed(1)},${H - 4} L${points[0].x.toFixed(1)},${H - 4} Z`;
  const peakIndex = values.indexOf(max);
  const peak = points[peakIndex] || points[0];
  return `<svg class="entity-sparkline" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">
    <defs><linearGradient id="spark-${Math.abs(hashEntity(label))}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path class="entity-spark-area" d="${area}" fill="url(#spark-${Math.abs(hashEntity(label))})"/>
    <path class="entity-spark-line" d="${line}" stroke="${color}"/>
    <circle cx="${peak.x}" cy="${peak.y}" r="3.2" fill="${color}"/>
  </svg>`;
}

function hashEntity(value) {
  return [...String(value)].reduce(
    (hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0,
    0,
  );
}

function svgEntityVisual(item, index, x, y, size = 40) {
  const category = getEntityCategory(item);
  const color = entityColor(item, index);
  if (category === "person") {
    const monogram = initials(item.entity);
    return `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="#fff" stroke="${color}" stroke-width="2"/>
      <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="${monogram.length > 2 ? 11 : 16}" font-weight="800" fill="${color}">${escapeHtml(monogram)}</text>`;
  }
  if (category === "platform") {
    const url = logoUrl(platformBrandKeys[item.entity]);
    if (url) {
      return `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="#fff" stroke="${color}" stroke-width="2"/>
        <image href="${url}" x="${x - size * 0.29}" y="${y - size * 0.29}" width="${size * 0.58}" height="${size * 0.58}" preserveAspectRatio="xMidYMid meet"/>`;
    }
  }
  const flag = countryFlags[item.entity] || initials(item.entity);
  return `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="#fff" stroke="${color}" stroke-width="2"/>
    <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="${flag.length > 3 ? 11 : 21}" font-weight="800" fill="${color}">${escapeHtml(flag)}</text>`;
}

function smoothEntityPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const midX = (prev.x + current.x) / 2;
    path += ` C${midX},${prev.y} ${midX},${current.y} ${current.x},${current.y}`;
  }
  return path;
}

function entityCardContext(item) {
  const category = getEntityCategory(item);
  if (category === "person") return `Охват: ${item.communities} сообществ`;
  if (category === "platform") return `Видна в ${item.communities} сообществах`;
  return `Упоминается в ${item.communities} сообществах`;
}

function renderEntities() {
  const tabs = $("#entityTabs");
  const trendToggle = $("#entityTrendToggle");
  if (!tabs || !trendToggle) return;

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entity-category]");
    if (!button) return;
    entityDashboardState.category = button.dataset.entityCategory;
    entityDashboardState.selected = null;
    $$(".entity-tab", tabs).forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderEntityDashboard();
  });

  trendToggle.addEventListener("change", () => {
    entityDashboardState.showTrends = trendToggle.checked;
    $(".entity-calendar-panel")?.classList.toggle(
      "hide-entity-trends",
      !trendToggle.checked,
    );
  });

  renderEntityDashboard();
}

function renderEntityDashboard() {
  const { months, map: seriesMap } = buildEntitySeriesMap();
  const items = entityItemsForCategory(entityDashboardState.category);
  const copy = entityCategoryCopy[entityDashboardState.category];
  $("#entityCategoryTitle").textContent = copy.title;
  $("#entityCategoryCopy").textContent = copy.copy;
  $("#entityLeaderCount").textContent = `${items.length} объектов`;
  renderEntityTimeline(items, months, seriesMap);
  renderEntityLeaders(items, seriesMap);
  renderEntitySpikes(items, seriesMap);
}

function renderEntityTimeline(items, months, seriesMap) {
  const svg = $("#entityTimeline");
  const tooltip = $("#entityTooltip");
  const W = 1080;
  const rowGap = 68;
  const pad = { l: 178, r: 24, t: 62, b: 30 };
  const H = pad.t + Math.max(items.length, 1) * rowGap + pad.b;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.height = `${H}px`;
  const x = (index) => pad.l + (index * (W - pad.l - pad.r)) / 11;
  const maxVisible = Math.max(
    ...items.flatMap((item) => entitySeries(item, seriesMap)),
    1,
  );
  let out = `<g class="entity-month-axis">${months.map((month, index) => `<text x="${x(index)}" y="24" text-anchor="middle">${entityMonthLabels[index]}</text>`).join("")}</g>`;

  items.forEach((item, itemIndex) => {
    const values = entitySeries(item, seriesMap);
    const rowY = pad.t + itemIndex * rowGap + 20;
    const color = entityColor(item, itemIndex);
    const peak = Math.max(...values, 1);
    const points = values.map((value, monthIndex) => ({
      x: x(monthIndex),
      y: rowY - (value / peak) * 5,
      value,
      monthIndex,
    }));
    const selected = entityDashboardState.selected === item.entity;
    out += `<g class="entity-timeline-row${selected ? " is-selected" : ""}" data-entity-row="${escapeHtml(item.entity)}">
      <rect class="entity-row-hit" x="0" y="${rowY - 30}" width="${W}" height="60" rx="18"/>
      ${svgEntityVisual(item, itemIndex, 32, rowY - 2, 42)}
      <text class="entity-row-name" x="62" y="${rowY + 3}">${escapeHtml(item.entity)}</text>
      <text class="entity-row-total" x="62" y="${rowY + 20}">${fmt.format(item.mentions)} за год</text>
      <path class="entity-row-line" d="${smoothEntityPath(points)}" stroke="${color}"/>
      ${points
        .map((point) => {
          const radius = point.value
            ? 3.6 + (Math.log1p(point.value) / Math.log1p(maxVisible)) * 15
            : 2.6;
          const isPeak = point.value === peak && point.value > 0;
          return `<g class="entity-point-wrap" data-entity="${escapeHtml(item.entity)}" data-month="${months[point.monthIndex]}" data-mentions="${point.value}" tabindex="0" role="button" aria-label="${escapeHtml(item.entity)}, ${entityMonthNames[point.monthIndex]}: ${point.value} упоминаний">
          ${isPeak ? `<circle class="entity-point-halo" cx="${point.x}" cy="${point.y}" r="${radius + 8}" fill="${color}"/>` : ""}
          <circle class="entity-point" cx="${point.x}" cy="${point.y}" r="${radius}" fill="${color}"/>
          <circle class="entity-point-core" cx="${point.x}" cy="${point.y}" r="${Math.max(1.8, radius * 0.34)}"/>
        </g>`;
        })
        .join("")}
    </g>`;
  });

  svg.innerHTML = out;
  $(".entity-calendar-panel")?.classList.toggle(
    "hide-entity-trends",
    !entityDashboardState.showTrends,
  );

  const showTooltip = (target, event) => {
    if (!target) return;
    const monthIndex = Number(target.dataset.month.slice(5)) - 1;
    tooltip.hidden = false;
    tooltip.style.left = `${event.clientX + 16}px`;
    tooltip.style.top = `${event.clientY + 16}px`;
    tooltip.innerHTML = `<strong>${escapeHtml(target.dataset.entity)}</strong><small>${entityMonthNames[monthIndex]} 2025 · ${fmt.format(Number(target.dataset.mentions))} упоминаний</small>`;
  };

  svg.onmousemove = (event) => {
    const point = event.target.closest(".entity-point-wrap");
    if (!point) {
      tooltip.hidden = true;
      return;
    }
    showTooltip(point, event);
  };
  svg.onmouseleave = () => (tooltip.hidden = true);
  svg.onclick = (event) => {
    const point = event.target.closest(".entity-point-wrap");
    const row = event.target.closest("[data-entity-row]");
    const name = point?.dataset.entity || row?.dataset.entityRow;
    if (!name) return;
    entityDashboardState.selected = name;
    renderEntityDashboard();
  };
}

function renderEntityLeaders(items, seriesMap) {
  const leaders = items.slice(0, 6);
  $("#entityCards").innerHTML = leaders
    .map((item, index) => {
      const color = entityColor(item, index);
      const series = entitySeries(item, seriesMap);
      const peakIndex = series.indexOf(Math.max(...series));
      const selected = entityDashboardState.selected === item.entity;
      return `<button class="entity-leader-card${selected ? " is-selected" : ""}" type="button" data-entity-select="${escapeHtml(item.entity)}" style="--entity-card-color:${color}">
      <span class="entity-rank">${index + 1}</span>
      <span class="entity-card-avatar">${entityAvatarContent(item)}</span>
      <span class="entity-card-copy">
        <strong>${escapeHtml(item.entity)}</strong>
        <small>r/${escapeHtml(item.top_community)}</small>
      </span>
      <span class="entity-card-count">${fmt.format(item.mentions)}<small>упоминаний</small></span>
      <span class="entity-card-context">${entityCardContext(item)} · пик: ${entityMonthNames[peakIndex]}</span>
      ${sparklineSvg(series, color, `Динамика ${item.entity}`)}
    </button>`;
    })
    .join("");

  $("#entityCards").onclick = (event) => {
    const card = event.target.closest("[data-entity-select]");
    if (!card) return;
    entityDashboardState.selected = card.dataset.entitySelect;
    renderEntityDashboard();
  };
}

function renderEntitySpikes(items, seriesMap) {
  const spikes = items
    .map((item, index) => {
      const values = entitySeries(item, seriesMap);
      let best = { delta: values[0], monthIndex: 0 };
      for (let i = 1; i < values.length; i += 1) {
        const delta = values[i] - values[i - 1];
        if (delta > best.delta) best = { delta, monthIndex: i };
      }
      return { item, values, color: entityColor(item, index), ...best };
    })
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 4);

  $("#entitySpikes").innerHTML = spikes
    .map(
      ({ item, values, color, delta, monthIndex }) => `
    <button class="entity-spike-card" type="button" data-entity-select="${escapeHtml(item.entity)}" style="--entity-card-color:${color}">
      <span class="entity-spike-avatar">${entityAvatarContent(item)}</span>
      <span class="entity-spike-title"><strong>${escapeHtml(item.entity)}</strong><small>${entityMonthNames[monthIndex]}</small></span>
      <b>+${fmt.format(Math.max(delta, 0))}</b>
      <span>упоминаний к прошлому месяцу</span>
      ${sparklineSvg(values, color, `Всплеск ${item.entity}`)}
    </button>`,
    )
    .join("");

  $("#entitySpikes").onclick = (event) => {
    const card = event.target.closest("[data-entity-select]");
    if (!card) return;
    entityDashboardState.selected = card.dataset.entitySelect;
    renderEntityDashboard();
  };
}

function renderFandoms() {
  const fandoms = [...DATA.fandoms].sort((a, b) =>
    String(a.peak_month).localeCompare(String(b.peak_month)),
  );
  $("#fandomWall").innerHTML = fandoms
    .map((f, i) => {
      const slug = f.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const logoKey = ASSETS.fandom_logo_map[f.name] || null;
      const peakMonthLabel = formatProjectMonth(f.peak_month);
      return `
      <article class="fandom-poster reveal">
        <a ${internalThreadHref(f.reddit_url)}>
          <img class="fandom-poster-bg" src="${f.cover || `assets/fandom-posters/${slug}.webp`}" alt="Редакционная обложка ${escapeHtml(f.name)}" loading="lazy" decoding="async">
          <div class="fandom-poster-shade"></div>
          <div class="fandom-logo-wrap"><div class="fandom-logo">${makeLogo(logoKey, f.name)}</div><span class="fandom-index">${String(i + 1).padStart(2, "0")}</span></div>
          <div class="fandom-caption"><strong>${escapeHtml(f.name)}</strong><span>${f.mentions} упоминаний · пик ${escapeHtml(peakMonthLabel)} · r/${f.community}</span></div>
        </a>
      </article>`;
    })
    .join("");
  applyBrandImages($("#fandomWall"));
}

const sourceBrandAccents = {
  "youtube.com": "#ff0033",
  "reuters.com": "#ff8000",
  "theguardian.com": "#052962",
  "bbc.com": "#b80000",
  "psypost.org": "#6842c2",
  "apnews.com": "#e21d2d",
  "nature.com": "#163a5f",
  "nytimes.com": "#292522",
  "doi.org": "#2a6fdb",
  "cnn.com": "#cc0000",
  "nbcnews.com": "#3565a8",
  "sciencedirect.com": "#f36f21",
  "theverge.com": "#e026a3",
  "cnbc.com": "#1976a3",
  "bloomberg.com": "#0b5fff",
};

function canonicalSourceDomain(domain = "") {
  const clean = String(domain).trim().toLowerCase();
  if (["youtu.be", "www.youtube.com", "m.youtube.com"].includes(clean))
    return "youtube.com";
  return clean;
}

function normalizedSources(items = []) {
  const byDomain = new Map();
  items.forEach((source) => {
    const domain = canonicalSourceDomain(source.domain);
    if (!domain) return;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, {
        domain,
        posts: 0,
        communities: new Map(),
        mark:
          source.mark ||
          `assets/sources/${domain.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}.svg`,
      });
    }
    const target = byDomain.get(domain);
    target.posts += Number(source.posts) || 0;
    (source.communities || []).forEach((flow) => {
      target.communities.set(
        flow.subreddit,
        (target.communities.get(flow.subreddit) || 0) +
          (Number(flow.posts) || 0),
      );
    });
  });
  return [...byDomain.values()]
    .map((source) => ({
      ...source,
      communities: [...source.communities.entries()]
        .map(([subreddit, posts]) => ({ subreddit, posts }))
        .sort((a, b) => b.posts - a.posts)
        .slice(0, 5),
    }))
    .sort((a, b) => b.posts - a.posts);
}

function sourceLogoHtml(source) {
  const path =
    source.mark ||
    `assets/sources/${source.domain.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}.svg`;
  const fallback = sourceLabel(source.domain).slice(0, 2).toUpperCase();
  return `<img src="${path}" alt="${escapeHtml(sourceLabel(source.domain))}" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'source-logo-fallback',textContent:'${escapeJs(fallback)}'}))">`;
}

function renderSources() {
  const list = $("#sourceList");
  const targets = $("#sourceTargets");
  const svg = $("#sourceFlow");
  const communities = DATA.subreddits.map((s) => s.id);
  const sources = normalizedSources(DATA.sources);

  list.innerHTML = sources
    .map((source, i) => {
      const accent = sourceBrandAccents[source.domain] || "#ff4500";
      const label = sourceLabel(source.domain);
      const posts = `${fmt.format(source.posts)} ссылок`;
      const topCommunities = source.communities
        .slice(0, 3)
        .map((item) => `r/${item.subreddit}`)
        .join(" · ");
      const tooltip = `${source.domain}\n${label}\n${posts}`;
      return `<button class="source-card source-card-icon" type="button" data-source="${i}" data-tooltip="${escapeHtml(tooltip)}" style="--source-accent:${accent}" aria-label="${escapeHtml(tooltip)}" aria-pressed="false"><span class="source-logo">${sourceLogoHtml(source)}</span><span class="source-card-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(posts)}</small><span class="source-card-communities">${escapeHtml(topCommunities)}</span></span></button>`;
    })
    .join("");

  targets.innerHTML = DATA.subreddits
    .map((s) => {
      const cover = communityCover(s.id);
      return `<article class="source-target" data-target="${s.id}"><img src="${cover}" alt="" loading="lazy" decoding="async"><span><strong>r/${s.id}</strong><small>${s.title}</small></span></article>`;
    })
    .join("");

  let selectedSourceIndex = null;

  function activateSource(index = selectedSourceIndex) {
    const activeIndex = Number.isInteger(index) && sources[index] ? index : null;
    $$(".source-card", list).forEach((node, i) => {
      const isActive = i === activeIndex;
      node.classList.toggle("active", isActive);
      node.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    const activeTargets =
      activeIndex === null
        ? new Set()
        : new Set(sources[activeIndex].communities.map((item) => item.subreddit));
    $$(".source-target", targets).forEach((node) =>
      node.classList.toggle("active", activeTargets.has(node.dataset.target)),
    );
    draw(activeIndex);
  }

  function draw(activeIndex = null) {
    const stage = svg.parentElement.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${stage.width} ${stage.height}`);
    let paths = "";
    sources.forEach((source, si) => {
      const card = list.children[si]?.getBoundingClientRect();
      if (!card) return;
      source.communities.forEach((flow) => {
        const ti = communities.indexOf(flow.subreddit);
        if (ti < 0) return;
        const target = targets.children[ti].getBoundingClientRect();
        const y1 = card.top + card.height / 2 - stage.top;
        const y2 = target.top + target.height / 2 - stage.top;
        const x1 = 6,
          x2 = stage.width - 6,
          mid = stage.width * 0.5;
        const width = Math.max(1.2, Math.sqrt(flow.posts));
        const isActive = activeIndex === si;
        const dim =
          activeIndex !== null && !isActive ? 0.045 : isActive ? 0.78 : 0.2;
        const stroke = isActive
          ? sourceBrandAccents[source.domain] || "#ff4500"
          : "#ff6b4a";
        paths += `<path class="flow-line ${isActive ? "active" : ""}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}" stroke="${stroke}" stroke-opacity="${dim}" stroke-width="${width}" stroke-dasharray="7 7"/>`;
      });
    });
    svg.innerHTML = paths;
  }

  list.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".source-card");
    if (!card) return;
    activateSource(+card.dataset.source);
  });
  list.addEventListener("focusin", (e) => {
    const card = e.target.closest(".source-card");
    if (!card) return;
    activateSource(+card.dataset.source);
  });
  list.addEventListener("click", (e) => {
    const card = e.target.closest(".source-card");
    if (!card) return;
    const index = +card.dataset.source;
    selectedSourceIndex = selectedSourceIndex === index ? null : index;
    activateSource(selectedSourceIndex);
  });
  list.addEventListener("mouseleave", () => {
    activateSource(selectedSourceIndex);
  });
  list.addEventListener("focusout", (event) => {
    if (list.contains(event.relatedTarget)) return;
    activateSource(selectedSourceIndex);
  });
  activateSource(null);
  window.addEventListener("resize", () => activateSource(selectedSourceIndex));
}

function renderTopics() {
  const select = $("#topicSelect");
  select.innerHTML = DATA.topic_lenses
    .map((topic) => `<option value="${topic.id}">${topic.label}</option>`)
    .join("");

  function update() {
    const topic = DATA.topic_lenses.find((item) => item.id === +select.value);
    const macro = macroById(topic.macro);
    $("#topicOverview").innerHTML = `
      <article class="topic-summary" style="--topic-color:${macro.color}">
        <div class="kicker">${macro.label}</div>
        <h3>${topic.label}</h3>
        <p>${macro.description}</p>
      </article>
      <div class="topic-meta">
        <div><b>${fmt.format(topic.posts)}</b><span>публикаций в теме</span></div>
        <div><b>${topic.peak_month}</b><span>месяц максимальной частоты</span></div>
        <div><b>${topic.communities[0].share.toFixed(1)}%</b><span>доля в r/${topic.communities[0].subreddit}</span></div>
        <div><b>${topic.words.length}</b><span>характерных слов и выражений</span></div>
      </div>`;

    $("#dialectClouds").innerHTML = topic.dialects
      .map((dialect) => {
        const max = Math.max(...dialect.words.map((word) => word.weight), 1);
        return `<article class="dialect-card reveal"><h3>r/${dialect.subreddit}</h3><div class="word-cloud">${dialect.words.map((word, i) => `<span style="font-size:${14 + (23 * word.weight) / max}px;animation-delay:${-i * 0.23}s">${escapeHtml(word.text)}</span>`).join("")}</div></article>`;
      })
      .join("");

    $("#topicPosts").innerHTML = topic.posts_examples
      .map(
        (post) =>
          `<a class="thread-card" ${internalThreadHref(post.reddit_url)}><small>r/${post.subreddit} · ${post.month}</small><strong>${escapeHtml(post.title)}</strong><span>Открыть публикацию →</span></a>`,
      )
      .join("");
    initReveal();
  }
  select.addEventListener("change", update);
  update();
}

function renderThreads() {
  $("#threadGallery").innerHTML = DATA.threads
    .map(
      (thread, i) => `
    <article class="thread-preview reveal">
      <img src="${
        thread.preview ||
        (i < 12
          ? `assets/thread-previews/thread_${String(i + 1).padStart(2, "0")}.webp`
          : communityCover(thread.subreddit))
      }" alt="Превью публикации r/${thread.subreddit}" loading="lazy" decoding="async">
      <div class="thread-preview-meta"><span>${thread.month} · r/${thread.subreddit}</span><span>${thread.scene}</span></div>
      <a ${internalThreadHref(thread.url)} aria-label="Открыть публикацию"></a>
    </article>`,
    )
    .join("");
}

function initLinks() {
  [
    ["colabLink", projectLinks.colab],
    ["githubLink", projectLinks.github],
  ].forEach(([id, url]) => {
    const node = $(`#${id}`);
    if (!node) return;
    if (!url) {
      node.hidden = true;
      node.removeAttribute("href");
      node.setAttribute("aria-hidden", "true");
      return;
    }
    node.hidden = false;
    node.removeAttribute("aria-hidden");
    node.href = url;
  });
}

function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  $$(".reveal:not(.is-visible)").forEach((node) => observer.observe(node));
}

function initProgress() {
  window.addEventListener(
    "scroll",
    () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      $(".reading-progress span").style.width =
        `${(scrollY / Math.max(max, 1)) * 100}%`;
    },
    { passive: true },
  );
}

function sourceLabel(domain) {
  const labels = {
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "reuters.com": "Reuters",
    "theguardian.com": "The Guardian",
    "bbc.com": "BBC",
    "psypost.org": "PsyPost",
    "apnews.com": "Associated Press",
    "nature.com": "Nature",
    "nytimes.com": "The New York Times",
    "doi.org": "DOI",
    "cnn.com": "CNN",
    "nbcnews.com": "NBC News",
    "sciencedirect.com": "ScienceDirect",
    "theverge.com": "The Verge",
    "cnbc.com": "CNBC",
    "bloomberg.com": "Bloomberg",
  };
  return labels[domain] || domain;
}

function initials(value) {
  return String(value)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255,
    g = (value >> 8) & 255,
    b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
}
function escapeJs(value) {
  return String(value).replace(/['\\]/g, "\\$&");
}

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="position:fixed;z-index:9999;left:20px;top:20px;max-width:520px;background:white;color:#111;padding:16px;border:2px solid #d00;border-radius:12px">${escapeHtml(error.message)}. Запустите сайт через <code>python3 serve.py</code>.</div>`,
  );
});
