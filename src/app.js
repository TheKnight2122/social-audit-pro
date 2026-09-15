import { sampleData } from "./data/sampleData.js";
import {
  buildRecommendations,
  calculateAudit,
  calculateKpis,
  classifyPerformance,
  detectAnomalies,
  engagementRate,
  filterPosts,
  rankPosts,
  totalInteractions
} from "./analytics.js";

const formatNumber = new Intl.NumberFormat("es-PE");
const formatPercent = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });

const state = {
  period: "30",
  platform: "all",
  format: "all",
  performance: "all",
  search: ""
};

const elements = {
  period: document.querySelector("#period-filter"),
  platform: document.querySelector("#platform-filter"),
  format: document.querySelector("#format-filter"),
  performance: document.querySelector("#performance-filter"),
  search: document.querySelector("#post-search"),
  summary: document.querySelector("#dashboard"),
  sync: document.querySelector("#last-sync"),
  auditScore: document.querySelector("#audit-score"),
  healthBars: document.querySelector("#health-bars"),
  trend: document.querySelector("#trend-chart"),
  insights: document.querySelector("#insight-list"),
  postsTable: document.querySelector("#posts-table"),
  topPosts: document.querySelector("#top-posts"),
  bottomPosts: document.querySelector("#bottom-posts"),
  recommendations: document.querySelector("#recommendations"),
  report: document.querySelector("#report-output"),
  exportReport: document.querySelector("#export-report")
};

function getVisibleAccounts() {
  if (state.platform === "all") return sampleData.accounts;
  return sampleData.accounts.filter((account) => account.platform === state.platform);
}

function getVisiblePosts() {
  const latestDate = new Date(Math.max(...sampleData.posts.map((post) => new Date(post.date).getTime())));
  const periodDays = Number(state.period);
  const postsInPeriod = sampleData.posts.filter((post) => {
    const postDate = new Date(post.date);
    const ageInDays = (latestDate - postDate) / (1000 * 60 * 60 * 24);
    return ageInDays < periodDays;
  });

  return filterPosts(postsInPeriod, state);
}

function renderKpis(kpis) {
  const cards = [
    {
      label: "Seguidores",
      value: formatNumber.format(kpis.followers),
      change: kpis.followersChange,
      note: "Crecimiento frente al periodo anterior"
    },
    {
      label: "Alcance",
      value: formatNumber.format(kpis.reach),
      change: kpis.reachChange,
      note: "Personas alcanzadas por publicaciones"
    },
    {
      label: "Engagement",
      value: `${formatPercent.format(kpis.engagement)}%`,
      change: kpis.engagement - 5,
      note: "Formula: interacciones / alcance x 100"
    },
    {
      label: "Publicaciones",
      value: formatNumber.format(kpis.posts),
      change: kpis.posts >= 8 ? 8 : -12,
      note: "Volumen analizado en el periodo"
    }
  ];

  elements.summary.innerHTML = cards
    .map((card) => {
      const positive = card.change >= 0;
      return `
        <article class="kpi-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <div class="${positive ? "positive" : "negative"}">${positive ? "↑" : "↓"} ${Math.abs(card.change).toFixed(1)}%</div>
          <p>${card.note}</p>
        </article>
      `;
    })
    .join("");
}

function renderAudit(audit) {
  elements.auditScore.textContent = `${audit.totalScore}/100 · ${audit.label}`;
  elements.healthBars.innerHTML = audit.dimensions
    .map(
      (dimension) => `
        <div class="health-item">
          <div>
            <strong>${dimension.name}</strong>
            <span>${dimension.explanation}</span>
          </div>
          <div class="bar" aria-label="${dimension.name}: ${dimension.score}">
            <span style="width: ${dimension.score}%"></span>
          </div>
          <b>${dimension.score}</b>
        </div>
      `
    )
    .join("");
}

function renderTrend() {
  const max = Math.max(...sampleData.engagementTrend.map((point) => point.value));
  elements.trend.innerHTML = sampleData.engagementTrend
    .map(
      (point) => `
        <div class="trend-bar">
          <span style="height: ${(point.value / max) * 100}%"></span>
          <small>${point.label}</small>
          <b>${point.value}%</b>
        </div>
      `
    )
    .join("");
}

