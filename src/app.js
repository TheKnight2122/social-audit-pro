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
  sort: "engagement-desc"
};

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
  status: document.querySelector("#app-status")
};

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

function getVisibleAccounts() {
  return sampleData.accounts.filter(function (account) {
    const platformMatches = state.platform === "all" || account.platform === state.platform;
    const accountMatches = state.account === "all" || account.id === state.account;
    return platformMatches && accountMatches;
  });
}

function getVisiblePosts() {
  const latestDate = new Date(Math.max(...sampleData.posts.map(function (post) {
    return new Date(post.date).getTime();
  })));
  const days = Number(state.period);
  const periodPosts = sampleData.posts.filter(function (post) {
    const age = (latestDate - new Date(post.date)) / 86400000;
    return age < days;
  });
  return filterPosts(periodPosts, state);
}

function allAnalysis() {
  const accounts = getVisibleAccounts();
  const posts = getVisiblePosts();
  const kpis = calculateKpis(accounts, posts);
  const audit = calculateAudit(kpis, posts);
  const anomalies = detectAnomalies(posts);
  const topPosts = rankPosts(posts, "top");
  const bottomPosts = rankPosts(posts, "bottom");
  const recommendations = buildRecommendations(kpis, anomalies, topPosts, bottomPosts);
  return { accounts, posts, kpis, audit, anomalies, topPosts, bottomPosts, recommendations };
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
  return '<article class="kpi-card"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + '</strong><div class="kpi-change">' + changeMarkup(change) + "</div><p>" + escapeHtml(note) + "</p></article>";
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
  const engagementChange = percentChange(kpis.engagement, 5);
  return '<section class="summary-grid">' +
    kpiCard("Seguidores", number.format(kpis.followers), kpis.followersChange, "Comunidad acumulada de las cuentas visibles") +
    kpiCard("Alcance", number.format(kpis.reach), kpis.reachChange, "Personas alcanzadas por el contenido") +
    kpiCard("Engagement", decimal.format(kpis.engagement) + "%", engagementChange, "Formula: interacciones / alcance x 100") +
    kpiCard("Publicaciones", number.format(kpis.posts), kpis.posts >= 8 ? 8 : -12, "Volumen analizado en el periodo") +
    "</section>";
}

function renderTrendChart() {
  const max = Math.max(...sampleData.engagementTrend.map(function (point) { return point.value; }));
  const bars = sampleData.engagementTrend.map(function (point) {
    const height = Math.max(8, (point.value / max) * 100);
    return '<div class="trend-bar"><div class="bar-track"><span style="height:' + height + '%"></span></div><small>' + escapeHtml(point.label) + "</small><b>" + point.value + "%</b></div>";
  }).join("");
  return '<div class="trend-chart" aria-label="Evolucion semanal del engagement">' + bars + "</div>";
}

function renderHealthBars(audit) {
  return '<div class="health-bars">' + audit.dimensions.map(function (dimension) {
    return '<div class="health-item"><div><strong>' + escapeHtml(dimension.name) + "</strong><span>" + escapeHtml(dimension.explanation) + '</span></div><div class="bar" aria-label="' + escapeHtml(dimension.name) + ": " + dimension.score + '"><span style="width:' + dimension.score + '%"></span></div><b>' + dimension.score + "</b></div>";
  }).join("") + "</div>";
}

function renderDashboard(data) {
  const strongest = [...data.audit.dimensions].sort(function (a, b) { return b.score - a.score; })[0];
  const weakest = [...data.audit.dimensions].sort(function (a, b) { return a.score - b.score; })[0];
  const firstRecommendation = data.recommendations[0];
  return renderSummaryGrid(data.kpis) +
    '<section class="split-grid"><article class="panel">' +
      panelHeader("Salud de cuenta", "Diagnostico general", '<span class="score-pill">' + data.audit.totalScore + "/100 · " + escapeHtml(data.audit.label) + "</span>") +
      '<div class="score-overview"><div class="score-ring" style="--score:' + data.audit.totalScore + '"><strong>' + data.audit.totalScore + "</strong><span>de 100</span></div><div><h3>" + escapeHtml(data.audit.label) + "</h3><p>La puntuacion combina presencia, actividad, engagement, contenido, crecimiento y alcance con ponderaciones documentadas.</p></div></div>" +
    '</article><article class="panel">' +
      panelHeader("Tendencia", "Evolucion del engagement") + renderTrendChart() +
    '</article></section>' +
    '<section class="decision-band"><div><span>Principal fortaleza</span><strong>' + escapeHtml(strongest.name) + " · " + strongest.score + '/100</strong><p>' + escapeHtml(strongest.explanation) + '</p></div><div><span>Area a mejorar</span><strong>' + escapeHtml(weakest.name) + " · " + weakest.score + '/100</strong><p>' + escapeHtml(weakest.explanation) + '</p></div><div><span>Accion prioritaria</span><strong>' + escapeHtml(firstRecommendation ? firstRecommendation.priority : "Seguimiento") + '</strong><p>' + escapeHtml(firstRecommendation ? firstRecommendation.action : "Mantener el monitoreo del periodo.") + "</p></div></section>" +
    '<section class="split-grid"><article class="panel">' +
      panelHeader("Hallazgos", "Alertas que requieren contexto") + renderInsightPreview(data.anomalies.slice(0, 3)) +
    '</article><article class="panel">' +
      panelHeader("Contenido", "Publicaciones destacadas") + renderRanking(data.topPosts.slice(0, 4)) +
    "</article></section>";
}

