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
export default async function Command(
  props: LaunchProps<{
    launchContext: {
      values?: VideoTranscribeFormValues;
      whisper?: { whisperPath?: string; whisperModel?: string };
    };
  }>,
) {
  const values = props.launchContext?.values;
  if (!values) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Video Pipeline Runner",
      message: "Launch this via the Video Download & Transcribe command.",
    });
    return;
  }

  // Whisper settings are configured on the Video Download & Transcribe command and arrive via
  // launchContext (this no-view runner's getPreferenceValues cannot see that command's prefs).
  const prefs = getPreferenceValues<VideoCommandPreferences>();
  const whisper = props.launchContext?.whisper;
  const mergedPrefs: VideoCommandPreferences = {
    ...prefs,
    ...(whisper?.whisperPath ? { whisperPath: whisper.whisperPath } : {}),
    ...(whisper?.whisperModel ? { whisperModel: whisper.whisperModel } : {}),
  };
  await runVideoTranscribeCommand(values, mergedPrefs);
}
