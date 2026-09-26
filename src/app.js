import { sampleData } from "./data/sampleData.js";
import {
  buildPlatformComparison,
  buildRecommendations,
  calculateAudit,
  calculateKpis,
  classifyPerformance,
  detectAnomalies,
  engagementRate,
  filterPosts,
  getContentPattern,
  percentChange,
  rankPosts,
  scoreLabel,
  sortPosts,
  summarizeBy,
  totalInteractions
} from "./analytics.js";

const number = new Intl.NumberFormat("es-PE");
const decimal = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" });

const state = {
  period: "30",
  platform: "all",
  account: "all",
  format: "all",
  performance: "all",
  topic: "all",
  campaign: "all",
  search: "",
  sort: "engagement-desc",
  user: null,
  csrfToken: null,
  needsInitialAdmin: false,
  authReady: false,
  apiAvailable: true,
  users: null,
  organizations: null,
  persistedIntegrations: null,
  savedReports: null,
  liveData: null,
  oauthNotice: null,
  mfaChallengeToken: null,
  mfaSetup: null,
  recoveryCodes: null,
  accountNotice: null,
  accountPreviewUrl: null,
  emailVerificationToken: null,
  passwordResetToken: null
};

const oauthParameters = new URLSearchParams(window.location.search);
state.emailVerificationToken = oauthParameters.get("verifyEmail");
state.passwordResetToken = oauthParameters.get("resetPassword");
if (oauthParameters.get("oauth")) {
  state.oauthNotice = {
    platform: oauthParameters.get("oauth"),
    status: oauthParameters.get("status"),
    reason: oauthParameters.get("reason")
  };
  history.replaceState({}, "", window.location.pathname + window.location.hash);
} else if (state.emailVerificationToken || state.passwordResetToken) {
  history.replaceState({}, "", window.location.pathname + (window.location.hash || "#/cuenta"));
}

const routes = {
  dashboard: {
    eyebrow: "Resumen ejecutivo",
    title: "Dashboard",
    description: "Estado general, tendencias y decisiones prioritarias.",
    render: renderDashboard
  },
  auditoria: {
    eyebrow: "Diagnostico integral",
    title: "Auditoria",
    description: "Evaluacion transparente de salud, reglas y dimensiones de la cuenta.",
    render: renderAuditPage
  },
  metricas: {
    eyebrow: "Analisis detallado",
    title: "Metricas",
    description: "Comunidad, alcance, impresiones, engagement, video y conversion.",
    render: renderMetricsPage
  },
  contenido: {
    eyebrow: "Rendimiento editorial",
    title: "Contenido",
    description: "Publicaciones, rankings, formatos, temas y patrones de rendimiento.",
    render: renderContentPage
  },
  audiencia: {
    eyebrow: "Comunidad",
    title: "Audiencia",
    description: "Caracteristicas y comportamiento disponibles segun cada plataforma.",
    render: renderAudiencePage
  },
  comparativas: {
    eyebrow: "Analisis multicanal",
    title: "Comparativas",
    description: "Comparacion responsable entre plataformas y periodos.",
    render: renderComparisonPage
  },
  insights: {
    eyebrow: "Analisis inteligente",
    title: "Insights",
    description: "Datos observados, interpretaciones, hipotesis e impacto.",
    render: renderInsightsPage
  },
  recomendaciones: {
    eyebrow: "Plan de accion",
    title: "Recomendaciones",
    description: "Acciones priorizadas y respaldadas por evidencia.",
    render: renderRecommendationsPage
  },
  reportes: {
    eyebrow: "Comunicacion ejecutiva",
    title: "Reportes",
    description: "Informe profesional listo para revisar, imprimir o descargar.",
    render: renderReportsPage
  },
  integraciones: {
    eyebrow: "Fuentes de datos",
    title: "Integraciones",
    description: "Estado de conexiones, cobertura de metricas y sincronizacion.",
    render: renderIntegrationsPage
  },
  configuracion: {
    eyebrow: "Administracion",
    title: "Configuracion",
    description: "Usuarios, roles, permisos y reglas del sistema.",
    render: renderSettingsPage
  },
  cuenta: {
    eyebrow: "Acceso seguro",
    title: "Cuenta",
    description: "Registro inicial, inicio de sesion y control de la sesion activa.",
    render: renderAccountPage
  }
};

const elements = {
  root: document.querySelector("#view-root"),
  navigation: document.querySelector("#main-navigation"),
  filters: document.querySelector("#global-filters"),
  period: document.querySelector("#period-filter"),
  platform: document.querySelector("#platform-filter"),
  account: document.querySelector("#account-filter"),
  format: document.querySelector("#format-filter"),
  sync: document.querySelector("#last-sync"),
  title: document.querySelector("#page-title"),
  eyebrow: document.querySelector("#page-eyebrow"),
  description: document.querySelector("#page-description"),
  reportShortcut: document.querySelector("#report-shortcut"),
  authArea: document.querySelector("#auth-area"),
  status: document.querySelector("#app-status")
};

