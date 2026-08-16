import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { AssemblyComponent, AssemblyInterface, WorkbenchOperation } from "../../workbench/contracts";
import { getWorkbenchService } from "../../workbench/service";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

function uid(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

export function VariantAssemblyStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const service = getWorkbenchService();
  const assets = runtime.assets.filter((asset) => asset.currentRevisionId);
  const [mode, setMode] = useState<"variant" | "assembly">("variant");
  const [parentAssetId, setParentAssetId] = useState("");
  const parent = assets.find((asset) => asset.assetId === parentAssetId) ?? assets[0];
  const [variantName, setVariantName] = useState("");
  const [variantFamily, setVariantFamily] = useState("");
  const [variantNotes, setVariantNotes] = useState("");
  const [variantOperations, setVariantOperations] = useState<WorkbenchOperation[]>([]);

  const [assemblyName, setAssemblyName] = useState("");
  const [assemblyNotes, setAssemblyNotes] = useState("");
  const [components, setComponents] = useState<AssemblyComponent[]>([]);
  const [interfaces, setInterfaces] = useState<AssemblyInterface[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const existingVariants = useMemo(
    () => runtime.workbench.variants.filter((item) => !parent || item.parentAssetId === parent.assetId),
    [runtime.workbench.variants, parent],
  );

  function addVariantOperation(type: WorkbenchOperation["type"] = "scale") {
    const operation: WorkbenchOperation = {
      operationId: uid("operation"),
      type,
      parameters: type === "scale" ? { x: 1, y: 1, z: 1 } : type === "rotate" ? { xDeg: 0, yDeg: 0, zDeg: 0 } : {},
      inputRevisionId: parent?.currentRevisionId,
      createdAt: new Date().toISOString(),
    };
    setVariantOperations((current) => [...current, operation]);
  }

  async function createVariant() {
    if (!parent?.currentRevisionId || !variantName.trim()) {
      setError("Choose a parent asset/revision and enter a variant name.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const asset = await service.createAsset({
        name: variantName.trim(),
        assetType: parent.assetType,
        owningProjectId: parent.owningProjectId,
        collectionId: parent.collectionId,
        lifecycleStatus: "in-development",
        canonicalAssetId: parent.canonicalAssetId ?? parent.assetId,
        canonicalRevisionId: parent.canonicalRevisionId ?? parent.currentRevisionId,
        provenance: { sourceType: "manual", sourceLabel: `Variant of ${parent.name}`, importedAt: new Date().toISOString() },
        tags: [...new Set([...parent.tags, "variant"])],
        notes: variantNotes.trim() || undefined,
      });
      const revision = await service.createRevision({
        assetId: asset.assetId,
        parentRevisionId: parent.currentRevisionId,
        revisionLabel: "variant-root",
        authorActorId: "forgekeeper:workbench",
        process: "variant-derivation",
        reason: `Derived variant of ${parent.name}.`,
        sourceFileIds: [],
        outputFileIds: [],
        inspectionResultIds: [],
        manufacturingApproval: "not-reviewed",
      });
      const variant = await service.createVariant({
        assetId: asset.assetId,
        parentAssetId: parent.assetId,
        parentRevisionId: parent.currentRevisionId,
        name: variantName.trim(),
        family: variantFamily.trim() || undefined,
        transformationGraph: variantOperations,
        currentRevisionId: revision.revisionId,
        reviewRequired: true,
      });
      await service.linkRelationship({
        type: "variant-of",
        fromAssetId: asset.assetId,
        fromRevisionId: revision.revisionId,
        toAssetId: parent.assetId,
        toRevisionId: parent.currentRevisionId,
        metadata: { variantId: variant.variantId },
        createdBy: "forgekeeper:workbench",
      });
      setMessage(`Variant ${variant.name} created as first-class Foundry asset ${asset.assetId}.`);
      setVariantName(""); setVariantFamily(""); setVariantNotes(""); setVariantOperations([]);
      await runtime.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  function addComponent() {
    const asset = assets[0];
    if (!asset?.currentRevisionId) return;
    setComponents((current) => [...current, {
      componentId: uid("component"), assetId: asset.assetId, revisionId: asset.currentRevisionId,
      quantity: 1, optional: false, interfaceIds: [],
    }]);
  }

  function addInterface() {
    if (components.length < 2) return;
    setInterfaces((current) => [...current, {
      interfaceId: uid("interface"), name: `Interface ${current.length + 1}`,
      fromComponentId: components[0].componentId, toComponentId: components[1].componentId,
      nominalClearanceMm: 0.2, toleranceMm: 0.1,
    }]);
  }

  async function createAssembly() {
    if (!assemblyName.trim() || components.length === 0) {
      setError("Enter an assembly name and add at least one component.");
      return;
    }
    const missing = components.find((component) => !runtime.workbench.assets.some((asset) => asset.assetId === component.assetId));
    if (missing) { setError(`Assembly component ${missing.componentId} references an unknown asset.`); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const asset = await service.createAsset({
        name: assemblyName.trim(), assetType: "assembly", lifecycleStatus: "in-development",
        provenance: { sourceType: "manual", sourceLabel: "Workbench assembly", importedAt: new Date().toISOString() },
        tags: ["assembly"], notes: assemblyNotes.trim() || undefined,
      });
      const revision = await service.createRevision({
        assetId: asset.assetId, revisionLabel: "assembly-root", authorActorId: "forgekeeper:workbench",
        process: "assembly-definition", reason: "Initial assembly definition.", sourceFileIds: [], outputFileIds: [],
        inspectionResultIds: [], manufacturingApproval: "not-reviewed",
      });
      const assembly = await service.createAssembly({
        assetId: asset.assetId, revisionId: revision.revisionId, components, interfaces,
        assemblyNotes: assemblyNotes.trim() || undefined,
        completenessRule: "All required components and interfaces must resolve to registered Foundry assets/revisions before manufacturing approval.",
      });
      for (const component of components) {
        await service.linkRelationship({
          type: "component-of", fromAssetId: component.assetId, fromRevisionId: component.revisionId,
          toAssetId: asset.assetId, toRevisionId: revision.revisionId,
          metadata: { assemblyId: assembly.assemblyId, componentId: component.componentId, quantity: component.quantity, optional: component.optional },
          createdBy: "forgekeeper:workbench",
        });
      }
      setMessage(`Assembly ${assemblyName.trim()} created with ${components.length} component record(s).`);
      setAssemblyName(""); setAssemblyNotes(""); setComponents([]); setInterfaces([]);
      await runtime.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
      <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench</div>
      <h1 className="mt-1 text-2xl font-semibold text-slate-100">Variants & Assemblies</h1>
      <p className="mt-1 max-w-4xl text-sm text-slate-400">Variants preserve lineage as first-class assets. Assemblies reference exact component revisions and explicit interfaces instead of flattening multiple files into one record.</p>
      <div className="mt-4 flex gap-2">
        <Button variant={mode === "variant" ? undefined : "ghost"} onClick={() => setMode("variant")}>Variants</Button>
        <Button variant={mode === "assembly" ? undefined : "ghost"} onClick={() => setMode("assembly")}>Assemblies</Button>
      </div>
    </div>

    {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">{error}</div> : null}
    {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">{message}</div> : null}

    {mode === "variant" ? <div className="grid gap-5 xl:grid-cols-[380px,minmax(0,1fr)]">
      <Card title="Variant Identity"><div className="space-y-3">
        <label className="text-xs text-slate-500">Parent asset</label>
        <Select value={parent?.assetId ?? ""} onChange={(event) => setParentAssetId(event.target.value)}>
          {assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name}</option>)}
        </Select>
        <Input value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder="Variant name" />
        <Input value={variantFamily} onChange={(event) => setVariantFamily(event.target.value)} placeholder="Variant family (optional)" />
        <Textarea value={variantNotes} onChange={(event) => setVariantNotes(event.target.value)} placeholder="Variant notes" className="min-h-[90px]" />
        <Button disabled={busy} onClick={() => void createVariant()}>{busy ? "Creating…" : "Create Variant Asset"}</Button>
      </div></Card>
      <div className="space-y-5">
        <Card title="Transformation Lineage" right={<span className="text-xs text-slate-500">{variantOperations.length} operation(s)</span>}>
          <div className="mb-3 flex flex-wrap gap-2">
            {(["scale","rotate","translate","mirror","plane-cut","alignment-feature","clearance"] as WorkbenchOperation["type"][]).map((type) => <Button key={type} variant="ghost" onClick={() => addVariantOperation(type)}>+ {type}</Button>)}
          </div>
          <div className="space-y-2">{variantOperations.map((operation, index) => <div key={operation.operationId} className="rounded-xl border border-white/10 bg-[#0b1119] p-3">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-200">{index + 1}. {operation.type}</span><Button variant="danger" onClick={() => setVariantOperations((current) => current.filter((_, i) => i !== index))}>Remove</Button></div>
            <div className="mt-2 text-xs text-slate-500">{JSON.stringify(operation.parameters)}</div>
          </div>)}</div>
        </Card>
        <Card title="Existing Variant Lineage"><div className="space-y-2">{existingVariants.map((variant) => <div key={variant.variantId} className="rounded-xl border border-white/10 p-3 text-sm"><div className="font-semibold text-slate-100">{variant.name}</div><div className="mt-1 text-slate-500">{variant.family || "No family"} · {variant.transformationGraph.length} operations · review {variant.reviewRequired ? "required" : "clear"}</div></div>)}{existingVariants.length === 0 ? <div className="text-sm text-slate-500">No variants recorded for this parent.</div> : null}</div></Card>
      </div>
    </div> : null}

    {mode === "assembly" ? <div className="grid gap-5 xl:grid-cols-[380px,minmax(0,1fr)]">
      <Card title="Assembly Identity"><div className="space-y-3">
        <Input value={assemblyName} onChange={(event) => setAssemblyName(event.target.value)} placeholder="Assembly name" />
        <Textarea value={assemblyNotes} onChange={(event) => setAssemblyNotes(event.target.value)} placeholder="Assembly notes" className="min-h-[90px]" />
        <Button variant="ghost" onClick={addComponent}>Add Component</Button>
        <Button variant="ghost" disabled={components.length < 2} onClick={addInterface}>Add Interface</Button>
        <Button disabled={busy} onClick={() => void createAssembly()}>{busy ? "Creating…" : "Create Assembly Asset"}</Button>
      </div></Card>
      <div className="space-y-5">
        <Card title="Components" right={<span className="text-xs text-slate-500">{components.length}</span>}><div className="space-y-3">{components.map((component, index) => <div key={component.componentId} className="rounded-xl border border-white/10 bg-[#0b1119] p-3"><div className="grid gap-2 md:grid-cols-[minmax(0,1fr),110px,auto]">
          <Select value={component.assetId} onChange={(event) => { const asset = assets.find((item) => item.assetId === event.target.value); setComponents((current) => current.map((item, i) => i === index ? { ...item, assetId: event.target.value, revisionId: asset?.currentRevisionId } : item)); }}>{assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name}</option>)}</Select>
          <Input type="number" min="1" value={component.quantity} onChange={(event) => setComponents((current) => current.map((item, i) => i === index ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) } : item))} />
          <Button variant="danger" onClick={() => setComponents((current) => current.filter((_, i) => i !== index))}>Remove</Button>
        </div><div className="mt-2 text-[11px] text-slate-500">Revision {component.revisionId || "unresolved"}</div></div>)}{components.length === 0 ? <div className="text-sm text-slate-500">No components added.</div> : null}</div></Card>
        <Card title="Interfaces" right={<span className="text-xs text-slate-500">{interfaces.length}</span>}><div className="space-y-3">{interfaces.map((item, index) => <div key={item.interfaceId} className="rounded-xl border border-white/10 p-3"><Input value={item.name} onChange={(event) => setInterfaces((current) => current.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /><div className="mt-2 text-xs text-slate-500">{item.fromComponentId} → {item.toComponentId} · clearance {item.nominalClearanceMm ?? 0} mm · tolerance {item.toleranceMm ?? 0} mm</div></div>)}{interfaces.length === 0 ? <div className="text-sm text-slate-500">No interfaces defined.</div> : null}</div></Card>
      </div>
    </div> : null}
  </div>;
}
