const express = require("express");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const prisma = require("../../config/prisma");
const { auth, requireRoles } = require("../../middleware/auth");
const { asyncHandler, ApiError } = require("../../utils/errors");

const router = express.Router();

router.use(auth);

async function buildRecruiterActivity() {
  const users = await prisma.user.findMany({
    where: { role: "RECRUITER" },
    select: { id: true, fullName: true, email: true, status: true },
  });

  const userIds = users.map((item) => item.id);
  const [jobs, candidates, interviews] = await Promise.all([
    prisma.job.groupBy({
      by: ["createdById"],
      where: { createdById: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.candidate.groupBy({
      by: ["createdById"],
      where: { createdById: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.interview.groupBy({
      by: ["createdById"],
      where: { createdById: { in: userIds } },
      _count: { _all: true },
    }),
  ]);

  const jobsMap = new Map(jobs.map((row) => [row.createdById, row._count._all]));
  const candidatesMap = new Map(candidates.map((row) => [row.createdById, row._count._all]));
  const interviewsMap = new Map(interviews.map((row) => [row.createdById, row._count._all]));

  return users.map((user) => ({
    recruiterId: user.id,
    recruiterName: user.fullName,
    recruiterEmail: user.email,
    status: user.status,
    jobsCreated: jobsMap.get(user.id) || 0,
    candidatesCreated: candidatesMap.get(user.id) || 0,
    interviewsScheduled: interviewsMap.get(user.id) || 0,
  }));
}

async function buildHiringProgress() {
  const [jobs, applications] = await Promise.all([
    prisma.job.findMany({
      select: {
        id: true,
        title: true,
        department: true,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.application.findMany({
      select: {
        id: true,
        jobId: true,
        status: true,
        currentStage: { select: { name: true } },
      },
    }),
  ]);

  const grouped = new Map();
  applications.forEach((app) => {
    if (!grouped.has(app.jobId)) {
      grouped.set(app.jobId, {
        totalApplications: 0,
        inPipeline: 0,
        selected: 0,
        rejected: 0,
        joined: 0,
      });
    }

    const row = grouped.get(app.jobId);
    row.totalApplications += 1;
    if (app.status === "IN_PIPELINE") row.inPipeline += 1;
    if (app.status === "SELECTED") row.selected += 1;
    if (app.status === "REJECTED") row.rejected += 1;
    if (app.status === "JOINED") row.joined += 1;
  });

  return jobs.map((job) => ({
    jobId: job.id,
    title: job.title,
    department: job.department || "General",
    jobStatus: job.isActive ? "ACTIVE" : "CLOSED",
    ...(grouped.get(job.id) || {
      totalApplications: 0,
      inPipeline: 0,
      selected: 0,
      rejected: 0,
      joined: 0,
    }),
  }));
}

async function buildPipelineInsights({ fromDate, toDate }) {
  const createdAtFilter = {};
  if (fromDate) createdAtFilter.gte = fromDate;
  if (toDate) createdAtFilter.lte = toDate;

  const applicationWhere = Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {};
  const applications = await prisma.application.findMany({
    where: applicationWhere,
    include: {
      candidate: {
        select: {
          id: true,
          source: true,
        },
      },
      currentStage: {
        select: { id: true, name: true },
      },
      pipelineEvents: {
        orderBy: { movedAt: "asc" },
        include: {
          fromStage: { select: { id: true, name: true } },
          toStage: { select: { id: true, name: true } },
        },
      },
    },
  });

  const totals = {
    totalApplications: applications.length,
    shortlisted: applications.filter((item) => item.shortlisted).length,
    selected: applications.filter((item) => item.status === "SELECTED").length,
    joined: applications.filter((item) => item.status === "JOINED").length,
  };
  totals.selectionRate = totals.totalApplications
    ? Math.round((totals.selected / totals.totalApplications) * 1000) / 10
    : 0;
  totals.joinRate = totals.totalApplications
    ? Math.round((totals.joined / totals.totalApplications) * 1000) / 10
    : 0;

  const sourceMap = new Map();
  applications.forEach((item) => {
    const key = item.candidate?.source?.trim() || "Unknown";
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { source: key, total: 0, selected: 0, joined: 0 });
    }
    const row = sourceMap.get(key);
    row.total += 1;
    if (item.status === "SELECTED" || item.status === "JOINED") row.selected += 1;
    if (item.status === "JOINED") row.joined += 1;
  });
  const sourceFunnel = Array.from(sourceMap.values())
    .map((row) => ({
      ...row,
      selectedRate: row.total ? Math.round((row.selected / row.total) * 1000) / 10 : 0,
      joinedRate: row.total ? Math.round((row.joined / row.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const stageDurations = new Map();
  applications.forEach((item) => {
    const events = item.pipelineEvents || [];
    for (let idx = 0; idx < events.length; idx += 1) {
      const event = events[idx];
      const stageName = event.toStage?.name || "Unknown";
      const start = new Date(event.movedAt).getTime();
      const end = idx + 1 < events.length ? new Date(events[idx + 1].movedAt).getTime() : Date.now();
      const days = Math.max(0, (end - start) / (1000 * 60 * 60 * 24));

      if (!stageDurations.has(stageName)) {
        stageDurations.set(stageName, { stage: stageName, totalDays: 0, samples: 0 });
      }
      const row = stageDurations.get(stageName);
      row.totalDays += days;
      row.samples += 1;
    }
  });

  const timeInStage = Array.from(stageDurations.values())
    .map((row) => ({
      stage: row.stage,
      sampleSize: row.samples,
      avgDays: Math.round((row.totalDays / Math.max(1, row.samples)) * 10) / 10,
    }))
    .sort((a, b) => b.avgDays - a.avgDays);

  return {
    totals,
    sourceFunnel,
    timeInStage,
  };
}

function sendExcel(res, reportName, rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${reportName}-${Date.now()}.xlsx"`,
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.send(buffer);
}

function sendPdf(res, reportName, rows) {
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${reportName}-${Date.now()}.pdf"`,
  );
  res.setHeader("Content-Type", "application/pdf");

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  doc.fontSize(16).text(`${reportName.replace("-", " ").toUpperCase()} REPORT`);
  doc.moveDown();

  rows.forEach((row, index) => {
    doc.fontSize(10).text(`${index + 1}. ${JSON.stringify(row)}`);
    doc.moveDown(0.3);
  });

  doc.end();
}

router.get(
  "/recruiter-activity",
  requireRoles("SUPER_ADMIN", "RECRUITER", "INTERVIEWER"),
  asyncHandler(async (req, res) => {
    const rows = await buildRecruiterActivity();
    res.json({ success: true, data: rows });
  }),
);

router.get(
  "/hiring-progress",
  requireRoles("SUPER_ADMIN", "RECRUITER", "INTERVIEWER"),
  asyncHandler(async (req, res) => {
    const rows = await buildHiringProgress();
    res.json({ success: true, data: rows });
  }),
);

router.get(
  "/pipeline-insights",
  requireRoles("SUPER_ADMIN", "RECRUITER", "INTERVIEWER"),
  asyncHandler(async (req, res) => {
    const days = Number.parseInt(req.query.days, 10) || 30;
    const boundedDays = Math.min(Math.max(days, 7), 365);
    const toDate = new Date();
    const fromDate = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);

    const insights = await buildPipelineInsights({ fromDate, toDate });
    res.json({
      success: true,
      meta: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        days: boundedDays,
      },
      data: insights,
    });
  }),
);

router.get(
  "/export",
  requireRoles("SUPER_ADMIN", "RECRUITER"),
  asyncHandler(async (req, res) => {
    const report = String(req.query.report || "").trim();
    const format = String(req.query.format || "excel").trim().toLowerCase();

    if (!["recruiter-activity", "hiring-progress"].includes(report)) {
      throw new ApiError(400, "report must be recruiter-activity or hiring-progress");
    }
    if (!["excel", "pdf"].includes(format)) {
      throw new ApiError(400, "format must be excel or pdf");
    }

    const rows =
      report === "recruiter-activity"
        ? await buildRecruiterActivity()
        : await buildHiringProgress();

    if (format === "excel") {
      sendExcel(res, report, rows);
      return;
    }

    sendPdf(res, report, rows);
  }),
);

module.exports = router;