function renderAuditPage(data) {
  const methodology = [
    ["Presencia digital", "15%", "Completitud del perfil"],
    ["Actividad", "15%", "Volumen y consistencia"],
    ["Engagement", "25%", "Interacciones sobre alcance"],
    ["Contenido", "15%", "Frecuencia y respuesta"],
    ["Crecimiento", "15%", "Variacion de seguidores"],
    ["Alcance", "15%", "Variacion del alcance"]
  ];
  return '<section class="audit-hero"><div class="score-ring large" style="--score:' + data.audit.totalScore + '"><strong>' + data.audit.totalScore + "</strong><span>" + escapeHtml(data.audit.label) + '</span></div><div><p class="eyebrow">Puntuacion consolidada</p><h2>Salud de las cuentas seleccionadas</h2><p>Resultado calculado con seis dimensiones y datos del periodo filtrado. La puntuacion no es arbitraria: cada componente muestra su evidencia y peso.</p></div></section>' +
    '<section class="panel">' + panelHeader("Dimensiones", "Detalle de la auditoria") + renderHealthBars(data.audit) + "</section>" +
    '<section class="panel">' + panelHeader("Transparencia", "Metodologia de puntuacion") +
      '<div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Peso</th><th>Base de calculo</th></tr></thead><tbody>' +
      methodology.map(function (row) { return "<tr><td><strong>" + row[0] + "</strong></td><td>" + row[1] + "</td><td>" + row[2] + "</td></tr>"; }).join("") +
      "</tbody></table></div></section>";
}