async function apiRequest(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  const method = String(options.method || "GET").toUpperCase();
  if (options.body && typeof options.body !== "string") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  if (!["GET", "HEAD"].includes(method) && state.csrfToken) {
    headers["x-csrf-token"] = state.csrfToken;
  }
  const response = await fetch("/api/v1" + path, {
    ...options,
    method,
    headers,
    credentials: "same-origin"
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    const error = new Error(payload.message || (payload.details || []).join(" ") || "No se pudo completar la operacion.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function can(permission) {
  return Boolean(state.user && state.user.permissions.includes(permission));
}

async function bootstrapAuth() {
  try {
    const setup = await apiRequest("/auth/setup");
    if (typeof setup.needsInitialAdmin !== "boolean") {
      throw new Error("La API de autenticacion no esta disponible.");
    }
    state.apiAvailable = true;
    state.needsInitialAdmin = setup.needsInitialAdmin;
    if (!setup.needsInitialAdmin) {
      try {
        const session = await apiRequest("/auth/me");
        state.user = session.user;
        state.csrfToken = session.csrfToken;
      } catch (error) {
        if (error.status !== 401) throw error;
      }
    }
  } catch {
    state.apiAvailable = false;
    state.needsInitialAdmin = false;
  } finally {
    state.authReady = true;
  }
}

async function processAccountLink() {
  if (!state.apiAvailable || !state.emailVerificationToken) return;
  try {
    await apiRequest("/auth/email-verification/confirm", {
      method: "POST",
      body: { token: state.emailVerificationToken }
    });
    state.accountNotice = { message: "Correo verificado correctamente.", error: false };
    if (state.user) {
      const session = await apiRequest("/auth/me");
      state.user = session.user;
      state.csrfToken = session.csrfToken;
    }
  } catch (error) {
    state.accountNotice = { message: error.message, error: true };
  } finally {
    state.emailVerificationToken = null;
    window.location.hash = "#/cuenta";
  }
}

async function loadLiveData() {
  state.liveData = null;
  if (!state.user || !state.apiAvailable) return;
  try {
    const payload = await apiRequest("/analytics/dashboard");
    if (payload.accounts?.length) state.liveData = payload;
  } catch (error) {
    elements.status.textContent = error.message;
  }
  updateAccountOptions();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentRoute() {
  const requested = window.location.hash.replace(/^#\//, "").split("/")[0];
  return routes[requested] ? requested : "dashboard";
}

function activeData() {
  return state.liveData?.accounts?.length ? state.liveData : sampleData;
}

function getVisibleAccounts() {
  return activeData().accounts.filter(function (account) {
    const platformMatches = state.platform === "all" || account.platform === state.platform;
    const accountMatches = state.account === "all" || account.id === state.account;
    return platformMatches && accountMatches;
  });
}

function getVisiblePosts() {
  const availablePosts = activeData().posts;
  if (!availablePosts.length) return [];
  const latestDate = new Date(Math.max(...availablePosts.map(function (post) {
    return new Date(post.date).getTime();
  })));
  const days = Number(state.period);
  const periodPosts = availablePosts.filter(function (post) {
    const age = (latestDate - new Date(post.date)) / 86400000;
    return age < days;
  });
  return filterPosts(periodPosts, state);
}

function allAnalysis() {
  const accounts = getVisibleAccounts();
  const posts = getVisiblePosts();
  const kpis = calculateKpis(accounts, posts);
  const isOfficial = Boolean(state.liveData?.accounts?.length);
  const audit = isOfficial
    ? calculateOfficialAudit(accounts, posts, kpis)
    : calculateAudit(kpis, posts);
  const anomalies = isOfficial ? calculateOfficialInsights(posts) : detectAnomalies(posts);
  const topPosts = rankPosts(posts, "top");
  const bottomPosts = rankPosts(posts, "bottom");
  const recommendations = isOfficial
    ? buildOfficialRecommendations(posts, topPosts, bottomPosts)
    : buildRecommendations(kpis, anomalies, topPosts, bottomPosts);
  return { accounts, posts, kpis, audit, anomalies, topPosts, bottomPosts, recommendations };
}

function calculateOfficialInsights(posts) {
  const measurable = posts.filter(function (post) { return Number(post.views || 0) > 0; });
  if (measurable.length < 2) return [];
  const ranked = [...measurable].sort(function (a, b) { return engagementRate(b) - engagementRate(a); });
  const averageRate = ranked.reduce(function (total, post) { return total + engagementRate(post); }, 0) / ranked.length;
  const top = ranked[0];
  const low = ranked.at(-1);
  const insights = [];
  if (engagementRate(top) >= averageRate * 1.25) {
    insights.push({
      type: "Respuesta destacada",
      metric: "Interacciones por vistas",
      date: top.date,
      magnitude: engagementRate(top),
      evidence: top.description + " registra " + engagementRate(top).toFixed(2) + "% de interacciones por vistas.",
      interpretation: "Es el video con mayor respuesta proporcional dentro del periodo disponible.",
      hypothesis: "El tema o la presentacion pueden haber contribuido; se necesita comparar mas videos para confirmarlo.",
      impact: "Puede orientar nuevas pruebas editoriales con una referencia observada.",
      recommendation: "Comparar su tema, duracion y presentacion con el resto del periodo antes de replicar el patron."
    });
  }
  if (low !== top && engagementRate(low) <= averageRate * 0.75) {
    insights.push({
      type: "Respuesta inferior al promedio",
      metric: "Interacciones por vistas",
      date: low.date,
      magnitude: engagementRate(low),
      evidence: low.description + " registra " + engagementRate(low).toFixed(2) + "% de interacciones por vistas.",
      interpretation: "Es el video con menor respuesta proporcional dentro del periodo disponible.",
      hypothesis: "El resultado puede relacionarse con el tema, la presentacion o el contexto de publicacion; no se atribuye una causa unica.",
      impact: "Una respuesta proporcional baja puede limitar la eficiencia editorial si se repite.",
      recommendation: "Contrastar el video con los de mejor respuesta y probar una variacion medible."
    });
  }
  return insights;
}

function buildOfficialRecommendations(posts, topPosts, bottomPosts) {
  const recommendations = [];
  if (posts.length < 5) {
    recommendations.push({
      priority: "Alta",
      problem: "Historial oficial limitado para establecer patrones.",
      evidence: "El periodo filtrado contiene " + posts.length + " videos sincronizados.",
      impact: "Una muestra pequena reduce la confianza de comparativas y tendencias.",
      action: "Ampliar el periodo o sincronizar mas historial antes de tomar decisiones definitivas."
    });
  }
  if (topPosts[0]) {
    recommendations.push({
      priority: "Media",
      problem: "Existe un video con la mejor respuesta proporcional observada.",
      evidence: topPosts[0].description + " lidera con " + engagementRate(topPosts[0]).toFixed(2) + "% de interacciones por vistas.",
      impact: "Ofrece una referencia real para priorizar nuevas pruebas de contenido.",
      action: "Comparar tema, formato y presentacion con el resto del periodo y validar una variacion."
    });
  }
  if (bottomPosts[0] && bottomPosts[0] !== topPosts[0]) {
    recommendations.push({
      priority: "Baja",
      problem: "Un video presenta la menor respuesta proporcional del periodo.",
      evidence: bottomPosts[0].description + " registra " + engagementRate(bottomPosts[0]).toFixed(2) + "% de interacciones por vistas.",
      impact: "Puede senalar una oportunidad de mejorar la propuesta editorial.",
      action: "Revisar el enfoque del contenido y medir una alternativa sin asumir una causa unica."
    });
  }
  return recommendations;
}

function calculateOfficialAudit(accounts, posts, kpis) {
  const consistencyScore = Math.min(100, posts.length * 8);
  const views = posts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
  const interactions = posts.reduce(function (total, post) { return total + totalInteractions(post); }, 0);
  const interactionRate = views ? (interactions / views) * 100 : 0;
  const interactionScore = Math.min(100, interactionRate * 10);
  const presenceScore = Math.round(kpis.averageProfileCompleteness);
  const growthScore = Math.max(0, Math.min(100, 70 + kpis.followersChange * 2));
  const contentScore = Math.round((consistencyScore + interactionScore) / 2);
  const hasGrowthHistory = accounts.some(function (account) { return account.hasPreviousFollowers; });
  const dimensions = [
    { name: "Presencia digital", score: presenceScore, weight: 20, explanation: "Completitud calculada con la informacion oficial disponible del canal." },
    { name: "Actividad", score: Math.round(consistencyScore), weight: 20, explanation: "Volumen de videos publicados en el periodo seleccionado." },
    { name: "Interaccion por vistas", score: Math.round(interactionScore), weight: 30, explanation: "Likes, comentarios y compartidos disponibles sobre vistas." },
    { name: "Contenido", score: Math.round(contentScore), weight: 15, explanation: "Combinacion de actividad y respuesta observable de la audiencia." }
  ];
  if (hasGrowthHistory) {
    dimensions.push({ name: "Crecimiento", score: Math.round(growthScore), weight: 15, explanation: "Variacion de suscriptores entre sincronizaciones disponibles." });
  }
  const totalWeight = dimensions.reduce(function (total, dimension) { return total + dimension.weight; }, 0);
  const totalScore = Math.round(dimensions.reduce(function (total, dimension) {
    return total + dimension.score * dimension.weight;
  }, 0) / totalWeight);
  return {
    totalScore,
    label: scoreLabel(totalScore) + " · parcial",
    dimensions: dimensions.map(function ({ weight, ...dimension }) {
      return { ...dimension, weightPercent: weight / totalWeight * 100 };
    }),
    hasGrowthHistory
  };
}

function changeMarkup(change, comparison) {
  const value = Number(change || 0);
  const css = value >= 0 ? "positive" : "negative";
  const arrow = value >= 0 ? "Sube" : "Baja";
  return '<span class="' + css + '">' + arrow + " " + Math.abs(value).toFixed(1) + "%</span><small>" + escapeHtml(comparison || "vs. periodo anterior") + "</small>";
}

function kpiCard(label, value, change, note, unavailable) {
  if (unavailable) {
    return '<article class="kpi-card unavailable-card"><span>' + escapeHtml(label) + '</span><strong class="unavailable-value">No disponible</strong><p>Metrica no disponible para esta plataforma o nivel de acceso.</p></article>';
  }
  const changeContent = change == null
    ? '<small class="official-source">Dato obtenido mediante API oficial</small>'
    : changeMarkup(change);
  return '<article class="kpi-card"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + '</strong><div class="kpi-change">' + changeContent + "</div><p>" + escapeHtml(note) + "</p></article>";
}

function panelHeader(eyebrow, title, trailing) {
  return '<div class="panel-header"><div><p class="eyebrow">' + escapeHtml(eyebrow) + "</p><h2>" + escapeHtml(title) + "</h2></div>" + (trailing || "") + "</div>";
}

function emptyState(message) {
  return '<div class="empty-state"><strong>Sin datos para mostrar</strong><p>' + escapeHtml(message) + "</p></div>";
}

function statusLabel(value) {
  return { high: "Alto", medium: "Medio", low: "Bajo" }[value] || value;
}

function renderSummaryGrid(kpis) {
  if (state.liveData?.accounts?.length) {
    const posts = getVisiblePosts();
    const subscribersAvailable = getVisibleAccounts().some(function (account) { return account.followers != null; });
    const views = posts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
    const interactions = posts.reduce(function (total, post) { return total + totalInteractions(post); }, 0);
    return '<section class="summary-grid">' +
      kpiCard("Suscriptores", number.format(kpis.followers), null, "Comunidad informada por el canal autorizado", !subscribersAvailable) +
      kpiCard("Vistas", number.format(views), null, "Vistas acumuladas de los videos visibles") +
      kpiCard("Interacciones", number.format(interactions), null, "Likes, comentarios y compartidos disponibles") +
      kpiCard("Videos", number.format(kpis.posts), null, "Contenido obtenido desde YouTube Data API") +
      "</section>";
  }
  const engagementChange = percentChange(kpis.engagement, 5);
  return '<section class="summary-grid">' +
    kpiCard("Seguidores", number.format(kpis.followers), kpis.followersChange, "Comunidad acumulada de las cuentas visibles") +
    kpiCard("Alcance", number.format(kpis.reach), kpis.reachChange, "Personas alcanzadas por el contenido") +
    kpiCard("Engagement", decimal.format(kpis.engagement) + "%", engagementChange, "Formula: interacciones / alcance x 100") +
    kpiCard("Publicaciones", number.format(kpis.posts), kpis.posts >= 8 ? 8 : -12, "Volumen analizado en el periodo") +
    "</section>";
}

function renderTrendChart() {
  const isLive = Boolean(state.liveData?.accounts?.length);
  const trend = isLive ? state.liveData.trend : sampleData.engagementTrend;
  if (!trend?.length) return emptyState("La API oficial todavia no ofrece historial suficiente para esta tendencia.");
  const max = Math.max(...trend.map(function (point) { return point.value; }), 1);
  const bars = trend.map(function (point) {
    const height = Math.max(8, (point.value / max) * 100);
    return '<div class="trend-bar"><div class="bar-track"><span style="height:' + height + '%"></span></div><small>' + escapeHtml(point.label) + "</small><b>" + (isLive ? number.format(point.value) : point.value + "%") + "</b></div>";
  }).join("");
  return '<div class="trend-chart" aria-label="' + (isLive ? "Vistas semanales oficiales" : "Evolucion semanal del engagement") + '">' + bars + "</div>";
}

function renderHealthBars(audit) {
  return '<div class="health-bars">' + audit.dimensions.map(function (dimension) {
    return '<div class="health-item"><div><strong>' + escapeHtml(dimension.name) + "</strong><span>" + escapeHtml(dimension.explanation) + '</span></div><div class="bar" aria-label="' + escapeHtml(dimension.name) + ": " + dimension.score + '"><span style="width:' + dimension.score + '%"></span></div><b>' + dimension.score + "</b></div>";
  }).join("") + "</div>";
}

function renderDashboard(data) {
  const isLive = Boolean(state.liveData?.accounts?.length);
  const strongest = [...data.audit.dimensions].sort(function (a, b) { return b.score - a.score; })[0];
  const weakest = [...data.audit.dimensions].sort(function (a, b) { return a.score - b.score; })[0];
  const firstRecommendation = data.recommendations[0];
  return renderSummaryGrid(data.kpis) +
    '<section class="split-grid"><article class="panel">' +
      panelHeader("Salud de cuenta", "Diagnostico general", '<span class="score-pill">' + data.audit.totalScore + "/100 · " + escapeHtml(data.audit.label) + "</span>") +
      '<div class="score-overview"><div class="score-ring" style="--score:' + data.audit.totalScore + '"><strong>' + data.audit.totalScore + "</strong><span>de 100</span></div><div><h3>" + escapeHtml(data.audit.label) + "</h3><p>" + (isLive ? "La puntuacion parcial usa solo presencia, actividad, interacciones por vistas, contenido y crecimiento disponibles mediante la API oficial." : "La puntuacion combina presencia, actividad, engagement, contenido, crecimiento y alcance con ponderaciones documentadas.") + "</p></div></div>" +
    '</article><article class="panel">' +
      panelHeader("Tendencia", state.liveData?.accounts?.length ? "Vistas obtenidas por semana" : "Evolucion del engagement") + renderTrendChart() +
    '</article></section>' +
    '<section class="decision-band"><div><span>Principal fortaleza</span><strong>' + escapeHtml(strongest.name) + " · " + strongest.score + '/100</strong><p>' + escapeHtml(strongest.explanation) + '</p></div><div><span>Area a mejorar</span><strong>' + escapeHtml(weakest.name) + " · " + weakest.score + '/100</strong><p>' + escapeHtml(weakest.explanation) + '</p></div><div><span>Accion prioritaria</span><strong>' + escapeHtml(firstRecommendation ? firstRecommendation.priority : "Seguimiento") + '</strong><p>' + escapeHtml(firstRecommendation ? firstRecommendation.action : "Mantener el monitoreo del periodo.") + "</p></div></section>" +
    '<section class="split-grid"><article class="panel">' +
      panelHeader("Hallazgos", "Alertas que requieren contexto") + renderInsightPreview(data.anomalies.slice(0, 3)) +
    '</article><article class="panel">' +
      panelHeader("Contenido", "Publicaciones destacadas") + renderRanking(data.topPosts.slice(0, 4)) +
    "</article></section>";
}

function renderAuditPage(data) {
  const isLive = Boolean(state.liveData?.accounts?.length);
  const methodology = isLive
    ? data.audit.dimensions.map(function (dimension) {
        return [dimension.name, decimal.format(dimension.weightPercent) + "%", dimension.explanation];
      })
    : [
        ["Presencia digital", "15%", "Completitud del perfil"],
        ["Actividad", "15%", "Volumen y consistencia"],
        ["Engagement", "25%", "Interacciones sobre alcance"],
        ["Contenido", "15%", "Frecuencia y respuesta"],
        ["Crecimiento", "15%", "Variacion de seguidores"],
        ["Alcance", "15%", "Variacion del alcance"]
      ];
  const auditDescription = isLive
    ? "Resultado parcial calculado solo con las cinco dimensiones que la API oficial permite observar. Alcance e impresiones no se estiman."
    : "Resultado calculado con seis dimensiones y datos del periodo filtrado. La puntuacion no es arbitraria: cada componente muestra su evidencia y peso.";
  return '<section class="audit-hero"><div class="score-ring large" style="--score:' + data.audit.totalScore + '"><strong>' + data.audit.totalScore + "</strong><span>" + escapeHtml(data.audit.label) + '</span></div><div><p class="eyebrow">Puntuacion consolidada</p><h2>Salud de las cuentas seleccionadas</h2><p>' + auditDescription + "</p></div></section>" +
    '<section class="panel">' + panelHeader("Dimensiones", "Detalle de la auditoria") + renderHealthBars(data.audit) + "</section>" +
    '<section class="panel">' + panelHeader("Transparencia", "Metodologia de puntuacion") +
      '<div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Peso</th><th>Base de calculo</th></tr></thead><tbody>' +
      methodology.map(function (row) { return "<tr><td><strong>" + row[0] + "</strong></td><td>" + row[1] + "</td><td>" + row[2] + "</td></tr>"; }).join("") +
      "</tbody></table></div></section>";
}

function renderMetricsPage(data) {
  const isLive = Boolean(state.liveData?.accounts?.length);
  const reachAverage = data.kpis.posts ? data.kpis.reach / data.kpis.posts : 0;
  const impressionAverage = data.kpis.posts ? data.kpis.impressions / data.kpis.posts : 0;
  const clicks = data.posts.reduce(function (total, post) { return total + Number(post.clicks || 0); }, 0);
  const ctr = data.kpis.impressions ? (clicks / data.kpis.impressions) * 100 : 0;
  const hasVideo = data.posts.some(function (post) { return Number.isFinite(post.views); });
  const views = data.posts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
  const likes = data.posts.reduce(function (total, post) { return total + Number(post.likes || 0); }, 0);
  const comments = data.posts.reduce(function (total, post) { return total + Number(post.comments || 0); }, 0);
  if (isLive) {
    const subscribersAvailable = data.accounts.some(function (account) { return account.followers != null; });
    const interactions = data.posts.reduce(function (total, post) { return total + totalInteractions(post); }, 0);
    const interactionRate = views ? (interactions / views) * 100 : 0;
    const averageViews = data.kpis.posts ? views / data.kpis.posts : 0;
    return '<section class="summary-grid six">' +
      kpiCard("Suscriptores", number.format(data.kpis.followers), null, "Total informado por el canal autorizado", !subscribersAvailable) +
      kpiCard("Vistas", number.format(views), null, "Vistas acumuladas de los videos sincronizados") +
      kpiCard("Interacciones", number.format(interactions), null, "Likes, comentarios y compartidos disponibles") +
      kpiCard("Videos", number.format(data.kpis.posts), null, "Videos recuperados para el periodo") +
      kpiCard("Likes", number.format(likes), null, "Likes informados por YouTube") +
      kpiCard("Comentarios", number.format(comments), null, "Comentarios informados por YouTube") +
      "</section>" +
      '<section class="split-grid"><article class="panel">' + panelHeader("Evolucion", "Vistas oficiales por semana") + renderTrendChart() + '</article><article class="panel">' +
        panelHeader("Lectura", "Indicadores disponibles") +
        '<div class="metric-list"><div><span>Vistas promedio por video</span><strong>' + number.format(Math.round(averageViews)) + '</strong></div><div><span>Interacciones por vistas</span><strong>' + decimal.format(interactionRate) + '%</strong></div><div><span>Alcance</span><strong>No disponible</strong></div><div><span>Impresiones</span><strong>No disponible</strong></div></div>' +
      '</article></section>' +
      '<section class="panel">' + panelHeader("Desglose", "Rendimiento por formato") + renderSummaryTable(summarizeBy(data.posts, "format"), true) + "</section>";
  }
  return '<section class="summary-grid six">' +
    kpiCard("Seguidores", number.format(data.kpis.followers), data.kpis.followersChange, "Comunidad total") +
    kpiCard("Alcance", number.format(data.kpis.reach), data.kpis.reachChange, "Alcance acumulado") +
    kpiCard("Impresiones", number.format(data.kpis.impressions), 8.1, "Exposiciones del contenido") +
    kpiCard("Interacciones", number.format(data.kpis.interactions), percentChange(data.kpis.interactions, data.kpis.interactions / 1.09), "Likes, comentarios, compartidos, guardados y clics") +
    kpiCard("Vistas de video", number.format(views), 12.4, "Solo contenido con dato disponible", !hasVideo) +
    kpiCard("CTR", decimal.format(ctr) + "%", 3.2, "Formula: clics / impresiones x 100") +
    "</section>" +
    '<section class="split-grid"><article class="panel">' + panelHeader("Evolucion", "Engagement por semana") + renderTrendChart() + '</article><article class="panel">' +
      panelHeader("Lectura", "Indicadores de eficiencia") +
      '<div class="metric-list"><div><span>Alcance promedio por publicacion</span><strong>' + number.format(Math.round(reachAverage)) + '</strong></div><div><span>Impresiones promedio</span><strong>' + number.format(Math.round(impressionAverage)) + '</strong></div><div><span>Frecuencia media</span><strong>' + decimal.format(data.kpis.reach ? data.kpis.impressions / data.kpis.reach : 0) + 'x</strong></div><div><span>Engagement por alcance</span><strong>' + decimal.format(data.kpis.engagement) + "%</strong></div></div>" +
    '</article></section>' +
    '<section class="panel">' + panelHeader("Desglose", "Rendimiento por formato") + renderSummaryTable(summarizeBy(data.posts, "format")) + "</section>";
}

function renderContentPage(data) {
  const isLive = Boolean(state.liveData?.accounts?.length);
  const posts = sortPosts(data.posts, state.sort);
  const patterns = getContentPattern(data.posts);
  return '<section class="panel">' +
    '<div class="content-toolbar"><label>Buscar<input id="post-search" type="search" value="' + escapeHtml(state.search) + '" placeholder="Tema o descripcion" /></label><label>Tematica<select id="topic-filter">' + optionList(uniqueValues(activeData().posts, "topic"), state.topic, "Todas") + '</select></label><label>Campana<select id="campaign-filter">' + optionList(uniqueValues(activeData().posts, "campaign"), state.campaign, "Todas") + '</select></label><label>Rendimiento<select id="performance-filter"><option value="all">Todos</option>' + selectedOption("high", "Alto", state.performance) + selectedOption("medium", "Medio", state.performance) + selectedOption("low", "Bajo", state.performance) + '</select></label><label>Ordenar<select id="sort-filter">' + selectedOption("engagement-desc", isLive ? "Mayor interaccion por vistas" : "Mayor engagement", state.sort) + selectedOption("reach-desc", isLive ? "Mayor vistas" : "Mayor alcance", state.sort) + selectedOption("interactions-desc", "Mayor interaccion", state.sort) + selectedOption("date-desc", "Mas recientes", state.sort) + selectedOption("performance-asc", "Peor rendimiento", state.sort) + "</select></label></div>" +
    panelHeader("Publicaciones", number.format(posts.length) + " resultados") +
    renderPostsTable(posts) + "</section>" +
    '<section class="split-grid"><article class="panel">' + panelHeader("Top 10", "Mejor rendimiento") + renderRanking(data.topPosts.slice(0, 10)) + '</article><article class="panel">' + panelHeader("Bottom 10", "Menor rendimiento") + renderRanking(data.bottomPosts.slice(0, 10)) + "</article></section>" +
    '<section class="decision-band"><div><span>Formato mas efectivo</span><strong>' + escapeHtml(patterns.bestFormat ? patterns.bestFormat.name : "Sin datos") + '</strong><p>' + (patterns.bestFormat ? decimal.format(patterns.bestFormat.engagement) + (isLive ? "% de interacciones por vistas" : "% de engagement") : "No calculable") + '</p></div><div><span>Tematica mas efectiva</span><strong>' + escapeHtml(patterns.bestTopic ? patterns.bestTopic.name : "Sin datos") + '</strong><p>' + (patterns.bestTopic ? number.format(patterns.bestTopic.interactions) + " interacciones" : "No calculable") + '</p></div><div><span>Hora con mejor respuesta</span><strong>' + escapeHtml(patterns.bestHour ? patterns.bestHour.name : "Sin datos") + '</strong><p>Hallazgo descriptivo; requiere mas historial para recomendar horario.</p></div></section>';
}

function renderAudiencePage(data) {
  const platforms = state.platform === "all"
    ? data.accounts.map(function (account) { return account.platform; })
    : [state.platform];
  if (!platforms.length) return emptyState("Selecciona una cuenta conectada con datos de audiencia.");
  return '<section class="audience-grid">' + platforms.map(function (platform) {
    const audience = sampleData.audience[platform] || { available: false };
    if (!audience.available) {
      return '<article class="panel audience-card">' + panelHeader(platform, "Audiencia") + '<div class="availability-notice"><strong>Metrica no disponible</strong><p>Metrica no disponible para esta plataforma o nivel de acceso.</p></div></article>';
    }
    return '<article class="panel audience-card">' + panelHeader(platform, "Perfil de audiencia") +
      '<div class="audience-facts"><div><span>Edad principal</span><strong>' + escapeHtml(audience.topAge || "No disponible") + '</strong></div><div><span>Ubicacion principal</span><strong>' + escapeHtml(audience.topLocation || "No disponible") + '</strong></div><div><span>Mayor actividad</span><strong>' + escapeHtml(audience.activeWindow || "No disponible") + '</strong></div></div>' +
      '<div class="distribution"><div><span>Mujeres</span><div class="bar"><span style="width:' + audience.women + '%"></span></div><b>' + audience.women + '%</b></div><div><span>Hombres</span><div class="bar secondary"><span style="width:' + audience.men + '%"></span></div><b>' + audience.men + '%</b></div><div><span>Sin especificar</span><div class="bar neutral"><span style="width:' + Math.max(3, audience.unspecified) + '%"></span></div><b>' + audience.unspecified + "%</b></div></div></article>";
  }).join("") + '</section><section class="info-banner"><strong>Disponibilidad condicionada por API</strong><p>Los datos demograficos se muestran solo cuando la plataforma y el nivel de acceso los proporcionan. No se completan valores ausentes mediante estimaciones.</p></section>';
}

function renderComparisonPage(data) {
  const isLive = Boolean(state.liveData?.accounts?.length);
  const comparisonAccounts = state.platform === "all" ? activeData().accounts : data.accounts;
  const comparisonPosts = getPostsForAccounts(comparisonAccounts);
  if (isLive) {
    const rows = comparisonAccounts.map(function (account) {
      const posts = comparisonPosts.filter(function (post) { return post.accountId === account.id; });
      const views = posts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
      const interactions = posts.reduce(function (total, post) { return total + totalInteractions(post); }, 0);
      return { account, posts: posts.length, views, interactions, rate: views ? interactions / views * 100 : 0 };
    });
    const totalViews = comparisonPosts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
    return '<section class="panel">' + panelHeader("Plataformas", "Comparacion con datos oficiales") +
      '<div class="info-line">Las comparaciones usan vistas e interacciones informadas por la API. Alcance e impresiones no se estiman.</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Red</th><th>Cuenta</th><th>Suscriptores</th><th>Crecimiento</th><th>Vistas</th><th>Interacciones</th><th>Interacciones / vistas</th><th>Videos</th></tr></thead><tbody>' +
      rows.map(function (row) {
        const growth = row.account.hasPreviousFollowers ? percentChange(row.account.followers, row.account.previousFollowers) : null;
        const subscribers = row.account.followers == null ? "No disponible" : number.format(row.account.followers);
        const growthCell = growth == null ? "No disponible" : '<span class="' + (growth >= 0 ? "positive" : "negative") + '">' + growth.toFixed(1) + "%</span>";
        return "<tr><td><strong>" + escapeHtml(row.account.platform) + "</strong></td><td>" + escapeHtml(row.account.handle) + "</td><td>" + subscribers + "</td><td>" + growthCell + "</td><td>" + number.format(row.views) + "</td><td>" + number.format(row.interactions) + "</td><td>" + row.rate.toFixed(2) + "%</td><td>" + row.posts + "</td></tr>";
      }).join("") + "</tbody></table></div></section>" +
      '<section class="panel">' + panelHeader("Periodos", "Datos disponibles") +
      '<div class="comparison-grid"><div><span>Suscriptores actuales</span><strong>' + (data.accounts.some(function (account) { return account.followers != null; }) ? number.format(data.kpis.followers) : "No disponible") + "</strong>" + (data.audit.hasGrowthHistory ? changeMarkup(data.kpis.followersChange) : "<small>Se requieren al menos dos sincronizaciones.</small>") + '</div><div><span>Vistas del periodo</span><strong>' + number.format(totalViews) + '</strong><small>Dato oficial de los videos sincronizados.</small></div><div><span>Mismo periodo del ano anterior</span><strong>No disponible</strong><small>Historial insuficiente para una comparacion valida.</small></div></div></section>';
  }
  const rows = buildPlatformComparison(comparisonAccounts, comparisonPosts);
  const current = data.kpis;
  const previousReach = data.posts.reduce(function (total, post) { return total + Number(post.previousReach || 0); }, 0);
  const previousFollowers = data.accounts.reduce(function (total, account) { return total + account.previousFollowers; }, 0);
  return '<section class="panel">' + panelHeader("Plataformas", "Comparacion multicanal") +
    '<div class="info-line">El engagement se calcula con la misma formula normalizada para facilitar lectura. Las definiciones nativas pueden variar entre plataformas.</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Red</th><th>Cuenta</th><th>Seguidores</th><th>Crecimiento</th><th>Alcance</th><th>Impresiones</th><th>Engagement</th><th>Publicaciones</th></tr></thead><tbody>' +
    rows.map(function (row) {
      return "<tr><td><strong>" + escapeHtml(row.platform) + "</strong></td><td>" + escapeHtml(row.account) + "</td><td>" + number.format(row.followers) + '</td><td><span class="' + (row.growth >= 0 ? "positive" : "negative") + '">' + row.growth.toFixed(1) + "%</span></td><td>" + number.format(row.reach) + "</td><td>" + number.format(row.impressions) + "</td><td>" + row.engagement.toFixed(2) + "%</td><td>" + row.posts + "</td></tr>";
    }).join("") + "</tbody></table></div></section>" +
    '<section class="panel">' + panelHeader("Periodos", "Actual vs. anterior") +
    '<div class="comparison-grid"><div><span>Seguidores actuales</span><strong>' + number.format(current.followers) + "</strong>" + changeMarkup(percentChange(current.followers, previousFollowers)) + '</div><div><span>Alcance actual</span><strong>' + number.format(current.reach) + "</strong>" + changeMarkup(percentChange(current.reach, previousReach)) + '</div><div><span>Mismo periodo del ano anterior</span><strong>No disponible</strong><small>Historial insuficiente para una comparacion valida.</small></div></div></section>';
}

function renderInsightsPage(data) {
  if (!data.anomalies.length) return emptyState("No se detectaron cambios fuera de los umbrales con los filtros actuales.");
  return '<section class="insight-grid">' + data.anomalies.map(function (item) {
    const direction = item.magnitude >= 0 ? "positive" : "negative";
    return '<article class="panel insight-detail"><div class="insight-heading"><div><span class="status ' + direction + '">' + escapeHtml(item.metric) + '</span><h2>' + escapeHtml(item.type) + '</h2></div><strong>' + Math.abs(item.magnitude).toFixed(1) + (["Engagement", "Interacciones por vistas"].includes(item.metric) ? "%" : "% variacion") + '</strong></div><dl><div><dt>Dato observado</dt><dd>' + escapeHtml(item.evidence) + '</dd></div><div><dt>Interpretacion</dt><dd>' + escapeHtml(item.interpretation) + '</dd></div><div><dt>Hipotesis</dt><dd>' + escapeHtml(item.hypothesis) + '</dd></div><div><dt>Impacto</dt><dd>' + escapeHtml(item.impact) + '</dd></div><div><dt>Recomendacion</dt><dd>' + escapeHtml(item.recommendation) + "</dd></div></dl></article>";
  }).join("") + "</section>";
}

function renderRecommendationsPage(data) {
  if (!data.recommendations.length) return emptyState("No hay recomendaciones nuevas para el periodo seleccionado.");
  const groups = ["Alta", "Media", "Baja"].map(function (priority) {
    const items = data.recommendations.filter(function (item) { return item.priority === priority; });
    return '<section class="recommendation-section"><div class="section-heading"><div><p class="eyebrow">' + priority + ' prioridad</p><h2>' + items.length + " acciones</h2></div></div>" +
      (items.length ? '<div class="recommendation-grid">' + items.map(renderRecommendation).join("") + "</div>" : '<p class="empty-inline">Sin acciones de esta prioridad.</p>') + "</section>";
  }).join("");
  return groups;
}

function renderReportsPage(data) {
  const saveButton = can("reports:write") ? '<button id="save-report" class="secondary-button" type="button">Guardar en sistema</button>' : "";
  const pdfButton = can("reports:write") ? '<button id="download-pdf" class="primary-button" type="button">Descargar PDF</button>' : "";
  return '<section class="report-actions"><div><strong>Reporte de auditoria y rendimiento</strong><span>Periodo de ' + escapeHtml(state.period) + ' dias · ' + escapeHtml(state.platform === "all" ? "Todas las redes" : state.platform) + '</span></div><div>' + saveButton + '<button id="print-report" class="secondary-button" type="button">Imprimir</button><button id="download-report" class="secondary-button" type="button">Descargar HTML</button>' + pdfButton + '</div></section><div id="report-message" class="form-message" hidden></div>' +
    '<article id="report-document" class="report-document">' + buildReportHtml(data) + "</article>";
}

function renderIntegrationsPage() {
  const persisted = state.persistedIntegrations || [];
  const cards = sampleData.integrations.map(function (integration) {
    const slug = integration.platform === "X" ? "x" : integration.platform.toLowerCase();
    const real = persisted.find(function (item) { return item.platform === slug; });
    const connected = Boolean(real?.connectionId && real.status === "connected");
    const configured = real && real.status !== "not_configured";
    const status = connected ? "Conectada" : configured ? real.status : "Sin configurar";
    let action = "";
    if (state.user) {
      if (connected && can("sync:run")) {
        action = '<button class="secondary-button integration-action" data-sync-platform="' + escapeHtml(slug) + '" type="button">Sincronizar ahora</button>';
      } else if (real?.oauthAvailable && can("integrations:write")) {
        action = '<button class="primary-button integration-action" data-oauth-platform="' + escapeHtml(slug) + '" type="button">Conectar cuenta</button>';
      } else if (!real?.oauthAvailable && can("integrations:write")) {
        action = '<button class="secondary-button integration-action" type="button" disabled>Falta configurar OAuth</button>';
      }
    }
    const schedule = connected && can("sync:run")
      ? '<form class="sync-schedule" data-schedule-platform="' + escapeHtml(slug) + '"><label><input name="enabled" type="checkbox"' + (real.scheduleEnabled ? " checked" : "") + ' /> Sincronizacion automatica</label><select name="intervalMinutes" aria-label="Frecuencia de sincronizacion"><option value="60"' + (real.scheduleIntervalMinutes === 60 ? " selected" : "") + '>Cada hora</option><option value="360"' + (real.scheduleIntervalMinutes === 360 ? " selected" : "") + '>Cada 6 horas</option><option value="720"' + (real.scheduleIntervalMinutes === 720 ? " selected" : "") + '>Cada 12 horas</option><option value="1440"' + (real.scheduleIntervalMinutes === 1440 ? " selected" : "") + '>Cada dia</option></select><button class="secondary-button" type="submit">Guardar</button></form>'
      : "";
    const nextSync = real?.nextSyncAt ? "Proxima automatica: " + escapeHtml(real.nextSyncAt) : "Sin proxima ejecucion";
    return '<article class="integration-card"><div class="integration-top"><span class="platform-mark">' + escapeHtml(integration.platform.slice(0, 2).toUpperCase()) + '</span><div><h2>' + escapeHtml(integration.platform) + "</h2><p>" + escapeHtml(integration.provider) + '</p></div><span class="connection-status ' + (connected ? "active" : configured ? "demo" : "pending") + '">' + escapeHtml(status) + '</span></div><div class="integration-account"><span>Cuenta autorizada</span><strong>' + (connected ? escapeHtml(real.connectedAccount) : "Sin cuenta conectada") + '</strong></div><div class="tag-list">' + integration.metrics.map(function (metric) { return "<span>" + escapeHtml(metric) + "</span>"; }).join("") + '</div>' + schedule + '<div class="integration-footer"><small>' + (real && real.lastSyncAt ? "Ultima sincronizacion: " + escapeHtml(real.lastSyncAt) + " · " + nextSync : "Sin sincronizacion oficial") + "</small>" + action + "</div></article>";
  }).join("");
  const oauthNotice = state.oauthNotice
    ? '<section class="info-banner ' + (state.oauthNotice.status === "success" ? "success-banner" : "error-banner") + '"><strong>' + (state.oauthNotice.status === "success" ? escapeHtml(state.oauthNotice.platform) + " conectado correctamente" : "No se pudo conectar " + escapeHtml(state.oauthNotice.platform)) + '</strong><p>' + (state.oauthNotice.status === "success" ? "La cuenta fue autorizada, sincronizada y guardada de forma segura." : "La autorizacion no se completo. Revisa la configuracion OAuth o vuelve a intentarlo.") + "</p></section>"
    : "";
  const configuration = can("integrations:write")
    ? '<section class="panel"><div class="panel-header"><div><p class="eyebrow">Configuracion tecnica</p><h2>Credenciales de proveedor</h2></div></div><form id="integration-form" class="form-grid"><label>Plataforma<select name="platform" required><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option><option value="linkedin">LinkedIn</option><option value="youtube">YouTube</option><option value="x">X / Twitter</option></select></label><label>Nombre interno<input name="displayName" required maxlength="80" placeholder="Cuenta corporativa" /></label><label>Client ID<input name="clientId" required autocomplete="off" /></label><label>Client secret<input name="clientSecret" type="password" required minlength="8" autocomplete="new-password" /></label><div class="form-actions"><button class="primary-button" type="submit">Guardar cifrado</button></div></form><div id="integration-message" class="form-message" hidden></div><p class="form-note">El registro interno queda cifrado. Para activar OAuth oficial, las credenciales aprobadas de cada proveedor deben configurarse tambien como variables del servidor.</p></section>'
    : state.apiAvailable
      ? '<section class="info-banner"><strong>Acceso protegido</strong><p>Inicia sesion con rol Administrador o Analista para configurar credenciales. Nunca se solicitan contrasenas de redes sociales.</p></section>'
      : '<section class="info-banner"><strong>Demostracion online</strong><p>La configuracion real de credenciales esta disponible al ejecutar el sistema local con su backend seguro.</p></section>';
  return oauthNotice + configuration + '<div id="oauth-message" class="form-message" hidden></div><section class="integration-grid">' + cards + '</section><section class="info-banner"><strong>Conectores oficiales preparados</strong><p>Cada red se activa con credenciales propias, permisos aprobados y consentimiento OAuth. Las metricas no disponibles se mantienen vacias; nunca se completan con estimaciones.</p></section>';
}

function renderSettingsPage() {
  if (!state.user) {
    const message = state.apiAvailable
      ? '<p>Debes iniciar sesion para consultar usuarios y permisos persistentes.</p><a class="inline-link" href="#/cuenta">Ir a inicio de sesion</a>'
      : '<p>Esta version publica muestra la matriz de permisos. La administracion real de usuarios permanece en la instalacion local.</p>';
    return '<section class="info-banner"><strong>' + (state.apiAvailable ? "Configuracion protegida" : "Demostracion online") + '</strong>' + message + '</section>' + renderPermissionMatrix();
  }
  const userRows = state.users
    ? state.users.map(function (user) {
        const roleControl = can("users:manage")
          ? '<select class="compact-select" data-user-role="' + user.id + '"><option value="admin"' + (user.role === "admin" ? " selected" : "") + '>Administrador</option><option value="analyst"' + (user.role === "analyst" ? " selected" : "") + '>Analista</option><option value="client"' + (user.role === "client" ? " selected" : "") + '>Cliente</option></select>'
          : escapeHtml(user.roleName);
        const statusControl = can("users:manage")
          ? '<select class="compact-select" data-user-status="' + user.id + '"><option value="active"' + (user.status === "active" ? " selected" : "") + '>Activo</option><option value="disabled"' + (user.status === "disabled" ? " selected" : "") + '>Deshabilitado</option></select>'
          : '<span class="status active">' + escapeHtml(user.status) + "</span>";
        const action = can("users:manage") ? '<button class="secondary-button user-save" data-user-id="' + user.id + '" type="button">Guardar</button>' : "";
        return "<tr><td><strong>" + escapeHtml(user.displayName) + "</strong></td><td>" + escapeHtml(user.email) + "</td><td>" + roleControl + "</td><td>" + statusControl + "</td><td>" + escapeHtml(user.lastLoginAt || "Sin acceso") + "</td><td>" + action + "</td></tr>";
      }).join("")
    : '<tr><td colspan="6">Cargando usuarios...</td></tr>';
  const userForm = can("users:manage")
    ? '<article class="panel">' + panelHeader("Alta segura", "Crear usuario") + '<form id="user-form" class="form-grid"><label>Nombre<input name="displayName" required minlength="2" maxlength="80" /></label><label>Correo<input name="email" type="email" required autocomplete="off" /></label><label>Contrasena temporal<input name="password" type="password" required minlength="12" autocomplete="new-password" /></label><label>Rol<select name="role"><option value="client">Cliente</option><option value="analyst">Analista</option><option value="admin">Administrador</option></select></label><div class="form-actions"><button class="primary-button" type="submit">Crear usuario</button></div></form><div id="user-message" class="form-message" hidden></div></article>'
    : "";
  return '<section class="settings-layout"><article class="panel">' + panelHeader("Acceso", "Usuarios y roles") +
    '<div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Ultimo acceso</th><th>Accion</th></tr></thead><tbody>' + userRows +
    '</tbody></table></div><p class="form-note">Los usuarios y roles se consultan desde la base de datos persistente.</p></article>' +
    '<article class="panel">' + panelHeader("Reglas", "Escala de auditoria") +
    '<div class="rule-list"><div><span>90-100</span><strong>Excelente</strong></div><div><span>80-89</span><strong>Muy bueno</strong></div><div><span>70-79</span><strong>Bueno</strong></div><div><span>60-69</span><strong>Necesita mejoras</strong></div><div><span>0-59</span><strong>Nivel critico</strong></div></div></article>' +
    userForm + renderPermissionMatrix() + '</section>';
}

function renderPermissionMatrix() {
  return '<article class="panel permission-panel">' + panelHeader("Permisos", "Matriz por rol") +
    '<div class="table-wrap"><table><thead><tr><th>Accion</th><th>Administrador</th><th>Analista</th><th>Cliente</th></tr></thead><tbody><tr><td>Ver dashboards</td><td>Permitido</td><td>Permitido</td><td>Permitido</td></tr><tr><td>Guardar reportes</td><td>Permitido</td><td>Permitido</td><td>Solo lectura</td></tr><tr><td>Gestionar integraciones</td><td>Permitido</td><td>Permitido</td><td>Restringido</td></tr><tr><td>Administrar usuarios</td><td>Permitido</td><td>Restringido</td><td>Restringido</td></tr></tbody></table></div></article>';
}

function renderAccountPage() {
  if (!state.authReady) return emptyState("Comprobando el estado de autenticacion.");
  if (!state.apiAvailable) {
    return '<section class="info-banner"><strong>Acceso disponible en la version local</strong><p>La demostracion online permite recorrer los modulos y reportes sin almacenar usuarios ni credenciales. El registro y el inicio de sesion funcionan al abrir el proyecto localmente.</p></section>';
  }
  const notice = state.accountNotice
    ? '<section class="info-banner ' + (state.accountNotice.error ? "error-banner" : "success-banner") + '"><strong>' + (state.accountNotice.error ? "No se pudo completar" : "Operacion completada") + '</strong><p>' + escapeHtml(state.accountNotice.message) + "</p></section>"
    : "";
  const preview = state.accountPreviewUrl
    ? '<section class="info-banner"><strong>Enlace disponible en este entorno</strong><p><a class="inline-link" href="' + escapeHtml(state.accountPreviewUrl) + '">Abrir enlace seguro</a></p></section>'
    : "";
  if (state.user) {
    const organizations = state.organizations || [];
    const organizationOptions = organizations.map(function (organization) {
      return '<option value="' + organization.id + '"' + (organization.id === state.user.organization?.id ? " selected" : "") + '>' + escapeHtml(organization.name) + '</option>';
    }).join("");
    const organizationControl = organizations.length
      ? '<form id="organization-select-form" class="organization-control"><label>Organizacion activa<select name="organizationId">' + organizationOptions + '</select></label><button class="secondary-button" type="submit">Cambiar</button></form>'
      : "";
    const createOrganization = can("users:manage")
      ? '<form id="organization-create-form" class="organization-control"><label>Nueva organizacion<input name="name" required minlength="2" maxlength="100" /></label><button class="secondary-button" type="submit">Crear</button></form>'
      : "";
    const emailSecurity = state.user.emailVerified
      ? '<div class="security-state success"><strong>Correo verificado</strong><span>La direccion de acceso fue confirmada.</span></div>'
      : '<div class="security-state warning"><strong>Correo pendiente</strong><span>Confirma la direccion para completar la proteccion de la cuenta.</span><button id="verify-email-button" class="secondary-button" type="button">Enviar verificacion</button></div>';
    const mfaSetup = state.mfaSetup
      ? '<div class="mfa-setup"><img src="' + escapeHtml(state.mfaSetup.qrCodeDataUrl) + '" alt="Codigo QR para configurar 2FA" /><div><p>Escanea el codigo con tu aplicacion autenticadora o introduce esta clave:</p><code>' + escapeHtml(state.mfaSetup.secret) + '</code><form id="mfa-confirm-form" class="security-form"><label>Codigo de 6 digitos<input name="code" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="one-time-code" /></label><button class="primary-button" type="submit">Confirmar 2FA</button></form></div></div>'
      : "";
    const mfaSecurity = state.user.mfaEnabled
      ? '<div class="security-state success"><strong>Segundo factor activo</strong><span>El inicio de sesion requiere un codigo temporal o de recuperacion.</span></div><form id="mfa-disable-form" class="security-form"><label>Contrasena<input name="password" type="password" required autocomplete="current-password" /></label><label>Codigo 2FA o recuperacion<input name="code" required autocomplete="one-time-code" /></label><button class="secondary-button danger-button" type="submit">Desactivar 2FA</button></form>'
      : '<div class="security-state"><strong>Segundo factor desactivado</strong><span>Protege el acceso con una aplicacion autenticadora.</span><button id="mfa-setup-button" class="secondary-button" type="button">Configurar 2FA</button></div>' + mfaSetup;
    const recoveryCodes = state.recoveryCodes
      ? '<section class="recovery-codes"><strong>Codigos de recuperacion</strong><p>Guardalos en un lugar seguro. Cada codigo funciona una sola vez.</p><div>' + state.recoveryCodes.map(function (code) { return "<code>" + escapeHtml(code) + "</code>"; }).join("") + "</div></section>"
      : "";
    return notice + preview + '<section class="account-layout"><article class="account-panel panel"><div class="account-avatar">' + escapeHtml(state.user.displayName.slice(0, 2).toUpperCase()) + '</div><div><p class="eyebrow">Sesion activa</p><h2>' + escapeHtml(state.user.displayName) + '</h2><p>' + escapeHtml(state.user.email) + ' · ' + escapeHtml(state.user.role) + '</p><p><strong>' + escapeHtml(state.user.organization?.name || "Organizacion sin asignar") + '</strong></p><div class="tag-list">' + state.user.permissions.map(function (permission) { return "<span>" + escapeHtml(permission) + "</span>"; }).join("") + '</div>' + organizationControl + createOrganization + '<div id="organization-message" class="form-message" hidden></div><button id="logout-button" class="secondary-button" type="button">Cerrar sesion</button></div></article><article class="account-security panel"><p class="eyebrow">Seguridad</p><h2>Proteccion de la cuenta</h2>' + emailSecurity + mfaSecurity + recoveryCodes + '<div id="security-message" class="form-message" hidden></div></article></section>';
  }
  if (state.passwordResetToken) {
    return notice + '<section class="auth-panel panel"><div><p class="eyebrow">Recuperacion</p><h2>Crear nueva contrasena</h2><p>El enlace solo puede utilizarse una vez y caduca a los 30 minutos.</p></div><form id="password-reset-form" class="auth-form"><label>Nueva contrasena<input name="password" type="password" required minlength="12" autocomplete="new-password" /></label><label>Repetir contrasena<input name="confirmation" type="password" required minlength="12" autocomplete="new-password" /></label><button class="primary-button" type="submit">Actualizar contrasena</button></form><div id="auth-message" class="form-message" hidden></div></section>';
  }
  if (state.mfaChallengeToken) {
    return notice + '<section class="auth-panel panel"><div><p class="eyebrow">Segundo factor</p><h2>Confirma tu acceso</h2><p>Introduce el codigo temporal de tu aplicacion o uno de recuperacion.</p></div><form id="mfa-login-form" class="auth-form"><label>Codigo de seguridad<input name="code" required autofocus autocomplete="one-time-code" /></label><button class="primary-button" type="submit">Verificar e iniciar sesion</button></form><div id="auth-message" class="form-message" hidden></div></section>';
  }
  const initial = state.needsInitialAdmin;
  const forgotPassword = initial ? "" : '<article class="password-help panel"><div><p class="eyebrow">Recuperacion</p><h2>Olvide mi contrasena</h2><p>Te enviaremos un enlace de un solo uso si la cuenta existe.</p></div><form id="forgot-password-form" class="auth-form"><label>Correo<input name="email" type="email" required autocomplete="email" /></label><button class="secondary-button" type="submit">Enviar enlace</button></form><div id="recovery-message" class="form-message" hidden></div></article>';
  return notice + preview + '<section class="auth-workspace"><article class="auth-panel panel"><div><p class="eyebrow">' + (initial ? "Configuracion inicial" : "Acceso") + '</p><h2>' + (initial ? "Crear administrador inicial" : "Iniciar sesion") + '</h2><p>' + (initial ? "Este formulario solo esta disponible mientras no exista ningun usuario." : "Usa una cuenta registrada por un administrador.") + '</p></div><form id="auth-form" class="auth-form">' +
    (initial ? '<label>Nombre<input name="displayName" required minlength="2" maxlength="80" autocomplete="name" /></label>' : "") +
    (initial ? '<label>Organizacion<input name="organizationName" required minlength="2" maxlength="100" value="Organizacion principal" /></label>' : "") +
    '<label>Correo<input name="email" type="email" required autocomplete="email" /></label><label>Contrasena<input name="password" type="password" required minlength="12" autocomplete="' + (initial ? "new-password" : "current-password") + '" /></label><button class="primary-button" type="submit">' + (initial ? "Crear cuenta segura" : "Iniciar sesion") + '</button></form><div id="auth-message" class="form-message" hidden></div></article>' + forgotPassword + "</section>";
}

function renderPostsTable(posts) {
  if (!posts.length) return emptyState("Ajusta los filtros para encontrar publicaciones.");
  const isLive = Boolean(state.liveData?.accounts?.length);
  return '<div class="table-wrap"><table class="posts-table"><thead><tr><th>Fecha</th><th>Red</th><th>Formato</th><th>Contenido</th><th>' + (isLive ? "Vistas" : "Alcance") + '</th><th>Impresiones</th><th>Interacciones</th><th>' + (isLive ? "Interacciones / vistas" : "Engagement") + '</th><th>Estado</th></tr></thead><tbody>' +
    posts.map(function (post) {
      const rate = engagementRate(post);
      const performance = classifyPerformance(rate);
      return "<tr><td>" + escapeHtml(post.date) + "</td><td><strong>" + escapeHtml(post.platform) + "</strong></td><td>" + escapeHtml(post.format) + "</td><td><span class=\"post-title\">" + escapeHtml(post.description) + "</span><small>" + escapeHtml(post.topic) + " · " + escapeHtml(post.campaign) + "</small></td><td>" + (isLive ? number.format(post.views) : number.format(post.reach)) + "</td><td>" + (isLive ? "No disponible" : number.format(post.impressions)) + "</td><td>" + number.format(totalInteractions(post)) + "</td><td>" + rate.toFixed(2) + '%</td><td><span class="status ' + performance + '">' + statusLabel(performance) + "</span></td></tr>";
    }).join("") + "</tbody></table></div>";
}

function renderSummaryTable(rows, officialViewsOnly = false) {
  if (!rows.length) return emptyState("No existen datos suficientes para agrupar.");
  if (officialViewsOnly) {
    return '<div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Videos</th><th>Vistas</th><th>Interacciones</th><th>Interacciones / vistas</th></tr></thead><tbody>' +
      rows.map(function (row) { return "<tr><td><strong>" + escapeHtml(row.name) + "</strong></td><td>" + row.posts + "</td><td>" + number.format(row.views) + "</td><td>" + number.format(row.interactions) + "</td><td>" + row.engagement.toFixed(2) + "%</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  return '<div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Publicaciones</th><th>Alcance</th><th>Impresiones</th><th>Interacciones</th><th>Engagement</th></tr></thead><tbody>' +
    rows.map(function (row) { return "<tr><td><strong>" + escapeHtml(row.name) + "</strong></td><td>" + row.posts + "</td><td>" + number.format(row.reach) + "</td><td>" + number.format(row.impressions) + "</td><td>" + number.format(row.interactions) + "</td><td>" + row.engagement.toFixed(2) + "%</td></tr>"; }).join("") + "</tbody></table></div>";
}

function renderRanking(posts) {
  if (!posts.length) return emptyState("No hay publicaciones para clasificar.");
  const rateLabel = state.liveData?.accounts?.length ? " interacciones por vistas" : " engagement";
  return '<div class="rank-list">' + posts.map(function (post, index) {
    return '<article class="rank-item"><span>' + (index + 1) + "</span><div><strong>" + escapeHtml(post.description) + "</strong><small>" + escapeHtml(post.platform) + " · " + escapeHtml(post.format) + " · " + engagementRate(post).toFixed(2) + "%" + rateLabel + "</small></div></article>";
  }).join("") + "</div>";
}

function renderInsightPreview(anomalies) {
  if (!anomalies.length) return emptyState("No se detectaron anomalias con los filtros actuales.");
  return '<div class="stack-list">' + anomalies.map(function (item) {
    return '<article class="insight-item"><strong>' + escapeHtml(item.type) + "</strong><p>" + escapeHtml(item.evidence) + '</p><a href="#/insights">Ver analisis completo</a></article>';
  }).join("") + "</div>";
}

function renderRecommendation(item) {
  return '<article class="recommendation-card priority-' + item.priority.toLowerCase() + '"><span>' + escapeHtml(item.priority) + ' prioridad</span><h3>' + escapeHtml(item.problem) + "</h3><p><b>Evidencia:</b> " + escapeHtml(item.evidence) + "</p><p><b>Impacto:</b> " + escapeHtml(item.impact) + "</p><p><b>Accion:</b> " + escapeHtml(item.action) + "</p></article>";
}

function buildReportHtml(data) {
  const isLive = Boolean(state.liveData?.accounts?.length);
  const top = data.topPosts[0];
  const low = data.bottomPosts[0];
  const generated = dateTime.format(new Date());
  const views = data.posts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
  const interactions = data.posts.reduce(function (total, post) { return total + totalInteractions(post); }, 0);
  const officialRate = views ? (interactions / views) * 100 : 0;
  const summary = isLive
    ? "La salud parcial alcanza <strong>" + data.audit.totalScore + "/100 (" + escapeHtml(data.audit.label) + ")</strong>. El periodo registra " + number.format(views) + " vistas y " + decimal.format(officialRate) + "% de interacciones por vistas sobre " + data.kpis.posts + " videos."
    : "La salud general alcanza <strong>" + data.audit.totalScore + "/100 (" + escapeHtml(data.audit.label) + ")</strong>. El periodo registra " + number.format(data.kpis.reach) + " de alcance y " + decimal.format(data.kpis.engagement) + "% de engagement sobre " + data.kpis.posts + " publicaciones.";
  const reportKpis = isLive
    ? '<div><span>Suscriptores</span><strong>' + (data.accounts.some(function (account) { return account.followers != null; }) ? number.format(data.kpis.followers) : "No disponible") + '</strong></div><div><span>Vistas</span><strong>' + number.format(views) + '</strong></div><div><span>Interacciones</span><strong>' + number.format(interactions) + '</strong></div><div><span>Interacciones / vistas</span><strong>' + decimal.format(officialRate) + '%</strong></div>'
    : '<div><span>Seguidores</span><strong>' + number.format(data.kpis.followers) + '</strong></div><div><span>Alcance</span><strong>' + number.format(data.kpis.reach) + '</strong></div><div><span>Impresiones</span><strong>' + number.format(data.kpis.impressions) + '</strong></div><div><span>Engagement</span><strong>' + decimal.format(data.kpis.engagement) + "%</strong></div>";
  return '<header class="report-cover"><span>Social Audit Pro</span><p>Reporte ejecutivo de auditoria y rendimiento</p><h2>' + escapeHtml(state.platform === "all" ? "Ecosistema social multicanal" : state.platform) + '</h2><div><span>Periodo analizado: ' + escapeHtml(state.period) + ' dias</span><span>Generado: ' + escapeHtml(generated) + '</span></div></header>' +
    '<section><h3>1. Resumen ejecutivo</h3><p>' + summary + "</p></section>" +
    '<section><h3>2. Cuentas analizadas</h3><p>' + escapeHtml(data.accounts.map(function (account) { return account.platform + " " + account.handle; }).join(", ") || "Ninguna cuenta con los filtros actuales") + '.</p></section>' +
    '<section><h3>3. KPIs principales</h3><div class="report-kpis">' + reportKpis + "</div></section>" +
    '<section><h3>4. Analisis de contenido</h3><p><strong>Mejor publicacion:</strong> ' + escapeHtml(top ? top.description : "Sin datos") + '.</p><p><strong>Publicacion de menor rendimiento:</strong> ' + escapeHtml(low ? low.description : "Sin datos") + '.</p></section>' +
    '<section><h3>5. Problemas y oportunidades</h3>' + (data.anomalies.length ? "<ul>" + data.anomalies.slice(0, 5).map(function (item) { return "<li><strong>" + escapeHtml(item.type) + ":</strong> " + escapeHtml(item.evidence) + "</li>"; }).join("") + "</ul>" : "<p>No se detectaron anomalias con los filtros actuales.</p>") + '</section>' +
    '<section><h3>6. Recomendaciones</h3>' + (data.recommendations.length ? "<ol>" + data.recommendations.map(function (item) { return "<li><strong>" + escapeHtml(item.priority) + ":</strong> " + escapeHtml(item.action) + "</li>"; }).join("") + "</ol>" : "<p>Mantener monitoreo y ampliar el historial.</p>") + '</section>' +
    '<section><h3>7. Conclusion</h3><p>' + (isLive ? "Las conclusiones se basan exclusivamente en los datos oficiales disponibles para la cuenta autorizada. Alcance, impresiones y demografia no se estiman cuando la API no los proporciona." : "Las conclusiones se basan exclusivamente en los datos demostrativos visibles y en reglas documentadas. Las hipotesis deben validarse con mayor historial y contexto de campana antes de tomar decisiones definitivas.") + "</p></section>";
}

function buildDownloadDocument(data) {
  const body = buildReportHtml(data);
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte Social Audit Pro</title><style>body{font-family:Arial,sans-serif;color:#17212b;max-width:900px;margin:40px auto;line-height:1.55}header{border-bottom:3px solid #0f766e;padding-bottom:24px}section{margin:32px 0}.report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.report-kpis div{border:1px solid #d9e0e8;padding:14px}.report-kpis span,.report-kpis strong{display:block}.report-kpis strong{font-size:22px;margin-top:8px}@media print{body{margin:0}}</style></head><body>' + body + "</body></html>";
}

function buildReportPayload(data) {
  if (!state.liveData?.accounts?.length) {
    return {
      dataSource: "demo",
      kpis: data.kpis,
      audit: data.audit,
      anomalies: data.anomalies,
      recommendations: data.recommendations
    };
  }
  const views = data.posts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
  const interactions = data.posts.reduce(function (total, post) { return total + totalInteractions(post); }, 0);
  return {
    dataSource: "official",
    kpis: {
      subscribers: data.accounts.some(function (account) { return account.followers != null; }) ? data.kpis.followers : null,
      views,
      interactions,
      interactionRate: views ? interactions / views * 100 : 0
    },
    audit: data.audit,
    anomalies: data.anomalies,
    recommendations: data.recommendations
  };
}

function uniqueValues(items, field) {
  return [...new Set(items.map(function (item) { return item[field]; }).filter(Boolean))].sort();
}

function selectedOption(value, label, current) {
  return '<option value="' + escapeHtml(value) + '"' + (value === current ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
}

function optionList(values, selected, allLabel) {
  return selectedOption("all", allLabel, selected) + values.map(function (value) {
    return selectedOption(value, value, selected);
  }).join("");
}

function getPostsForAccounts(accounts) {
  const ids = new Set(accounts.map(function (account) { return account.id; }));
  return activeData().posts.filter(function (post) { return ids.has(post.accountId); });
}

function updateAccountOptions() {
  const candidates = activeData().accounts.filter(function (account) {
    return state.platform === "all" || account.platform === state.platform;
  });
  elements.account.innerHTML = selectedOption("all", "Todas las cuentas", state.account) + candidates.map(function (account) {
    return selectedOption(account.id, account.platform + " · " + account.handle, state.account);
  }).join("");
  if (state.account !== "all" && !candidates.some(function (account) { return account.id === state.account; })) {
    state.account = "all";
    elements.account.value = "all";
  }
}

function render() {
  const routeName = currentRoute();
  const route = routes[routeName];
  const data = allAnalysis();
  elements.eyebrow.textContent = route.eyebrow;
  elements.title.textContent = route.title;
  elements.description.textContent = route.description;
  const lastSync = activeData().lastSync;
  elements.sync.textContent = lastSync
    ? "Ultima actualizacion: " + dateTime.format(new Date(lastSync))
    : "Sin sincronizacion disponible";
  elements.filters.hidden = ["integraciones", "configuracion", "cuenta"].includes(routeName);
  elements.reportShortcut.hidden = routeName === "reportes";
  elements.authArea.innerHTML = !state.apiAvailable
    ? '<span class="demo-badge online-badge">Demostracion online</span>'
    : state.user
    ? '<button id="account-button" class="account-button" type="button"><span>' + escapeHtml(state.user.displayName.slice(0, 2).toUpperCase()) + '</span><b>' + escapeHtml(state.user.role) + "</b></button>"
    : '<button id="account-button" class="secondary-button" type="button">Iniciar sesion</button>';
  elements.navigation.querySelectorAll("a").forEach(function (link) {
    const active = link.dataset.route === routeName;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  elements.root.innerHTML = route.render(data);
  bindViewEvents(routeName, data);
  const accountButton = document.querySelector("#account-button");
  if (accountButton) {
    accountButton.addEventListener("click", function () {
      window.location.hash = "#/cuenta";
    });
  }
  document.title = route.title + " | Social Audit Pro";
  elements.status.textContent = "Vista " + route.title + " cargada";
  hydrateRoute(routeName);
}

function bindViewEvents(routeName, data) {
  if (routeName === "contenido") {
    const search = document.querySelector("#post-search");
    const topic = document.querySelector("#topic-filter");
    const campaign = document.querySelector("#campaign-filter");
    const performance = document.querySelector("#performance-filter");
    const sort = document.querySelector("#sort-filter");
    search.addEventListener("input", function (event) { state.search = event.target.value; render(); });
    topic.addEventListener("change", function (event) { state.topic = event.target.value; render(); });
    campaign.addEventListener("change", function (event) { state.campaign = event.target.value; render(); });
    performance.addEventListener("change", function (event) { state.performance = event.target.value; render(); });
    sort.addEventListener("change", function (event) { state.sort = event.target.value; render(); });
  }
  if (routeName === "reportes") {
    document.querySelector("#download-report").addEventListener("click", function () {
      const blob = new Blob([buildDownloadDocument(data)], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "social-audit-pro-reporte.html";
      link.click();
      URL.revokeObjectURL(url);
    });
    document.querySelector("#print-report").addEventListener("click", function () { window.print(); });
    const pdfButton = document.querySelector("#download-pdf");
    if (pdfButton) {
      pdfButton.addEventListener("click", async function () {
        const message = document.querySelector("#report-message");
        try {
          const response = await fetch("/api/v1/reports/export-pdf", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": state.csrfToken
            },
            body: JSON.stringify({
              title: "Reporte ejecutivo de redes sociales",
              platform: state.platform === "all" ? "Todas las redes" : state.platform,
              periodDays: Number(state.period),
              content: buildReportPayload(data)
            })
          });
          if (!response.ok) {
            const payload = await response.json();
            throw new Error(payload.message || "No se pudo generar el PDF.");
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "social-audit-pro-reporte.pdf";
          link.click();
          URL.revokeObjectURL(url);
          showMessage(message, "PDF generado correctamente.", false);
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const save = document.querySelector("#save-report");
    if (save) {
      save.addEventListener("click", async function () {
        const message = document.querySelector("#report-message");
        try {
          await apiRequest("/reports", {
            method: "POST",
            body: {
              title: "Reporte ejecutivo " + new Date().toLocaleDateString("es-PE"),
              reportType: "executive",
              content: {
                periodDays: Number(state.period),
                platform: state.platform,
                ...buildReportPayload(data)
              }
            }
          });
          showMessage(message, "Reporte guardado en la base de datos.", false);
          state.savedReports = null;
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
  }
  if (routeName === "integraciones") {
    const form = document.querySelector("#integration-form");
    if (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        const message = document.querySelector("#integration-message");
        try {
          await apiRequest("/integrations/" + values.platform + "/configure", {
            method: "POST",
            body: {
              displayName: values.displayName,
              clientId: values.clientId,
              clientSecret: values.clientSecret
            }
          });
          form.reset();
          state.persistedIntegrations = null;
          showMessage(message, "Credenciales cifradas y guardadas.", false);
          await hydrateRoute("integraciones");
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    document.querySelectorAll("[data-oauth-platform]").forEach(function (button) {
      button.addEventListener("click", async function () {
        const message = document.querySelector("#oauth-message");
        button.disabled = true;
        try {
          const result = await apiRequest("/integrations/" + button.dataset.oauthPlatform + "/oauth/start");
          window.location.assign(result.authorizationUrl);
        } catch (error) {
          button.disabled = false;
          showMessage(message, error.message, true);
        }
      });
    });
    document.querySelectorAll("[data-sync-platform]").forEach(function (button) {
      button.addEventListener("click", async function () {
        const message = document.querySelector("#oauth-message");
        button.disabled = true;
        try {
          const result = await apiRequest("/integrations/" + button.dataset.syncPlatform + "/sync", { method: "POST" });
          state.persistedIntegrations = null;
          await loadLiveData();
          await hydrateRoute("integraciones");
          showMessage(document.querySelector("#oauth-message"), "Sincronizacion completada: " + result.recordsImported + " registros procesados.", false);
        } catch (error) {
          button.disabled = false;
          showMessage(message, error.message, true);
        }
      });
    });
    document.querySelectorAll("[data-schedule-platform]").forEach(function (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const message = document.querySelector("#oauth-message");
        const values = new FormData(form);
        try {
          await apiRequest("/integrations/" + form.dataset.schedulePlatform + "/schedule", {
            method: "PATCH",
            body: {
              enabled: values.get("enabled") === "on",
              intervalMinutes: Number(values.get("intervalMinutes"))
            }
          });
          state.persistedIntegrations = null;
          await hydrateRoute("integraciones");
          showMessage(document.querySelector("#oauth-message"), "Programacion actualizada.", false);
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    });
  }
  if (routeName === "configuracion") {
    const form = document.querySelector("#user-form");
    if (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        const message = document.querySelector("#user-message");
        try {
          await apiRequest("/auth/register", { method: "POST", body: values });
          form.reset();
          state.users = null;
          showMessage(message, "Usuario creado correctamente.", false);
          await hydrateRoute("configuracion");
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    document.querySelectorAll(".user-save").forEach(function (button) {
      button.addEventListener("click", async function () {
        const userId = button.dataset.userId;
        const message = document.querySelector("#user-message");
        try {
          await apiRequest("/users/" + userId, {
            method: "PATCH",
            body: {
              role: document.querySelector('[data-user-role="' + userId + '"]').value,
              status: document.querySelector('[data-user-status="' + userId + '"]').value
            }
          });
          state.users = null;
          showMessage(message, "Usuario actualizado correctamente.", false);
          await hydrateRoute("configuracion");
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    });
  }
  if (routeName === "cuenta") {
    const form = document.querySelector("#auth-form");
    if (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        const message = document.querySelector("#auth-message");
        try {
          const endpoint = state.needsInitialAdmin ? "/auth/register" : "/auth/login";
          const result = await apiRequest(endpoint, { method: "POST", body: values });
          if (result.mfaRequired) {
            state.mfaChallengeToken = result.challengeToken;
            state.accountNotice = null;
            render();
            return;
          }
          state.user = result.user;
          state.csrfToken = result.csrfToken;
          state.accountPreviewUrl = result.previewVerificationUrl || null;
          state.needsInitialAdmin = false;
          state.users = null;
          state.persistedIntegrations = null;
          await loadLiveData();
          window.location.hash = "#/dashboard";
          render();
        } catch (error) {
          if (error.payload?.error === "email_unverified") {
            state.accountPreviewUrl = error.payload.previewVerificationUrl || null;
            state.accountNotice = { message: error.message, error: true };
            render();
            return;
          }
          showMessage(message, error.message, true);
        }
      });
    }
    const mfaLoginForm = document.querySelector("#mfa-login-form");
    if (mfaLoginForm) {
      mfaLoginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(mfaLoginForm));
        const message = document.querySelector("#auth-message");
        try {
          const result = await apiRequest("/auth/login/2fa", {
            method: "POST",
            body: { challengeToken: state.mfaChallengeToken, code: values.code }
          });
          state.user = result.user;
          state.csrfToken = result.csrfToken;
          state.mfaChallengeToken = null;
          state.accountNotice = null;
          state.users = null;
          state.persistedIntegrations = null;
          await loadLiveData();
          window.location.hash = "#/dashboard";
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const forgotPasswordForm = document.querySelector("#forgot-password-form");
    if (forgotPasswordForm) {
      forgotPasswordForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(forgotPasswordForm));
        const message = document.querySelector("#recovery-message");
        try {
          const result = await apiRequest("/auth/password/forgot", { method: "POST", body: values });
          state.accountPreviewUrl = result.previewResetUrl || null;
          state.accountNotice = { message: result.message, error: false };
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const passwordResetForm = document.querySelector("#password-reset-form");
    if (passwordResetForm) {
      passwordResetForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(passwordResetForm));
        const message = document.querySelector("#auth-message");
        if (values.password !== values.confirmation) {
          showMessage(message, "Las contrasenas no coinciden.", true);
          return;
        }
        try {
          await apiRequest("/auth/password/reset", {
            method: "POST",
            body: { token: state.passwordResetToken, password: values.password }
          });
          state.passwordResetToken = null;
          state.accountPreviewUrl = null;
          state.accountNotice = { message: "Contrasena actualizada. Ya puedes iniciar sesion.", error: false };
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const verifyEmail = document.querySelector("#verify-email-button");
    if (verifyEmail) {
      verifyEmail.addEventListener("click", async function () {
        const message = document.querySelector("#security-message");
        try {
          const result = await apiRequest("/auth/email-verification/request", { method: "POST" });
          state.accountPreviewUrl = result.previewVerificationUrl || null;
          state.accountNotice = { message: "La verificacion de correo fue preparada.", error: false };
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const mfaSetupButton = document.querySelector("#mfa-setup-button");
    if (mfaSetupButton) {
      mfaSetupButton.addEventListener("click", async function () {
        const message = document.querySelector("#security-message");
        try {
          state.mfaSetup = await apiRequest("/auth/mfa/setup", { method: "POST" });
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const mfaConfirmForm = document.querySelector("#mfa-confirm-form");
    if (mfaConfirmForm) {
      mfaConfirmForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(mfaConfirmForm));
        const message = document.querySelector("#security-message");
        try {
          const result = await apiRequest("/auth/mfa/confirm", { method: "POST", body: values });
          const session = await apiRequest("/auth/me");
          state.user = session.user;
          state.csrfToken = session.csrfToken;
          state.mfaSetup = null;
          state.recoveryCodes = result.recoveryCodes;
          state.accountNotice = { message: "El segundo factor quedo activo.", error: false };
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const mfaDisableForm = document.querySelector("#mfa-disable-form");
    if (mfaDisableForm) {
      mfaDisableForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(mfaDisableForm));
        const message = document.querySelector("#security-message");
        try {
          await apiRequest("/auth/mfa/disable", { method: "POST", body: values });
          const session = await apiRequest("/auth/me");
          state.user = session.user;
          state.csrfToken = session.csrfToken;
          state.recoveryCodes = null;
          state.accountNotice = { message: "El segundo factor fue desactivado.", error: false };
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const logout = document.querySelector("#logout-button");
    if (logout) {
      logout.addEventListener("click", async function () {
        await apiRequest("/auth/logout", { method: "POST" });
        state.user = null;
        state.csrfToken = null;
        state.users = null;
        state.organizations = null;
        state.persistedIntegrations = null;
        state.liveData = null;
        state.mfaSetup = null;
        state.recoveryCodes = null;
        state.accountPreviewUrl = null;
        window.location.hash = "#/dashboard";
        render();
      });
    }
    const organizationSelect = document.querySelector("#organization-select-form");
    if (organizationSelect) {
      organizationSelect.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(organizationSelect));
        const message = document.querySelector("#organization-message");
        try {
          await apiRequest("/organizations/" + values.organizationId + "/select", { method: "POST" });
          const session = await apiRequest("/auth/me");
          state.user = session.user;
          state.csrfToken = session.csrfToken;
          state.users = null;
          state.persistedIntegrations = null;
          state.liveData = null;
          await loadLiveData();
          showMessage(message, "Organizacion activa actualizada.", false);
          render();
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
    const organizationCreate = document.querySelector("#organization-create-form");
    if (organizationCreate) {
      organizationCreate.addEventListener("submit", async function (event) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(organizationCreate));
        const message = document.querySelector("#organization-message");
        try {
          await apiRequest("/organizations", { method: "POST", body: values });
          organizationCreate.reset();
          state.organizations = null;
          await hydrateRoute("cuenta");
          showMessage(document.querySelector("#organization-message"), "Organizacion creada correctamente.", false);
        } catch (error) {
          showMessage(message, error.message, true);
        }
      });
    }
  }
}

function showMessage(element, message, isError) {
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function hydrateRoute(routeName) {
  try {
    if (routeName === "configuracion" && can("users:manage") && state.users === null) {
      state.users = [];
      const payload = await apiRequest("/users");
      state.users = payload.users;
      if (currentRoute() === routeName) render();
    }
    if (routeName === "integraciones" && state.user && state.persistedIntegrations === null) {
      state.persistedIntegrations = [];
      const payload = await apiRequest("/integrations");
      state.persistedIntegrations = payload.integrations;
      if (currentRoute() === routeName) render();
    }
    if (routeName === "cuenta" && state.user && state.organizations === null) {
      state.organizations = [];
      const payload = await apiRequest("/organizations");
      state.organizations = payload.organizations;
      if (currentRoute() === routeName) render();
    }
  } catch (error) {
    elements.status.textContent = error.message;
  }
}

function bindGlobalEvents() {
  elements.period.addEventListener("change", function (event) {
    state.period = event.target.value;
    render();
  });
  elements.platform.addEventListener("change", function (event) {
    state.platform = event.target.value;
    state.account = "all";
    updateAccountOptions();
    render();
  });
  elements.account.addEventListener("change", function (event) {
    state.account = event.target.value;
    render();
  });
  elements.format.addEventListener("change", function (event) {
    state.format = event.target.value;
    render();
  });
  elements.reportShortcut.addEventListener("click", function () {
    window.location.hash = "#/reportes";
  });
  window.addEventListener("hashchange", function () {
    window.scrollTo({ top: 0, behavior: "auto" });
    render();
  });
}

updateAccountOptions();
bindGlobalEvents();
if (!window.location.hash) window.location.hash = "#/dashboard";
await bootstrapAuth();
await processAccountLink();
await loadLiveData();
render();
