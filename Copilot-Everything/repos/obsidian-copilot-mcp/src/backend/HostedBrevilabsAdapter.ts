import { BrevilabsClient } from "@/LLMProviders/brevilabsClient";
import { getSettings } from "@/settings/model";
import type {
  BackendAdapter,
  BackendCapability,
  BackendCapabilityStatus,
  HostedLicenseValidationResult,
} from "./BackendAdapter";

export class HostedBrevilabsAdapter implements BackendAdapter {
  readonly mode = "hosted" as const;
  readonly label = "Hosted Brevilabs";

  private readonly client = BrevilabsClient.getInstance();

  setPluginVersion(version: string): void {
    this.client.setPluginVersion(version);
  }

  getCapabilityStatus(capability: BackendCapability): BackendCapabilityStatus {
    const hasLicense = !!getSettings().plusLicenseKey;

    switch (capability) {
      case "license_validation":
        return {
          supported: true,
          configured: hasLicense,
          message: hasLicense
            ? "Hosted license key is configured."
            : "Hosted license key is not configured.",
        };
      case "web_search":
      case "youtube_transcription":
      case "url_ingestion":
      case "twitter_ingestion":
      case "pdf_parse":
      case "docs_parse":
      case "rerank":
        return {
          supported: true,
          configured: hasLicense,
          message: hasLicense
            ? "Hosted adapter is available."
            : "Hosted mode requires a Brevilabs license key for this capability.",
        };
      case "vector_search":
        return {
          supported: false,
          configured: false,
          message: "Hosted adapter does not expose a plugin-owned vector search backend.",
        };
    }
  }

  async validateHostedLicense(
    context?: Record<string, unknown>
  ): Promise<HostedLicenseValidationResult> {
    return await this.client.validateLicenseKey(context);
  }

  async webSearch(query: string): Promise<{ content: string; citations: string[] }> {
    const response = await this.client.webSearch(query);
    return {
      content: response.response.choices[0]?.message?.content || "",
      citations: response.response.citations || [],
    };
  }

  async youtube4llm(url: string) {
    return await this.client.youtube4llm(url);
  }

  async url4llm(url: string) {
    return await this.client.url4llm(url);
  }

  async twitter4llm(url: string) {
    return await this.client.twitter4llm(url);
  }

  async pdf4llm(binaryContent: ArrayBuffer) {
    return await this.client.pdf4llm(binaryContent);
  }

  async docs4llm(binaryContent: ArrayBuffer, fileType: string) {
    return await this.client.docs4llm(binaryContent, fileType);
  }

  async rerank(query: string, documents: string[]) {
    return await this.client.rerank(query, documents);
  }
}
