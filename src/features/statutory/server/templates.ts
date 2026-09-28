import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StatutoryTemplateField = {
  id: string;
  field_key: string;
  label: string;
  sort_order: number;
  source_mode: "derived" | "manual" | "hybrid" | "unresolved";
  resolver_type: string | null;
  resolver_config: Record<string, unknown>;
  required: boolean;
  validation_schema: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type StatutoryTemplateSection = {
  id: string;
  section_key: string;
  display_name: string;
  description: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  fields: StatutoryTemplateField[];
};

export type StatutoryTemplatePayload = {
  form: {
    id: string;
    form_key: string;
    display_name: string;
    authority: string;
    description: string | null;
    active: boolean;
  };
  version: {
    id: string;
    version_key: string;
    effective_from: string;
    effective_to: string | null;
    source_reference: string | null;
    status: "draft" | "approved" | "published" | "superseded" | "withdrawn";
    field_schema: Record<string, unknown>;
    mapping_schema: Record<string, unknown>;
    validation_schema: Record<string, unknown>;
  };
  sections: StatutoryTemplateSection[];
};

function asTemplatePayload(value: unknown): StatutoryTemplatePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as StatutoryTemplatePayload;
}

export async function getEffectiveStatutoryTemplate(
  formKey: string,
  effectiveOn: string,
): Promise<StatutoryTemplatePayload | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_statutory_form_template", {
    p_form_key: formKey,
    p_effective_on: effectiveOn,
  });

  if (error) {
    throw new Error(`Unable to resolve statutory template: ${error.message}`);
  }

  return asTemplatePayload(data);
}

export async function getStatutoryTemplateVersionById(
  formVersionId: string,
): Promise<StatutoryTemplatePayload | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_statutory_form_template_version_by_id",
    { p_form_version_id: formVersionId },
  );

  if (error) {
    throw new Error(`Unable to load statutory template version: ${error.message}`);
  }

  return asTemplatePayload(data);
}

export async function getStatutoryTemplateVersionByKey(
  formKey: string,
  versionKey: string,
): Promise<StatutoryTemplatePayload | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_statutory_form_template_version_by_key",
    {
      p_form_key: formKey,
      p_version_key: versionKey,
    },
  );

  if (error) {
    throw new Error(`Unable to load statutory template version: ${error.message}`);
  }

  return asTemplatePayload(data);
}
