import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { CanonRegistryView } from "../canon/CanonRegistryView";
import { ModelVerificationStation } from "../catalog/ModelVerificationStation";
import { PrintTrialStation } from "../catalog/PrintTrialStation";
import { ProductionReferenceBuilder } from "../catalog/ProductionReferenceBuilder";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

const workspaceTabs = ["overview", "stls", "concepts", "variants", "engineering"] as const;
type WorkspaceTab = (typeof workspaceTabs)[number];
type LibrarySection = "designs" | "canon";

export function DesignLibraryView({ state }: { state: ForgekeeperState }) {
  const [section, setSection] = useState<LibrarySection>("designs");
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const design = state.selectedProduct;
  const latestConcept = state.productConcepts[0];

  const designStats = useMemo(() => ({
    stls: state.productStls.length,
    concepts: state.productConcepts.length,
    variants: state.productVariants.length,
    jobs: state.productOrders.length,
  }), [state.productStls.length, state.productConcepts.length, state.productVariants.length, state.productOrders.length]);

  if (section === "canon") {
    return (
      <div className="space-y-5">
        <LibraryHeader section={section} setSection={setSection} />
        <CanonRegistryView state={state} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <LibraryHeader section={section} setSection={setSection} />

      <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
        <Card title="Design Library" right={<span className="text-xs text-slate-500">Foundry source of truth</span>}>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Input
                value={state.searchTerm}
                onChange={(event) => state.setSearchTerm(event.target.value)}
                placeholder="Search designs"
              />
              <div className="flex gap-2">
                <Input
                  autoFocus={state.quickAction === "newProduct"}
                  value={state.newProductName}
                  onChange={(event) => state.setNewProductName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") state.addProduct(); }}
                  placeholder="New design"
                />
                <Button onClick={state.addProduct}>Add</Button>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs leading-5 text-slate-400">
              Designs own their concept specs, STL assets, variants, engineering evidence, and production history. Catalog/customer storefront behavior is not part of this station.
            </div>

            <div className="space-y-2">
              {state.filteredProducts.map((item) => {
                const selected = item.id === state.selectedProductId;
                const stls = state.stls.filter((record) => record.productId === item.id).length;
                const concepts = state.concepts.filter((record) => record.productId === item.id).length;
                const variants = state.variants.filter((record) => record.productId === item.id).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => state.setSelectedProductId(item.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-amber-500/35 bg-amber-500/10" : "border-white/10 bg-[#0d131c] hover:bg-white/5"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-100">{item.name}</div>
                        <div className="mt-1 truncate text-xs text-slate-500">{item.collection} · {item.category}</div>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">{item.status}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-500">
                      <Mini label="STLs" value={stls} />
                      <Mini label="Specs" value={concepts} />
                      <Mini label="Variants" value={variants} />
                    </div>
                  </button>
                );
              })}
              {state.filteredProducts.length === 0 ? <Empty text="No designs match the current search." /> : null}
            </div>
          </div>
        </Card>

        {!design ? (
          <Card title="Design Project"><Empty text="Select or create a design project." /></Card>
        ) : (
          <div className="space-y-6">
            <Card title="Design Project" right={<span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-1 text-xs text-amber-300">{design.status}</span>}>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),280px]">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-amber-400">{design.line}</div>
                  <h1 className="mt-2 text-3xl font-semibold text-slate-100">{design.name}</h1>
                  <div className="mt-2 text-sm text-slate-400">{design.category} · {design.collection}</div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Stat label="STL assets" value={designStats.stls} />
                    <Stat label="Concept specs" value={designStats.concepts} />
                    <Stat label="Variants" value={designStats.variants} />
                    <Stat label="Production jobs" value={designStats.jobs} />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
                  <Info label="Primary image" value={state.getProductDisplayImage(design) || "No managed image linked"} />
                  <Info label="Estimated material" value={`${design.estimatedFilamentGrams.toFixed(0)}g`} />
                  <Info label="Estimated print time" value={`${design.estimatedPrintHours.toFixed(1)}h`} />
                  <Info label="Production stock" value={`${design.available} available`} />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
                {workspaceTabs.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTab(item)}
                    className={`min-h-[42px] rounded-xl border px-4 py-2 text-sm font-medium ${tab === item ? "border-amber-500/35 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
                  >
                    {item === "stls" ? "STL Files" : item === "concepts" ? "Concept Specs" : item.charAt(0).toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
            </Card>

            {tab === "overview" ? <DesignOverview state={state} /> : null}
            {tab === "stls" ? <StlWorkspace state={state} /> : null}
            {tab === "concepts" ? <ConceptWorkspace state={state} /> : null}
            {tab === "variants" ? <VariantWorkspace state={state} /> : null}
            {tab === "engineering" ? (
              latestConcept ? (
                <div className="space-y-6">
                  <ProductionReferenceBuilder state={state} concept={latestConcept} />
                  <ModelVerificationStation state={state} concept={latestConcept} />
                  <PrintTrialStation state={state} concept={latestConcept} />
                </div>
              ) : <Card title="Engineering"><Empty text="Create a concept spec before building production references or verification evidence." /></Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryHeader({ section, setSection }: { section: LibrarySection; setSection: (value: LibrarySection) => void }) {
  return (
    <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setSection("designs")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${section === "designs" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Design Projects</button>
        <button type="button" onClick={() => setSection("canon")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${section === "canon" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Canon Registry</button>
      </div>
    </div>
  );
}

function DesignOverview({ state }: { state: ForgekeeperState }) {
  const design = state.selectedProduct;
  if (!design) return null;
  return (
    <Card title="Identity & Production Definition">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Design name"><Input value={design.name} onChange={(event) => state.updateProduct(design.id, { name: event.target.value })} /></Field>
        <Field label="Category"><Input value={design.category} onChange={(event) => state.updateProduct(design.id, { category: event.target.value })} /></Field>
        <Field label="Collection"><Input value={design.collection} onChange={(event) => state.updateProduct(design.id, { collection: event.target.value })} /></Field>
        <Field label="Status"><Select value={design.status} onChange={(event) => state.updateProduct(design.id, { status: event.target.value as typeof design.status })}><option>Concept</option><option>Prototype</option><option>Active</option><option>Production</option><option>Archived</option></Select></Field>
        <Field label="Target price"><Input type="number" step="0.01" value={design.targetPrice} onChange={(event) => state.updateProduct(design.id, { targetPrice: Number(event.target.value) })} /></Field>
        <Field label="Estimated material grams"><Input type="number" value={design.estimatedFilamentGrams} onChange={(event) => state.updateProduct(design.id, { estimatedFilamentGrams: Number(event.target.value) })} /></Field>
        <Field label="Estimated print hours"><Input type="number" step="0.1" value={design.estimatedPrintHours} onChange={(event) => state.updateProduct(design.id, { estimatedPrintHours: Number(event.target.value) })} /></Field>
        <Field label="Reorder point"><Input type="number" value={design.reorderPoint} onChange={(event) => state.updateProduct(design.id, { reorderPoint: Number(event.target.value) })} /></Field>
      </div>
      <div className="mt-4"><Field label="Design notes"><Textarea value={design.notes} onChange={(event) => state.updateProduct(design.id, { notes: event.target.value })} className="min-h-[110px]" /></Field></div>
      <div className="mt-4 flex justify-end"><Button variant="danger" onClick={() => state.removeProduct(design.id)}>Remove Design</Button></div>
    </Card>
  );
}

function StlWorkspace({ state }: { state: ForgekeeperState }) {
  return (
    <Card title="STL Assets">
      <div className="flex flex-wrap gap-2">
        <Input value={state.newStlName} onChange={(event) => state.setNewStlName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") state.addStl(); }} placeholder="New STL asset" className="max-w-sm" />
        <Button onClick={state.addStl}>Add STL</Button>
      </div>
      <div className="mt-4 space-y-3">
        {state.productStls.map((stl) => (
          <div key={stl.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr,180px,auto]">
              <Input value={stl.name} onChange={(event) => state.updateStl(stl.id, { name: event.target.value })} />
              <Input value={stl.version} onChange={(event) => state.updateStl(stl.id, { version: event.target.value })} />
              <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => state.markPrimaryStl(stl.id)}>{stl.isPrimary ? "Primary" : "Make Primary"}</Button><Button variant="danger" onClick={() => state.removeStl(stl.id)}>Remove</Button></div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,auto,auto]">
              <Input value={stl.filePath || ""} onChange={(event) => state.linkStlPath(stl.id, event.target.value)} placeholder="STL file path" />
              <Button variant="ghost" onClick={() => state.openStlAsset(stl.id, "file")}>Open STL</Button>
              <Button variant="ghost" onClick={() => state.openStlAsset(stl.id, "folder")}>Open Folder</Button>
            </div>
          </div>
        ))}
        {state.productStls.length === 0 ? <Empty text="No STL assets linked to this design." /> : null}
      </div>
    </Card>
  );
}

function ConceptWorkspace({ state }: { state: ForgekeeperState }) {
  return (
    <Card title="Concept Specifications">
      <div className="flex flex-wrap gap-2">
        <Input value={state.newConceptTitle} onChange={(event) => state.setNewConceptTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") state.addConcept(); }} placeholder="New concept spec" className="max-w-sm" />
        <Button onClick={state.addConcept}>Add Concept</Button>
      </div>
      <div className="mt-4 space-y-4">
        {state.productConcepts.map((concept) => (
          <div key={concept.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="grid gap-3 md:grid-cols-2"><Field label="Title"><Input value={concept.title} onChange={(event) => state.updateConcept(concept.id, { title: event.target.value })} /></Field><Field label="Reference image"><Input value={concept.imagePath || ""} onChange={(event) => state.updateConcept(concept.id, { imagePath: event.target.value })} /></Field></div>
            <div className="mt-3"><Field label="Measurements"><Textarea value={concept.measurements} onChange={(event) => state.updateConcept(concept.id, { measurements: event.target.value })} className="min-h-[72px]" /></Field></div>
            <div className="mt-3"><Field label="Description"><Textarea value={concept.description} onChange={(event) => state.updateConcept(concept.id, { description: event.target.value })} className="min-h-[90px]" /></Field></div>
            <div className="mt-3 flex justify-end"><Button variant="danger" onClick={() => state.removeConcept(concept.id)}>Remove Concept</Button></div>
          </div>
        ))}
        {state.productConcepts.length === 0 ? <Empty text="No concept specifications recorded for this design." /> : null}
      </div>
    </Card>
  );
}

function VariantWorkspace({ state }: { state: ForgekeeperState }) {
  return (
    <Card title="Design Variants" right={<Button onClick={() => state.addVariant()}>Add Variant</Button>}>
      <div className="space-y-3">
        {state.productVariants.map((variant) => (
          <div key={variant.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="grid gap-3 md:grid-cols-[1fr,200px,auto]">
              <Input value={variant.name} onChange={(event) => state.updateVariant(variant.id, { name: event.target.value })} />
              <Select value={variant.realm} onChange={(event) => state.updateVariant(variant.id, { realm: event.target.value as typeof variant.realm })}>{["Midgard","Alfheim","Svartalfheim","Vanaheim","Asgard","Jotunheim","Muspelheim","Niflheim","Helheim"].map((realm) => <option key={realm}>{realm}</option>)}</Select>
              <Button variant="danger" onClick={() => state.removeVariant(variant.id)}>Remove</Button>
            </div>
          </div>
        ))}
        {state.productVariants.length === 0 ? <Empty text="No explicit variant records yet." /> : null}
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{label}</div>{children}</label>; }
function Mini({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-black/20 px-2 py-2"><div className="font-semibold text-slate-200">{value}</div><div>{label}</div></div>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4"><div className="text-2xl font-semibold text-slate-100">{value}</div><div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{label}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="mb-3"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 break-all text-slate-200">{value}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">{text}</div>; }
