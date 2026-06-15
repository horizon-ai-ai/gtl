export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageType = "ai" | "generation_result" | "system";

export interface MessageAttachment {
  url: string;
  type: "image" | "video" | "file";
  originalName?: string | null;
  mimeType?: string | null;
  assetKind?: string | null;
  field?: string | null;
}

export interface QuickAction {
  type?: string;
  action?: string;
  label: string;
  value?: string;
  taskId?: string;
  siteId?: string;
  thumbnailUrl?: string;
  sourceMessageId?: string;
  assetKind?: string;
  field?: string;
  productData?: Record<string, unknown>;
}

export interface MarketingIntelligenceSource {
  title?: string;
  url: string;
  publisher?: string | null;
  publishedAt?: string | null;
  snippet?: string | null;
}

export interface VisualReferenceCard {
  title: string;
  url: string;
  source: string;
  thumbnailUrl?: string | null;
  reason?: string | null;
  styleTags?: string[];
  usage?: string;
}

export interface MarketingIntelligence {
  query?: string;
  summary?: string;
  sources?: MarketingIntelligenceSource[];
  visualReferences?: VisualReferenceCard[];
  referenceCards?: VisualReferenceCard[];
  groundedMode?: boolean;
  searchModel?: string;
  createdAt?: string;
}

export interface ConversationStepDecision {
  version: 1;
  phase: string;
  action: string;
  domain: string;
  mode: string;
  taskType: string | null;
  targetTaskId: string | null;
  stageLabel: string;
  stageDescription: string;
  needsUserInput: boolean;
  canGenerate: boolean;
  shouldShowProgress: boolean;
  nextActions: Array<{ label: string; value?: string; action?: string }>;
  recommendedDisplay: string;
  updatedAt: string;
  [key: string]: unknown;
}


export interface DesignTaskStarter {
  taskType: string;
  templateKey: string;
  label: string;
  description: string;
  domain?: "image" | "text" | "web";
  starters?: string[];
}

export interface DesignTask {
  id: string;
  taskType: string;
  templateKey?: string | null;
  templateLabel?: string | null;
  executionStrategy?: string | null;
  preferredModel?: string | null;
  title: string;
  status: string;
  summary?: string | null;
  collectedData?: unknown;
  resolvedRequirements?: unknown;
  missingRequirements?: unknown;
  currentClarificationGoal?: unknown;
  clarificationCount?: number;
  lastActivityAt?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  ai_model?: string | null;
  aiModel?: string | null;
  active_design_task_id?: string | null;
  activeDesignTaskId?: string | null;
  active_leaf_message_id?: string | null;
  activeLeafMessageId?: string | null;
  last_message_at?: string | null;
  lastMessageAt?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface ConversationMessage {
  id: string;
  conversation?: string;
  conversationId?: string | null;
  role: MessageRole;
  messageType: MessageType;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  attachments?: MessageAttachment[];
  marketingIntelligence?: MarketingIntelligence | null;
  stepDecision?: ConversationStepDecision | null;
  quickActions?: QuickAction[];
  designTaskId?: string | null;
  parentMessageId?: string | null;
  siblingCount?: number;
  siblingIndex?: number;
  siblingIds?: string[];
  createdAt?: string;
}

export interface ChatMessage extends ConversationMessage {
  isStreaming?: boolean;
}

export interface SendMessageResponse {
  userMessage?: ConversationMessage;
  assistantMessage?: ConversationMessage;
  streaming?: boolean;
}
