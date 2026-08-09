import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { downloadCsv } from "../../lib/csv";
import { filamentCsvTemplate } from "../../lib/filamentInventory";
import { filamentCostPerGram } from "../../lib/cost";
import { money } from "../../lib/format";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { FilamentDryingStatus, FilamentMaterial, FilamentProfile, FilamentQuantityConfidence, FilamentSpoolCondition, FilamentSpoolStatus } from "../../types/domain";

const materialOptions: FilamentMaterial[] = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "Other"];
const confidenceOptions: FilamentQuantityConfidence[] = ["Exact", "Nominal", "Estimated", "Unknown"];
const conditionOptions: FilamentSpoolCondition[] = ["Sealed", "Used", "Empty"];
const statusOptions: FilamentSpoolStatus[] = ["In Stock", "In Use", "Empty", "Archived"];
const dryingOptions: FilamentDryingStatus[] = ["Unknown", "Dry", "Needs Drying", "Dried"];

const emptyProfile = (): Omit<FilamentProfile, "id" | "createdAt" | "updatedAt"> => ({
  brand: "", productLine: "", material: "PLA", colorName: "", colorFamily: "", diameterMm: 1.75,
  nominalWeightGrams: 1000, emptySpoolWeightGrams: undefined, reorderPointGrams: 250,
  defaultSpoolPrice: 0, notes: "",
});

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function FilamentView({ state }: { state: ForgekeeperState }) {
  const [selectedProfileId, setSelectedProfileId] = useState("new");
  const [profileDraft, setProfileDraft] = useState(emptyProfile());
  const [sealedQuantity, setSealedQuantity] = useState("0");
  const [measuredGrossWeights, setMeasuredGrossWeights] = useState("");
  const [estimatedQuantity, setEstimatedQuantity] = useState("0");
  const [estimatedPercent, setEstimatedPercent] = useState("50");
  const [unknownQuantity, setUnknownQuantity] = useState("0");
  const [emptyQuantity, setEmptyQuantity] = useState("0");
  const [storageLocation, setStorageLocation] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [intakeMessage, setIntakeMessage] = useState("");
  const csvInput = useRef<HTMLInputElement>(null);

  const selectedProfile = state.filamentProfiles.find((profile) => profile.id === selectedProfileId);
  const effectiveProfile = selectedProfile ?? profileDraft;
  const activeSpools = state.filament.filter((spool) => spool.status !== "Archived");
  const knownSpools = activeSpools.filter((spool) => spool.quantityConfidence !== "Unknown");
  const knownGrams = knownSpools.reduce((sum, spool) => sum + spool.gramsAvailable, 0);
  const unknownCount = activeSpools.length - knownSpools.length;

  const grouped = useMemo(() => state.filamentProfiles.map((profile) => ({
    profile,
    spools: state.filament.filter((spool) => spool.profileId === profile.id),
  })).filter((group) => group.spools.length || state.filamentProfiles.length < 12), [state.filamentProfiles, state.filament]);

  function resetIntake() {
    setSealedQuantity("0");
    setMeasuredGrossWeights("");
    setEstimatedQuantity("0");
    setUnknownQuantity("0");
    setEmptyQuantity("0");
    setPurchasePrice("");
  }

  function receive() {
    let profile = selectedProfile;
    if (!profile) {
      if (!profileDraft.brand.trim() || !profileDraft.colorName.trim()) {
        setIntakeMessage("Brand and color name are required for a new filament profile.");
        return;
      }
      profile = state.addFilamentProfile({ ...profileDraft, brand: profileDraft.brand.trim(), colorName: profileDraft.colorName.trim(), colorFamily: profileDraft.colorFamily.trim() || "Unknown" });
      setSelectedProfileId(profile.id);
      setProfileDraft(emptyProfile());
    }

    const price = numberOrUndefined(purchasePrice);
    const common = { spoolPrice: price, storageLocation };
    const drafts: Parameters<typeof state.receiveFilamentBatch>[1] = [];
    for (let index = 0; index < Math.max(0, Number(sealedQuantity) || 0); index += 1) drafts.push({ ...common, condition: "Sealed", quantityConfidence: "Nominal", gramsAvailable: profile.nominalWeightGrams });

    const weights = measuredGrossWeights.split(/[\s,;]+/).map(Number).filter((value) => Number.isFinite(value) && value >= 0);
    if (weights.length && profile.emptySpoolWeightGrams === undefined) {
      setIntakeMessage("Add the empty-spool tare to the profile before entering gross measured weights.");
      return;
    }
    weights.forEach((grossWeightGrams) => drafts.push({ ...common, condition: "Used", quantityConfidence: "Exact", grossWeightGrams, gramsAvailable: Math.max(0, grossWeightGrams - (profile!.emptySpoolWeightGrams ?? 0)) }));

    const percent = Math.max(0, Math.min(100, Number(estimatedPercent) || 0));
    for (let index = 0; index < Math.max(0, Number(estimatedQuantity) || 0); index += 1) drafts.push({ ...common, condition: "Used", quantityConfidence: "Estimated", estimatedPercent: percent, gramsAvailable: profile.nominalWeightGrams * percent / 100 });
    for (let index = 0; index < Math.max(0, Number(unknownQuantity) || 0); index += 1) drafts.push({ ...common, condition: "Used", quantityConfidence: "Unknown", gramsAvailable: 0 });
    for (let index = 0; index < Math.max(0, Number(emptyQuantity) || 0); index += 1) drafts.push({ ...common, condition: "Empty", quantityConfidence: "Exact", gramsAvailable: 0 });

    if (!drafts.length) {
      setIntakeMessage("Enter at least one sealed, measured, estimated, unknown, or empty spool.");
      return;
    }
    const created = state.receiveFilamentBatch(profile.id, drafts, profile);
    setIntakeMessage(`${created.length} physical spool${created.length === 1 ? "" : "s"} added. Foundry IDs were assigned automatically.`);
    resetIntake();
  }

  async function importCsv(file: File) {
    try {
      const result = state.importFilamentCensusCsv(await file.text());
      setIntakeMessage(`CSV imported: ${result.profiles} new profile${result.profiles === 1 ? "" : "s"}, ${result.spools} physical spool${result.spools === 1 ? "" : "s"}.`);
    } catch (error) {
      setIntakeMessage(`CSV import failed: ${String(error)}`);
    } finally {
      if (csvInput.current) csvInput.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Profiles" value={state.filamentProfiles.length} />
        <Stat label="Physical spools" value={activeSpools.length} />
        <Stat label="Known stock" value={`${(knownGrams / 1000).toFixed(2)} kg`} />
        <Stat label="Unknown remainder" value={unknownCount} warning={unknownCount > 0} />
      </div>

      <Card title="Filament Inventory Census" right={<span className="text-xs text-slate-500">{state.storageStatus === "SQLite" ? "SQLite workshop database" : state.storageStatus}</span>}>
        <div className="grid gap-5 xl:grid-cols-[1.05fr,1.4fr]">
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">1 · Select or define material</div>
            <Select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
              <option value="new">Create new filament profile</option>
              {state.filamentProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.brand} {profile.productLine} · {profile.material} · {profile.colorName}</option>)}
            </Select>
            {!selectedProfile && (
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={profileDraft.brand} onChange={(event) => setProfileDraft({ ...profileDraft, brand: event.target.value })} placeholder="Brand *" />
                <Input value={profileDraft.productLine} onChange={(event) => setProfileDraft({ ...profileDraft, productLine: event.target.value })} placeholder="Product line" />
                <Select value={profileDraft.material} onChange={(event) => setProfileDraft({ ...profileDraft, material: event.target.value as FilamentMaterial })}>{materialOptions.map((material) => <option key={material}>{material}</option>)}</Select>
                <Input value={profileDraft.colorName} onChange={(event) => setProfileDraft({ ...profileDraft, colorName: event.target.value })} placeholder="Color name *" />
                <Input value={profileDraft.colorFamily} onChange={(event) => setProfileDraft({ ...profileDraft, colorFamily: event.target.value })} placeholder="Color family" />
                <Input type="number" step="0.01" value={profileDraft.diameterMm} onChange={(event) => setProfileDraft({ ...profileDraft, diameterMm: Number(event.target.value) })} placeholder="Diameter mm" />
                <Input type="number" value={profileDraft.nominalWeightGrams} onChange={(event) => setProfileDraft({ ...profileDraft, nominalWeightGrams: Number(event.target.value) })} placeholder="Nominal filament grams" />
                <Input type="number" value={profileDraft.emptySpoolWeightGrams ?? ""} onChange={(event) => setProfileDraft({ ...profileDraft, emptySpoolWeightGrams: numberOrUndefined(event.target.value) })} placeholder="Empty spool tare grams" />
                <Input type="number" value={profileDraft.reorderPointGrams} onChange={(event) => setProfileDraft({ ...profileDraft, reorderPointGrams: Number(event.target.value) })} placeholder="Reorder point grams" />
                <Input type="number" step="0.01" value={profileDraft.defaultSpoolPrice || ""} onChange={(event) => setProfileDraft({ ...profileDraft, defaultSpoolPrice: Number(event.target.value) })} placeholder="Default spool price" />
              </div>
            )}
            {selectedProfile && (
              <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-2">
                <Input value={selectedProfile.brand} onChange={(event) => state.updateFilamentProfile(selectedProfile.id, { brand: event.target.value })} placeholder="Brand" />
                <Input value={selectedProfile.productLine} onChange={(event) => state.updateFilamentProfile(selectedProfile.id, { productLine: event.target.value })} placeholder="Product line" />
                <Select value={selectedProfile.material} onChange={(event) => state.updateFilamentProfile(selectedProfile.id, { material: event.target.value as FilamentMaterial })}>{materialOptions.map((material) => <option key={material}>{material}</option>)}</Select>
                <Input value={selectedProfile.colorName} onChange={(event) => state.updateFilamentProfile(selectedProfile.id, { colorName: event.target.value })} placeholder="Color name" />
                <Input type="number" value={selectedProfile.nominalWeightGrams} onChange={(event) => state.updateFilamentProfile(selectedProfile.id, { nominalWeightGrams: Number(event.target.value) })} placeholder="Nominal grams" />
                <Input type="number" value={selectedProfile.emptySpoolWeightGrams ?? ""} onChange={(event) => state.updateFilamentProfile(selectedProfile.id, { emptySpoolWeightGrams: numberOrUndefined(event.target.value) })} placeholder="Empty spool tare grams" />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">2 · Add the physical spools</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Labeled label="Sealed quantity"><Input type="number" min="0" value={sealedQuantity} onChange={(event) => setSealedQuantity(event.target.value)} /></Labeled>
              <Labeled label="Estimated quantity"><Input type="number" min="0" value={estimatedQuantity} onChange={(event) => setEstimatedQuantity(event.target.value)} /></Labeled>
              <Labeled label="Estimated remaining %"><Input type="number" min="0" max="100" value={estimatedPercent} onChange={(event) => setEstimatedPercent(event.target.value)} /></Labeled>
              <Labeled label="Unknown quantity"><Input type="number" min="0" value={unknownQuantity} onChange={(event) => setUnknownQuantity(event.target.value)} /></Labeled>
              <Labeled label="Empty quantity"><Input type="number" min="0" value={emptyQuantity} onChange={(event) => setEmptyQuantity(event.target.value)} /></Labeled>
              <Labeled label="Price per spool"><Input type="number" step="0.01" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder={String(effectiveProfile.defaultSpoolPrice || "Optional")} /></Labeled>
              <Labeled label="Storage location"><Input value={storageLocation} onChange={(event) => setStorageLocation(event.target.value)} placeholder="Shelf / bin / rack" /></Labeled>
              <div className="md:col-span-2"><Labeled label="Measured gross weights · one per spool"><Input value={measuredGrossWeights} onChange={(event) => setMeasuredGrossWeights(event.target.value)} placeholder="742, 611, 1280" /></Labeled></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={receive}>Receive Spools</Button>
              <Button variant="ghost" onClick={() => csvInput.current?.click()}>Import Census CSV</Button>
              <Button variant="ghost" onClick={() => downloadCsv("forgekeeper-filament-census-template.csv", filamentCsvTemplate())}>Download CSV Template</Button>
              <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} />
            </div>
            {intakeMessage && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">{intakeMessage}</div>}
          </section>
        </div>
      </Card>

      <Card title="Physical Spool Inventory" right={<div className="flex gap-2"><Button variant="ghost" onClick={state.exportFilamentCsv}>Export CSV</Button><Button variant="ghost" onClick={() => void state.printFilamentLabels()}>Print All QR Labels</Button></div>}>
        {state.filament.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-8 text-center text-sm text-slate-400">No physical spools recorded. The retired demonstration spools no longer count as inventory.</div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ profile, spools }) => (
              <section key={profile.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="font-semibold text-slate-100">{profile.brand} {profile.productLine} · {profile.colorName}</div><div className="mt-1 text-sm text-slate-400">{profile.material} · {profile.diameterMm}mm · {profile.nominalWeightGrams}g nominal · {spools.length} spool{spools.length === 1 ? "" : "s"}</div></div>
                  <div className="flex gap-2"><Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => void state.printFilamentLabels(spools.map((spool) => spool.id))}>Print Labels</Button>{spools.length === 0 && <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeFilamentProfile(profile.id)}>Remove Profile</Button>}</div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {spools.map((spool) => <SpoolCard key={spool.id} state={state} spool={spool} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SpoolCard({ state, spool }: { state: ForgekeeperState; spool: ForgekeeperState["filament"][number] }) {
  const costPerGram = filamentCostPerGram(spool);
  return (
    <div className="rounded-xl border border-white/10 bg-[#111722] p-3">
      <div className="flex items-center justify-between gap-3"><div className="font-mono text-sm font-semibold text-amber-300">{spool.foundrySpoolCode}</div><div className="text-xs text-slate-400">{spool.quantityConfidence === "Unknown" ? "Remainder unknown" : `${Math.round(spool.gramsAvailable)}g`} · {money(costPerGram)}/g</div></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Select value={spool.condition} onChange={(event) => state.updateFilament(spool.id, { condition: event.target.value as FilamentSpoolCondition })}>{conditionOptions.map((item) => <option key={item}>{item}</option>)}</Select>
        <Select value={spool.quantityConfidence} onChange={(event) => state.updateFilament(spool.id, { quantityConfidence: event.target.value as FilamentQuantityConfidence })}>{confidenceOptions.map((item) => <option key={item}>{item}</option>)}</Select>
        <Input type="number" value={spool.quantityConfidence === "Unknown" ? "" : spool.gramsAvailable} disabled={spool.quantityConfidence === "Unknown"} onChange={(event) => state.updateFilament(spool.id, { gramsAvailable: Math.max(0, Number(event.target.value)) })} placeholder="Remaining grams" />
        <Input type="number" value={spool.grossWeightGrams ?? ""} onChange={(event) => state.updateFilament(spool.id, { grossWeightGrams: numberOrUndefined(event.target.value) })} placeholder="Gross weight grams" />
        <Select value={spool.status} onChange={(event) => state.updateFilament(spool.id, { status: event.target.value as FilamentSpoolStatus })}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</Select>
        <Select value={spool.dryingStatus} onChange={(event) => state.updateFilament(spool.id, { dryingStatus: event.target.value as FilamentDryingStatus })}>{dryingOptions.map((item) => <option key={item}>{item}</option>)}</Select>
        <Input value={spool.storageLocation} onChange={(event) => state.updateFilament(spool.id, { storageLocation: event.target.value })} placeholder="Storage location" />
        <Input value={spool.lotNumber} onChange={(event) => state.updateFilament(spool.id, { lotNumber: event.target.value })} placeholder="Lot number" />
        <Textarea value={spool.notes} onChange={(event) => state.updateFilament(spool.id, { notes: event.target.value })} placeholder="Spool notes" className="min-h-[58px] sm:col-span-2" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => void state.printFilamentLabels([spool.id])}>QR Label</Button><Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.adjustFilament(spool.id, -100)}>-100g</Button><Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeFilament(spool.id)}>Remove</Button></div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs text-slate-500">{label}</span>{children}</label>;
}

function Stat({ label, value, warning = false }: { label: string; value: string | number; warning?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${warning ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-[#0d131c]"}`}><div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div><div className={`mt-2 text-2xl font-semibold ${warning ? "text-amber-300" : "text-slate-100"}`}>{value}</div></div>;
}
