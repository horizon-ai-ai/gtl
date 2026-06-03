import type { DesignTaskType } from "@prisma/client";

// TODO: port AttachmentInsightSummary when attachment-insights module is ported
export type AttachmentInsightSummary = {
  url: string;
  kind: "image" | "document";
  summary: string;
  status: "ready" | "pending" | "failed";
};

// ─── Assembled Context (what Pass 1 sees) ────────────────────────────

export type AssembledContext = {
  working: {
    recentTurns: HistoryMessage[];
    activeTaskCore: TaskCore | null;
    lastUserAct: UserAct;
    generationOutputs?: GenerationOutputContext | null;
  };
  project: {
    relevantMemories: MemoryEntry[];
    brandVoice: string | null;
    sharedBrandContext: Record<string, unknown>;
  };
  hints: ObserverHint[];
  raw: {
    conversationId: string;
    userId: string;
    participants: string[];
    selectedModel: string | null;
    activeTaskFull: TaskSnapshot | null;
    allTasks: TaskSnapshot[];
    projectMemory: Record<string, unknown>;
    latestInteraction: LatestInteraction;
    latestAttachments: AttachmentRef[];
    recentAttachments: AttachmentRef[];
    attachmentInsights: AttachmentInsightSummary[];
    marketingIntelligence?: MarketingIntelligencePack | null;
    pendingGeneration: {
      hasPending: boolean;
      count: number;
      latestStatus: "queued" | "processing" | null;
      latestMessageId: string | null;
    };
  };
};

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TaskCore = {
  id: string;
  type: DesignTaskType;
  title: string;
  goal: string;
  stage: "exploring" | "collecting" | "refining" | "ready";
};

export type TaskSnapshot = {
  id: string;
  title: string;
  taskType: DesignTaskType;
  status?: string;
  collectedData: Record<string, unknown>;
};

export type MemoryEntry = {
  type: "preference" | "decision" | "fact";
  content: string;
  workstream?: string;
};

export type ObserverHint = {
  text: string;
  priority: "soft" | "hard";
};

export type UserAct =
  | "exploring"
  | "deciding"
  | "requesting"
  | "correcting"
  | "acknowledging"
  | "meta";

export type LatestInteraction = {
  messageType?: string;
  quickReplyAction?: string | null;
  quickReplyLabel?: string | null;
};

export type AttachmentRef = {
  kind: "image" | "pdf" | "file" | "unknown";
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sourceMessageId?: string | null;
};

export type MarketingIntelligenceSource = {
  title: string;
  url: string;
  publisher?: string | null;
  publishedAt?: string | null;
  snippet?: string | null;
};

export type MarketingVisualReference = {
  title: string;
  url: string;
  source: string;
  thumbnailUrl?: string | null;
  reason?: string | null;
  styleTags: string[];
  usage: "inspiration_only";
};

export type MarketingIntelligenceCategory =
  | "strategy"
  | "trend"
  | "competitive"
  | "factual"
  | "creative"
  | "meta";

export type MarketingEvidenceFragment = {
  claim: string;
  sourceIndices: number[];
};

export type MarketingIntelligenceMetrics = {
  subQueriesPlanned: number;
  subQueriesSucceeded: number;
  sourcesUniqueCount: number;
  fragmentsExtracted: number;
  fragmentsValidated: number;
  fragmentsRejected: number;
  verificationSkipped: boolean;
};

export type MarketingIntelligencePack = {
  provider: "openrouter";
  model: string;
  searchModel: string;
  searchDepth: "quick" | "standard" | "deep";
  freshness: "recent" | "realtime" | "evergreen";
  query: string;
  summary: string;
  insights: string[];
  sources: MarketingIntelligenceSource[];
  visualReferences: MarketingVisualReference[];
  assumptions: string[];
  createdAt: string;
  groundedMode?: boolean;
  classificationCategory?: MarketingIntelligenceCategory;
  wantsVisualReferences?: boolean;
  visualReferenceIntent?: string | null;
  subQueries?: string[];
  evidenceFragments?: MarketingEvidenceFragment[];
  metrics?: MarketingIntelligenceMetrics;
};

// ─── Structure Pass Output ───────────────────────────────────────────

