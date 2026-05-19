"use strict";

/**
 * Tool descriptions for the Owkin MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * Excludes image-rendering tools (display_slide_thumbnail,
 * display_tiles_with_predictions, download_histomics) because
 * agents process text, not images.
 *
 * @module owkin-tool-descriptions
 */

const OWKIN_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "owkin_list_cohorts",
    description: "List all available TCGA cancer cohorts in the Owkin pathology platform",
    parameters: '{}'
  },
  {
    name: "owkin_cohort_description",
    description: "Get descriptive statistics for a histomics feature across a TCGA cohort",
    parameters: '{ "cohort": "TCGA-BRCA", "column_name": "tumor_cell_density" }'
  },
  {
    name: "owkin_filter_slides",
    description: "Filter and rank slides in a TCGA cohort by a histomics feature value",
    parameters: '{ "cohort": "TCGA-BRCA", "column": "tumor_cell_density" [, "descending": true] [, "limit": 10] }'
  },
  {
    name: "owkin_survival_analysis",
    description: "Run Kaplan-Meier survival analysis for a TCGA cohort stratified by a histomics feature",
    parameters: '{ "cohort": "TCGA-BRCA", "feature": "tumor_cell_density", "endpoint": "OS|PFS" [, "stratify": false] }'
  },
  {
    name: "owkin_list_cell_types",
    description: "List all cell types recognized by the Owkin histomics model",
    parameters: '{}'
  },
  {
    name: "owkin_filter_tiles",
    description: "Filter and rank tiles within a slide by a histomics feature value",
    parameters: '{ "cohort": "TCGA-BRCA", "slide_id": "TCGA-A2-A0T2-01Z", "column": "tumor_cell_density" [, "descending": true] [, "limit": 25] }'
  },
  {
    name: "owkin_get_histomics",
    description: "Retrieve histomics feature values for one or more slides",
    parameters: '{ "slide_ids": ["TCGA-A2-A0T2-01Z"] [, "column_names": ["tumor_cell_density", "stromal_ratio"]] }'
  },
  {
    name: "owkin_features_description",
    description: "List or describe available histomics features, optionally filtered by cell type",
    parameters: '{ [, "cell_type": "tumor"] [, "column_name": "tumor_cell_density"] [, "name_only": false] }'
  }
]);

module.exports = { OWKIN_TOOL_DESCRIPTIONS };
