"use strict";

/**
 * ChEMBL MCP -- calls the EBI ChEMBL REST API over HTTPS.
 *
 * Provides compound search, drug indication lookup, target search,
 * ADMET property retrieval, bioactivity data, and mechanism-of-action
 * queries for OpenClaw research agents.
 *
 * Follows the same execute({name, arguments}) interface as other MCP providers.
 *
 * @module chembl-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./chembl-schema.js");

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

function encodeParam(value) {
  return encodeURIComponent(String(value));
}

function extractMoleculeProps(mol) {
  const props = isPlainObject(mol.molecule_properties) ? mol.molecule_properties : {};
  return {
    molecule_chembl_id: mol.molecule_chembl_id || "",
    pref_name: mol.pref_name || null,
    max_phase: mol.max_phase != null ? mol.max_phase : null,
    molecule_type: mol.molecule_type || null,
    molecular_formula: props.full_mwt ? (mol.molecule_structures && mol.molecule_structures.molecular_formula) || props.molecular_formula || null : null,
    molecular_weight: props.full_mwt ? Number(props.full_mwt) : null,
    alogp: props.alogp != null ? Number(props.alogp) : null,
    hba: props.hba != null ? Number(props.hba) : null,
    hbd: props.hbd != null ? Number(props.hbd) : null,
    psa: props.psa != null ? Number(props.psa) : null,
    qed_weighted: props.qed_weighted != null ? Number(props.qed_weighted) : null,
    ro5_violations: props.num_ro5_violations != null ? Number(props.num_ro5_violations) : null
  };
}

function extractAdmetProps(props) {
  if (!isPlainObject(props)) return {};
  return {
    full_mwt: props.full_mwt != null ? Number(props.full_mwt) : null,
    mw_freebase: props.mw_freebase != null ? Number(props.mw_freebase) : null,
    alogp: props.alogp != null ? Number(props.alogp) : null,
    hba: props.hba != null ? Number(props.hba) : null,
    hbd: props.hbd != null ? Number(props.hbd) : null,
    psa: props.psa != null ? Number(props.psa) : null,
    rtb: props.rtb != null ? Number(props.rtb) : null,
    num_ro5_violations: props.num_ro5_violations != null ? Number(props.num_ro5_violations) : null,
    ro3_pass: props.ro3_pass || null,
    qed_weighted: props.qed_weighted != null ? Number(props.qed_weighted) : null,
    aromatic_rings: props.aromatic_rings != null ? Number(props.aromatic_rings) : null,
    heavy_atoms: props.heavy_atoms != null ? Number(props.heavy_atoms) : null
  };
}

function createChemblMcp(options = {}) {
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };

  const client = createHttpsClient({
    hostname: "www.ebi.ac.uk",
    basePath: "/chembl/api/data",
    headers: { Accept: "application/json" },
    maxPerSecond: 5
  });

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("chembl-mcp: tool name is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("chembl-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {
      case "chembl_compound_search": {
        let molecules = [];

        if (validated.chembl_id) {
          const data = await client.getJson(`/molecule/${encodeParam(validated.chembl_id)}.json`);
          if (isPlainObject(data) && data.molecule_chembl_id) {
            molecules = [data];
          }
        } else if (validated.smiles) {
          const threshold = validated.similarity_threshold || 85;
          const data = await client.getJson(
            `/similarity/${encodeParam(validated.smiles)}/${threshold}.json?limit=${validated.limit}`
          );
          molecules = Array.isArray(data.molecules) ? data.molecules : [];
        } else {
          const data = await client.getJson(
            `/molecule/search.json?q=${encodeParam(validated.name)}&limit=${validated.limit}`
          );
          molecules = Array.isArray(data.molecules) ? data.molecules : [];
        }

        if (validated.max_phase != null) {
          const phase = Number(validated.max_phase);
          molecules = molecules.filter(m => m.max_phase != null && m.max_phase >= phase);
        }

        result = {
          ok: true,
          compounds: molecules.map(extractMoleculeProps)
        };
        break;
      }

      case "chembl_drug_search": {
        const params = [];
        params.push(`mesh_heading__icontains=${encodeParam(validated.indication)}`);

        if (validated.molecule_chembl_id) {
          params.push(`molecule_chembl_id=${encodeParam(validated.molecule_chembl_id)}`);
        }
        if (validated.max_phase != null) {
          params.push(`max_phase_for_ind=${encodeParam(validated.max_phase)}`);
        }
        if (validated.only_approved) {
          params.push("max_phase_for_ind=4");
        }
        params.push(`limit=${validated.limit}`);

        const data = await client.getJson(`/drug_indication.json?${params.join("&")}`);
        const indications = Array.isArray(data.drug_indications) ? data.drug_indications : [];

        // If drug_name filter provided, fetch molecule details for name matching
        let filtered = indications;
        if (validated.drug_name) {
          const nameLC = validated.drug_name.toLowerCase();
          filtered = indications.filter(ind => {
            const name = (ind.molecule_chembl_id || "").toLowerCase();
            const pref = (ind.pref_name || "").toLowerCase();
            return name.includes(nameLC) || pref.includes(nameLC);
          });
        }

        result = {
          ok: true,
          drugs: filtered.map(ind => ({
            molecule_chembl_id: ind.molecule_chembl_id || "",
            pref_name: ind.pref_name || null,
            max_phase: ind.max_phase_for_ind != null ? ind.max_phase_for_ind : null,
            indication: ind.indication || null,
            mesh_heading: ind.mesh_heading || null,
            efo_term: ind.efo_term || null,
            withdrawn_flag: ind.withdrawn_flag || false,
            black_box_warning: ind.black_box_warning || false
          }))
        };
        break;
      }

      case "chembl_target_search": {
        let targets = [];

        if (validated.target_chembl_id) {
          const data = await client.getJson(`/target/${encodeParam(validated.target_chembl_id)}.json`);
          if (isPlainObject(data) && data.target_chembl_id) {
            targets = [data];
          }
        } else if (validated.gene_symbol) {
          const data = await client.getJson(
            `/target.json?target_components__target_component_synonyms__component_synonym=${encodeParam(validated.gene_symbol)}&limit=${validated.limit}`
          );
          targets = Array.isArray(data.targets) ? data.targets : [];
        } else {
          const params = [];
          if (validated.target_name) {
            params.push(`pref_name__icontains=${encodeParam(validated.target_name)}`);
          }
          if (validated.organism) {
            params.push(`organism__icontains=${encodeParam(validated.organism)}`);
          }
          if (validated.target_type) {
            params.push(`target_type=${encodeParam(validated.target_type)}`);
          }
          params.push(`limit=${validated.limit}`);

          const data = await client.getJson(`/target.json?${params.join("&")}`);
          targets = Array.isArray(data.targets) ? data.targets : [];
        }

        result = {
          ok: true,
          targets: targets.map(t => ({
            target_chembl_id: t.target_chembl_id || "",
            pref_name: t.pref_name || null,
            target_type: t.target_type || null,
            organism: t.organism || null,
            target_components: Array.isArray(t.target_components) ? t.target_components : []
          }))
        };
        break;
      }

      case "chembl_get_admet": {
        const data = await client.getJson(`/molecule/${encodeParam(validated.molecule_chembl_id)}.json`);

        if (!isPlainObject(data) || !data.molecule_chembl_id) {
          result = { ok: false, error: "Molecule not found", molecule_chembl_id: validated.molecule_chembl_id };
        } else {
          result = {
            ok: true,
            molecule_chembl_id: data.molecule_chembl_id,
            properties: extractAdmetProps(data.molecule_properties)
          };
        }
        break;
      }

      case "chembl_get_bioactivity": {
        const params = [];
        if (validated.molecule_chembl_id) {
          params.push(`molecule_chembl_id=${encodeParam(validated.molecule_chembl_id)}`);
        }
        if (validated.target_chembl_id) {
          params.push(`target_chembl_id=${encodeParam(validated.target_chembl_id)}`);
        }
        if (validated.activity_type) {
          params.push(`standard_type=${encodeParam(validated.activity_type)}`);
        }
        if (validated.min_pchembl != null) {
          params.push(`pchembl_value__gte=${encodeParam(validated.min_pchembl)}`);
        }
        if (validated.min_value != null) {
          params.push(`standard_value__gte=${encodeParam(validated.min_value)}`);
        }
        if (validated.max_value != null) {
          params.push(`standard_value__lte=${encodeParam(validated.max_value)}`);
        }
        if (validated.unit) {
          params.push(`standard_units=${encodeParam(validated.unit)}`);
        }
        params.push(`limit=${validated.limit}`);

        const data = await client.getJson(`/activity.json?${params.join("&")}`);
        const activities = Array.isArray(data.activities) ? data.activities : [];

        result = {
          ok: true,
          activities: activities.map(a => ({
            molecule_chembl_id: a.molecule_chembl_id || "",
            target_chembl_id: a.target_chembl_id || "",
            target_pref_name: a.target_pref_name || null,
            standard_type: a.standard_type || null,
            standard_value: a.standard_value != null ? Number(a.standard_value) : null,
            standard_units: a.standard_units || null,
            pchembl_value: a.pchembl_value != null ? Number(a.pchembl_value) : null,
            assay_type: a.assay_type || null,
            assay_description: a.assay_description || null
          }))
        };
        break;
      }

      case "chembl_get_mechanism": {
        const params = [];
        if (validated.molecule_chembl_id) {
          params.push(`molecule_chembl_id=${encodeParam(validated.molecule_chembl_id)}`);
        }
        if (validated.target_chembl_id) {
          params.push(`target_chembl_id=${encodeParam(validated.target_chembl_id)}`);
        }
        if (validated.action_type) {
          params.push(`action_type=${encodeParam(validated.action_type)}`);
        }
        params.push(`limit=${validated.limit}`);

        const data = await client.getJson(`/mechanism.json?${params.join("&")}`);
        const mechanisms = Array.isArray(data.mechanisms) ? data.mechanisms : [];

        result = {
          ok: true,
          mechanisms: mechanisms.map(m => ({
            molecule_chembl_id: m.molecule_chembl_id || "",
            target_chembl_id: m.target_chembl_id || "",
            target_name: m.target_pref_name || m.target_name || null,
            action_type: m.action_type || null,
            mechanism_of_action: m.mechanism_of_action || null,
            direct_interaction: m.direct_interaction != null ? Boolean(m.direct_interaction) : null,
            disease_efficacy: m.disease_efficacy != null ? Boolean(m.disease_efficacy) : null,
            binding_site_name: m.binding_site_name || null
          }))
        };
        break;
      }
    }

    logger.info({
      event: "chembl_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  async function isAvailable() {
    try {
      const data = await client.getJson("/molecule/search.json?q=aspirin&limit=1");
      return isPlainObject(data) && Array.isArray(data.molecules);
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

module.exports = { createChemblMcp };
