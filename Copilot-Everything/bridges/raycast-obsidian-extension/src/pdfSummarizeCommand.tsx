import { Action, ActionPanel, Form, getPreferenceValues } from "@raycast/api";
import { PdfCommandPreferences, PdfSummarizeFormValues, runPdfSummarizeCommand } from "@/tools/pdfSummarizeFlow";

export default function Command() {
  const prefs = getPreferenceValues<PdfCommandPreferences>();

  async function handleSubmit(values: PdfSummarizeFormValues) {
    await runPdfSummarizeCommand(values, prefs);
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Extract & Summarize" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="pdfPath"
        title="PDF Path or URL"
        placeholder="path/to/file.pdf or https://example.com/file.pdf"
      />
    </Form>
  );
}