function renderMetricsPage(data) {
  const reachAverage = data.kpis.posts ? data.kpis.reach / data.kpis.posts : 0;
  const impressionAverage = data.kpis.posts ? data.kpis.impressions / data.kpis.posts : 0;
  const clicks = data.posts.reduce(function (total, post) { return total + Number(post.clicks || 0); }, 0);
  const ctr = data.kpis.impressions ? (clicks / data.kpis.impressions) * 100 : 0;
  const hasVideo = data.posts.some(function (post) { return Number.isFinite(post.views); });
  const views = data.posts.reduce(function (total, post) { return total + Number(post.views || 0); }, 0);
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
  const posts = sortPosts(data.posts, state.sort);
  const patterns = getContentPattern(data.posts);
  return '<section class="panel">' +
    '<div class="content-toolbar"><label>Buscar<input id="post-search" type="search" value="' + escapeHtml(state.search) + '" placeholder="Tema o descripcion" /></label><label>Tematica<select id="topic-filter">' + optionList(uniqueValues(sampleData.posts, "topic"), state.topic, "Todas") + '</select></label><label>Campana<select id="campaign-filter">' + optionList(uniqueValues(sampleData.posts, "campaign"), state.campaign, "Todas") + '</select></label><label>Rendimiento<select id="performance-filter"><option value="all">Todos</option>' + selectedOption("high", "Alto", state.performance) + selectedOption("medium", "Medio", state.performance) + selectedOption("low", "Bajo", state.performance) + '</select></label><label>Ordenar<select id="sort-filter">' + selectedOption("engagement-desc", "Mayor engagement", state.sort) + selectedOption("reach-desc", "Mayor alcance", state.sort) + selectedOption("interactions-desc", "Mayor interaccion", state.sort) + selectedOption("date-desc", "Mas recientes", state.sort) + selectedOption("performance-asc", "Peor rendimiento", state.sort) + "</select></label></div>" +
    panelHeader("Publicaciones", number.format(posts.length) + " resultados") +
    renderPostsTable(posts) + "</section>" +
    '<section class="split-grid"><article class="panel">' + panelHeader("Top 10", "Mejor rendimiento") + renderRanking(data.topPosts.slice(0, 10)) + '</article><article class="panel">' + panelHeader("Bottom 10", "Menor rendimiento") + renderRanking(data.bottomPosts.slice(0, 10)) + "</article></section>" +
    '<section class="decision-band"><div><span>Formato mas efectivo</span><strong>' + escapeHtml(patterns.bestFormat ? patterns.bestFormat.name : "Sin datos") + '</strong><p>' + (patterns.bestFormat ? decimal.format(patterns.bestFormat.engagement) + "% de engagement" : "No calculable") + '</p></div><div><span>Tematica mas efectiva</span><strong>' + escapeHtml(patterns.bestTopic ? patterns.bestTopic.name : "Sin datos") + '</strong><p>' + (patterns.bestTopic ? number.format(patterns.bestTopic.interactions) + " interacciones" : "No calculable") + '</p></div><div><span>Hora con mejor respuesta</span><strong>' + escapeHtml(patterns.bestHour ? patterns.bestHour.name : "Sin datos") + '</strong><p>Hallazgo descriptivo; requiere mas historial para recomendar horario.</p></div></section>';
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
  const comparisonAccounts = state.platform === "all" ? sampleData.accounts : data.accounts;
  const comparisonPosts = getPostsForAccounts(comparisonAccounts);
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
    return '<article class="panel insight-detail"><div class="insight-heading"><div><span class="status ' + direction + '">' + escapeHtml(item.metric) + '</span><h2>' + escapeHtml(item.type) + '</h2></div><strong>' + Math.abs(item.magnitude).toFixed(1) + (item.metric === "Engagement" ? "%" : "% variacion") + '</strong></div><dl><div><dt>Dato observado</dt><dd>' + escapeHtml(item.evidence) + '</dd></div><div><dt>Interpretacion</dt><dd>' + escapeHtml(item.interpretation) + '</dd></div><div><dt>Hipotesis</dt><dd>' + escapeHtml(item.hypothesis) + '</dd></div><div><dt>Impacto</dt><dd>' + escapeHtml(item.impact) + '</dd></div><div><dt>Recomendacion</dt><dd>' + escapeHtml(item.recommendation) + "</dd></div></dl></article>";
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
  return '<section class="report-actions"><div><strong>Reporte de auditoria y rendimiento</strong><span>Periodo de ' + escapeHtml(state.period) + ' dias · ' + escapeHtml(state.platform === "all" ? "Todas las redes" : state.platform) + '</span></div><div><button id="print-report" class="secondary-button" type="button">Imprimir</button><button id="download-report" class="primary-button" type="button">Descargar HTML</button></div></section>' +
    '<article id="report-document" class="report-document">' + buildReportHtml(data) + "</article>";
}

function renderIntegrationsPage() {
  return '<section class="integration-grid">' + sampleData.integrations.map(function (integration) {
    const isDemo = integration.status === "demo";
    const status = isDemo ? "Datos demo" : "Sin conectar";
    return '<article class="integration-card"><div class="integration-top"><span class="platform-mark">' + escapeHtml(integration.platform.slice(0, 2).toUpperCase()) + '</span><div><h2>' + escapeHtml(integration.platform) + "</h2><p>" + escapeHtml(integration.provider) + '</p></div><span class="connection-status ' + (isDemo ? "demo" : "pending") + '">' + status + '</span></div><div class="integration-account"><span>Cuenta</span><strong>' + escapeHtml(integration.account || "Ninguna cuenta conectada") + '</strong></div><div class="tag-list">' + integration.metrics.map(function (metric) { return "<span>" + escapeHtml(metric) + "</span>"; }).join("") + '</div><div class="integration-footer"><small>' + (isDemo ? "Actualizacion simulada hace " + integration.freshness : "Requiere OAuth y permisos oficiales") + '</small><button type="button" class="secondary-button" disabled>' + (isDemo ? "Configurar API real" : "Conectar") + "</button></div></article>";
  }).join("") + '</section><section class="info-banner"><strong>Conexion oficial pendiente</strong><p>Los botones permanecen deshabilitados hasta configurar las credenciales OAuth en el backend. Social Audit Pro nunca solicita ni almacena contrasenas de redes sociales.</p></section>';
}

