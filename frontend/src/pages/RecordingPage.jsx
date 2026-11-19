import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeftIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import toast from "react-hot-toast";
import Navbar from "../components/navbar";

const boxShape =
  "!inline-flex !items-center !justify-center !h-9 !min-h-0 !rounded-[4px] !px-4 !gap-2 !text-sm !font-semibold !border-0 !shadow-[0_4px_8px_rgba(0,0,0,0.25)]";

function RecordingPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [isDownloading, setIsDownloading] = useState(false);

  // keep the recording across a page refresh
  if (state?.url) sessionStorage.setItem("lastRecording", JSON.stringify(state));
  const saved = state?.url ? state : JSON.parse(sessionStorage.getItem("lastRecording") || "null");

  const url = saved?.url;
  const filename = saved?.filename || "interview-recording.mp4";

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      toast.error("Direct download failed, opening the file instead.");
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-100 flex flex-col">
      <Navbar />

      <div className="flex-1 bg-base-200 p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="bg-base-100 rounded-lg shadow p-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-base-content">Session Recording</h1>
              <p className="text-base-content/60 mt-1">{filename}</p>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/dashboard")} className={`btn btn-ghost ${boxShape}`}>
                <ArrowLeftIcon className="size-4" />
                Dashboard
              </button>

              {url && (
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className={`btn text-white bg-gradient-to-r from-red-600 to-orange-500 ${boxShape}`}
                >
                  {isDownloading ? <Loader2Icon className="size-4 animate-spin" /> : <DownloadIcon className="size-4" />}
                  Download
                </button>
              )}
            </div>
          </div>

          <div className="bg-base-100 rounded-xl shadow-sm p-5 border border-base-300">
            {url ? (
              <video src={url} controls className="w-full rounded-lg bg-black aspect-video" />
            ) : (
              <p className="text-base-content/60">No recording found. The link may be missing or expired.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RecordingPage;