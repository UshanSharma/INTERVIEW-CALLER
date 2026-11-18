import { chatClient } from "../lib/stream.js";

export async function getStreamToken(req, res) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const { clerkId, name, profileImage } = req.user;

    // make sure the user exists in Stream before they're added to channels/calls
    await chatClient.upsertUser({ id: clerkId, name, image: profileImage });

    // optional: expire in 1 hour (only if your frontend refreshes tokens)
    // const exp = Math.floor(Date.now() / 1000) + 60 * 60;
    // const token = chatClient.createToken(clerkId, exp);
    const token = chatClient.createToken(clerkId);

    res.status(200).json({
      token,
      userId: clerkId,
      userName: name,
      userImage: profileImage,
    });
  } catch (error) {
    console.error("Error in getStreamToken controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}