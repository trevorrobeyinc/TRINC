import { getPreferenceValues, LaunchProps, showToast, Toast } from "@raycast/api";
import {
  runVideoTranscribeCommand,
  VideoCommandPreferences,
  VideoTranscribeFormValues,
} from "@/tools/videoTranscribeFlow";

/**
 * Internal no-view runner for the video pipeline. The "Video Download & Transcribe" form
 * launches this via launchCommand so the multi-minute pipeline (yt-dlp → Whisper → Copilot
 * summary) runs in a command Raycast keeps alive until the promise settles — a view command's
 * JS context dies when its window is dismissed (even by focus loss), which silently killed
 * runs mid-Whisper. Not meant to be invoked directly from the root search.
 */
export default async function Command(props: LaunchProps<{ launchContext: { values?: VideoTranscribeFormValues } }>) {
  const values = props.launchContext?.values;
  if (!values) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Video Pipeline Runner",
      message: "Launch this via the Video Download & Transcribe command.",
    });
    return;
  }

  const prefs = getPreferenceValues<VideoCommandPreferences>();
  await runVideoTranscribeCommand(values, prefs);
}
