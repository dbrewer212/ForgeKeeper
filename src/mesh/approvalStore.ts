import type { ActionRequest, ApprovalRequest } from "./types";

export type ApprovalState = "pending" | "approved" | "denied" | "expired";

export interface ApprovalRecord<TPayload = unknown> {
  request: ApprovalRequest<TPayload>;
  actionRequest?: ActionRequest<TPayload>;
  state: ApprovalState;
  decidedAt?: string;
  decidedBy?: "human";
  decisionReason?: string;
}

export interface ApprovalStore {
  enqueue<TPayload>(request: ApprovalRequest<TPayload>, actionRequest?: ActionRequest<TPayload>): ApprovalRecord<TPayload>;
  approve(approvalId: string, reason?: string): ApprovalRecord;
  deny(approvalId: string, reason?: string): ApprovalRecord;
  get(approvalId: string): ApprovalRecord | undefined;
  list(state?: ApprovalState): ApprovalRecord[];
  restore(records: ApprovalRecord[]): void;
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly records = new Map<string, ApprovalRecord>();

  enqueue<TPayload>(request: ApprovalRequest<TPayload>, actionRequest?: ActionRequest<TPayload>): ApprovalRecord<TPayload> {
    const record: ApprovalRecord<TPayload> = { request, actionRequest, state: "pending" };
    this.records.set(request.id, record as ApprovalRecord);
    return record;
  }

  approve(approvalId: string, reason?: string): ApprovalRecord {
    return this.decide(approvalId, "approved", reason);
  }

  deny(approvalId: string, reason?: string): ApprovalRecord {
    return this.decide(approvalId, "denied", reason);
  }

  get(approvalId: string): ApprovalRecord | undefined {
    this.expireOverdue();
    return this.records.get(approvalId);
  }

  list(state?: ApprovalState): ApprovalRecord[] {
    this.expireOverdue();
    const records = [...this.records.values()];
    return state ? records.filter((record) => record.state === state) : records;
  }

  restore(records: ApprovalRecord[]): void {
    this.records.clear();
    for (const record of records) this.records.set(record.request.id, record);
    this.expireOverdue();
  }

  private decide(approvalId: string, state: Extract<ApprovalState, "approved" | "denied">, reason?: string): ApprovalRecord {
    this.expireOverdue();
    const current = this.records.get(approvalId);
    if (!current) throw new Error(`Approval ${approvalId} does not exist.`);
    if (current.state !== "pending") throw new Error(`Approval ${approvalId} is already ${current.state}.`);

    const decided: ApprovalRecord = {
      ...current,
      state,
      decidedAt: new Date().toISOString(),
      decidedBy: "human",
      decisionReason: reason,
    };
    this.records.set(approvalId, decided);
    return decided;
  }

  private expireOverdue(): void {
    const now = Date.now();
    for (const [id, record] of this.records) {
      if (record.state !== "pending" || !record.request.expiresAt) continue;
      if (Date.parse(record.request.expiresAt) > now) continue;
      this.records.set(id, { ...record, state: "expired" });
    }
  }
}
