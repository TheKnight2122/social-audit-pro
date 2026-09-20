import PDFDocument from "pdfkit";

const COLORS = {
  ink: "#14202b",
  muted: "#617083",
  accent: "#0f766e",
  line: "#d9e0e7",
  soft: "#f4f6f8",
  warning: "#a85b0b"
};

function safeNumber(value, digits = 0) {
  const parsed = Number(value);
  const number = Number.isFinite(parsed) ? parsed : 0;
  return number.toLocaleString("es-PE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function ensureSpace(document, needed) {
  if (document.y + needed > document.page.height - 100) document.addPage();
}

function sectionTitle(document, number, title) {
  ensureSpace(document, 60);
  document.moveDown(1.1);
  const y = document.y;
  document.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(9)
    .text(String(number).padStart(2, "0"), 50, y, { width: 495 });
  document.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(16)
    .text(title, 50, y + 13, { width: 495 });
  document.x = 50;
  document.y = y + 42;
}

function paragraph(document, text) {
  document.fillColor(COLORS.muted).font("Helvetica").fontSize(10.5)
    .text(String(text || ""), 50, document.y, { width: 495, lineGap: 3 });
}

function list(document, items) {
  for (const item of items) {
    ensureSpace(document, 48);
    const y = document.y;
    document.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(10).text("-", 56, y, { width: 10 });
    document.fillColor(COLORS.muted).font("Helvetica").text(item, 70, y, { width: 470, lineGap: 2 });
    document.x = 50;
    document.moveDown(0.4);
  }
}

function kpiGrid(document, kpis, dataSource) {
  const items = dataSource === "official"
    ? [
        ["Suscriptores", kpis.subscribers == null ? "No disponible" : safeNumber(kpis.subscribers), "Dato oficial del canal"],
        ["Vistas", safeNumber(kpis.views), "Videos sincronizados"],
        ["Interacciones", safeNumber(kpis.interactions), "Datos disponibles"],
        ["Interacciones / vistas", safeNumber(kpis.interactionRate, 2) + "%", "Formula documentada"]
      ]
    : [
        ["Seguidores", safeNumber(kpis.followers), "Comunidad total"],
        ["Alcance", safeNumber(kpis.reach), "Personas alcanzadas"],
        ["Impresiones", safeNumber(kpis.impressions), "Exposiciones"],
        ["Engagement", safeNumber(kpis.engagement, 2) + "%", "Interacciones / alcance"]
      ];
  const startY = document.y;
  const width = 242;
  const height = 72;
  items.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 50 + column * 253;
    const y = startY + row * 82;
    document.roundedRect(x, y, width, height, 5).fillAndStroke(COLORS.soft, COLORS.line);
    document.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(item[0].toUpperCase(), x + 13, y + 12);
    document.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(20).text(item[1], x + 13, y + 27);
    document.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(item[2], x + 13, y + 54);
  });
  document.y = startY + 164;
  document.x = 50;
}

export function createReportPdf({ title, platform, periodDays, generatedAt, content }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      bufferPages: true,
      margins: { top: 52, right: 50, bottom: 58, left: 50 },
      info: {
        Title: title,
        Author: "Social Audit Pro",
        Subject: "Reporte de auditoria y rendimiento de redes sociales"
      }
    });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document.on("pageAdded", () => {
      document.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
        .text("Social Audit Pro - Reporte ejecutivo", 50, 28, { align: "right", width: 495, lineBreak: false });
      document.x = 50;
      document.y = 52;
    });

    document.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(10).text("SOCIAL AUDIT PRO");
    document.moveDown(1.6);
    document.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(27).text(title, { lineGap: 3 });
    document.moveDown(0.45);
    document.fillColor(COLORS.muted).font("Helvetica").fontSize(11)
      .text("Auditoria, analisis y recomendaciones para decisiones de marketing.");
    document.moveDown(1.4);
    document.strokeColor(COLORS.accent).lineWidth(3).moveTo(50, document.y).lineTo(545, document.y).stroke();
    document.moveDown(1.2);
    document.fillColor(COLORS.muted).fontSize(9)
      .text("Plataforma: " + (platform || "Todas las redes"));
    document.text("Periodo: " + Number(periodDays || 30) + " dias");
    document.text("Generado: " + new Date(generatedAt || Date.now()).toLocaleString("es-PE"));

    sectionTitle(document, 1, "Resumen ejecutivo");
    const audit = content.audit || {};
    const kpis = content.kpis || {};
    paragraph(
      document,
      "La salud general del ecosistema analizado es " + safeNumber(audit.totalScore) +
      "/100 (" + (audit.label || "Sin clasificar") + "). El informe diferencia datos observados, " +
      "interpretaciones, hipotesis y acciones recomendadas."
    );

    sectionTitle(document, 2, "Indicadores principales");
    kpiGrid(document, kpis, content.dataSource);

    sectionTitle(document, 3, "Salud de la cuenta");
    const dimensions = Array.isArray(audit.dimensions) ? audit.dimensions : [];
    if (dimensions.length) {
      for (const dimension of dimensions.slice(0, 12)) {
        ensureSpace(document, 34);
        const y = document.y;
        document.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9).text(dimension.name, 50, y, { width: 160 });
        document.roundedRect(220, y + 1, 270, 8, 4).fill(COLORS.line);
        const score = Math.min(100, Math.max(0, Number(dimension.score) || 0));
        document.roundedRect(220, y + 1, Math.max(2, 270 * score / 100), 8, 4).fill(COLORS.accent);
        document.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9).text(safeNumber(dimension.score), 500, y, { width: 40, align: "right" });
        document.x = 50;
        document.y = y + 25;
      }
    } else {
      paragraph(document, "No existen dimensiones de auditoria para este periodo.");
    }

    sectionTitle(document, 4, "Hallazgos");
    const anomalies = Array.isArray(content.anomalies) ? content.anomalies : [];
    list(document, anomalies.length
      ? anomalies.slice(0, 8).map((item) => (item.type || "Hallazgo") + ": " + (item.evidence || "Sin evidencia"))
      : ["No se detectaron anomalias con los filtros actuales."]);

    sectionTitle(document, 5, "Recomendaciones");
    const recommendations = Array.isArray(content.recommendations) ? content.recommendations : [];
    list(document, recommendations.length
      ? recommendations.slice(0, 8).map((item) => "[" + (item.priority || "Media") + "] " + (item.action || item.problem || "Revisar el indicador."))
      : ["Mantener el monitoreo y ampliar el historial disponible."]);

    sectionTitle(document, 6, "Nota metodologica");
    paragraph(
      document,
      "Este reporte se genera a partir de las metricas disponibles. Una metrica ausente no se estima ni se inventa. " +
      "Las hipotesis requieren validacion con contexto de campana e historial suficiente."
    );

    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      document.switchToPage(index);
      document.strokeColor(COLORS.line).lineWidth(0.6).moveTo(50, 765).lineTo(545, 765).stroke();
      document.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
        .text("Documento generado por Social Audit Pro", 50, 772, { width: 350, lineBreak: false });
      document.text("Pagina " + (index + 1) + " de " + range.count, 410, 772, { width: 135, align: "right", lineBreak: false });
    }
    document.end();
  });
}
