const express = require("express");
const fs = require("fs");
const path = require("path");
const prisma = require("../../config/prisma");
const { auth, requireRoles } = require("../../middleware/auth");
const { upload, uploadsRoot } = require("../../middleware/upload");
const { asyncHandler, ApiError } = require("../../utils/errors");
const { logAudit } = require("../../utils/audit");

const router = express.Router();

router.use(auth);

router.post(
  "/",
  requireRoles("SUPER_ADMIN", "RECRUITER"),
  asyncHandler(async (req, res) => {
    const {
      applicationId,
      roundNo,
      interviewerId,
      scheduledStart,
      scheduledEnd = null,
      mode,
      meetingLink = null,
    } = req.body;

    if (!applicationId || !roundNo || !interviewerId || !scheduledStart || !mode) {
      throw new ApiError(
        400,
        "applicationId, roundNo, interviewerId, scheduledStart, and mode are required",
      );
    }
    if (!["ONLINE", "OFFLINE", "PHONE"].includes(mode)) {
      throw new ApiError(400, "mode must be ONLINE, OFFLINE, or PHONE");
    }

    const [application, interviewer] = await Promise.all([
      prisma.application.findUnique({ where: { id: applicationId }, select: { id: true } }),
      prisma.user.findUnique({
        where: { id: interviewerId },
        select: { id: true, role: true, status: true },
      }),
    ]);
    if (!application) throw new ApiError(404, "Application not found");
    if (!interviewer) throw new ApiError(404, "Interviewer not found");
    if (interviewer.status !== "ACTIVE") throw new ApiError(400, "Interviewer is inactive");

    const interview = await prisma.interview.create({
      data: {
        applicationId,
        roundNo,
        interviewerId,
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
        mode,
        meetingLink,
        createdById: req.user.id,
      },
      include: {
        application: {
          select: {
            id: true,
            candidate: { select: { id: true, fullName: true } },
            job: { select: { id: true, title: true } },
          },
        },
        interviewer: { select: { id: true, fullName: true, email: true } },
      },
    });

    await logAudit({
      actorUserId: req.user.id,
      action: "SCHEDULE_INTERVIEW",
      entityType: "INTERVIEW",
      entityId: interview.id,
      newData: {
        applicationId,
        roundNo,
        interviewerId,
        scheduledStart,
        scheduledEnd,
        mode,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({ success: true, data: interview });
  }),
);

router.get(
  "/",
  requireRoles("SUPER_ADMIN", "RECRUITER", "INTERVIEWER"),
  asyncHandler(async (req, res) => {
    const where = {};
    if (req.query.applicationId) where.applicationId = req.query.applicationId;
    if (req.query.interviewerId) where.interviewerId = req.query.interviewerId;
    if (req.query.mode) where.mode = req.query.mode;

    if (req.query.from || req.query.to) {
      where.scheduledStart = {};
      if (req.query.from) where.scheduledStart.gte = new Date(req.query.from);
      if (req.query.to) where.scheduledStart.lte = new Date(req.query.to);
    }

    const interviews = await prisma.interview.findMany({
      where,
      orderBy: { scheduledStart: "asc" },
      include: {
        application: {
          select: {
            id: true,
            candidate: { select: { id: true, fullName: true } },
            job: { select: { id: true, title: true } },
          },
        },
        interviewer: { select: { id: true, fullName: true, email: true } },
        feedback: true,
        voiceRecordingFile: {
          select: {
            id: true,
            storageKey: true,
            originalName: true,
            mimeType: true,
            createdAt: true,
          },
        },
      },
    });

    res.json({ success: true, data: interviews });
  }),
);

router.post(
  "/:id/voice-recording",
  requireRoles("SUPER_ADMIN", "RECRUITER", "INTERVIEWER"),
  (req, res, next) => {
    req.uploadFolder = "interview-recordings";
    next();
  },
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      throw new ApiError(400, "Voice recording file is required (field: file)");
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { voiceRecordingFile: true },
    });
    if (!interview) {
      throw new ApiError(404, "Interview not found");
    }

    if (req.user.role === "INTERVIEWER" && interview.interviewerId !== req.user.id) {
      throw new ApiError(403, "You can upload recording only for your assigned interview");
    }

    const relativePath = path.relative(uploadsRoot, req.file.path).replace(/\\/g, "/");
    const fileMeta = await prisma.fileMeta.create({
      data: {
        storageKey: relativePath,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || "application/octet-stream",
        sizeBytes: BigInt(req.file.size || 0),
        uploadedById: req.user.id,
      },
    });

    await prisma.interview.update({
      where: { id },
      data: { voiceRecordingFileId: fileMeta.id },
    });

    if (interview.voiceRecordingFile?.storageKey) {
      const oldPath = path.join(uploadsRoot, interview.voiceRecordingFile.storageKey);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await logAudit({
      actorUserId: req.user.id,
      action: "UPLOAD_INTERVIEW_RECORDING",
      entityType: "INTERVIEW",
      entityId: id,
      newData: {
        fileId: fileMeta.id,
        fileName: fileMeta.originalName,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      success: true,
      data: {
        fileId: fileMeta.id,
        originalName: fileMeta.originalName,
        url: `/uploads/${fileMeta.storageKey}`,
      },
    });
  }),
);

router.post(
  "/:id/feedback",
  requireRoles("SUPER_ADMIN", "RECRUITER", "INTERVIEWER"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      technicalRating,
      communicationRating,
      cultureFitRating,
      strengths,
      concerns,
      recommendation,
      overallComments,
    } = req.body;

    if (
      !technicalRating ||
      !communicationRating ||
      !cultureFitRating ||
      !strengths ||
      !concerns ||
      !recommendation ||
      !overallComments
    ) {
      throw new ApiError(
        400,
        "technicalRating, communicationRating, cultureFitRating, strengths, concerns, recommendation, and overallComments are required",
      );
    }

    if (!["PASS", "FAIL", "HOLD", "PENDING"].includes(recommendation)) {
      throw new ApiError(400, "Invalid recommendation");
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { id: true, interviewerId: true, result: true, mandatoryFeedbackSubmitted: true },
    });
    if (!interview) throw new ApiError(404, "Interview not found");

    if (req.user.role === "INTERVIEWER" && interview.interviewerId !== req.user.id) {
      throw new ApiError(403, "You can only submit feedback for interviews assigned to you");
    }

    const existingFeedback = await prisma.interviewFeedback.findUnique({
      where: { interviewId: id },
      select: { id: true },
    });
    if (existingFeedback) {
      throw new ApiError(409, "Feedback already submitted for this interview");
    }

    const feedback = await prisma.interviewFeedback.create({
      data: {
        interviewId: id,
        technicalRating,
        communicationRating,
        cultureFitRating,
        strengths,
        concerns,
        recommendation,
        overallComments,
        submittedById: req.user.id,
      },
    });

    await prisma.interview.update({
      where: { id },
      data: {
        result: recommendation,
        mandatoryFeedbackSubmitted: true,
      },
    });

    await logAudit({
      actorUserId: req.user.id,
      action: "SUBMIT_INTERVIEW_FEEDBACK",
      entityType: "INTERVIEW",
      entityId: id,
      oldData: { mandatoryFeedbackSubmitted: interview.mandatoryFeedbackSubmitted, result: interview.result },
      newData: { mandatoryFeedbackSubmitted: true, result: recommendation },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({ success: true, data: feedback });
  }),
);

module.exports = router;