export type StructurePassResult = {
  userAct: UserAct;
  taskSignal: {
    action: TurnAction;
    taskType: DesignTaskType | null;
    targetTaskId: string | null;
    reason: string;
  };
  extractedInfo: Record<string, unknown>;
  modificationReference: ModificationReference | null;
  memoryUpdates: MemoryEntry[];
  suggestedReplies: SuggestedReply[];
  memory: {
    currentFocus: string | null;
    confirmedDecisions: Array<{ summary: string; workstream?: string }>;
    openLoops: Array<{
      summary: string;
      status?: "pending" | "hold";
      workstream?: string;
    }>;
  };
  nextTurnHint: string | null;
  reasoning: string;
  wantsVisualReferences?: boolean;
  isComparingDirections?: boolean;
  shouldOfferMicroAdjustment?: boolean;
  userApprovedGeneration?: boolean;
};

export type SuggestedReply = {
  label: string;
  value: string;
  action?: string;
};

export type DesignConversationStep =
  | "feeling"
  | "info"
  | "spec"
  | "supplement"
  | "done"
  | "none";

export type ConversationStepPhase =
  | "consulting"
  | "collecting"
  | "confirming"
  | "generating"
  | "modifying"
  | "analyzing"
  | "delivering";

export type ConversationStepDecision = {
  version: 1;
  phase: ConversationStepPhase;
  action: TurnAction;
  domain: TurnDomain;
  mode: TurnMode;
  taskType: DesignTaskType | null;
  targetTaskId: string | null;
  userAct: UserAct | null;
  designStep: DesignConversationStep;
  stageIndex: number | null;
  stageLabel: string;
  stageDescription: string;
  needsUserInput: boolean;
  canGenerate: boolean;
  shouldShowProgress: boolean;
  isSoftFlow: boolean;
  source: "pass1" | "pass2";
  reason: string | null;
  nextTurnHint?: string | null;
  nextActions: Array<{
    label: string;
    value?: string;
    action?: string;
  }>;
  recommendedDisplay:
    | "consultant_text"
    | "consultant_card_with_actions"
    | "progress_only"
    | "generation_card";
  updatedAt: string;
};

export type TurnAction =
  | "chat"
  | "create_task"
  | "update_task"
  | "switch_task"
  | "ready_to_confirm"
  | "generate"
  | "analyze_attachment"
  | "service_inquiry"
  | "one_shot_brief";

// ─── Generation Output ──────────────────────────────────────────────

export type GenerationOutputItem = {
  messageId: string;
  generationId: string;
  kind: "image" | "text" | "document";
  label: string;
  url?: string;
  content?: string;
  index: number;
  taskId: string;
  taskType: string;
};

export type ModificationReference = {
  taskId: string | null;
  batchNumber: number | null;
  versionNumber: number | null;
  itemIndex: number | null;
  referenceMode:
    | "modify_existing_output"
    | "reuse_brief_generate_new"
    | "compose_from_outputs"
    | null;
  outputCount: number | null;
  targetKind: "image" | "text" | null;
  changeRequest: string | null;
};

export type GenerationOutputVersion = {
  messageId: string;
  generationId: string;
  taskId: string;
  taskType: string;
  taskLabel: string;
  batchNumber: number;
  versionNumber: number;
  createdAt: string;
  rootMessageId: string | null;
  generationThreadId: string | null;
  parentMessageId: string | null;
  parentBatchNumber: number | null;
  parentVersionNumber: number | null;
  imageCount: number;
  textCount: number;
  hasArtifact: boolean;
  items: GenerationOutputItem[];
};

export type GenerationOutputContext = {
  recentOutputs: GenerationOutputItem[];
  lastImageOutputs: GenerationOutputItem[];
  lastTextOutputs: GenerationOutputItem[];
  lastGenerationMessageId: string | null;
  lastGenerationTaskId: string | null;
  versions: GenerationOutputVersion[];
};

// ─── Turn Classification ─────────────────────────────────────────────

export type TurnDomain = "design" | "marketing" | "seo" | "ads" | "general";
export type TurnMode = "advice" | "organize" | "generate" | "continue";

export type TurnClassification = {
  domain: TurnDomain;
  mode: TurnMode;
  taskType?: DesignTaskType;
  designStep?: DesignConversationStep;
};

export type ModificationIntentDecision = {
  intentType: "modify_image" | "analyze_attachment" | "generate_new" | "other";
  intentClarity: "clear" | "ambiguous";
  targetEvidence: "none" | "user_upload" | "ai_generation" | "both";
  changeRequest: string | null;
  shouldDirectExecute: boolean;
  confidence: number;
  clarifyQuestion: string | null;
};
