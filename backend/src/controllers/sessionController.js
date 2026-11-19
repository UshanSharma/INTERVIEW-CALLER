import mongoose from "mongoose";
import { chatClient, streamClient } from "../lib/stream.js";
import Session from "../models/Session.js";

const invalidId = (res) =>
  res.status(400).json({ message: "Invalid session id" });

export async function createSession(req, res) {
  let step = "validating request";
  let session = null;

  try {
    const { problem, difficulty } = req.body;
    const userId = req.user._id;
    const clerkId = req.user.clerkId;

    if (!problem || !difficulty) {
      return res.status(400).json({
        message: "Problem and difficulty are required",
      });
    }

    step = "syncing Stream user";

    await chatClient.upsertUser({
      id: clerkId,
      name: req.user.name,
      image: req.user.profileImage,
    });

    // Generate a unique call ID for Stream Video.
    const callId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;

    // Create session in database.
    step = "creating database session";

    session = await Session.create({
      problem,
      difficulty,
      host: userId,
      callId,
    });

    // Create Stream Video call.
    step = "creating video call";

    await streamClient.video.call("default", callId).getOrCreate({
      data: {
        created_by_id: clerkId,
        custom: {
          problem,
          difficulty,
          sessionId: session._id.toString(),
        },
      },
    });

    // Create chat channel.
    step = "creating chat channel";

    const channel = chatClient.channel("messaging", callId, {
      name: `${problem} Session`,
      created_by_id: clerkId,
      members: [clerkId],
    });

    await channel.create();

    res.status(201).json({ session });
  } catch (error) {
    console.error(
      `Error in createSession controller while ${step}:`,
      {
        message: error.message,
        code: error.code,
        apiError: error.apiError ?? error.response?.data,
      }
    );

    // Clean up a partially created database session.
    if (session) {
      await Session.findByIdAndDelete(session._id).catch((e) =>
        console.error("Failed to clean up session:", e.message)
      );
    }

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
}

export async function getActiveSessions(_, res) {
  try {
    const sessions = await Session.find({ status: "active" })
      .populate("host", "name profileImage clerkId")
      .populate("participant", "name profileImage clerkId")
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({ sessions });
  } catch (error) {
    console.log(
      "Error in getActiveSessions controller:",
      error.message
    );

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
}

export async function getMyRecentSessions(req, res) {
  try {
    const userId = req.user._id;

    // Get sessions where the user is either host or participant.
    const sessions = await Session.find({
      status: "completed",
      $or: [
        { host: userId },
        { participant: userId },
      ],
    })
      .populate("host", "name profileImage clerkId")
      .populate("participant", "name profileImage clerkId")
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({ sessions });
  } catch (error) {
    console.log(
      "Error in getMyRecentSessions controller:",
      error.message
    );

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
}

export async function getSessionById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return invalidId(res);
    }

    const session = await Session.findById(id)
      .populate("host", "name profileImage clerkId")
      .populate("participant", "name profileImage clerkId");

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    res.status(200).json({ session });
  } catch (error) {
    console.log(
      "Error in getSessionById controller:",
      error.message
    );

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
}

export async function joinSession(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return invalidId(res);
    }

    const userId = req.user._id;
    const clerkId = req.user.clerkId;

    const existing = await Session.findById(id);

    if (!existing) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    if (existing.status !== "active") {
      return res.status(400).json({
        message: "Cannot join a completed session",
      });
    }

    if (existing.host.toString() === userId.toString()) {
      return res.status(400).json({
        message: "Host cannot join their own session as participant",
      });
    }

    // Already the participant: make retries harmless.
    if (existing.participant?.toString() === userId.toString()) {
      return res.status(200).json({
        session: existing,
      });
    }

    // Atomically claim the participant slot.
    const session = await Session.findOneAndUpdate(
      {
        _id: id,
        status: "active",
        participant: null,
      },
      {
        participant: userId,
      },
      {
        returnDocument: "after",
      }
    );

    if (!session) {
      return res.status(409).json({
        message: "Session is full",
      });
    }

    try {
      // Make sure the user exists in Stream.
      await chatClient.upsertUser({
        id: clerkId,
        name: req.user.name,
        image: req.user.profileImage,
      });

      const channel = chatClient.channel(
        "messaging",
        session.callId
      );

      await channel.addMembers([clerkId]);
    } catch (chatError) {
      // Roll back participant assignment if chat fails.
      await Session.updateOne(
        {
          _id: id,
          participant: userId,
        },
        {
          participant: null,
        }
      );

      throw chatError;
    }

    res.status(200).json({ session });
  } catch (error) {
    console.log(
      "Error in joinSession controller:",
      error.message
    );

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
}

export async function endSession(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return invalidId(res);
    }

    const userId = req.user._id;

    const session = await Session.findById(id);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    // Only the host can end the session.
    if (session.host.toString() !== userId.toString()) {
      return res.status(403).json({
        message: "Only the host can end the session",
      });
    }

    // Check whether the session is already completed.
    if (session.status === "completed") {
      return res.status(400).json({
        message: "Session is already completed",
      });
    }

    // Mark the session as completed in MongoDB.
    session.status = "completed";
    await session.save();

    // IMPORTANT:
    // Do not hard-delete the Stream Video call here.
    // Keep it so the recording can remain accessible.

    // Delete the chat channel only.
    try {
      await chatClient
        .channel("messaging", session.callId)
        .delete();
    } catch (error) {
      console.log(
        "Failed to delete Stream chat channel:",
        error.message
      );
    }

    res.status(200).json({
      session,
      message: "Session ended successfully. Video recording preserved.",
    });
  } catch (error) {
    console.log(
      "Error in endSession controller:",
      error.message
    );

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
}
