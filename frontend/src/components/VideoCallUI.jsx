import {
  CallingState,
  CancelCallButton,
  OwnCapability,
  ReactionsButton,
  Restricted,
  ScreenShareButton,
  SpeakerLayout,
  ToggleAudioPublishingButton,
  ToggleVideoPublishingButton,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  CircleDotIcon,
  DownloadIcon,
  Loader2Icon,
  MessageSquareIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  Channel,
  Chat,
  MessageComposer,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import "stream-chat-react/dist/css/index.css";

const boxShape =
  "!h-9 !min-h-0 !rounded-[4px] !px-4 !gap-2 !text-sm !font-semibold !border-0 !shadow-[0_4px_8px_rgba(0,0,0,0.25)]";

function VideoCallUI({ chatClient, channel }) {
  const navigate = useNavigate();
  const call = useCall();

  const {
    useCallCallingState,
    useParticipantCount,
    useIsCallRecordingInProgress,
  } = useCallStateHooks();

  const callingState = useCallCallingState();
  const participantCount = useParticipantCount();
  const isRecordingFromSdk = useIsCallRecordingInProgress();

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isTogglingRecording, setIsTogglingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState(null);

  const [localRecording, setLocalRecording] = useState(false);
  const isRecording = isRecordingFromSdk || localRecording;

  // Recording state.
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingFile, setRecordingFile] = useState(null);

  const iStoppedRecording = useRef(false);
  const knownRecordingUrls = useRef(new Set());
  const checkingRecordings = useRef(false);

  // Listen for Stream's recording_ready event.
  useEffect(() => {
    if (!call) return;

    const unsubscribe = call.on("call.recording_ready", (event) => {
      if (!iStoppedRecording.current) return;

      const url = event.call_recording?.url;

      if (!url) {
        console.error("Recording ready event did not contain a URL.");
        return;
      }

      const filename =
        event.call_recording?.filename || `interview-${Date.now()}.mp4`;

      iStoppedRecording.current = false;
      setIsProcessing(false);
      setRecordingFile({ url, filename });
    });

    return () => unsubscribe();
  }, [call]);

  // Backup polling in case the recording_ready event is missed.
  useEffect(() => {
    if (!call || !isProcessing) return;

    const interval = setInterval(async () => {
      if (!iStoppedRecording.current || checkingRecordings.current) {
        return;
      }

      checkingRecordings.current = true;

      try {
        const { recordings } = await call.listRecordings();

        const fresh = (recordings || []).find(
          (recording) =>
            recording.url && !knownRecordingUrls.current.has(recording.url)
        );

        if (!fresh || !iStoppedRecording.current) return;

        iStoppedRecording.current = false;
        setIsProcessing(false);

        const filename = fresh.filename || `interview-${Date.now()}.mp4`;

        setRecordingFile({ url: fresh.url, filename });
      } catch (error) {
        console.error("Checking recordings failed:", error);
      } finally {
        checkingRecordings.current = false;
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [call, isProcessing]);

  // Start or stop recording.
  const handleToggleRecording = async () => {
    setRecordingError(null);
    setIsTogglingRecording(true);

    try {
      if (isRecording) {
        // Remember existing recordings.
        const before = await call
          .listRecordings()
          .catch(() => ({ recordings: [] }));

        knownRecordingUrls.current = new Set(
          (before.recordings || [])
            .map((recording) => recording.url)
            .filter(Boolean)
        );

        await call.stopRecording();

        setLocalRecording(false);
        iStoppedRecording.current = true;
        setRecordingFile(null);
        setIsProcessing(true);
      } else {
        await call.startRecording();
        setLocalRecording(true);
      }
    } catch (error) {
      const message = error?.message || "";

      if (message.includes("already being recorded")) {
        setLocalRecording(true);
      } else if (message.includes("not being recorded")) {
        setLocalRecording(false);
      } else {
        console.error("Recording failed:", error);
        setRecordingError(message || "Recording failed");
      }
    } finally {
      setIsTogglingRecording(false);
    }
  };

  // Go to the styled recording page.
  const handleOpenRecordingPage = () => {
    if (!recordingFile) return;
    navigate("/recording", {
      state: { url: recordingFile.url, filename: recordingFile.filename },
    });
  };

  if (callingState === CallingState.JOINING) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2Icon className="w-12 h-12 mx-auto animate-spin text-orange-500 mb-4" />
          <p className="text-lg">Joining call...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-3 relative str-video">
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 bg-base-100 p-3 rounded-lg shadow">
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center text-white pointer-events-none bg-gradient-to-r from-red-600 to-orange-500 ${boxShape}`}
            >
              <UsersIcon className="size-4" />
              <span>
                {participantCount}{" "}
                {participantCount === 1 ? "participant" : "participants"}
              </span>
            </div>

            {isRecording && (
              <span className="badge badge-error gap-1.5">
                <span className="size-2 rounded-full bg-white animate-pulse" />
                Recording
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleRecording}
              disabled={isTogglingRecording || !call}
              className={`btn btn-error ${boxShape}`}
              title={isRecording ? "Stop recording" : "Start recording"}
            >
              {isTogglingRecording ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <CircleDotIcon className="size-4" />
              )}

              {isRecording ? "Stop recording" : "Record"}
            </button>

            {chatClient && channel && (
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`btn ${boxShape} ${
                  isChatOpen
                    ? "text-white bg-gradient-to-r from-red-600 to-orange-500"
                    : "btn-ghost"
                }`}
                title={isChatOpen ? "Hide chat" : "Show chat"}
              >
                <MessageSquareIcon className="size-4" />
                Chat
              </button>
            )}
          </div>
        </div>

        {/* Recording error */}
        {recordingError && (
          <div role="alert" className="alert alert-error text-sm py-2">
            <span>Recording error: {recordingError}</span>
          </div>
        )}

        {/* Processing message */}
        {isProcessing && (
          <div role="alert" className="alert alert-info text-sm py-2">
            <Loader2Icon className="size-4 animate-spin" />
            <span>
              Processing your recording. A button will appear here when
              it's ready.
            </span>
          </div>
        )}

        {/* Recording ready */}
        {recordingFile && (
          <div
            role="alert"
            className="alert alert-success text-sm py-2 flex justify-between"
          >
            <span>Recording ready.</span>

            <button
              onClick={handleOpenRecordingPage}
              className="btn btn-sm gap-2"
            >
              <DownloadIcon className="size-4" />
              Download recording
            </button>
          </div>
        )}

        {/* Video */}
        <div className="flex-1 bg-base-300 rounded-lg overflow-hidden relative">
          <SpeakerLayout />
        </div>

        {/* Call controls */}
        <div className="bg-base-100 p-3 rounded-lg shadow flex justify-center">
          <div className="str-video__call-controls">
            <Restricted requiredGrants={[OwnCapability.SEND_AUDIO]}>
              <ToggleAudioPublishingButton menuPlacement="top" />
            </Restricted>

            <Restricted requiredGrants={[OwnCapability.SEND_VIDEO]}>
              <ToggleVideoPublishingButton menuPlacement="top" />
            </Restricted>

            <Restricted requiredGrants={[OwnCapability.CREATE_REACTION]}>
              <ReactionsButton />
            </Restricted>

            <Restricted requiredGrants={[OwnCapability.SCREENSHARE]}>
              <ScreenShareButton />
            </Restricted>

            <CancelCallButton onLeave={() => navigate("/dashboard")} />
          </div>
        </div>
      </div>

      {/* Chat section */}
      {chatClient && channel && (
        <div
          className={`flex flex-col min-h-0 rounded-lg shadow overflow-hidden bg-[#272a30] transition-all duration-300 ease-in-out ${
            isChatOpen ? "w-80 opacity-100" : "w-0 opacity-0"
          }`}
        >
          {isChatOpen && (
            <>
              <div className="bg-[#1c1e22] p-3 border-b border-[#3a3d44] flex items-center justify-between shrink-0">
                <h3 className="font-semibold text-white">Session Chat</h3>

                <button
                  onClick={() => setIsChatOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Close chat"
                >
                  <XIcon className="size-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 flex flex-col stream-chat-dark">
                <Chat client={chatClient} theme="str-chat__theme-dark">
                  <Channel channel={channel}>
                    <Window>
                      <MessageList />
                      <MessageComposer />
                    </Window>
                    <Thread />
                  </Channel>
                </Chat>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default VideoCallUI;