function renderSettingsPage() {
  return '<section class="settings-layout"><article class="panel">' + panelHeader("Acceso", "Usuarios y roles", '<button class="secondary-button" type="button" disabled>Agregar usuario</button>') +
    '<div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Ultimo acceso</th></tr></thead><tbody>' +
    sampleData.users.map(function (user) { return "<tr><td><strong>" + escapeHtml(user.name) + "</strong></td><td>" + escapeHtml(user.email) + "</td><td>" + escapeHtml(user.role) + "</td><td><span class=\"status active\">" + escapeHtml(user.status) + "</span></td><td>" + escapeHtml(user.lastAccess) + "</td></tr>"; }).join("") +
    '</tbody></table></div><p class="form-note">Vista demostrativa. La gestion real de sesiones y permisos se habilitara con el backend de autenticacion.</p></article>' +
    '<article class="panel">' + panelHeader("Reglas", "Escala de auditoria") +
    '<div class="rule-list"><div><span>90-100</span><strong>Excelente</strong></div><div><span>80-89</span><strong>Muy bueno</strong></div><div><span>70-79</span><strong>Bueno</strong></div><div><span>60-69</span><strong>Necesita mejoras</strong></div><div><span>0-59</span><strong>Nivel critico</strong></div></div></article>' +
    '<article class="panel">' + panelHeader("Permisos", "Matriz por rol") +
    '<div class="table-wrap"><table><thead><tr><th>Accion</th><th>Administrador</th><th>Analista</th><th>Cliente</th></tr></thead><tbody><tr><td>Ver dashboards</td><td>Permitido</td><td>Permitido</td><td>Permitido</td></tr><tr><td>Ejecutar auditorias</td><td>Permitido</td><td>Permitido</td><td>Solo lectura</td></tr><tr><td>Gestionar integraciones</td><td>Permitido</td><td>Permitido</td><td>Restringido</td></tr><tr><td>Administrar usuarios</td><td>Permitido</td><td>Restringido</td><td>Restringido</td></tr></tbody></table></div></article></section>';
}

function renderPostsTable(posts) {
  if (!posts.length) return emptyState("Ajusta los filtros para encontrar publicaciones.");
  return '<div class="table-wrap"><table class="posts-table"><thead><tr><th>Fecha</th><th>Red</th><th>Formato</th><th>Contenido</th><th>Alcance</th><th>Impresiones</th><th>Interacciones</th><th>Engagement</th><th>Estado</th></tr></thead><tbody>' +
    posts.map(function (post) {
      const rate = engagementRate(post);
      const performance = classifyPerformance(rate);
      return "<tr><td>" + escapeHtml(post.date) + "</td><td><strong>" + escapeHtml(post.platform) + "</strong></td><td>" + escapeHtml(post.format) + "</td><td><span class=\"post-title\">" + escapeHtml(post.description) + "</span><small>" + escapeHtml(post.topic) + " · " + escapeHtml(post.campaign) + "</small></td><td>" + number.format(post.reach) + "</td><td>" + number.format(post.impressions) + "</td><td>" + number.format(totalInteractions(post)) + "</td><td>" + rate.toFixed(2) + '%</td><td><span class="status ' + performance + '">' + statusLabel(performance) + "</span></td></tr>";
    }).join("") + "</tbody></table></div>";
}

function renderSummaryTable(rows) {
  if (!rows.length) return emptyState("No existen datos suficientes para agrupar.");
  return '<div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Publicaciones</th><th>Alcance</th><th>Impresiones</th><th>Interacciones</th><th>Engagement</th></tr></thead><tbody>' +
    rows.map(function (row) { return "<tr><td><strong>" + escapeHtml(row.name) + "</strong></td><td>" + row.posts + "</td><td>" + number.format(row.reach) + "</td><td>" + number.format(row.impressions) + "</td><td>" + number.format(row.interactions) + "</td><td>" + row.engagement.toFixed(2) + "%</td></tr>"; }).join("") + "</tbody></table></div>";
}

