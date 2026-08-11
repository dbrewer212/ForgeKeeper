import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { downloadCsv } from "../../lib/csv";
import { filamentCsvTemplate, previewFilamentCsv, type FilamentCsvPreview } from "../../lib/filamentInventory";
import { money } from "../../lib/format";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { FilamentDryingRecord, FilamentMaterial, FilamentProfile, FilamentQuantityConfidence, FilamentSpoolCondition, FilamentSpoolStatus } from "../../types/domain";

type MaterialTab = "overview" | "receive" | "inventory" | "ledger" | "reservations" | "drying" | "transfer";
const materialOptions: FilamentMaterial[] = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "Other"];
const confidenceOptions: FilamentQuantityConfidence[] = ["Exact", "Nominal", "Estimated", "Unknown"];
const conditionOptions: FilamentSpoolCondition[] = ["Sealed", "Used", "Empty"];
const statusOptions: FilamentSpoolStatus[] = ["In Stock", "In Use", "Empty", "Archived"];
const tabs: Array<{ id: MaterialTab; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "receive", label: "Receive" }, { id: "inventory", label: "Inventory" },
  { id: "ledger", label: "Ledger" }, { id: "reservations", label: "Reservations" }, { id: "drying", label: "Drying" }, { id: "transfer", label: "Import / Export" },
];

