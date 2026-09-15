export function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

export function average(values) {
  const numericValues = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  return numericValues.length ? sum(numericValues) / numericValues.length : 0;
}

export function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function totalInteractions(post) {
  return sum([post.likes, post.comments, post.shares, post.saves, post.clicks]);
}

export function engagementRate(post) {
  if (!post.reach) return 0;
  return (totalInteractions(post) / post.reach) * 100;
}

export function classifyPerformance(rate) {
  if (rate >= 8) return "high";
  if (rate >= 4) return "medium";
  return "low";
}

export function scoreLabel(score) {
  if (score >= 90) return "Excelente";
  if (score >= 80) return "Muy bueno";
  if (score >= 70) return "Bueno";
  if (score >= 60) return "Necesita mejoras";
  return "Nivel critico";
}

export function filterPosts(posts, filters) {
  return posts.filter((post) => {
    const matchesPlatform = filters.platform === "all" || post.platform === filters.platform;
    const matchesAccount = !filters.account || filters.account === "all" || post.accountId === filters.account;
    const matchesFormat = filters.format === "all" || post.format === filters.format;
    const matchesSearch = !filters.search || post.description.toLowerCase().includes(filters.search.toLowerCase());
    const matchesTopic = !filters.topic || filters.topic === "all" || post.topic === filters.topic;
    const matchesCampaign = !filters.campaign || filters.campaign === "all" || post.campaign === filters.campaign;
    const performance = classifyPerformance(engagementRate(post));
    const matchesPerformance = !filters.performance || filters.performance === "all" || filters.performance === performance;
    return matchesPlatform && matchesAccount && matchesFormat && matchesSearch && matchesTopic && matchesCampaign && matchesPerformance;
  });
}

export function sortPosts(posts, sortBy = "engagement-desc") {
  const sorted = [...posts];
  const comparators = {
    "engagement-desc": (a, b) => engagementRate(b) - engagementRate(a),
    "reach-desc": (a, b) => b.reach - a.reach,
    "interactions-desc": (a, b) => totalInteractions(b) - totalInteractions(a),
    "date-desc": (a, b) => new Date(b.date) - new Date(a.date),
    "performance-asc": (a, b) => engagementRate(a) - engagementRate(b)
  };
  return sorted.sort(comparators[sortBy] || comparators["engagement-desc"]);
}

export function calculateKpis(accounts, posts) {
  const followers = sum(accounts.map((account) => account.followers));
  const previousFollowers = sum(accounts.map((account) => account.previousFollowers));
  const reach = sum(posts.map((post) => post.reach));
  const previousReach = sum(posts.map((post) => post.previousReach));
  const impressions = sum(posts.map((post) => post.impressions));
  const interactions = sum(posts.map(totalInteractions));
  const engagement = reach ? (interactions / reach) * 100 : 0;
  const averageProfileCompleteness = accounts.length
    ? sum(accounts.map((account) => account.profileCompleteness)) / accounts.length
    : 0;

  return {
    followers,
    followersChange: percentChange(followers, previousFollowers),
    reach,
    reachChange: percentChange(reach, previousReach),
    impressions,
    interactions,
    engagement,
    posts: posts.length,
    averageProfileCompleteness
  };
}

export function calculateAudit(kpis, posts) {
  const consistencyScore = Math.min(100, posts.length * 8);
  const engagementScore = Math.min(100, kpis.engagement * 10);
  const growthScore = Math.max(0, Math.min(100, 70 + kpis.followersChange * 2));
  const reachScore = Math.max(0, Math.min(100, 70 + kpis.reachChange));
  const contentScore = Math.round((consistencyScore + engagementScore) / 2);
  const presenceScore = Math.round(kpis.averageProfileCompleteness);
  const totalScore = Math.round(
    presenceScore * 0.15 +
      consistencyScore * 0.15 +
      engagementScore * 0.25 +
      contentScore * 0.15 +
      growthScore * 0.15 +
      reachScore * 0.15
  );

  return {
    totalScore,
    label: scoreLabel(totalScore),
    dimensions: [
      { name: "Presencia digital", score: presenceScore, explanation: "Completitud promedio de perfil y datos basicos." },
      { name: "Actividad", score: Math.round(consistencyScore), explanation: "Volumen de publicaciones del periodo seleccionado." },
      { name: "Engagement", score: Math.round(engagementScore), explanation: "Interacciones sobre alcance usando la formula documentada." },
      { name: "Contenido", score: Math.round(contentScore), explanation: "Combinacion de frecuencia y respuesta de audiencia." },
      { name: "Crecimiento", score: Math.round(growthScore), explanation: "Variacion porcentual de seguidores frente al periodo anterior." },
      { name: "Alcance", score: Math.round(reachScore), explanation: "Variacion de alcance frente al comportamiento previo." }
    ]
  };
}

