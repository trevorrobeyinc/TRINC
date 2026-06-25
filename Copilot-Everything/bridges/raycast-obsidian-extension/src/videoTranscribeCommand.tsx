import { Action, ActionPanel, Form, getPreferenceValues } from "@raycast/api";
import {
  runVideoTranscribeCommand,
  VideoCommandPreferences,
  VideoTranscribeFormValues,
} from "@/tools/videoTranscribeFlow";

export default function Command() {
  const prefs = getPreferenceValues<VideoCommandPreferences>();

  async function handleSubmit(values: VideoTranscribeFormValues) {
    await runVideoTranscribeCommand(values, prefs);
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
        placeholder="Paste a video URL — YouTube, TikTok, Wiley, etc. (auth sites: set the yt-dlp Cookies Browser pref)"
      />
    </Form>
  );
}
