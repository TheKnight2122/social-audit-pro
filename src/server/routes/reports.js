import { Router } from "express";
import { logActivity } from "../database.js";
import { requireCsrf, requirePermission } from "../middleware.js";
import { createReportPdf } from "../report-pdf.js";

export function createReportsRouter({ database }) {
  const router = Router();

  router.get("/", requirePermission("reports:read"), (request, response) => {
    const reports = database.prepare(
      `SELECT r.id, r.title, r.report_type AS reportType,
              r.period_start AS periodStart, r.period_end AS periodEnd,
              r.created_at AS createdAt, u.display_name AS createdBy
       FROM reports r JOIN users u ON u.id = r.created_by
       ORDER BY r.created_at DESC LIMIT 100`
    ).all();
    response.json({ reports });
  });

  router.post("/export-pdf", requirePermission("reports:write"), requireCsrf, async (request, response, next) => {
    try {
      const content = request.body.content;
      if (!content || typeof content !== "object") {
        return response.status(400).json({ error: "validation_error", message: "El contenido del reporte es obligatorio." });
      }
      const title = String(request.body.title || "Reporte ejecutivo de redes sociales").slice(0, 120);
      const pdf = await createReportPdf({
        title,
        platform: request.body.platform,
        periodDays: request.body.periodDays,
        generatedAt: new Date().toISOString(),
        content
      });
      response.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="social-audit-pro-reporte.pdf"',
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store"
      });
      return response.send(pdf);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:id", requirePermission("reports:read"), (request, response) => {
    const report = database.prepare(
      `SELECT id, title, report_type AS reportType, period_start AS periodStart,
              period_end AS periodEnd, content_json AS contentJson, created_at AS createdAt
       FROM reports WHERE id = ?`
    ).get(Number(request.params.id));
    if (!report) return response.status(404).json({ error: "report_not_found", message: "Reporte no encontrado." });
    return response.json({ ...report, content: JSON.parse(report.contentJson), contentJson: undefined });
  });

  router.post("/", requirePermission("reports:write"), requireCsrf, (request, response) => {
    const title = String(request.body.title || "").trim();
    const content = request.body.content;
    if (title.length < 3 || !content || typeof content !== "object") {
      return response.status(400).json({ error: "validation_error", message: "Titulo y contenido son obligatorios." });
    }
    const result = database.prepare(
      `INSERT INTO reports
        (title, report_type, period_start, period_end, content_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      String(request.body.reportType || "executive"),
      request.body.periodStart || null,
      request.body.periodEnd || null,
      JSON.stringify(content),
      request.user.id
    );
    const reportId = Number(result.lastInsertRowid);
    logActivity(database, {
      userId: request.user.id,
      action: "reports.created",
      entityType: "report",
      entityId: reportId,
      ipAddress: request.ip
    });
    response.status(201).json({ id: reportId, title });
  });

  return router;
}
