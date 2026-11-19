import mongoose from "mongoose";
import { chatClient, streamClient } from "../lib/stream.js";
import Session from "../models/Session.js";

const invalidId = (res) => res.status(400).json({ message: "Invalid session id" });

export async function createSession(req, res) {
  let step = "validating request";
  let session = null;

  try {
    const { problem, difficulty } = req.body;
    const userId = req.user._id;
    const clerkId = req.user.clerkId;

    if (!problem || !difficulty) {
      return res.status(400).json({ message: "Problem and difficulty are required" });
    }

    step = "syncing Stream user";
    await chatClient.upsertUser({
      id: clerkId,
      name: req.user.name,
      image: req.user.profileImage,
    });

    // generate a unique call id for stream video
    const callId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // create session in db
    step = "creating database session";
    session = await Session.create({ problem, difficulty, host: userId, callId });

    // create stream video call
    step = "creating video call";
    await streamClient.video.call("default", callId).getOrCreate({
      data: {
        created_by_id: clerkId,
        custom: { problem, difficulty, sessionId: session._id.toString() },
      },
    });

    // chat messaging
    step = "creating chat channel";
    const channel = chatClient.channel("messaging", callId, {
      name: `${problem} Session`,
      created_by_id: clerkId,
      members: [clerkId],
    });

    await channel.create();

    res.status(201).json({ session });
  } catch (error) {
    console.error(`Error in createSession controller while ${step}:`, {
      message: error.message,
      code: error.code,
      apiError: error.apiError ?? error.response?.data,
    });

    // don't leave a half-created session behind
    if (session) {
      await Session.findByIdAndDelete(session._id).catch((e) =>
        console.error("Failed to clean up session:", e.message)
      );
    }

    res.status(500).json({ message: "Internal Server Error" });
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
    console.log("Error in getActiveSessions controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getMyRecentSessions(req, res) {
  try {
    const userId = req.user._id;

    // get sessions where user is either host or participant
    const sessions = await Session.find({
      status: "completed",
      $or: [{ host: userId }, { participant: userId }],
    })
      .populate("host", "name profileImage clerkId")
      .populate("participant", "name profileImage clerkId")
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({ sessions });
  } catch (error) {
    console.log("Error in getMyRecentSessions controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getSessionById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidId(res);

    const session = await Session.findById(id)
      .populate("host", "name profileImage clerkId")
      .populate("participant", "name profileImage clerkId");

    if (!session) return res.status(404).json({ message: "Session not found" });

    res.status(200).json({ session });
  } catch (error) {
    console.log("Error in getSessionById controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function joinSession(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidId(res);

    const userId = req.user._id;
    const clerkId = req.user.clerkId;

    const existing = await Session.findById(id);

    if (!existing) return res.status(404).json({ message: "Session not found" });

    if (existing.status !== "active") {
      return res.status(400).json({ message: "Cannot join a completed session" });
    }

    if (existing.host.toString() === userId.toString()) {
      return res.status(400).json({ message: "Host cannot join their own session as participant" });
    }

    // already the participant -> succeed (makes retries / double requests harmless)
    if (existing.participant?.toString() === userId.toString()) {
      return res.status(200).json({ session: existing });
    }

    // atomic claim of the participant slot: only one request can win
    const session = await Session.findOneAndUpdate(
      { _id: id, status: "active", participant: null },
      { participant: userId },
      { returnDocument: "after" }
    );

    if (!session) return res.status(409).json({ message: "Session is full" });

    try {
      // make sure the user exists in Stream before adding them to the channel
      await chatClient.upsertUser({
        id: clerkId,
        name: req.user.name,
        image: req.user.profileImage,
      });

      const channel = chatClient.channel("messaging", session.callId);
      await channel.addMembers([clerkId]);
    } catch (chatError) {
      // roll back so the user isn't a participant without chat access
      await Session.updateOne({ _id: id, participant: userId }, { participant: null });
      throw chatError;
    }

    res.status(200).json({ session });
  } catch (error) {
    console.log("Error in joinSession controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function endSession(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidId(res);

    const userId = req.user._id;

    const session = await Session.findById(id);

    if (!session) return res.status(404).json({ message: "Session not found" });

    // check if user is the host (interviewer)
    if (session.host.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Only the host can end the session" });
    }

    // check if session is already completed
    if (session.status === "completed") {
      return res.status(400).json({ message: "Session is already completed" });
    }

    // mark completed FIRST so a Stream failure can't leave the session stuck as active
    session.status = "completed";
    await session.save();

    // best-effort Stream cleanup (don't fail the request if these throw)
    try {
      await streamClient.video.call("default", session.callId).delete({ hard: true });
    } catch (e) {
      console.log("Failed to delete Stream call:", e.message);
    }

    try {
      await chatClient.channel("messaging", session.callId).delete();
    } catch (e) {
      console.log("Failed to delete Stream channel:", e.message);
    }

    res.status(200).json({ session, message: "Session ended successfully" });
  } catch (error) {
    console.log("Error in endSession controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}