function renderInsights(anomalies) {
  elements.insights.innerHTML = anomalies.length
    ? anomalies
        .slice(0, 4)
        .map(
          (anomaly) => `
            <article class="insight-item">
              <strong>${anomaly.type}</strong>
              <p><b>Dato:</b> ${anomaly.evidence}</p>
              <p><b>Recomendacion:</b> ${anomaly.recommendation}</p>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No se detectaron anomalias con los filtros actuales.</p>`;
}

function renderPosts(posts) {
  elements.postsTable.innerHTML = posts
    .map((post) => {
      const rate = engagementRate(post);
      const performance = classifyPerformance(rate);
      return `
        <tr>
          <td>${post.date}</td>
          <td>${post.platform}</td>
          <td>${post.format}</td>
          <td>${post.description}</td>
          <td>${formatNumber.format(post.reach)}</td>
          <td>${formatNumber.format(totalInteractions(post))}</td>
          <td>${rate.toFixed(2)}%</td>
          <td><span class="status ${performance}">${performanceLabel(performance)}</span></td>
        </tr>
      `;
    })
    .join("");
}

function performanceLabel(value) {
  return {
    high: "Alto",
    medium: "Medio",
    low: "Bajo"
  }[value];
}

function renderRanking(container, posts) {
  container.innerHTML = posts
    .slice(0, 5)
    .map(
      (post, index) => `
        <article class="rank-item">
          <span>${index + 1}</span>
          <div>
            <strong>${post.description}</strong>
            <small>${post.platform} · ${post.format} · ${engagementRate(post).toFixed(2)}%</small>
          </div>
        </article>
      `
    )
    .join("");
}

function renderRecommendations(recommendations) {
  elements.recommendations.innerHTML = recommendations
    .map(
      (item) => `
        <article class="recommendation-card priority-${item.priority.toLowerCase()}">
          <span>${item.priority} prioridad</span>
          <h3>${item.problem}</h3>
          <p><b>Evidencia:</b> ${item.evidence}</p>
          <p><b>Impacto:</b> ${item.impact}</p>
          <p><b>Accion:</b> ${item.action}</p>
        </article>
      `
    )
    .join("");
}

function buildReport(kpis, audit, anomalies, recommendations) {
  return [
    "REPORTE EJECUTIVO - SOCIAL AUDIT PRO",
    `Periodo: ${sampleData.periodLabel}`,
    `Ultima actualizacion: ${new Date(sampleData.lastSync).toLocaleString("es-PE")}`,
    "",
    `Salud general: ${audit.totalScore}/100 (${audit.label})`,
    `Seguidores: ${formatNumber.format(kpis.followers)} (${kpis.followersChange.toFixed(1)}% vs. periodo anterior)`,
    `Alcance: ${formatNumber.format(kpis.reach)} (${kpis.reachChange.toFixed(1)}% vs. periodo anterior)`,
    `Engagement: ${kpis.engagement.toFixed(2)}%`,
    "",
    "Hallazgos principales:",
    ...anomalies.slice(0, 3).map((item) => `- ${item.type}: ${item.evidence}`),
    "",
    "Recomendaciones prioritarias:",
    ...recommendations.slice(0, 3).map((item) => `- [${item.priority}] ${item.action}`)
  ].join("\n");
}

function render() {
  const accounts = getVisibleAccounts();
  const posts = getVisiblePosts();
  const kpis = calculateKpis(accounts, posts);
  const audit = calculateAudit(kpis, posts);
  const anomalies = detectAnomalies(posts);
  const topPosts = rankPosts(posts, "top");
  const bottomPosts = rankPosts(posts, "bottom");
  const recommendations = buildRecommendations(kpis, anomalies, topPosts, bottomPosts);

  elements.sync.textContent = `Ultima actualizacion: ${new Date(sampleData.lastSync).toLocaleString("es-PE")}`;
  renderKpis(kpis);
  renderAudit(audit);
  renderTrend();
  renderInsights(anomalies);
  renderPosts(posts);
  renderRanking(elements.topPosts, topPosts);
  renderRanking(elements.bottomPosts, bottomPosts);
  renderRecommendations(recommendations);
  elements.report.textContent = buildReport(kpis, audit, anomalies, recommendations);
}

function bindEvents() {
  elements.period.addEventListener("change", (event) => {
    state.period = event.target.value;
    render();
  });
  elements.platform.addEventListener("change", (event) => {
    state.platform = event.target.value;
    render();
  });
  elements.format.addEventListener("change", (event) => {
    state.format = event.target.value;
    render();
  });
  elements.performance.addEventListener("change", (event) => {
    state.performance = event.target.value;
    render();
  });
  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  elements.exportReport.addEventListener("click", () => {
    elements.report.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

bindEvents();
render();