const emptyProfile = (): Omit<FilamentProfile, "id" | "createdAt" | "updatedAt"> => ({
  brand: "", productLine: "", material: "PLA", colorName: "", colorFamily: "", diameterMm: 1.75,
  nominalWeightGrams: 1000, emptySpoolWeightGrams: undefined, reorderPointGrams: 250,
  defaultSpoolPrice: 0, supplier: "", supplierSku: "", notes: "",
});

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function FilamentView({ state }: { state: ForgekeeperState }) {
  const [tab, setTab] = useState<MaterialTab>("overview");
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
  const [purchaseDate, setPurchaseDate] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [grossDrafts, setGrossDrafts] = useState<Record<string, string>>({});
  const [adjustSpoolId, setAdjustSpoolId] = useState("");
  const [adjustGrams, setAdjustGrams] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [consumptionOrderId, setConsumptionOrderId] = useState("");
  const [consumptionReason, setConsumptionReason] = useState("");
  const [consumptionAllocations, setConsumptionAllocations] = useState<Array<{ spoolId: string; grams: string }>>([{ spoolId: "", grams: "" }]);
  const [reservationProfileId, setReservationProfileId] = useState("");
  const [reservationSpoolId, setReservationSpoolId] = useState("");
  const [reservationGrams, setReservationGrams] = useState("");
  const [reservationPurpose, setReservationPurpose] = useState("");
  const [reservationOrderId, setReservationOrderId] = useState("");
  const [drySpoolId, setDrySpoolId] = useState("");
  const [dryTemperature, setDryTemperature] = useState("");
  const [dryDuration, setDryDuration] = useState("");
  const [dryOutcome, setDryOutcome] = useState<FilamentDryingRecord["outcome"]>("Dry");
  const [dryNotes, setDryNotes] = useState("");
  const [pendingImport, setPendingImport] = useState<{ filename: string; text: string; preview: FilamentCsvPreview }>();
  const csvInput = useRef<HTMLInputElement>(null);

  const selectedProfile = state.filamentProfiles.find((profile) => profile.id === selectedProfileId);
  const effectiveProfile = selectedProfile ?? profileDraft;
  const activeSpools = state.filament.filter((spool) => spool.status !== "Archived");
  const knownSpools = activeSpools.filter((spool) => spool.quantityConfidence !== "Unknown");
  const knownGrams = knownSpools.reduce((sum, spool) => sum + spool.gramsAvailable, 0);
  const reservedGrams = state.materialReservations.filter((item) => item.status === "Active").reduce((sum, item) => sum + item.grams, 0);
  const unknownCount = activeSpools.length - knownSpools.length;
  const stockValue = state.materialSummaries.reduce((sum, item) => sum + item.stockValue, 0);

  const filteredSpools = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return state.filament;
    return state.filament.filter((spool) => {
      const profile = state.filamentProfiles.find((item) => item.id === spool.profileId);
      return [spool.foundrySpoolCode, spool.brand, spool.material, spool.colorName, spool.colorFamily, spool.storageLocation, spool.lotNumber, profile?.productLine, profile?.supplierSku]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
    });
  }, [search, state.filament, state.filamentProfiles]);

  function resetIntake() {
    setSealedQuantity("0"); setMeasuredGrossWeights(""); setEstimatedQuantity("0"); setUnknownQuantity("0"); setEmptyQuantity("0");
    setPurchasePrice(""); setPurchaseDate(""); setLotNumber("");
  }

  function receive() {
    let profile = selectedProfile;
    if (!profile) {
      if (!profileDraft.brand.trim() || !profileDraft.colorName.trim()) return setMessage("Brand and color name are required for a new material profile.");
      profile = state.addFilamentProfile({ ...profileDraft, brand: profileDraft.brand.trim(), colorName: profileDraft.colorName.trim(), colorFamily: profileDraft.colorFamily.trim() || "Unknown" });
      setSelectedProfileId(profile.id);
      setProfileDraft(emptyProfile());
    }
    const common = { spoolPrice: numberOrUndefined(purchasePrice), storageLocation, purchaseDate, lotNumber };
    const drafts: Parameters<typeof state.receiveFilamentBatch>[1] = [];
    for (let i = 0; i < Math.max(0, Number(sealedQuantity) || 0); i += 1) drafts.push({ ...common, condition: "Sealed", quantityConfidence: "Nominal", gramsAvailable: profile.nominalWeightGrams });
    const weights = measuredGrossWeights.split(/[\s,;]+/).map(Number).filter((value) => Number.isFinite(value) && value >= 0);
    if (weights.length && profile.emptySpoolWeightGrams === undefined) return setMessage("Add the empty-spool tare before entering gross weights.");
    weights.forEach((grossWeightGrams) => drafts.push({ ...common, condition: "Used", quantityConfidence: "Exact", grossWeightGrams, gramsAvailable: Math.max(0, grossWeightGrams - (profile!.emptySpoolWeightGrams ?? 0)) }));
    const percent = Math.max(0, Math.min(100, Number(estimatedPercent) || 0));
    for (let i = 0; i < Math.max(0, Number(estimatedQuantity) || 0); i += 1) drafts.push({ ...common, condition: "Used", quantityConfidence: "Estimated", estimatedPercent: percent, gramsAvailable: profile.nominalWeightGrams * percent / 100 });
    for (let i = 0; i < Math.max(0, Number(unknownQuantity) || 0); i += 1) drafts.push({ ...common, condition: "Used", quantityConfidence: "Unknown", gramsAvailable: 0 });
    for (let i = 0; i < Math.max(0, Number(emptyQuantity) || 0); i += 1) drafts.push({ ...common, condition: "Empty", quantityConfidence: "Exact", gramsAvailable: 0 });
    if (!drafts.length) return setMessage("Enter at least one sealed, measured, estimated, unknown, or empty spool.");
    const created = state.receiveFilamentBatch(profile.id, drafts, profile);
    setMessage(`${created.length} physical spool${created.length === 1 ? "" : "s"} received and added to the ledger.`);
    resetIntake();
  }

  async function stageCsv(file: File) {
    const text = await file.text();
    setPendingImport({ filename: file.name, text, preview: previewFilamentCsv(text, state.materialImportHistory) });
    if (csvInput.current) csvInput.current.value = "";
  }

  function commitCsv() {
    if (!pendingImport) return;
    try {
      const result = state.importFilamentCensusCsv(pendingImport.text, pendingImport.filename);
      setMessage(`Imported ${result.profiles} new profile${result.profiles === 1 ? "" : "s"} and ${result.spools} physical spool${result.spools === 1 ? "" : "s"}.`);
      setPendingImport(undefined);
    } catch (error) { setMessage(`CSV import blocked: ${String(error)}`); }
  }

  async function downloadTemplate() {
    try {
      const result = await downloadCsv("forgekeeper-material-intake-template.csv", filamentCsvTemplate());
      setMessage(result.outputPath ? `Template saved to ${result.outputPath}` : "Template download started.");
    } catch (error) { setMessage(`Template export failed: ${String(error)}`); }
  }

  function recordAdjustment(type: "Correction" | "Waste") {
    const grams = Number(adjustGrams);
    if (!adjustSpoolId || !Number.isFinite(grams) || grams === 0 || !adjustReason.trim()) return setMessage("Choose a spool, enter a non-zero gram change, and record the reason.");
    const delta = type === "Waste" ? -Math.abs(grams) : grams;
    if (!state.adjustFilament(adjustSpoolId, delta, adjustReason, type)) return setMessage("This adjustment could not be recorded. Unknown spools must be measured or estimated first.");
    setMessage(`${type} recorded in the material ledger.`); setAdjustGrams(""); setAdjustReason("");
  }

  function recordConsumption() {
    const allocations = consumptionAllocations
      .map((allocation) => ({ spoolId: allocation.spoolId, grams: Number(allocation.grams) }))
      .filter((allocation) => allocation.spoolId && Number.isFinite(allocation.grams) && allocation.grams > 0);
    if (!consumptionOrderId || allocations.length !== consumptionAllocations.length) return setMessage("Choose an order and enter a positive amount for every spool allocation.");
    if (!state.consumeMaterialForOrder(consumptionOrderId, allocations, consumptionReason.trim() || "Recorded actual production use")) return setMessage("Consumption was blocked. Check each spool's known balance and allocation amount.");
    setMessage(`Recorded ${allocations.reduce((sum, item) => sum + item.grams, 0).toFixed(0)}g of actual use across ${allocations.length} spool${allocations.length === 1 ? "" : "s"}.`);
    setConsumptionAllocations([{ spoolId: "", grams: "" }]); setConsumptionReason("");
  }

  function createReservation() {
    const grams = Number(reservationGrams);
    const created = state.createMaterialReservation(reservationProfileId, grams, reservationPurpose, reservationOrderId || undefined, reservationSpoolId || undefined);
    if (!created) return setMessage("Choose a material profile and enter a positive reserved amount.");
    setMessage(`Reserved ${grams.toFixed(0)}g for ${created.purpose}.`); setReservationGrams(""); setReservationPurpose("");
  }

  function recordDrying() {
    const record = state.recordFilamentDrying(drySpoolId, Number(dryTemperature), Number(dryDuration), dryOutcome, dryNotes);
    if (!record) return setMessage("Choose a spool and enter a valid drying temperature and duration.");
    setMessage(`Drying cycle recorded for ${state.filament.find((item) => item.id === drySpoolId)?.foundrySpoolCode}.`); setDryNotes("");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-5">
        <Stat label="Physical spools" value={activeSpools.length} />
        <Stat label="Known stock" value={`${(knownGrams / 1000).toFixed(2)} kg`} />
        <Stat label="Reserved" value={`${(reservedGrams / 1000).toFixed(2)} kg`} />
        <Stat label="Stock value" value={money(stockValue)} />
        <Stat label="Unknown" value={unknownCount} warning={unknownCount > 0} />
      </div>

      <Card title="Material Station" right={<span className="text-xs text-slate-500">v0.2.0 · {state.storageStatus === "SQLite" ? "SQLite workshop database" : state.storageStatus}</span>}>
        {state.storageStatus === "Error" && <Notice danger>SQLite did not start: {state.storageError || "No diagnostic detail was returned."}</Notice>}
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((item) => <Button key={item.id} variant={tab === item.id ? "default" : "ghost"} className="h-9 px-3 text-xs" onClick={() => setTab(item.id)}>{item.label}</Button>)}
        </div>
        {message && <Notice>{message}</Notice>}

        {tab === "overview" && <Overview state={state} />}
        {tab === "receive" && (
          <div className="grid gap-5 xl:grid-cols-[1.05fr,1.4fr]">
            <section className="space-y-3">
              <SectionTitle>1 · Select or define material</SectionTitle>
              <Select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}><option value="new">Create new material profile</option>{state.filamentProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.brand} {profile.productLine} · {profile.material} · {profile.colorName}</option>)}</Select>
              {!selectedProfile && <ProfileEditor profile={profileDraft} update={(patch) => setProfileDraft({ ...profileDraft, ...patch })} />}
              {selectedProfile && <ProfileEditor profile={selectedProfile} update={(patch) => state.updateFilamentProfile(selectedProfile.id, patch)} />}
            </section>
            <section className="space-y-3">
              <SectionTitle>2 · Receive physical spools</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Labeled label="Sealed quantity"><Input type="number" min="0" value={sealedQuantity} onChange={(e) => setSealedQuantity(e.target.value)} /></Labeled>
                <Labeled label="Measured gross weights"><Input value={measuredGrossWeights} onChange={(e) => setMeasuredGrossWeights(e.target.value)} placeholder="742, 811, 930" /></Labeled>
                <Labeled label="Estimated quantity"><Input type="number" min="0" value={estimatedQuantity} onChange={(e) => setEstimatedQuantity(e.target.value)} /></Labeled>
                <Labeled label="Estimated remaining %"><Input type="number" min="0" max="100" value={estimatedPercent} onChange={(e) => setEstimatedPercent(e.target.value)} /></Labeled>
                <Labeled label="Unknown quantity"><Input type="number" min="0" value={unknownQuantity} onChange={(e) => setUnknownQuantity(e.target.value)} /></Labeled>
                <Labeled label="Empty quantity"><Input type="number" min="0" value={emptyQuantity} onChange={(e) => setEmptyQuantity(e.target.value)} /></Labeled>
                <Labeled label="Price per spool"><Input type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder={String(effectiveProfile.defaultSpoolPrice || "Optional")} /></Labeled>
                <Labeled label="Purchase date"><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Labeled>
                <Labeled label="Lot number"><Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} /></Labeled>
                <Labeled label="Storage location"><Input value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} placeholder="Shelf / bin / rack" /></Labeled>
              </div>
              <Button onClick={receive}>Receive and assign Foundry IDs</Button>
            </section>
          </div>
        )}

        {tab === "inventory" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Scan or search Foundry ID, brand, material, color, location, lot, or SKU" className="max-w-2xl" /><Button variant="ghost" onClick={() => void state.printFilamentLabels(filteredSpools.map((item) => item.id)).then((result) => result?.outputPath && setMessage(`Printable labels saved to ${result.outputPath}`))}>Labels for results</Button></div>
            <div className="grid gap-4 xl:grid-cols-2">{filteredSpools.map((spool) => {
              const profile = state.filamentProfiles.find((item) => item.id === spool.profileId);
              const grossDraft = grossDrafts[spool.id] ?? (spool.grossWeightGrams === undefined ? "" : String(spool.grossWeightGrams));
              return <div key={spool.id} className={`rounded-xl border p-4 ${spool.status === "Archived" ? "border-slate-700 bg-slate-900/50 opacity-75" : "border-white/10 bg-white/[0.03]"}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-white">{spool.foundrySpoolCode} · {profile?.brand ?? spool.brand} {profile?.productLine}</div><div className="text-sm text-slate-400">{profile?.material ?? spool.material} · {profile?.colorName ?? spool.colorName} · {spool.quantityConfidence === "Unknown" ? "remainder unknown" : `${spool.gramsAvailable.toFixed(0)}g`}</div></div><Badge>{spool.status}</Badge></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Select value={spool.condition} onChange={(e) => state.updateFilament(spool.id, { condition: e.target.value as FilamentSpoolCondition })}>{conditionOptions.map((value) => <option key={value}>{value}</option>)}</Select>
                  <Select value={spool.quantityConfidence} onChange={(e) => state.updateFilament(spool.id, { quantityConfidence: e.target.value as FilamentQuantityConfidence })}>{confidenceOptions.map((value) => <option key={value}>{value}</option>)}</Select>
                  <Select value={spool.status} onChange={(e) => state.updateFilament(spool.id, { status: e.target.value as FilamentSpoolStatus })}>{statusOptions.map((value) => <option key={value}>{value}</option>)}</Select>
                  <Input value={spool.storageLocation} onChange={(e) => state.updateFilament(spool.id, { storageLocation: e.target.value })} placeholder="Storage location" />
                  <Input value={spool.lotNumber} onChange={(e) => state.updateFilament(spool.id, { lotNumber: e.target.value })} placeholder="Lot number" />
                  <Input type="number" value={grossDraft} onChange={(e) => setGrossDrafts({ ...grossDrafts, [spool.id]: e.target.value })} placeholder="Gross weight grams" />
                  <Button variant="ghost" onClick={() => { const gross = numberOrUndefined(grossDraft); if (gross === undefined) return setMessage("Enter the measured gross weight."); if (spool.emptySpoolWeightGrams === undefined) return setMessage("This profile needs an empty-spool tare first."); state.updateFilament(spool.id, { grossWeightGrams: gross }); setMessage(`${spool.foundrySpoolCode} measured and recalculated from tare.`); }}>Record measurement</Button>
                </div>
                <Textarea className="mt-2 min-h-[56px]" value={spool.notes} onChange={(e) => state.updateFilament(spool.id, { notes: e.target.value })} placeholder="Spool notes" />
                <div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => void state.printFilamentLabels([spool.id]).then((result) => result?.outputPath && setMessage(`Printable label saved to ${result.outputPath}`))}>QR label</Button>{spool.status === "Archived" ? <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.restoreArchivedFilament(spool.id)}>Restore</Button> : <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeFilament(spool.id)}>Archive</Button>}</div>
              </div>;
            })}</div>
          </div>
        )}

        {tab === "ledger" && <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><SectionTitle>Record actual production use</SectionTitle><div className="mt-3 grid gap-3 md:grid-cols-2"><Select value={consumptionOrderId} onChange={(e) => setConsumptionOrderId(e.target.value)}><option value="">Choose order / production job</option>{state.orders.filter((order) => !order.materialConsumed).map((order) => <option key={order.id} value={order.id}>{order.id} · {order.customer || "Workshop order"}</option>)}</Select><Input value={consumptionReason} onChange={(e) => setConsumptionReason(e.target.value)} placeholder="Use note (actual print, failed print, etc.)" /></div><div className="mt-3 space-y-2">{consumptionAllocations.map((allocation, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr,180px,auto]"><Select value={allocation.spoolId} onChange={(e) => setConsumptionAllocations(consumptionAllocations.map((item, itemIndex) => itemIndex === index ? { ...item, spoolId: e.target.value } : item))}><option value="">Choose physical spool</option>{activeSpools.filter((spool) => spool.quantityConfidence !== "Unknown" && spool.gramsAvailable > 0).map((spool) => <option key={spool.id} value={spool.id}>{spool.foundrySpoolCode} · {spool.material} {spool.colorName} · {spool.gramsAvailable.toFixed(0)}g</option>)}</Select><Input type="number" value={allocation.grams} onChange={(e) => setConsumptionAllocations(consumptionAllocations.map((item, itemIndex) => itemIndex === index ? { ...item, grams: e.target.value } : item))} placeholder="Actual grams" /><Button variant="ghost" disabled={consumptionAllocations.length === 1} onClick={() => setConsumptionAllocations(consumptionAllocations.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div>)}</div><div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setConsumptionAllocations([...consumptionAllocations, { spoolId: "", grams: "" }])}>Add another spool</Button><Button onClick={recordConsumption}>Record actual consumption</Button></div></div>
          <div className="grid gap-3 md:grid-cols-4"><Select value={adjustSpoolId} onChange={(e) => setAdjustSpoolId(e.target.value)}><option value="">Choose spool</option>{activeSpools.map((spool) => <option key={spool.id} value={spool.id}>{spool.foundrySpoolCode} · {spool.colorName}</option>)}</Select><Input type="number" value={adjustGrams} onChange={(e) => setAdjustGrams(e.target.value)} placeholder="Gram change (+ / -)" /><Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Required reason" /><div className="flex gap-2"><Button onClick={() => recordAdjustment("Correction")}>Correction</Button><Button variant="ghost" onClick={() => recordAdjustment("Waste")}>Waste</Button></div></div>
          <div className="space-y-2">{state.materialTransactions.slice(0, 200).map((entry) => { const spool = state.filament.find((item) => item.id === entry.spoolId); return <div key={entry.id} className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-sm md:grid-cols-[150px,135px,90px,1fr,auto]"><div className="text-slate-300">{new Date(entry.occurredAt).toLocaleString()}</div><div className="font-semibold text-white">{spool?.foundrySpoolCode ?? entry.spoolId}</div><div className={entry.deltaGrams < 0 ? "text-red-300" : entry.deltaGrams > 0 ? "text-emerald-300" : "text-slate-400"}>{entry.deltaGrams > 0 ? "+" : ""}{entry.deltaGrams.toFixed(0)}g</div><div><span className="text-amber-300">{entry.type}</span> · {entry.reason}{entry.reversedByTransactionId && <span className="ml-2 text-slate-500">Reversed</span>}</div>{entry.deltaGrams !== 0 && !entry.reversedByTransactionId && entry.type !== "Opening Balance" && entry.type !== "Reversal" ? <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.reverseMaterialTransaction(entry.id, "Operator-requested reversal")}>Reverse</Button> : <span />}</div>; })}</div>
        </div>}

        {tab === "reservations" && <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"><Select value={reservationProfileId} onChange={(e) => { setReservationProfileId(e.target.value); setReservationSpoolId(""); }}><option value="">Material profile</option>{state.filamentProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.brand} · {profile.material} · {profile.colorName}</option>)}</Select><Select value={reservationSpoolId} onChange={(e) => setReservationSpoolId(e.target.value)}><option value="">Any spool in profile</option>{activeSpools.filter((spool) => spool.profileId === reservationProfileId).map((spool) => <option key={spool.id} value={spool.id}>{spool.foundrySpoolCode} · {spool.gramsAvailable.toFixed(0)}g</option>)}</Select><Input type="number" value={reservationGrams} onChange={(e) => setReservationGrams(e.target.value)} placeholder="Reserved grams" /><Input value={reservationPurpose} onChange={(e) => setReservationPurpose(e.target.value)} placeholder="Purpose / queued job" /><Select value={reservationOrderId} onChange={(e) => setReservationOrderId(e.target.value)}><option value="">No linked order</option>{state.orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.customer || "Workshop order"}</option>)}</Select></div><Button onClick={createReservation}>Reserve material</Button>
          <div className="grid gap-3 xl:grid-cols-2">{state.materialReservations.map((reservation) => { const profile = state.filamentProfiles.find((item) => item.id === reservation.profileId); return <div key={reservation.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="flex justify-between gap-3"><div><div className="font-semibold text-white">{reservation.grams.toFixed(0)}g · {profile?.brand} {profile?.colorName}</div><div className="text-sm text-slate-400">{reservation.purpose}{reservation.orderId ? ` · ${reservation.orderId}` : ""}</div></div><Badge>{reservation.status}</Badge></div>{reservation.status === "Active" && <Button variant="ghost" className="mt-3 h-8 px-3 text-xs" onClick={() => state.releaseMaterialReservation(reservation.id)}>Release reservation</Button>}</div>; })}</div>
        </div>}

        {tab === "drying" && <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"><Select value={drySpoolId} onChange={(e) => setDrySpoolId(e.target.value)}><option value="">Choose spool</option>{activeSpools.map((spool) => <option key={spool.id} value={spool.id}>{spool.foundrySpoolCode} · {spool.material} {spool.colorName}</option>)}</Select><Input type="number" value={dryTemperature} onChange={(e) => setDryTemperature(e.target.value)} placeholder="Temperature °C" /><Input type="number" step="0.25" value={dryDuration} onChange={(e) => setDryDuration(e.target.value)} placeholder="Duration hours" /><Select value={dryOutcome} onChange={(e) => setDryOutcome(e.target.value as FilamentDryingRecord["outcome"])}><option>Dry</option><option>Needs More Drying</option><option>Unknown</option></Select><Input value={dryNotes} onChange={(e) => setDryNotes(e.target.value)} placeholder="Outcome notes" /></div><Button onClick={recordDrying}>Record drying cycle</Button><div className="space-y-2">{state.filamentDryingRecords.map((record) => { const spool = state.filament.find((item) => item.id === record.spoolId); return <div key={record.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm"><span className="font-semibold text-white">{spool?.foundrySpoolCode}</span> · {record.temperatureC}°C for {record.durationHours}h · <span className="text-amber-300">{record.outcome}</span> · {new Date(record.occurredAt).toLocaleString()} {record.notes && <span className="text-slate-400">· {record.notes}</span>}</div>; })}</div></div>}

        {tab === "transfer" && <div className="space-y-5"><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={downloadTemplate}>Download intake template</Button><Button variant="ghost" onClick={() => csvInput.current?.click()}>Choose CSV to preview</Button><Button variant="ghost" onClick={() => state.exportFilamentCsv()}>Export spools</Button><Button variant="ghost" onClick={() => state.exportMaterialLedgerCsv()}>Export ledger</Button><Button variant="ghost" onClick={() => state.exportMaterialReservationsCsv()}>Export reservations</Button><Button variant="ghost" onClick={() => state.exportMaterialPurchaseListCsv()}>Export purchase list</Button><Button variant="ghost" onClick={() => state.exportBackupJson()}>Full verified JSON backup</Button><input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void stageCsv(e.target.files[0])} /></div>
          {pendingImport && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold text-white">Preview: {pendingImport.filename}</div><div className="text-sm text-slate-400">{pendingImport.preview.rows.length} rows · {pendingImport.preview.totalSpools} physical spools</div></div><Badge danger={!pendingImport.preview.valid || pendingImport.preview.duplicateImport}>{pendingImport.preview.duplicateImport ? "Duplicate blocked" : pendingImport.preview.valid ? "Ready for confirmation" : "Errors found"}</Badge></div><div className="mt-3 space-y-2">{pendingImport.preview.rows.map((row) => <div key={row.rowNumber} className="rounded-lg bg-black/20 p-2 text-sm"><span className="font-semibold">Row {row.rowNumber}</span> · {row.row.brand || "Missing brand"} · {row.row.material || "Missing material"} · {row.row.colorName || "Missing color"} · qty {row.quantity}{row.errors.map((error) => <div key={error} className="text-red-300">{error}</div>)}{row.warnings.map((warning) => <div key={warning} className="text-amber-300">{warning}</div>)}</div>)}</div><div className="mt-3 flex gap-2"><Button disabled={!pendingImport.preview.valid || pendingImport.preview.duplicateImport} onClick={commitCsv}>Confirm import</Button><Button variant="ghost" onClick={() => setPendingImport(undefined)}>Cancel</Button></div></div>}
        </div>}
      </Card>
    </div>
  );
}

function Overview({ state }: { state: ForgekeeperState }) {
  const consumed = -state.materialTransactions.filter((item) => item.type === "Consumption" && !item.reversedByTransactionId).reduce((sum, item) => sum + item.deltaGrams, 0);
  const wasted = -state.materialTransactions.filter((item) => item.type === "Waste" && !item.reversedByTransactionId).reduce((sum, item) => sum + item.deltaGrams, 0);
  const unknown = state.filament.filter((item) => item.status !== "Archived" && item.quantityConfidence === "Unknown").length;
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Stat label="Recorded production use" value={`${Math.max(0, consumed).toFixed(0)}g`} /><Stat label="Recorded waste" value={`${Math.max(0, wasted).toFixed(0)}g`} warning={wasted > 0} /><Stat label="Unknown balances" value={unknown} warning={unknown > 0} /></div><div className="grid gap-4 xl:grid-cols-2"><Card title="Profile stock and commitments"><div className="space-y-3">{state.materialSummaries.map((item) => <div key={item.profile.id} className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex justify-between gap-3"><div><div className="font-semibold text-white">{item.profile.brand} {item.profile.productLine} · {item.profile.colorName}</div><div className="text-xs text-slate-400">{item.profile.material} · {item.activeSpools} active spool{item.activeSpools === 1 ? "" : "s"}{item.unknownSpools ? ` · ${item.unknownSpools} unknown` : ""}</div></div><Badge danger={item.shortageGrams > 0}>{item.shortageGrams > 0 ? "Reorder" : "Stocked"}</Badge></div><div className="mt-2 grid grid-cols-3 gap-2 text-sm"><Metric label="Physical" value={`${item.physicalGrams.toFixed(0)}g`} /><Metric label="Reserved" value={`${item.reservedGrams.toFixed(0)}g`} /><Metric label="Available" value={`${item.availableGrams.toFixed(0)}g`} /></div></div>)}</div></Card><Card title="Purchase requirements"><div className="space-y-3">{state.materialPurchaseList.length ? state.materialPurchaseList.map((item) => <div key={item.profile.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><div className="font-semibold text-white">{item.profile.brand} · {item.profile.material} · {item.profile.colorName}</div><div className="text-sm text-amber-200">Short {item.shortageGrams.toFixed(0)}g · buy {item.suggestedSpools} spool{item.suggestedSpools === 1 ? "" : "s"}</div><div className="text-xs text-slate-400">{item.profile.supplier || "Supplier not recorded"}{item.profile.supplierSku ? ` · ${item.profile.supplierSku}` : ""}</div></div>) : <div className="text-sm text-slate-400">No known profile is below its reorder target.</div>}</div></Card></div><Card title="Material integrity"><div className="space-y-2">{state.materialIntegrityFindings.length ? state.materialIntegrityFindings.map((finding, index) => <div key={`${finding.code}-${index}`} className={finding.severity === "Error" ? "text-sm text-red-300" : "text-sm text-amber-300"}>{finding.severity} · {finding.message}</div>) : <div className="text-sm text-emerald-300">No negative balances, duplicate IDs, bad tare calculations, orphaned ledger entries, or invalid reservations detected.</div>}</div></Card></div>;
}

function ProfileEditor({ profile, update }: { profile: Omit<FilamentProfile, "id" | "createdAt" | "updatedAt"> | FilamentProfile; update: (patch: Partial<FilamentProfile>) => void }) {
  return <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-2"><Input value={profile.brand} onChange={(e) => update({ brand: e.target.value })} placeholder="Brand *" /><Input value={profile.productLine} onChange={(e) => update({ productLine: e.target.value })} placeholder="Product line" /><Select value={profile.material} onChange={(e) => update({ material: e.target.value as FilamentMaterial })}>{materialOptions.map((material) => <option key={material}>{material}</option>)}</Select><Input value={profile.colorName} onChange={(e) => update({ colorName: e.target.value })} placeholder="Color name *" /><Input value={profile.colorFamily} onChange={(e) => update({ colorFamily: e.target.value })} placeholder="Color family" /><Input type="number" step="0.01" value={profile.diameterMm} onChange={(e) => update({ diameterMm: Number(e.target.value) })} placeholder="Diameter mm" /><Input type="number" value={profile.nominalWeightGrams} onChange={(e) => update({ nominalWeightGrams: Number(e.target.value) })} placeholder="Nominal grams" /><Input type="number" value={profile.emptySpoolWeightGrams ?? ""} onChange={(e) => update({ emptySpoolWeightGrams: numberOrUndefined(e.target.value) })} placeholder="Empty-spool tare grams" /><Input type="number" value={profile.reorderPointGrams} onChange={(e) => update({ reorderPointGrams: Number(e.target.value) })} placeholder="Reorder target grams" /><Input type="number" step="0.01" value={profile.defaultSpoolPrice || ""} onChange={(e) => update({ defaultSpoolPrice: Number(e.target.value) })} placeholder="Default spool price" /><Input value={profile.supplier} onChange={(e) => update({ supplier: e.target.value })} placeholder="Supplier" /><Input value={profile.supplierSku} onChange={(e) => update({ supplierSku: e.target.value })} placeholder="Supplier SKU" /><Textarea value={profile.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Profile notes" className="min-h-[58px] md:col-span-2" /></div>;
}

function Stat({ label, value, warning = false }: { label: string; value: ReactNode; warning?: boolean }) { return <div className={`rounded-xl border p-4 ${warning ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-white/[0.03]"}`}><div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div><div className={`mt-1 text-2xl font-semibold ${warning ? "text-amber-300" : "text-white"}`}>{value}</div></div>; }
function Labeled({ label, children }: { label: string; children: ReactNode }) { return <label className="space-y-1"><span className="text-xs text-slate-500">{label}</span>{children}</label>; }
function SectionTitle({ children }: { children: ReactNode }) { return <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">{children}</div>; }
function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) { return <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${danger ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-amber-500/20 bg-amber-500/5 text-amber-100"}`}>{children}</div>; }
function Badge({ children, danger = false }: { children: ReactNode; danger?: boolean }) { return <span className={`rounded-full px-2 py-1 text-xs ${danger ? "bg-red-500/15 text-red-300" : "bg-white/10 text-slate-300"}`}>{children}</span>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-slate-500">{label}</div><div className="text-white">{value}</div></div>; }
