import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { WorkbenchOperation } from "../../workbench/contracts";
import { getWorkbenchBuildBenchService, newWorkbenchOperation } from "../../workbench/buildBench";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

const operationTypes: WorkbenchOperation["type"][] = [
  "scale", "rotate", "translate", "mirror", "split", "combine", "plane-cut", "boolean", "alignment-feature", "clearance", "unit-correction", "other",
];

export function BuildBenchStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const assets = runtime.assets.filter((item) => item.currentRevisionId);
  const [assetId, setAssetId] = useState("");
  const selectedAsset = assets.find((item) => item.assetId === assetId) ?? assets[0];
  const revisionId = selectedAsset?.currentRevisionId ?? "";
  const specs = runtime.workbench.manufacturingSpecs.filter((item) => item.assetId === selectedAsset?.assetId && item.revisionId === revisionId);
  const [specId, setSpecId] = useState("");
  const selectedSpecId = specs.some((item) => item.manufacturingSpecId === specId) ? specId : (specs[0]?.manufacturingSpecId ?? "");
  const [printerId, setPrinterId] = useState("");
  const [materialProfileId, setMaterialProfileId] = useState("");
  const [physicalSpoolIds, setPhysicalSpoolIds] = useState<string[]>([]);
  const [slicerId, setSlicerId] = useState("");
  const [slicerProfileRef, setSlicerProfileRef] = useState("");
  const [supportIntent, setSupportIntent] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [operations, setOperations] = useState<WorkbenchOperation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  const inspection = useMemo(() => runtime.workbench.inspections
    .filter((item) => item.assetId === selectedAsset?.assetId && item.revisionId === revisionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
  [runtime.workbench.inspections, revisionId, selectedAsset?.assetId]);

  const eligibleSpools = useMemo(() => state.filament.filter((spool) =>
    spool.profileId === materialProfileId && spool.status !== "Archived" && spool.status !== "Empty" && spool.condition !== "Empty"
  ), [materialProfileId, state.filament]);

  function addOperation(type: WorkbenchOperation["type"] = "scale") {
    const operation = newWorkbenchOperation(type, revisionId);
    if (type === "scale") operation.parameters = { x: 1, y: 1, z: 1 };
    if (type === "rotate") operation.parameters = { xDeg: 0, yDeg: 0, zDeg: 0 };
    if (type === "translate") operation.parameters = { xMm: 0, yMm: 0, zMm: 0 };
    if (type === "mirror") operation.parameters = { axis: "x" };
    if (type === "plane-cut") operation.parameters = { axis: "z", offsetMm: 0, keep: "positive" };
    if (type === "alignment-feature") operation.parameters = { feature: "pin", diameterMm: 3, depthMm: 4 };
    if (type === "clearance") operation.parameters = { clearanceMm: 0.2 };
    setOperations((current) => [...current, operation]);
  }

  function updateOperation(index: number, patch: Partial<WorkbenchOperation>) {
    setOperations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function move(index: number, direction: -1 | 1) {
    setOperations((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleSpool(spoolId: string) {
    setPhysicalSpoolIds((current) => current.includes(spoolId)
      ? current.filter((id) => id !== spoolId)
      : [...current, spoolId]);
  }

  async function save(requestValidation: boolean) {
    if (!selectedAsset || !revisionId || !selectedSpecId) {
      setProblems(["Select an asset revision with a ManufacturingSpec before saving a preparation."]);
      return;
    }
    setBusy(true);
    setProblems([]);
    setMessage("");
    try {
      const result = await getWorkbenchBuildBenchService().save({
        assetId: selectedAsset.assetId,
        revisionId,
        manufacturingSpecId: selectedSpecId,
        printerId: printerId || undefined,
        materialProfileId: materialProfileId || undefined,
        physicalSpoolIds: physicalSpoolIds.length ? physicalSpoolIds : undefined,
        slicerId: slicerId.trim() || undefined,
        slicerProfileRef: slicerProfileRef.trim() || undefined,
        supportIntent: supportIntent.trim() || undefined,
        assumptions: assumptions.split("\n").map((item) => item.trim()).filter(Boolean),
        operationGraph: operations,
      }, state, requestValidation);
      setProblems([...result.validation.errors, ...result.validation.warnings]);
      setMessage(`Preparation ${result.preparation.preparationId} saved as ${result.preparation.status}.`);
      await runtime.refresh();
    } catch (cause) {
      setProblems([cause instanceof Error ? cause.message : String(cause)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Build Bench</h1>
        <p className="mt-1 max-w-4xl text-sm text-slate-400">Manufacturing preparation is non-destructive. Operations are recorded as a reproducible graph against an exact asset revision; source geometry is never silently overwritten.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px,minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Preparation Target">
            <div className="space-y-3">
              <label className="block text-xs text-slate-500">Asset</label>
              <Select value={selectedAsset?.assetId ?? ""} onChange={(event) => { setAssetId(event.target.value); setSpecId(""); setOperations([]); }}>
                {assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name}</option>)}
              </Select>
              <Readout label="Revision" value={revisionId || "No current revision"} />
              <label className="block text-xs text-slate-500">Manufacturing spec</label>
              <Select value={selectedSpecId} onChange={(event) => setSpecId(event.target.value)}>
                {specs.map((spec) => <option key={spec.manufacturingSpecId} value={spec.manufacturingSpecId}>{spec.intendedProcess} · {spec.approvalState}</option>)}
              </Select>
              <label className="block text-xs text-slate-500">Printer</label>
              <Select value={printerId} onChange={(event) => setPrinterId(event.target.value)}>
                <option value="">Unassigned</option>
                {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.buildVolume || "volume unset"}</option>)}
              </Select>
              <label className="block text-xs text-slate-500">Material profile</label>
              <Select value={materialProfileId} onChange={(event) => { setMaterialProfileId(event.target.value); setPhysicalSpoolIds([]); }}>
                <option value="">Unassigned</option>
                {state.filamentProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.brand} {profile.material} · {profile.colorName}</option>)}
              </Select>
            </div>
          </Card>

          <Card title="Physical Spool Assignment" right={<span className="text-xs text-slate-500">{physicalSpoolIds.length} selected</span>}>
            {!materialProfileId ? <div className="text-sm text-slate-500">Choose a material profile first.</div> : null}
            {materialProfileId && eligibleSpools.length === 0 ? <div className="text-sm text-amber-300">No usable physical spools currently match this profile.</div> : null}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {eligibleSpools.map((spool) => {
                const selected = physicalSpoolIds.includes(spool.id);
                return (
                  <button key={spool.id} type="button" onClick={() => toggleSpool(spool.id)} className={`w-full rounded-xl border p-3 text-left ${selected ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-[#0b1119] hover:bg-white/5"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-200">{spool.foundrySpoolCode}</div>
                        <div className="mt-1 text-xs text-slate-500">{spool.colorName} · {spool.condition} · {spool.quantityConfidence}</div>
                      </div>
                      <div className="text-right text-sm text-slate-300">{spool.quantityConfidence === "Unknown" ? "Unknown" : `${spool.gramsAvailable.toFixed(0)}g`}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Inspector Gate">
            {inspection ? (
              <div className="space-y-2 text-sm">
                <Readout label="Engine" value={`${inspection.engineId} ${inspection.engineVersion}`} />
                <Readout label="Bounds" value={inspection.geometry.boundsMm ? `${inspection.geometry.boundsMm.x.toFixed(2)} × ${inspection.geometry.boundsMm.y.toFixed(2)} × ${inspection.geometry.boundsMm.z.toFixed(2)} mm` : "Unknown"} />
                <Readout label="Blocking findings" value={String(inspection.findings.filter((item) => item.severity === "critical" || item.severity === "error").length)} />
                <Readout label="Manifold" value={inspection.geometry.manifold === undefined ? "Unknown" : inspection.geometry.manifold ? "Yes" : "No"} />
              </div>
            ) : <div className="text-sm text-amber-300">No Inspector evidence for this exact revision. Drafts are allowed; validation is not.</div>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Operation Graph" right={<span className="text-xs text-slate-500">{operations.length} operation{operations.length === 1 ? "" : "s"}</span>}>
            <div className="mb-4 flex flex-wrap gap-2">
              {operationTypes.map((type) => <Button key={type} variant="ghost" onClick={() => addOperation(type)}>+ {type}</Button>)}
            </div>
            <div className="space-y-3">
              {operations.map((operation, index) => (
                <div key={operation.operationId} className="rounded-2xl border border-white/10 bg-[#0b1119] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">{index + 1}</span>
                      <Select value={operation.type} onChange={(event) => updateOperation(index, { type: event.target.value as WorkbenchOperation["type"] })}>
                        {operationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => move(index, -1)}>↑</Button>
                      <Button variant="ghost" onClick={() => move(index, 1)}>↓</Button>
                      <Button variant="danger" onClick={() => setOperations((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                    </div>
                  </div>
                  <div className="mt-3"><ParameterEditor operation={operation} onChange={(parameters) => updateOperation(index, { parameters })} /></div>
                  <div className="mt-2 break-all text-[10px] text-slate-600">{operation.operationId}</div>
                </div>
              ))}
              {operations.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No transformations. A preparation may intentionally preserve the registered geometry unchanged.</div> : null}
            </div>
          </Card>

          <Card title="Slicer & Assumptions">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={slicerId} onChange={(event) => setSlicerId(event.target.value)} placeholder="Slicer ID, e.g. OrcaSlicer" />
              <Input value={slicerProfileRef} onChange={(event) => setSlicerProfileRef(event.target.value)} placeholder="Slicer profile reference" />
            </div>
            <Textarea value={supportIntent} onChange={(event) => setSupportIntent(event.target.value)} className="mt-3 min-h-[72px]" placeholder="Support intent / removal requirements" />
            <Textarea value={assumptions} onChange={(event) => setAssumptions(event.target.value)} className="mt-3 min-h-[100px]" placeholder="One preparation assumption per line" />
          </Card>

          {problems.length ? <Card title="Validation"><div className="space-y-2">{problems.map((problem, index) => <div key={`${problem}-${index}`} className="text-sm text-amber-200">{problem}</div>)}</div></Card> : null}
          {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">{message}</div> : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" disabled={busy} onClick={() => void save(false)}>{busy ? "Saving…" : "Save Draft"}</Button>
            <Button disabled={busy || !inspection} onClick={() => void save(true)}>{busy ? "Validating…" : "Validate Preparation"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParameterEditor({ operation, onChange }: { operation: WorkbenchOperation; onChange: (parameters: WorkbenchOperation["parameters"]) => void }) {
  const entries = Object.entries(operation.parameters);
  if (!entries.length) {
    return <Button variant="ghost" onClick={() => onChange({ value: 0 })}>Add parameter</Button>;
  }
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {entries.map(([key, value]) => (
        <label key={key} className="text-xs text-slate-500">
          {key}
          <Input className="mt-1" value={String(value ?? "")} onChange={(event) => {
            const raw = event.target.value;
            const nextValue = typeof value === "number" ? (raw === "" ? 0 : Number(raw)) : typeof value === "boolean" ? raw === "true" : raw;
            onChange({ ...operation.parameters, [key]: nextValue });
          }} />
        </label>
      ))}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-white/5 py-2 last:border-0"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-1 break-words text-sm text-slate-300">{value}</div></div>;
}
