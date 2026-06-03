import type { DesignTaskType } from "@prisma/client";

export type DesignTaskRequirement = {
  key: string;
  label: string;
  group: string;
  required?: boolean;
  question: string;
  kind?: "core" | "optional" | "quote" | "asset_validation";
  description?: string;
  sharedContextKey?: string;
  priority?: number;
  blockingForReady?: boolean;
  canInferFromContext?: boolean;
  askStrategy?: "direct" | "example_choice" | "confirm_from_context";
  examples?: string[];
};

export type DesignTaskField = DesignTaskRequirement;

export type ExecutionStrategy =
  | "direct_image"
  | "structured_composition"
  | "structured_text"
  | "image_edit";

export type DesignTaskSchema = {
  templateKey?: string;
  taskType: DesignTaskType;
  displayName: string;
  description: string;
  keywords: string[];
  starters: string[];
  requirements?: DesignTaskRequirement[];
  fields?: DesignTaskField[];
  sharedContextKeys?: string[];
  minimumViableRequirementKeys?: string[];
  minimumViableThreshold?: number;
  executionStrategy?: ExecutionStrategy;
};

const STRUCTURED_TEXT_TASKS = new Set<DesignTaskType>([
  "social_copy",
  "seo_article",
  "website_audit",
  "annual_marketing_strategy",
  "ads_strategy",
]);

const IMAGE_EDIT_TASKS = new Set<DesignTaskType>(["design_modification"]);

const STRUCTURED_COMPOSITION_TASKS = new Set<DesignTaskType>([
  "brand_guideline",
  "brand_website",
  "landing_page",
  "ecommerce_website",
]);

const WEB_TASKS = new Set<DesignTaskType>([
  "brand_website",
  "landing_page",
  "ecommerce_website",
]);

export const resolveDefaultExecutionStrategy = (
  taskType: DesignTaskType | string | null | undefined,
): ExecutionStrategy => {
  if (!taskType || typeof taskType !== "string") return "direct_image";
  if (IMAGE_EDIT_TASKS.has(taskType as DesignTaskType)) return "image_edit";
  if (STRUCTURED_TEXT_TASKS.has(taskType as DesignTaskType)) return "structured_text";
  if (STRUCTURED_COMPOSITION_TASKS.has(taskType as DesignTaskType)) {
    return "structured_composition";
  }
  return "direct_image";
};

export const resolveTaskDomain = (
  taskType: DesignTaskType | string | null | undefined,
): "image" | "text" | "web" => {
  if (!taskType || typeof taskType !== "string") return "image";
  if (WEB_TASKS.has(taskType as DesignTaskType)) return "web";
  if (STRUCTURED_TEXT_TASKS.has(taskType as DesignTaskType)) return "text";
  return "image";
};

const KNOWN_TASK_TYPES: Set<string> = new Set([
  "logo",
  "vi",
  "brand_guideline",
  "business_card",
  "dm",
  "poster",
  "catalog",
  "menu",
  "invitation_card",
  "sticker",
  "packaging",
  "social_post",
  "banner",
  "edm",
  "brand_website",
  "landing_page",
  "ecommerce_website",
  "event_backdrop",
  "x_banner",
  "standing_sign",
  "hand_held_sign",
  "banner_cloth",
  "outdoor_signboard",
  "store_sign",
  "merchandise",
  "gift",
  "illustration",
  "design_modification",
  "social_copy",
  "seo_article",
  "website_audit",
  "annual_marketing_strategy",
  "ads_strategy",
]);

const normalizeSchema = (schema: DesignTaskSchema): DesignTaskSchema => {
  const requirements =
    Array.isArray(schema.requirements) && schema.requirements.length > 0
      ? schema.requirements
      : Array.isArray(schema.fields)
        ? schema.fields
        : [];

  return {
    ...schema,
    requirements,
    fields: requirements,
    executionStrategy:
      schema.executionStrategy || resolveDefaultExecutionStrategy(schema.taskType),
  };
};

const normalizeTaskType = (
  taskType: DesignTaskType | string | null | undefined,
): DesignTaskType | null => {
  if (!taskType || typeof taskType !== "string") return null;
  return KNOWN_TASK_TYPES.has(taskType) ? (taskType as DesignTaskType) : null;
};

const buildGenericFallbackSchema = (taskType: string): DesignTaskSchema => {
  console.warn(
    `[schema-registry] Unknown taskType "${taskType}", using generic fallback schema.`,
  );
  return normalizeSchema({
    taskType: taskType as DesignTaskType,
    displayName: String(taskType),
    description: "",
    keywords: [],
    starters: [],
    requirements: [],
  });
};

// Lazy import to avoid circular dependency at module load.
let cachedDefaults: Record<DesignTaskType, DesignTaskSchema> | null = null;
const loadDefaults = async (): Promise<Record<DesignTaskType, DesignTaskSchema>> => {
  if (!cachedDefaults) {
    const mod = await import("./template-defaults");
    cachedDefaults = mod.DEFAULT_DESIGN_TASK_SCHEMAS;
  }
  return cachedDefaults;
};

export async function getSchema(
  taskType: DesignTaskType | string | null | undefined,
): Promise<DesignTaskSchema> {
  const normalized = normalizeTaskType(taskType);
  if (!normalized) return buildGenericFallbackSchema("generic_task");

  const defaults = await loadDefaults();
  const defaultSchema = defaults[normalized];
  const schema = defaultSchema
    ? normalizeSchema(defaultSchema)
    : buildGenericFallbackSchema(normalized);

  return {
    ...schema,
    templateKey: schema.templateKey || schema.taskType,
  };
}

export async function getSchemaByTemplateKey(
  templateKey: string,
): Promise<DesignTaskSchema | null> {
  const normalized = templateKey?.trim();
  if (!normalized) return null;

  const defaults = await loadDefaults();
  const matched = Object.values(defaults).find(
    (schema) => (schema.templateKey || schema.taskType) === normalized,
  );

  return matched
    ? normalizeSchema({
        ...matched,
        templateKey: matched.templateKey || matched.taskType,
      })
    : null;
}

export async function listSchemas(): Promise<DesignTaskSchema[]> {
  const defaults = await loadDefaults();
  return Object.values(defaults).map((schema) => normalizeSchema(schema));
}

export async function listServiceStarters(): Promise<
  Array<{
    taskType: DesignTaskType;
    templateKey: string;
    label: string;
    description: string;
    domain: "image" | "text" | "web";
    starters: string[];
  }>
> {
  const schemas = await listSchemas();
  return schemas.map((schema) => ({
    taskType: schema.taskType,
    templateKey: schema.templateKey || schema.taskType,
    label: schema.displayName,
    description: schema.description,
    domain: resolveTaskDomain(schema.taskType),
    starters: schema.starters,
  }));
}
