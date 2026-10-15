import { getPreferenceValues, LaunchProps, showToast, Toast } from "@raycast/api";
import {
  runVideoTranscribeCommand,
  SupersededRunError,
  VideoCommandPreferences,
  VideoTranscribeFormValues,
} from "@/tools/videoTranscribeFlow";

/**
 * THE video pipeline command (the old two-command form → runner handoff was merged 2026-07-16):
 * paste a video URL — or a local file path / file:// URL — into the root-search argument.
 * no-view mode keeps the multi-minute pipeline (Downie → Whisper → Copilot summary) alive after
 * the Raycast window closes; a view command's JS context dies when its window is dismissed
 * (even by focus loss), which is what silently killed runs mid-Whisper under the old form flow.
 */
export default async function Command(
  props: LaunchProps<{
    arguments: { videoUrl?: string };
    launchContext: { values?: VideoTranscribeFormValues };
  }>
) {
  // The root-search argument is the primary input; launchContext.values survives for deeplink
  // automations (same payload shape the old form handoff used).
  const argUrl = props.arguments?.videoUrl?.trim();
  const values = argUrl ? { videoUrl: argUrl } : props.launchContext?.values;

  if (!values || (!values.videoUrl?.trim() && !values.videoFile?.length)) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Video Pipeline Runner",
      message: "Paste a video URL (or a local file path) into the command's argument.",
    });
    return;
  }

  // Whisper settings live on this command's own preferences now — no forwarding needed.
  const prefs = getPreferenceValues<VideoCommandPreferences>();
  try {
    await runVideoTranscribeCommand({ ...values, videoUrl: values.videoUrl ?? "" }, prefs);
  } catch (error) {
    // A newer dispatch replaced this run; it already logged RUN SUPERSEDED. Exit quietly.
    if (error instanceof SupersededRunError) {
      return;
    }
    throw error;
  }
}
