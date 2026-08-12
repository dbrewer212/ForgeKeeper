import type { WorkerId } from "./types";

export type AuthorityActorType = "human" | "deterministic-policy" | "worker" | "system";

export type AuthorityActor = {
  type: AuthorityActorType;
  id: string;
  label?: string;
};

export type DomainMutationContext = {
  requestedBy: AuthorityActor;
  authorizedBy?: AuthorityActor;
  correlationId?: string;
  reason?: string;
};

export type FoundrySessionState = "active" | "paused" | "blocked" | "completed" | "abandoned";

export type ParkedThoughtCategory =
  | "interesting-later"
  | "useful-dependency"
  | "blocker"
  | "architecture-changing"
  | "shiny";

export type ParkedThought = {
  id: string;
  capturedAt: string;
  text: string;
  category: ParkedThoughtCategory;
  source?: string;
  relatedProjectId?: string;
  relatedProductionItemId?: string;
  resolvedAt?: string;
};

export type FoundrySession = {
  id: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  state: FoundrySessionState;
  activeProjectId?: string;
  activeProductionItemId?: string;
  currentObjective?: string;
  currentStage?: string;
  currentAction?: string;
  blockedBy?: string;
  parkedThoughtIds: string[];
  lastCheckpointId?: string;
  participatingWorkerIds: WorkerId[];
  resourceContext?: Record<string, unknown>;
};

export type ActiveWorkSnapshot = {
  session?: FoundrySession;
  projectId?: string;
  productionItemId?: string;
  objective?: string;
  stage?: string;
  currentAction?: string;
  blocker?: string;
  lastCheckpointId?: string;
  parkedThoughtCount: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  status?: string;
  updatedAt?: string;
};

export type ProductionItemSummary = {
  id: string;
  projectId?: string;
  name: string;
  stage?: string;
  status?: string;
  nextAction?: string;
  blocker?: string;
};

export type AssetSummary = {
  id: string;
  name: string;
  kind?: string;
  status?: string;
  path?: string;
};

export type InventorySummary = {
  id: string;
  name: string;
  kind?: string;
  quantity?: number;
  unit?: string;
  status?: string;
};

export type CanonSummary = {
  id: string;
  name: string;
  status?: string;
  authority?: string;
};

export type DecisionRecord = {
  id: string;
  createdAt: string;
  subject: string;
  decision: string;
  rationale?: string;
  projectId?: string;
  productionItemId?: string;
  madeBy: AuthorityActor;
};

export interface ProjectService {
  get(id: string): Promise<ProjectSummary | undefined>;
  list(): Promise<ProjectSummary[]>;
  getActive(): Promise<ProjectSummary | undefined>;
}

export interface ProductionService {
  get(id: string): Promise<ProductionItemSummary | undefined>;
  list(projectId?: string): Promise<ProductionItemSummary[]>;
  getActiveWork(): Promise<ActiveWorkSnapshot>;
  setNextAction(id: string, nextAction: string, context: DomainMutationContext): Promise<void>;
  setBlocker(id: string, blocker: string | undefined, context: DomainMutationContext): Promise<void>;
}

export interface AssetService {
  get(id: string): Promise<AssetSummary | undefined>;
  search(query: string): Promise<AssetSummary[]>;
}

export interface InventoryService {
  get(id: string): Promise<InventorySummary | undefined>;
  search(query: string): Promise<InventorySummary[]>;
}

export interface CanonService {
  get(id: string): Promise<CanonSummary | undefined>;
  search(query: string): Promise<CanonSummary[]>;
}

export interface DecisionService {
  get(id: string): Promise<DecisionRecord | undefined>;
  list(projectId?: string): Promise<DecisionRecord[]>;
  record(decision: DecisionRecord, context: DomainMutationContext): Promise<void>;
}

export interface SessionService {
  get(id: string): Promise<FoundrySession | undefined>;
  getActive(): Promise<FoundrySession | undefined>;
  start(session: FoundrySession, context: DomainMutationContext): Promise<void>;
  update(id: string, patch: Partial<FoundrySession>, context: DomainMutationContext): Promise<FoundrySession>;
  end(id: string, state: Extract<FoundrySessionState, "completed" | "abandoned">, context: DomainMutationContext): Promise<void>;
  captureThought(thought: ParkedThought, context: DomainMutationContext): Promise<void>;
  getParkedThoughts(sessionId: string): Promise<ParkedThought[]>;
}

export type FoundryDomainServices = {
  projects: ProjectService;
  production: ProductionService;
  assets: AssetService;
  inventory: InventoryService;
  canon: CanonService;
  decisions: DecisionService;
  sessions: SessionService;
};

export const HumanAuthority: AuthorityActor = {
  type: "human",
  id: "foundry-owner",
  label: "Foundry Owner",
};
