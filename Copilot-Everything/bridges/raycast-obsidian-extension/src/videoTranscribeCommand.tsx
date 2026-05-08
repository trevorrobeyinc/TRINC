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
        placeholder="https://youtube.com/watch?v=... or https://www.tiktok.com/@user/video/..."
      />
    </Form>
  );
}