export function detectAnomalies(posts) {
  return posts
    .map((post) => {
      const reachChange = percentChange(post.reach, post.previousReach);
      const engagement = engagementRate(post);
      if (reachChange >= 80) {
        return {
          type: "Crecimiento anormal",
          metric: "Alcance",
          date: post.date,
          magnitude: reachChange,
          evidence: `${post.description} crecio ${reachChange.toFixed(1)}% frente a su referencia historica.`,
          interpretation: "La publicacion supero ampliamente su nivel de alcance habitual.",
          hypothesis: "El formato, el tema o la hora de publicacion pudieron favorecer la distribucion; se requiere contrastar mas publicaciones para confirmarlo.",
          impact: "Puede revelar un patron replicable para aumentar la visibilidad organica.",
          recommendation: "Analizar formato, tema y hora de publicacion para replicar patrones positivos."
        };
      }
      if (reachChange <= -25) {
        return {
          type: "Caida de alcance",
          metric: "Alcance",
          date: post.date,
          magnitude: reachChange,
          evidence: `${post.description} redujo su alcance ${Math.abs(reachChange).toFixed(1)}%.`,
          interpretation: "La distribucion fue significativamente menor que la referencia historica.",
          hypothesis: "La creatividad, segmentacion o relevancia del tema pudieron limitar el alcance; no puede atribuirse una causa unica con estos datos.",
          impact: "Reduce la exposicion del mensaje y la oportunidad de generar interacciones.",
          recommendation: "Revisar segmentacion, creatividad y consistencia tematica antes de repetir el formato."
        };
      }
      if (engagement < 3) {
        return {
          type: "Engagement bajo",
          metric: "Engagement",
          date: post.date,
          magnitude: engagement,
          evidence: `${post.description} registro ${engagement.toFixed(2)}% de engagement.`,
          interpretation: "El contenido alcanzo usuarios, pero genero una respuesta proporcional baja.",
          hypothesis: "La propuesta de valor o la llamada a la accion podrian no haber sido suficientemente claras.",
          impact: "Una respuesta baja sostenida puede debilitar la eficiencia de la estrategia de contenido.",
          recommendation: "Evaluar si el contenido ofrece una llamada a la accion clara y valor para la audiencia."
        };
      }
      return null;
    })
    .filter(Boolean);
}

export function buildRecommendations(kpis, anomalies, topPosts, bottomPosts) {
  const recommendations = [];

  if (kpis.engagement < 6) {
    recommendations.push({
      priority: "Alta",
      problem: "Engagement por debajo del umbral saludable definido para el MVP.",
      evidence: `Engagement actual: ${kpis.engagement.toFixed(2)}%. Formula: interacciones / alcance x 100.`,
      impact: "La audiencia recibe el contenido, pero no interactua con suficiente fuerza.",
      action: "Comparar formatos de mejor rendimiento y ajustar temas, llamadas a la accion y frecuencia."
    });
  }

  if (anomalies.some((anomaly) => anomaly.type === "Caida de alcance")) {
    recommendations.push({
      priority: "Alta",
      problem: "Existen publicaciones con caidas relevantes de alcance.",
      evidence: "Se detectaron variaciones negativas superiores al 25% frente al comportamiento historico.",
      impact: "Puede reducirse la visibilidad organica y la eficiencia del contenido.",
      action: "Auditar los contenidos afectados y contrastarlos con publicaciones de alto rendimiento."
    });
  }

  if (topPosts[0]) {
    recommendations.push({
      priority: "Media",
      problem: "Hay formatos con rendimiento claramente superior.",
      evidence: `${topPosts[0].format} sobre ${topPosts[0].topic} lidera el ranking con ${engagementRate(topPosts[0]).toFixed(2)}% de engagement.`,
      impact: "El equipo puede priorizar contenido con mayor probabilidad de respuesta.",
      action: "Crear variaciones editoriales del formato ganador sin copiar mecanicamente el contenido."
    });
  }

  if (bottomPosts[0]) {
    recommendations.push({
      priority: "Baja",
      problem: "Algunos contenidos institucionales o promocionales muestran baja respuesta.",
      evidence: `${bottomPosts[0].description} aparece entre los contenidos de menor rendimiento.`,
      impact: "Puede consumir esfuerzo editorial sin aportar interaccion significativa.",
      action: "Reformular estos mensajes con una propuesta de valor mas concreta y medicion posterior."
    });
  }

  return recommendations;
}

export function rankPosts(posts, direction = "top") {
  const sorted = [...posts].sort((a, b) => engagementRate(b) - engagementRate(a));
  return direction === "bottom" ? sorted.reverse() : sorted;
}

export function summarizeBy(posts, field) {
  const groups = new Map();
  for (const post of posts) {
    const key = post[field] || "Sin clasificar";
    const group = groups.get(key) || [];
    group.push(post);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([name, group]) => ({
      name,
      posts: group.length,
      reach: sum(group.map((post) => post.reach)),
      impressions: sum(group.map((post) => post.impressions)),
      interactions: sum(group.map(totalInteractions)),
      engagement: sum(group.map((post) => post.reach))
        ? (sum(group.map(totalInteractions)) / sum(group.map((post) => post.reach))) * 100
        : 0
    }))
    .sort((a, b) => b.engagement - a.engagement);
}

export function buildPlatformComparison(accounts, posts) {
  return accounts.map((account) => {
    const platformPosts = posts.filter((post) => post.accountId === account.id);
    const reach = sum(platformPosts.map((post) => post.reach));
    const interactions = sum(platformPosts.map(totalInteractions));
    return {
      platform: account.platform,
      account: account.handle,
      followers: account.followers,
      growth: percentChange(account.followers, account.previousFollowers),
      reach,
      impressions: sum(platformPosts.map((post) => post.impressions)),
      engagement: reach ? (interactions / reach) * 100 : 0,
      posts: platformPosts.length
    };
  });
}

export function getContentPattern(posts) {
  const formats = summarizeBy(posts, "format");
  const topics = summarizeBy(posts, "topic");
  const hours = summarizeBy(posts.map((post) => ({ ...post, timeBand: `${String(post.hour).padStart(2, "0")}:00` })), "timeBand");
  return {
    bestFormat: formats[0] || null,
    weakestFormat: formats.at(-1) || null,
    bestTopic: topics[0] || null,
    bestHour: hours[0] || null
  };
}