function renderRanking(posts) {
  if (!posts.length) return emptyState("No hay publicaciones para clasificar.");
  return '<div class="rank-list">' + posts.map(function (post, index) {
    return '<article class="rank-item"><span>' + (index + 1) + "</span><div><strong>" + escapeHtml(post.description) + "</strong><small>" + escapeHtml(post.platform) + " · " + escapeHtml(post.format) + " · " + engagementRate(post).toFixed(2) + "% engagement</small></div></article>";
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
  const top = data.topPosts[0];
  const low = data.bottomPosts[0];
  const generated = dateTime.format(new Date(sampleData.lastSync));
  return '<header class="report-cover"><span>Social Audit Pro</span><p>Reporte ejecutivo de auditoria y rendimiento</p><h2>' + escapeHtml(state.platform === "all" ? "Ecosistema social multicanal" : state.platform) + '</h2><div><span>Periodo analizado: ' + escapeHtml(state.period) + ' dias</span><span>Generado: ' + escapeHtml(generated) + '</span></div></header>' +
    '<section><h3>1. Resumen ejecutivo</h3><p>La salud general alcanza <strong>' + data.audit.totalScore + "/100 (" + escapeHtml(data.audit.label) + ")</strong>. El periodo registra " + number.format(data.kpis.reach) + " de alcance y " + decimal.format(data.kpis.engagement) + "% de engagement sobre " + data.kpis.posts + " publicaciones.</p></section>" +
    '<section><h3>2. Cuentas analizadas</h3><p>' + escapeHtml(data.accounts.map(function (account) { return account.platform + " " + account.handle; }).join(", ") || "Ninguna cuenta con los filtros actuales") + '.</p></section>' +
    '<section><h3>3. KPIs principales</h3><div class="report-kpis"><div><span>Seguidores</span><strong>' + number.format(data.kpis.followers) + '</strong></div><div><span>Alcance</span><strong>' + number.format(data.kpis.reach) + '</strong></div><div><span>Impresiones</span><strong>' + number.format(data.kpis.impressions) + '</strong></div><div><span>Engagement</span><strong>' + decimal.format(data.kpis.engagement) + "%</strong></div></div></section>" +
    '<section><h3>4. Analisis de contenido</h3><p><strong>Mejor publicacion:</strong> ' + escapeHtml(top ? top.description : "Sin datos") + '.</p><p><strong>Publicacion de menor rendimiento:</strong> ' + escapeHtml(low ? low.description : "Sin datos") + '.</p></section>' +
    '<section><h3>5. Problemas y oportunidades</h3>' + (data.anomalies.length ? "<ul>" + data.anomalies.slice(0, 5).map(function (item) { return "<li><strong>" + escapeHtml(item.type) + ":</strong> " + escapeHtml(item.evidence) + "</li>"; }).join("") + "</ul>" : "<p>No se detectaron anomalias con los filtros actuales.</p>") + '</section>' +
    '<section><h3>6. Recomendaciones</h3>' + (data.recommendations.length ? "<ol>" + data.recommendations.map(function (item) { return "<li><strong>" + escapeHtml(item.priority) + ":</strong> " + escapeHtml(item.action) + "</li>"; }).join("") + "</ol>" : "<p>Mantener monitoreo y ampliar el historial.</p>") + '</section>' +
    '<section><h3>7. Conclusion</h3><p>Las conclusiones se basan exclusivamente en los datos demostrativos visibles y en reglas documentadas. Las hipotesis deben validarse con mayor historial y contexto de campana antes de tomar decisiones definitivas.</p></section>';
}

function buildDownloadDocument(data) {
  const body = buildReportHtml(data);
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte Social Audit Pro</title><style>body{font-family:Arial,sans-serif;color:#17212b;max-width:900px;margin:40px auto;line-height:1.55}header{border-bottom:3px solid #0f766e;padding-bottom:24px}section{margin:32px 0}.report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.report-kpis div{border:1px solid #d9e0e8;padding:14px}.report-kpis span,.report-kpis strong{display:block}.report-kpis strong{font-size:22px;margin-top:8px}@media print{body{margin:0}}</style></head><body>' + body + "</body></html>";
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
  return sampleData.posts.filter(function (post) { return ids.has(post.accountId); });
}

function updateAccountOptions() {
  const candidates = sampleData.accounts.filter(function (account) {
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
  elements.sync.textContent = "Ultima actualizacion: " + dateTime.format(new Date(sampleData.lastSync));
  elements.filters.hidden = ["integraciones", "configuracion"].includes(routeName);
  elements.reportShortcut.hidden = routeName === "reportes";
  elements.navigation.querySelectorAll("a").forEach(function (link) {
    const active = link.dataset.route === routeName;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  elements.root.innerHTML = route.render(data);
  bindViewEvents(routeName, data);
  document.title = route.title + " | Social Audit Pro";
  elements.status.textContent = "Vista " + route.title + " cargada";
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
  window.addEventListener("hashchange", render);
}

updateAccountOptions();
bindGlobalEvents();
if (!window.location.hash) window.location.hash = "#/dashboard";
render();
