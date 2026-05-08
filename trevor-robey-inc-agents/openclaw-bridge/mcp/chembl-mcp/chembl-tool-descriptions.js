"use strict";

/**
 * Tool descriptions for the ChEMBL MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * @module chembl-tool-descriptions
 */

const CHEMBL_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "chembl_compound_search",
    description: "Search ChEMBL for compounds by name, ChEMBL ID, or SMILES similarity",
    parameters: '{ "name": "aspirin" [, "chembl_id": "CHEMBL25"] [, "smiles": "CC(=O)Oc1ccccc1C(=O)O"] [, "similarity_threshold": 85] [, "max_phase": "4"] [, "limit": 20] }'
  },
  {
    name: "chembl_drug_search",
    description: "Search ChEMBL drug indications by disease/condition, drug name, or approval phase",
    parameters: '{ "indication": "breast cancer" [, "drug_name": "tamoxifen"] [, "molecule_chembl_id": "CHEMBL83"] [, "max_phase": "4"] [, "only_approved": false] [, "limit": 20] }'
  },
  {
    name: "chembl_target_search",
    description: "Search ChEMBL for drug targets by name, gene symbol, organism, or target type",
    parameters: '{ [, "target_name": "cyclooxygenase"] [, "gene_symbol": "EGFR"] [, "target_chembl_id": "CHEMBL203"] [, "organism": "Homo sapiens"] [, "target_type": "SINGLE PROTEIN"] [, "limit": 20] }'
  },
  {
    name: "chembl_get_admet",
    description: "Get ADMET-relevant molecular properties (logP, PSA, HBA/HBD, Ro5, QED) for a ChEMBL molecule",
    parameters: '{ "molecule_chembl_id": "CHEMBL25" }'
  },
  {
    name: "chembl_get_bioactivity",
    description: "Retrieve bioactivity data (IC50, EC50, Ki, etc.) for a molecule or target from ChEMBL",
    parameters: '{ [, "molecule_chembl_id": "CHEMBL25"] [, "target_chembl_id": "CHEMBL203"] [, "activity_type": "IC50"] [, "min_pchembl": 5.0] [, "min_value": 1] [, "max_value": 1000] [, "unit": "nM"] [, "limit": 20] }'
  },
  {
    name: "chembl_get_mechanism",
    description: "Look up mechanism-of-action data (action type, binding site, disease efficacy) from ChEMBL",
    parameters: '{ [, "molecule_chembl_id": "CHEMBL25"] [, "target_chembl_id": "CHEMBL203"] [, "action_type": "INHIBITOR"] [, "limit": 20] }'
  }
]);

module.exports = { CHEMBL_TOOL_DESCRIPTIONS };
