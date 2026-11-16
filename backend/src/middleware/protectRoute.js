import { clerkClient, getAuth } from "@clerk/express";
import User from "../models/User.js";

export const protectRoute = async (req, res, next) => {
  try {
    const { isAuthenticated, userId: clerkId } = getAuth(req);

    if (!isAuthenticated || !clerkId) {
      return res.status(401).json({ message: "Unauthorized - invalid token" });
    }

    // find user in db by clerk ID
    let user = await User.findOne({ clerkId });

    // not synced yet (e.g. the Inngest event never arrived on localhost): create it now
    if (!user) {
      const clerkUser = await clerkClient.users.getUser(clerkId);

      try {
        user = await User.findOneAndUpdate(
          { clerkId },
          {
            $setOnInsert: {
              clerkId,
              email: clerkUser.emailAddresses?.[0]?.emailAddress,
              name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "User",
              profileImage: clerkUser.imageUrl,
            },
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        // two requests arrived at once and both tried to insert; just read the winner
        if (err.code === 11000) user = await User.findOne({ clerkId });
        else throw err;
      }
    }

    // attach user to req
    req.user = user;

    next();
  } catch (error) {
    console.error("Error in protectRoute middleware", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};