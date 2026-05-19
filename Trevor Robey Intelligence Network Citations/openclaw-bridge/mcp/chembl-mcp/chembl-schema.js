"use strict";

const { z } = require("zod");

const CHEMBL_TOOL_NAMES = Object.freeze([
  "chembl_compound_search",
  "chembl_drug_search",
  "chembl_target_search",
  "chembl_get_admet",
  "chembl_get_bioactivity",
  "chembl_get_mechanism"
]);

const MaxPhaseEnum = z.enum(["0", "1", "2", "3", "4"]).optional();
const LimitSchema = z.number().int().min(1).max(1000).default(20);

const TargetTypeEnum = z.enum([
  "SINGLE PROTEIN",
  "PROTEIN COMPLEX",
  "PROTEIN FAMILY",
  "ORGANISM",
  "TISSUE",
  "CELL-LINE",
  "NUCLEIC-ACID",
  "SUBCELLULAR"
]).optional();

const ActivityTypeEnum = z.enum([
  "IC50", "EC50", "Ki", "Kd", "AC50", "GI50", "ED50", "Potency"
]).optional();

const UnitEnum = z.enum(["nM", "uM", "mM", "pM", "M"]).optional();

const ActionTypeEnum = z.enum([
  "INHIBITOR",
  "AGONIST",
  "ANTAGONIST",
  "BLOCKER",
  "MODULATOR",
  "OPENER",
  "ACTIVATOR",
  "POSITIVE ALLOSTERIC MODULATOR",
  "NEGATIVE ALLOSTERIC MODULATOR",
  "PARTIAL AGONIST",
  "INVERSE AGONIST"
]).optional();

const ChemblCompoundSearchSchema = z.object({
  name: z.string().min(1),
  chembl_id: z.string().optional(),
  smiles: z.string().optional(),
  similarity_threshold: z.number().int().min(70).max(100).optional(),
  max_phase: MaxPhaseEnum,
  limit: LimitSchema
}).strict();

const ChemblDrugSearchSchema = z.object({
  indication: z.string().min(1),
  drug_name: z.string().optional(),
  molecule_chembl_id: z.string().optional(),
  max_phase: MaxPhaseEnum,
  only_approved: z.boolean().default(false),
  limit: LimitSchema
}).strict();

const ChemblTargetSearchSchema = z.object({
  target_name: z.string().optional(),
  gene_symbol: z.string().optional(),
  target_chembl_id: z.string().optional(),
  organism: z.string().optional(),
  target_type: TargetTypeEnum,
  limit: LimitSchema
}).strict();

const ChemblGetAdmetSchema = z.object({
  molecule_chembl_id: z.string().min(1)
}).strict();

const ChemblGetBioactivitySchema = z.object({
  molecule_chembl_id: z.string().optional(),
  target_chembl_id: z.string().optional(),
  activity_type: ActivityTypeEnum,
  min_pchembl: z.number().min(0).max(14).optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  unit: UnitEnum,
  limit: LimitSchema
}).strict();

const ChemblGetMechanismSchema = z.object({
  molecule_chembl_id: z.string().optional(),
  target_chembl_id: z.string().optional(),
  action_type: ActionTypeEnum,
  limit: LimitSchema
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  chembl_compound_search: ChemblCompoundSearchSchema,
  chembl_drug_search: ChemblDrugSearchSchema,
  chembl_target_search: ChemblTargetSearchSchema,
  chembl_get_admet: ChemblGetAdmetSchema,
  chembl_get_bioactivity: ChemblGetBioactivitySchema,
  chembl_get_mechanism: ChemblGetMechanismSchema
});

module.exports = {
  CHEMBL_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  ChemblCompoundSearchSchema,
  ChemblDrugSearchSchema,
  ChemblTargetSearchSchema,
  ChemblGetAdmetSchema,
  ChemblGetBioactivitySchema,
  ChemblGetMechanismSchema
};
