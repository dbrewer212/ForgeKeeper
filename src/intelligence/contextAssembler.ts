import type { FoundryWorldModelSnapshot, WorldEntity } from "./worldModel";

export interface FoundryContextRequest {
  text: string;
  focusEntityIds?: string[];
  maxEntities?: number;
}

export interface FoundryContextPacket {
  schemaVersion: 1;
  assembledAt: string;
  request: string;
  worldModelBuiltAt: string;
  safeMode: boolean;
  health: FoundryWorldModelSnapshot["health"];
  activeContext: FoundryWorldModelSnapshot["activeContext"];
  entities: WorldEntity[];
  omittedEntityCount: number;
  guardrails: {
    executionAuthority: "mesh-tool-gateway";
    directOsControl: false;
    worldModelAuthority: "derived-read-model";
  };
}

export class FoundryContextAssembler {
  constructor(private readonly getWorldSnapshot: () => FoundryWorldModelSnapshot) {}

  assemble(request: FoundryContextRequest): FoundryContextPacket {
    const snapshot = this.getWorldSnapshot();
    const maxEntities = Math.max(5, Math.min(100, request.maxEntities ?? 30));
    const tokens = tokenize(request.text);
    const selected = new Map<string, { entity: WorldEntity; score: number }>();

    const add = (entity: WorldEntity | undefined, score: number) => {
      if (!entity) return;
      const current = selected.get(entity.id);
      if (!current || score > current.score) selected.set(entity.id, { entity, score });
    };
    const byId = new Map(snapshot.entities.map((entity) => [entity.id, entity]));

    add(byId.get("workstation:primary"), 1000);

    if (snapshot.activeContext.projectId) add(byId.get(`project:${snapshot.activeContext.projectId}`), 950);
    if (snapshot.activeContext.productionItemId) add(byId.get(`production-item:${snapshot.activeContext.productionItemId}`), 950);
    if (snapshot.activeContext.sessionId) add(byId.get(`session:${snapshot.activeContext.sessionId}`), 950);

    for (const id of request.focusEntityIds ?? []) add(byId.get(id), 1000);

    for (const entity of snapshot.entities) {
      if (entity.kind === "watcher-finding") add(entity, 900);
      if (entity.status === "critical" || entity.status === "failed" || entity.status === "degraded") add(entity, 850);

      const searchable = `${entity.id} ${entity.label} ${entity.status ?? ""}`.toLowerCase();
      const matches = tokens.filter((token) => searchable.includes(token)).length;
      if (matches > 0) add(entity, 500 + matches * 25);
    }

    const firstPass = [...selected.values()].sort((a, b) => b.score - a.score || a.entity.id.localeCompare(b.entity.id));
    for (const { entity, score } of firstPass) {
      for (const relation of entity.relations) add(byId.get(relation.targetId), Math.max(100, score - 100));
    }

    const ranked = [...selected.values()]
      .sort((a, b) => b.score - a.score || a.entity.id.localeCompare(b.entity.id))
      .map(({ entity }) => structuredClone(entity));
    const entities = ranked.slice(0, maxEntities);

    return {
      schemaVersion: 1,
      assembledAt: new Date().toISOString(),
      request: request.text,
      worldModelBuiltAt: snapshot.builtAt,
      safeMode: snapshot.safeMode,
      health: structuredClone(snapshot.health),
      activeContext: structuredClone(snapshot.activeContext),
      entities,
      omittedEntityCount: Math.max(0, snapshot.entities.length - entities.length),
      guardrails: {
        executionAuthority: "mesh-tool-gateway",
        directOsControl: false,
        worldModelAuthority: "derived-read-model",
      },
    };
  }
}

function tokenize(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  )];
}
