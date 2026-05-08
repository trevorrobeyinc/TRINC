import { showToast, Toast } from "@raycast/api";
import { runAiSummarizeCommand } from "@/tools/aiSummarizeCommandFlow";

export default async function Command() {
  await showToast({
    style: Toast.Style.Animated,
    title: "Triggering summarize prompt...",
  });

  try {
    const result = await runAiSummarizeCommand({});
    const targetLabel = result.normalizedPath || "Active note";

    await showToast({
      style: Toast.Style.Success,
      title: "Summarization triggered",
      message: `${targetLabel} via ${result.usedCommandId}`,
    });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to summarize",
      message: String(error),
    });
  }
}
