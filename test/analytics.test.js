import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAudit,
  calculateKpis,
  classifyPerformance,
  detectAnomalies,
  engagementRate,
  percentChange,
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
});
