const express = require("express");
const prisma = require("../../config/prisma");
const { auth, requireRoles } = require("../../middleware/auth");
const { asyncHandler, ApiError } = require("../../utils/errors");
const { logAudit } = require("../../utils/audit");

const router = express.Router();

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const jobs = await prisma.job.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        department: true,
        location: true,
        employmentType: true,
        description: true,
      },
    });

    res.json({ success: true, data: jobs });
  }),
);

router.use(auth);

router.get(
  "/",
  requireRoles("SUPER_ADMIN", "RECRUITER", "INTERVIEWER"),
  asyncHandler(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.isActive === "true") where.isActive = true;
    if (req.query.isActive === "false") where.isActive = false;
    if (req.query.search) {
      where.OR = [
        { title: { contains: req.query.search, mode: "insensitive" } },
        { department: { contains: req.query.search, mode: "insensitive" } },
        { location: { contains: req.query.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { applications: true },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }),
);

router.post(
  "/",
  requireRoles("SUPER_ADMIN", "RECRUITER"),
  asyncHandler(async (req, res) => {
    const {
      title,
      department = null,
      location = null,
      employmentType = null,
      experienceMin = null,
      experienceMax = null,
      openingsCount = 1,
      description = null,
    } = req.body;

    if (!title) throw new ApiError(400, "title is required");

    const job = await prisma.job.create({
      data: {
        title,
        department,
        location,
        employmentType,
        experienceMin,
        experienceMax,
        openingsCount,
        description,
        createdById: req.user.id,
      },
    });

    await logAudit({
      actorUserId: req.user.id,
      action: "CREATE_JOB",
      entityType: "JOB",
      entityId: job.id,
      newData: job,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({ success: true, data: job });
  }),
);

router.patch(
  "/:id/status",
  requireRoles("SUPER_ADMIN", "RECRUITER"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      throw new ApiError(400, "isActive must be boolean");
    }

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Job not found");

    const updated = await prisma.job.update({
      where: { id },
      data: { isActive },
    });

    await logAudit({
      actorUserId: req.user.id,
      action: "UPDATE_JOB_STATUS",
      entityType: "JOB",
      entityId: id,
      oldData: { isActive: existing.isActive },
      newData: { isActive: updated.isActive },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ success: true, data: updated });
  }),
);

module.exports = router;
