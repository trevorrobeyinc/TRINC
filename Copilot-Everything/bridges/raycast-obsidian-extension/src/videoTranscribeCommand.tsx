import {
  Action,
  ActionPanel,
  Form,
  getPreferenceValues,
  launchCommand,
  LaunchType,
  open,
  showToast,
  Toast,
} from "@raycast/api";
import { VideoTranscribeFormValues } from "@/tools/videoTranscribeFlow";

interface VideoLauncherPreferences {
  whisperPath?: string;
  whisperModel?: string;
}

export default function Command() {
  // Hand the pipeline off to the no-view runner command: view-command JS dies when the
  // Raycast window is dismissed (even by focus loss), which silently killed multi-minute
  // runs mid-Whisper. The runner is kept alive by Raycast until its promise settles.
  async function handleSubmit(values: VideoTranscribeFormValues) {
    // Whisper settings live on THIS command's preferences (so they're visible in the Video
    // Download & Transcribe pane). The no-view runner cannot see this command's preferences,
    // so forward them through launchContext.
    const { whisperPath, whisperModel } = getPreferenceValues<VideoLauncherPreferences>();
    const whisper = { whisperPath, whisperModel };
    try {
      await launchCommand({
        name: "videoTranscribeRunnerCommand",
        extensionName: "obsidian-bridge-fork",
        ownerOrAuthorName: "marcjulian",
        type: LaunchType.UserInitiated,
        context: { values, whisper },
      });
    } catch {
      // Dev builds can fail to resolve sibling commands via launchCommand ("No enabled
      // command ... found"); the deeplink route delivers the same launchContext.
      const context = encodeURIComponent(JSON.stringify({ values, whisper }));
      await open(
        `raycast://extensions/marcjulian/obsidian-bridge-fork/videoTranscribeRunnerCommand?launchType=userInitiated&context=${context}`
      );
    }
    await showToast({
      style: Toast.Style.Success,
      title: "Pipeline started in background",
      message: "Safe to close Raycast — progress in ~/.local/share/raycast-obsidian/video-transcribe.log",
    });
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Transcribe & Save" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="videoUrl"
        title="Video URL"
        placeholder="Paste a video URL — YouTube, TikTok, Wiley, etc. (or pick a local file below)"
      />
      <Form.FilePicker
        id="videoFile"
        title="Local Video File"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        info="Skips the download step entirely (no cookies, no YubiKey). Use for sources yt-dlp can't fetch — e.g. LinkedIn Learning via Downie."
      />
    </Form>
  );
}
