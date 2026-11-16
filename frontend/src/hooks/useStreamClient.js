import { useState, useEffect } from "react";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";
import { initializeStreamClient, disconnectStreamClient } from "../lib/stream";
import { sessionApi } from "../api/sessions";

function useStreamClient(session, loadingSession, isHost, isParticipant) {
  const [streamClient, setStreamClient] = useState(null);
  const [call, setCall] = useState(null);
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [isInitializingCall, setIsInitializingCall] = useState(true);
  const callId = session?.callId;
  const sessionStatus = session?.status;

  useEffect(() => {
    let isCancelled = false;
    let videoCall = null;
    let videoClient = null;
    let chatClientInstance = null;

    const initCall = async () => {
      if (!callId || (!isHost && !isParticipant) || sessionStatus === "completed") return;

      try {
        const { token, userId, userName, userImage } = await sessionApi.getStreamToken();
        if (isCancelled) return;

        videoClient = await initializeStreamClient(
          {
            id: userId,
            name: userName,
            image: userImage,
          },
          token
        );

        if (isCancelled) {
          await disconnectStreamClient(videoClient);
          return;
        }

        setStreamClient(videoClient);
        videoCall = videoClient.call("default", callId);
        await videoCall.join({ create: true });
        if (isCancelled) return;

        setCall(videoCall);

        const apiKey = import.meta.env.VITE_STREAM_API_KEY;
        chatClientInstance = StreamChat.getInstance(apiKey);

        await chatClientInstance.connectUser(
          {
            id: userId,
            name: userName,
            image: userImage,
          },
          token
        );
        if (isCancelled) return;

        setChatClient(chatClientInstance);

        const chatChannel = chatClientInstance.channel("messaging", callId);
        await chatChannel.watch();
        if (isCancelled) return;

        setChannel(chatChannel);
      } catch (error) {
        if (!isCancelled) {
          toast.error("Failed to join video call");
          console.error("Error init call", error);
        }
      } finally {
        if (!isCancelled) setIsInitializingCall(false);
      }
    };

    if (!loadingSession) initCall();

    return () => {
      isCancelled = true;
      (async () => {
        try {
          if (videoCall) await videoCall.leave();
          if (chatClientInstance) await chatClientInstance.disconnectUser();
          if (videoClient) await disconnectStreamClient(videoClient);
        } catch (error) {
          console.error("Cleanup error:", error);
        }
      })();
    };
  }, [callId, sessionStatus, loadingSession, isHost, isParticipant]);

  return {
    streamClient,
    call,
    chatClient,
    channel,
    isInitializingCall,
  };
}

export default useStreamClient;