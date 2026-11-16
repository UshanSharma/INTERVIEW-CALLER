import { StreamVideoClient } from "@stream-io/video-react-sdk";

const apiKey = import.meta.env.VITE_STREAM_API_KEY;

export const initializeStreamClient = async (user, token) => {
  if (!apiKey) throw new Error("Stream API key is not provided.");

  return StreamVideoClient.getOrCreateInstance({
    apiKey,
    user,
    token,
  });
};

export const disconnectStreamClient = async (clientToDisconnect) => {
  if (!clientToDisconnect) return;

  try {
    await clientToDisconnect.disconnectUser();
  } catch (error) {
    console.error("Error disconnecting Stream client:", error);
  }
};