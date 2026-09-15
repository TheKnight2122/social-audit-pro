import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlatformComparison,
  calculateAudit,
  calculateKpis,
  classifyPerformance,
  detectAnomalies,
  engagementRate,
  filterPosts,
  getContentPattern,
  percentChange,
  sortPosts,
  summarizeBy,
  totalInteractions
} from "../src/analytics.js";

test("calcula variacion porcentual contra periodo anterior", () => {
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(0, 0), 0);
  assert.equal(percentChange(50, 0), 100);
});

test("calcula engagement usando interacciones sobre alcance", () => {
  const post = { reach: 1000, likes: 50, comments: 20, shares: 10, saves: 5, clicks: 15 };
  assert.equal(totalInteractions(post), 100);
  assert.equal(engagementRate(post), 10);
});

test("clasifica rendimiento por tasa de engagement", () => {
  assert.equal(classifyPerformance(8), "high");
  assert.equal(classifyPerformance(5), "medium");
  assert.equal(classifyPerformance(2.5), "low");
});

test("calcula KPIs agregados y auditoria respaldada por reglas", () => {
  const accounts = [{ followers: 200, previousFollowers: 100, profileCompleteness: 90 }];
  const posts = [{ reach: 1000, previousReach: 800, impressions: 1500, likes: 80, comments: 10, shares: 5, saves: 5, clicks: 0 }];
  const kpis = calculateKpis(accounts, posts);
  const audit = calculateAudit(kpis, posts);

  assert.equal(kpis.followers, 200);
  assert.equal(kpis.engagement, 10);
  assert.ok(audit.totalScore > 0);
  assert.equal(audit.dimensions.length, 6);
});

test("detecta anomalias de alcance", () => {
  const anomalies = detectAnomalies([
    { date: "2026-09-15", description: "Video viral", reach: 2000, previousReach: 1000, likes: 200, comments: 30, shares: 20, saves: 10, clicks: 5 }
  ]);

  assert.equal(anomalies[0].type, "Crecimiento anormal");
  assert.match(anomalies[0].hypothesis, /pudieron/);
});

test("filtra publicaciones por cuenta, tematica y campana", () => {
  const posts = [
    { accountId: "a", platform: "Instagram", format: "Video", topic: "Educativo", campaign: "Marca", description: "Uno", reach: 100, likes: 10 },
    { accountId: "b", platform: "Facebook", format: "Imagen", topic: "Venta", campaign: "Conversion", description: "Dos", reach: 100, likes: 1 }
  ];
  const filtered = filterPosts(posts, { platform: "all", account: "a", format: "all", performance: "all", topic: "Educativo", campaign: "Marca", search: "" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].description, "Uno");
});

test("ordena y resume rendimiento de contenido", () => {
  const posts = [
    { format: "Video", topic: "A", hour: 20, date: "2026-09-01", description: "Bajo", reach: 100, impressions: 150, likes: 2 },
    { format: "Video", topic: "B", hour: 21, date: "2026-09-02", description: "Alto", reach: 100, impressions: 170, likes: 20 }
  ];
  assert.equal(sortPosts(posts, "engagement-desc")[0].description, "Alto");
  assert.equal(summarizeBy(posts, "format")[0].posts, 2);
  assert.equal(getContentPattern(posts).bestFormat.name, "Video");
});

test("construye comparativa normalizada entre plataformas", () => {
  const accounts = [{ id: "ig", platform: "Instagram", handle: "@demo", followers: 120, previousFollowers: 100 }];
  const posts = [{ accountId: "ig", reach: 1000, impressions: 1400, likes: 80, comments: 20 }];
  const comparison = buildPlatformComparison(accounts, posts);
  assert.equal(comparison[0].growth, 20);
  assert.equal(comparison[0].engagement, 10);
  assert.equal(comparison[0].posts, 1);
});
