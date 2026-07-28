import type { ReactNode } from "react";
import { AssetLaunchpad } from "../../components/assets/AssetLaunchpad";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { CollectionsView } from "../collections/CollectionsView";
import { ReleasesView } from "../releases/ReleasesView";
import { money } from "../../lib/format";
import { inventoryState, pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { AssetStatus, ProductionStatus, DesignProject, DesignLine, DesignStatus, DesignTab, DesignTier, DesignVariant, RealmVariant, SlicerKey } from "../../types/domain";

const designTabs: DesignTab[] = ["overview", "stls", "concepts", "packets", "variants", "jobs"];
const realmOptions: RealmVariant[] = ["Midgard", "Alfheim", "Svartalfheim", "Vanaheim", "Asgard", "Jotunheim", "Muspelheim", "Niflheim", "Helheim"];

export function DesignLibraryView({ state }: { state: ForgekeeperState }) {
  const design = state.selectedDesignProject;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <DesignRail state={state} />

        {!design ? (
          <Card title="Design Project">
            <Empty text="No design selected. Add or select a design to begin." />
          </Card>
        ) : (
          <DesignWorkspace state={state} design={design} />
        )}
      </div>
      <CollectionsView state={state} />
      <ReleasesView state={state} />
    </div>
  );
}

function DesignRail({ state }: { state: ForgekeeperState }) {
  return (
    <Card
      title="Design Library"
      right={
        <div className="flex gap-2">
          <Input
            autoFocus={state.quickAction === "newDesign"}
            value={state.newDesignName}
            onChange={(e) => state.setNewDesignName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") state.addDesign();
            }}
            placeholder="New design"
            className="w-40"
          />
          <Button onClick={state.addDesign}>Add</Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#0d131c] p-3 text-xs text-slate-400">
        Design Library is the design source of truth. Production Jobs, releases, STL records, and concept specs all connect back here.
      </div>

      <div className="space-y-3">
        {state.filteredDesignProjects.length === 0 ? (
          <Empty text="No design projects match the current search." />
        ) : (
          state.filteredDesignProjects.map((design) => {
            const stlCount = state.stls.filter((stl) => stl.designProjectId === design.id).length;
            const conceptCount = state.concepts.filter((concept) => concept.designProjectId === design.id).length;
            const orderCount = state.productionJobs.filter((job) => job.designProjectId === design.id).length;
            const variantCount = state.variants.filter((variant) => variant.designProjectId === design.id).length;
            const selected = state.selectedDesignProjectId === design.id;

            return (
              <button
                key={design.id}
                onClick={() => state.setSelectedDesignProjectId(design.id)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  selected ? "border-amber-500/40 bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.08)]" : "border-white/10 bg-[#0d131c] hover:bg-white/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <DesignThumb src={state.getDesignDisplayImage(design)} alt={design.name} className="h-14 w-14 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-100">{design.name}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{design.collection}</div>
                    {variantCount ? (
                      <div className="mt-2 text-[11px] text-amber-300">{variantCount} active variant records</div>
                    ) : design.supportedRealmVariants.length ? (
                      <div className="mt-2 text-[11px] text-amber-300">{design.supportedRealmVariants.length} planned realms</div>
                    ) : null}
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${pillClass(design.status)}`}>{design.status}</span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px] text-slate-400">
                  <MiniMetric label="STLs" value={stlCount} />
                  <MiniMetric label="Specs" value={conceptCount} />
                  <MiniMetric label="Variants" value={variantCount} />
                  <MiniMetric label="Jobs" value={orderCount} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}

function DesignWorkspace({ state, design }: { state: ForgekeeperState; design: DesignProject }) {
  const primaryStl = state.designStls.find((stl) => stl.isPrimary);
  const latestConcept = state.designConcepts[0];
  const productPackets = state.intakePackets.filter((packet) => packet.productId === design.id);
  const inventory = inventoryState(design.available, design.reorderPoint);
  const costGuide = state.getDesignCostGuide(design);

  return (
    <div className="space-y-6">
      <Card
        title="Design Project"
        right={<span className={`rounded-full border px-3 py-1 text-xs ${pillClass(design.status)}`}>{design.status}</span>}
      >
        <div className="grid gap-5 xl:grid-cols-[320px,1fr,360px]">
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-3">
            <DesignImagePanel design={design} imageSrc={state.getDesignDisplayImage(design)} />
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-amber-400">{design.line}</div>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-3xl font-semibold text-slate-100">{design.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{design.category} · {design.collection}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(inventory)}`}>{inventory}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{design.tier}</span>
              </div>
            </div>

            <RealmVariantStrip variants={design.supportedRealmVariants} />

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile label="Price" value={money(design.targetPrice)} />
              <SummaryTile label="Est. Cost" value={money(costGuide.total)} />
              <SummaryTile label="Suggested" value={money(costGuide.suggestedPrice)} />
              <SummaryTile label="Print Hours" value={`${design.estimatedPrintHours.toFixed(1)}h`} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Connected Assets</div>
            <div className="mt-4 space-y-3 text-sm">
              <AssetLine label="Primary STL" value={primaryStl?.name || "None assigned"} />
              <AssetLine label="STL File" value={primaryStl?.filePath || primaryStl?.fileName || "No STL file path"} />
              <AssetLine label="Latest Concept" value={latestConcept?.title || "No concept spec"} />
              <AssetLine label="Foundry Packets" value={`${productPackets.length} retained`} />
              <AssetLine label="Variants" value={`${state.designVariants.length} configured`} />
              <AssetLine label="Release" value={state.designRelease?.name || "Unassigned"} />
              <AssetLine label="Material Cost" value={money(costGuide.material)} />
              <AssetLine label="Electricity Cost" value={money(costGuide.electricity)} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {designTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => state.setDesignTab(tab)}
              className={`rounded-xl border px-4 py-2 text-sm transition ${
                state.designTab === tab ? "border-amber-500/35 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {tab === "concepts" ? "Concept Specs" : tab === "stls" ? "STL Files" : tab === "packets" ? "Foundry Packets" : tab === "variants" ? "Variants" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </Card>

      {state.designTab === "overview" && <DesignEditor state={state} />}
      {state.designTab === "stls" && <StlPanel state={state} />}
      {state.designTab === "concepts" && <ConceptPanel state={state} />}
      {state.designTab === "packets" && <FoundryPacketsPanel state={state} design={design} />}
      {state.designTab === "variants" && <VariantPanel state={state} />}
      {state.designTab === "jobs" && <DesignJobsPanel state={state} />}
    </div>
  );
}

function FoundryPacketsPanel({ state, design }: { state: ForgekeeperState; design: DesignProject }) {
  const packets = state.intakePackets
    .filter((packet) => packet.productId === design.id)
    .sort((a, b) => Date.parse(b.importedAt) - Date.parse(a.importedAt));

  return (
    <Card title="Foundry Packet History">
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
        Every promoted product keeps its complete `.forgepack` history. Concept sheets, models, diagnostics, reviews, gates, and next actions remain attached to the stable Design Library record.
      </div>
      {packets.length === 0 ? (
        <Empty text="No Foundry packets are linked to this design." />
      ) : (
        <div className="space-y-4">
          {packets.map((packet) => (
            <div key={packet.packetId} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{packet.packetId}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {packet.stage} · {packet.conceptRevision} · imported {new Date(packet.importedAt).toLocaleString()}
                  </div>
                </div>
                <Button onClick={() => state.openManagedAsset(packet.assetRoot)}>Open Packet Folder</Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <StatusRow label="Canon" value={packet.canonGate.status} status={packet.canonGate.status} />
                <StatusRow label="Forgeability" value={packet.forgeability.status} status={packet.forgeability.status} />
                <StatusRow label="Physical Trial" value={packet.pipeline.physicalTestStatus} status={packet.pipeline.physicalTestStatus} />
              </div>

              {packet.product?.purpose && <div className="mt-4 text-sm text-slate-300">{packet.product.purpose}</div>}
              {packet.product?.measurements && <div className="mt-2 whitespace-pre-wrap text-sm text-slate-400"><span className="text-slate-200">Measurements:</span> {packet.product.measurements}</div>}
              {packet.pipeline.nextAction && <div className="mt-2 whitespace-pre-wrap text-sm text-slate-400"><span className="text-slate-200">Next action:</span> {packet.pipeline.nextAction}</div>}
              {packet.pipeline.blockedBy.length > 0 && <div className="mt-2 text-sm text-rose-300">Blocked by: {packet.pipeline.blockedBy.join("; ")}</div>}

              <div className="mt-4 grid gap-2 lg:grid-cols-2">
                {packet.assets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-200">{asset.label}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{asset.kind} · {asset.version}</div>
                    </div>
                    <Button className="shrink-0" onClick={() => state.openManagedAsset(asset.importedPath)}>Open</Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DesignEditor({ state }: { state: ForgekeeperState }) {
  const design = state.selectedDesignProject;
  if (!design) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr,360px]">
      <Card title="Identity & Classification">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Design Name">
            <Input value={design.name} onChange={(e) => state.updateDesign(design.id, { name: e.target.value })} />
          </Field>
          <Field label="Category">
            <Input value={design.category} onChange={(e) => state.updateDesign(design.id, { category: e.target.value })} />
          </Field>
          <Field label="Tier">
            <Select value={design.tier} onChange={(e) => state.updateDesign(design.id, { tier: e.target.value as DesignTier })}>
              <option value="Hero">Hero</option>
              <option value="Utility">Utility</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={design.status} onChange={(e) => state.updateDesign(design.id, { status: e.target.value as DesignStatus })}>
              <option value="Concept">Concept</option>
              <option value="Prototype">Prototype</option>
              <option value="Active">Active</option>
              <option value="Production">Production</option>
              <option value="Archived">Archived</option>
            </Select>
          </Field>
          <Field label="Design Line">
            <Select value={design.line} onChange={(e) => state.updateDesign(design.id, { line: e.target.value as DesignLine })}>
              <option value="ForgeTech">ForgeTech</option>
              <option value="Foundry">Foundry</option>
              <option value="Relics of the Nine Realms">Relics of the Nine Realms</option>
              <option value="Runehallow Relics">Runehallow Relics</option>
            </Select>
          </Field>
          <Field label="Collection">
            <Select value={design.collection} onChange={(e) => state.updateDesign(design.id, { collection: e.target.value })}>
              <option value="Unassigned">Unassigned</option>
              {state.collections.map((collection) => (
                <option key={collection.id} value={collection.name}>{collection.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Design Image Path" className="md:col-span-2">
            <Input value={design.designImagePath} onChange={(e) => state.updateDesign(design.id, { designImagePath: e.target.value })} placeholder="/assets/products/design-image.png" />
          </Field>
          <Field label="Concept Image Path" className="md:col-span-2">
            <Input value={design.conceptImagePath} onChange={(e) => state.updateDesign(design.id, { conceptImagePath: e.target.value })} placeholder="/assets/concepts/design-concept.png" />
          </Field>
        </div>
      </Card>

      <Card title="Production Snapshot">
        <div className="space-y-3">
          <StatusRow label="Inventory" value={`${design.available}`} status={inventoryState(design.available, design.reorderPoint)} />
          <StatusRow label="STL Files" value={`${state.designStls.length}`} />
          <StatusRow label="Concept Specs" value={`${state.designConcepts.length}`} />
          <StatusRow label="Realm Variants" value={`${state.designVariants.length}`} />
          <StatusRow label="Linked Production Jobs" value={`${state.designJobs.length}`} />
        </div>
      </Card>

      <Card title="Realm Variant Planning">
        <div className="mb-3 text-sm text-slate-400">
          Hero designs can carry realm variants. Utility designs can stay blank unless you want variants later.
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {realmOptions.map((realm) => {
            const active = design.supportedRealmVariants.includes(realm);
            return (
              <button
                key={realm}
                onClick={() => {
                  const next = active
                    ? design.supportedRealmVariants.filter((item) => item !== realm)
                    : [...design.supportedRealmVariants, realm];
                  state.updateDesign(design.id, { supportedRealmVariants: next });
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${active ? "border-amber-500/35 bg-amber-500/10 text-amber-100" : "border-white/10 bg-[#0d131c] text-slate-400 hover:bg-white/5"}`}
              >
                {realm}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Smart Cost Guide">
        <div className="space-y-3">
          <StatusRow label="Estimated Cost" value={money(state.getDesignCostGuide(design).total)} />
          <StatusRow label="Suggested Price" value={money(state.getDesignCostGuide(design).suggestedPrice)} />
          <StatusRow label="Material" value={money(state.getDesignCostGuide(design).material)} />
          <StatusRow label="Electricity" value={money(state.getDesignCostGuide(design).electricity)} />
        </div>
      </Card>

      <Card title="Pricing & Production" className="xl:col-span-2">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Target Price">
            <Input type="number" min={0} step="0.01" value={design.targetPrice} onChange={(e) => state.updateDesign(design.id, { targetPrice: Number(e.target.value) })} />
          </Field>
          <Field label="Inventory On Hand">
            <Input type="number" min={0} value={design.available} onChange={(e) => state.updateDesign(design.id, { available: Number(e.target.value) })} />
          </Field>
          <Field label="Reorder Point">
            <Input type="number" min={0} value={design.reorderPoint} onChange={(e) => state.updateDesign(design.id, { reorderPoint: Number(e.target.value) })} />
          </Field>
          <Field label="Estimated Print Hours">
            <Input type="number" min={0} step="0.1" value={design.estimatedPrintHours} onChange={(e) => state.updateDesign(design.id, { estimatedPrintHours: Number(e.target.value) })} />
          </Field>
          <Field label="Estimated Filament Grams">
            <Input type="number" min={0} value={design.estimatedFilamentGrams} onChange={(e) => state.updateDesign(design.id, { estimatedFilamentGrams: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="Design Notes" className="xl:col-span-2">
        <Textarea
          value={design.notes}
          onChange={(e) => state.updateDesign(design.id, { notes: e.target.value })}
          placeholder="Design notes, print notes, finish instructions, listing ideas, or reminders..."
          className="min-h-[130px] w-full"
        />
      </Card>

      <Card title="Danger Zone" className="border-rose-500/25 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-rose-200">Delete this design</div>
            <div className="mt-1 text-sm text-slate-400">This also removes linked STL records, concept specs, production jobs, and release links.</div>
          </div>
          <Button variant="danger" onClick={() => state.removeDesign(design.id)}>Delete Design</Button>
        </div>
      </Card>
    </div>
  );
}

function StlPanel({ state }: { state: ForgekeeperState }) {
  return (
    <Card
      title="STL File Records"
      right={
        <div className="flex flex-wrap gap-2">
          <Input
            value={state.newStlName}
            onChange={(e) => state.setNewStlName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") state.addStl();
            }}
            placeholder="STL name"
            className="w-64"
          />
          <Button onClick={state.addStl}>Add STL</Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
        Use this section for printable files. Link the STL path, assign the preferred printer/slicer, and keep version notes tied to the design.
      </div>

      <div className="space-y-4">
        {state.designStls.length === 0 ? (
          <Empty text="No STL records yet." />
        ) : (
          state.designStls.map((stl) => (
            <div key={stl.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{stl.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{stl.filePath || stl.fileName || "No file path"} · {stl.version || "No version"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stl.isPrimary ? <span className="rounded-full border border-amber-500/25 bg-amber-500/15 px-3 py-1 text-xs text-amber-100">Primary</span> : null}
                  <Button variant="ghost" onClick={() => state.markPrimaryStl(stl.id)}>Mark Primary</Button>
                  <Button variant="danger" onClick={() => state.removeStl(stl.id)}>Remove</Button>
                </div>
              </div>

              <div className="mb-4">
                <AssetLaunchpad
                  stlPath={stl.filePath || stl.fileName}
                  folderPath={stl.folderPath || stl.libraryPath}
                  printerName={state.printers.find((printer) => printer.id === stl.defaultPrinterId)?.name}
                  slicer={stl.defaultSlicer || state.getPreferredSlicerForStl(stl)}
                  settings={state.settings}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Display Name">
                  <Input value={stl.name} onChange={(e) => state.updateStl(stl.id, { name: e.target.value })} />
                </Field>
                <Field label="File Name">
                  <Input value={stl.fileName} onChange={(e) => state.updateStl(stl.id, { fileName: e.target.value })} placeholder="design-v001.stl" />
                </Field>
                <Field label="Version">
                  <Input value={stl.version} onChange={(e) => state.updateStl(stl.id, { version: e.target.value })} placeholder="v001" />
                </Field>
                <Field label="Full STL Path" className="md:col-span-2">
                  <Input value={stl.filePath || ""} onChange={(e) => state.linkStlPath(stl.id, e.target.value)} placeholder="C:\ForgekeeperLibrary\STLs\DesignProject\v001\part.stl" />
                </Field>
                <Field label="Asset Status">
                  <Select value={stl.assetStatus || "Planned"} onChange={(e) => state.updateStl(stl.id, { assetStatus: e.target.value as AssetStatus })}>
                    <option value="Planned">Planned</option>
                    <option value="Linked">Linked</option>
                    <option value="Needs Update">Needs Update</option>
                    <option value="Archived">Archived</option>
                  </Select>
                </Field>
                <Field label="Library Folder" className="md:col-span-2">
                  <Input value={stl.folderPath || stl.libraryPath || ""} onChange={(e) => state.updateStl(stl.id, { folderPath: e.target.value, libraryPath: e.target.value })} placeholder="C:\ForgekeeperLibrary\STLs\DesignProject\v001" />
                </Field>
                <Field label="Suggested Folder">
                  <Button variant="ghost" onClick={() => state.setStlSuggestedFolder(stl.id)}>Use Library Path</Button>
                </Field>
                <Field label="Default Printer">
                  <Select value={stl.defaultPrinterId || ""} onChange={(e) => state.updateStl(stl.id, { defaultPrinterId: e.target.value || undefined, defaultSlicer: state.getDefaultSlicerForPrinter(state.printers.find((printer) => printer.id === e.target.value)?.name) })}>
                    <option value="">No printer route</option>
                    {state.printers.map((printer) => (
                      <option key={printer.id} value={printer.id}>{printer.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default Slicer">
                  <Select value={stl.defaultSlicer || state.getPreferredSlicerForStl(stl)} onChange={(e) => state.updateStl(stl.id, { defaultSlicer: e.target.value as SlicerKey })}>
                    <option value="orca">OrcaSlicer</option>
                    <option value="anycubic">Anycubic Slicer Next</option>
                  </Select>
                </Field>
                <Field label="Linked Concept">
                  <Select value={stl.linkedConceptId || ""} onChange={(e) => state.updateStl(stl.id, { linkedConceptId: e.target.value || undefined })}>
                    <option value="">No linked concept</option>
                    {state.designConcepts.map((concept) => (
                      <option key={concept.id} value={concept.id}>{concept.title}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Launch Actions" className="md:col-span-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => state.openStlAsset(stl.id, "file")}>Open STL</Button>
                    <Button variant="ghost" onClick={() => state.openStlAsset(stl.id, "folder")}>Open Folder</Button>
                    <Button variant="ghost" onClick={() => state.openStlAsset(stl.id, "slicer")}>Open Preferred Slicer</Button>
                    <Button variant="ghost" onClick={() => state.openStlAsset(stl.id, "blender")}>Open Blender</Button>
                    <Button onClick={() => state.openExternalTool("meshy")}>Open Meshy.ai</Button>
                  </div>
                </Field>
                <Field label="STL Notes" className="md:col-span-3">
                  <Textarea value={stl.notes} onChange={(e) => state.updateStl(stl.id, { notes: e.target.value })} placeholder="Print orientation, supports, slicer notes, repair notes..." className="min-h-[90px] w-full" />
                </Field>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ConceptPanel({ state }: { state: ForgekeeperState }) {
  return (
    <Card
      title="Concept Specs"
      right={
        <div className="flex flex-wrap gap-2">
          <Input
            value={state.newConceptTitle}
            onChange={(e) => state.setNewConceptTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") state.addConcept();
            }}
            placeholder="Concept title"
            className="w-64"
          />
          <Button onClick={state.addConcept}>Add Concept</Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
        Concept Specs are the design intelligence layer: image reference, measurements, listing content, design notes, and associated STL.
      </div>

      <div className="space-y-4">
        {state.designConcepts.length === 0 ? (
          <Empty text="No concept specs yet." />
        ) : (
          state.designConcepts.map((concept) => (
            <div key={concept.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{concept.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{concept.imageName || "No image path"}</div>
                </div>
                <Button variant="danger" onClick={() => state.removeConcept(concept.id)}>Remove Concept</Button>
              </div>

              <div className="mb-4 grid gap-4 xl:grid-cols-[260px,1fr]">
                <DesignImagePanel design={state.selectedDesignProject} imageSrc={concept.imagePath || concept.imageName || state.selectedDesignProject?.conceptImagePath || ""} label="Concept Art" />
                <div className="rounded-2xl border border-white/10 bg-[#111722] p-4 text-sm text-slate-400">
                  Use Concept Specs for measurements, listing content, visual identity, variant notes, and STL association. This is the design intelligence layer.
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Concept Title">
                  <Input value={concept.title} onChange={(e) => state.updateConcept(concept.id, { title: e.target.value })} />
                </Field>
                <Field label="Image Name">
                  <Input value={concept.imageName} onChange={(e) => state.updateConcept(concept.id, { imageName: e.target.value })} placeholder="design-front.png" />
                </Field>
                <Field label="Concept Image Path">
                  <Input value={concept.imagePath || ""} onChange={(e) => state.updateConcept(concept.id, { imagePath: e.target.value })} placeholder="C:\ForgekeeperLibrary\Concepts\DesignProject\concept-art\front.png" />
                </Field>
                <Field label="Measurement Image Path">
                  <Input value={concept.measurementImagePath || ""} onChange={(e) => state.updateConcept(concept.id, { measurementImagePath: e.target.value })} placeholder="C:\ForgekeeperLibrary\Concepts\DesignProject\measurements\dims.png" />
                </Field>
                <Field label="Reference Folder">
                  <Input value={concept.referenceFolderPath || ""} onChange={(e) => state.updateConcept(concept.id, { referenceFolderPath: e.target.value })} placeholder="C:\ForgekeeperLibrary\Concepts\DesignProject\reference" />
                </Field>
                <Field label="Measurements">
                  <Textarea value={concept.measurements} onChange={(e) => state.updateConcept(concept.id, { measurements: e.target.value })} placeholder="Width, height, depth, tolerances, insert sizes..." className="min-h-[100px] w-full" />
                </Field>
                <Field label="Design Details">
                  <Textarea value={concept.description} onChange={(e) => state.updateConcept(concept.id, { description: e.target.value })} placeholder="Features, design intent, engineering notes, and production context..." className="min-h-[100px] w-full" />
                </Field>
                <Field label="Primary Associated STL" className="lg:col-span-2">
                  <Select value={concept.linkedStlId || ""} onChange={(e) => state.updateConcept(concept.id, { linkedStlId: e.target.value || undefined, linkedStlIds: e.target.value ? Array.from(new Set([...(concept.linkedStlIds || []), e.target.value])) : concept.linkedStlIds })}>
                    <option value="">No linked STL</option>
                    {state.designStls.map((stl) => (
                      <option key={stl.id} value={stl.id}>{stl.name} · {stl.version}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Internal Notes" className="lg:col-span-2">
                  <Textarea value={concept.notes} onChange={(e) => state.updateConcept(concept.id, { notes: e.target.value })} placeholder="Finish notes, design changes, print recommendations, paint ideas..." className="min-h-[100px] w-full" />
                </Field>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function VariantPanel({ state }: { state: ForgekeeperState }) {
  const design = state.selectedDesignProject;
  if (!design) return null;

  const unusedRealms = realmOptions.filter((realm) => !state.designVariants.some((variant) => variant.realm === realm));

  return (
    <Card
      title="Realm Variant System"
      right={
        <div className="flex flex-wrap gap-2">
          {unusedRealms.slice(0, 3).map((realm) => (
            <Button key={realm} variant="ghost" onClick={() => state.addVariant(realm)}>Add {realm}</Button>
          ))}
          <Button onClick={() => state.addVariant(unusedRealms[0] || "Midgard")}>Add Variant</Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
        Variants are the bridge between realm theming and production. Use them for realm-specific images, concept art, STL association, filament choice, price modifiers, and print overrides.
      </div>

      {state.designVariants.length === 0 ? (
        <Empty text="No variant records yet. Add a realm variant to connect alternate art, STL notes, and pricing adjustments." />
      ) : (
        <div className="space-y-4">
          {state.designVariants.map((variant) => (
            <VariantCard key={variant.id} state={state} variant={variant} />
          ))}
        </div>
      )}
    </Card>
  );
}

function VariantCard({ state, variant }: { state: ForgekeeperState; variant: DesignVariant }) {
  const design = state.designProjects.find((item) => item.id === variant.designProjectId);
  const basePrice = design?.targetPrice ?? 0;
  const finalPrice = basePrice + variant.priceModifier;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <DesignThumb src={state.getVariantDisplayImage(variant)} alt={variant.name} className="h-16 w-16 shrink-0" />
          <div>
            <div className="font-semibold text-slate-100">{variant.name}</div>
            <div className="mt-1 text-sm text-slate-500">{variant.realm} · {variant.isActive ? "Active" : "Inactive"} · {money(finalPrice)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => state.updateVariant(variant.id, { isActive: !variant.isActive })}>{variant.isActive ? "Disable" : "Enable"}</Button>
          <Button variant="danger" onClick={() => state.removeVariant(variant.id)}>Remove</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px,1fr]">
        <DesignImagePanel design={design} imageSrc={state.getVariantDisplayImage(variant)} label={`${variant.realm} Preview`} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Variant Name">
            <Input value={variant.name} onChange={(e) => state.updateVariant(variant.id, { name: e.target.value })} />
          </Field>
          <Field label="Realm">
            <Select value={variant.realm} onChange={(e) => state.updateVariant(variant.id, { realm: e.target.value as RealmVariant })}>
              {realmOptions.map((realm) => <option key={realm} value={realm}>{realm}</option>)}
            </Select>
          </Field>
          <Field label="Design Image Path">
            <Input value={variant.designImagePath} onChange={(e) => state.updateVariant(variant.id, { designImagePath: e.target.value })} placeholder="/assets/products/variant.png" />
          </Field>
          <Field label="Concept Image Path">
            <Input value={variant.conceptImagePath} onChange={(e) => state.updateVariant(variant.id, { conceptImagePath: e.target.value })} placeholder="/assets/concepts/variant-concept.png" />
          </Field>
          <Field label="Associated STL">
            <Select value={variant.stlId || ""} onChange={(e) => state.updateVariant(variant.id, { stlId: e.target.value || undefined })}>
              <option value="">No STL selected</option>
              {state.designStls.map((stl) => <option key={stl.id} value={stl.id}>{stl.name} · {stl.version}</option>)}
            </Select>
          </Field>
          <Field label="Associated Concept">
            <Select value={variant.conceptId || ""} onChange={(e) => state.updateVariant(variant.id, { conceptId: e.target.value || undefined })}>
              <option value="">No concept selected</option>
              {state.designConcepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.title}</option>)}
            </Select>
          </Field>
          <Field label="Recommended Filament">
            <Select value={variant.filamentId || ""} onChange={(e) => state.updateVariant(variant.id, { filamentId: e.target.value || undefined })}>
              <option value="">No filament selected</option>
              {state.filament.map((item) => <option key={item.id} value={item.id}>{item.colorName} · {item.material}</option>)}
            </Select>
          </Field>
          <Field label="Price Modifier">
            <Input type="number" step="0.01" value={variant.priceModifier} onChange={(e) => state.updateVariant(variant.id, { priceModifier: Number(e.target.value) })} />
          </Field>
          <Field label="Override Filament Grams">
            <Input type="number" min={0} value={variant.estimatedFilamentGrams ?? ""} onChange={(e) => state.updateVariant(variant.id, { estimatedFilamentGrams: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="Override Print Hours">
            <Input type="number" min={0} step="0.1" value={variant.estimatedPrintHours ?? ""} onChange={(e) => state.updateVariant(variant.id, { estimatedPrintHours: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="Variant Notes" className="md:col-span-2">
            <Textarea value={variant.notes} onChange={(e) => state.updateVariant(variant.id, { notes: e.target.value })} placeholder="Realm-specific finish, material, STL, paint, listing, and production notes..." className="min-h-[100px] w-full" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function DesignJobsPanel({ state }: { state: ForgekeeperState }) {
  return (
    <Card
      title="Production Jobs for Selected Design"
      right={
        <div className="flex flex-wrap gap-2">
          <Input
            value={state.newJobName}
            onChange={(e) => state.setNewJobName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") state.addProductionJob();
            }}
            placeholder="Job name"
            className="w-56"
          />
          <Button onClick={state.addProductionJob}>Add Production Job</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {state.designJobs.length === 0 ? (
          <Empty text="No production jobs for this design yet." />
        ) : (
          state.designJobs.map((job) => (
            <div key={job.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{job.name}</div>
                  <div className="mt-1 text-sm text-slate-400">Estimated cost {money(state.getCostBreakdownForJob(job).total)}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(job.status)}`}>{job.status}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Field label="Status">
                  <Select value={job.status} onChange={(e) => state.updateProductionJob(job.id, { status: e.target.value as ProductionStatus })}>
                    <option value="Queued">Queued</option>
                    <option value="Printing">Printing</option>
                    <option value="Finishing">Finishing</option>
                    <option value="Complete">Complete</option>
                    <option value="Cancelled">Cancelled</option>
                  </Select>
                </Field>
                <Field label="Printer">
                  <Select value={job.printerId || ""} onChange={(e) => state.updateProductionJob(job.id, { printerId: e.target.value || undefined })}>
                    <option value="">Unassigned printer</option>
                    {state.printers.map((printer) => (
                      <option key={printer.id} value={printer.id}>{printer.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Filament">
                  <Select value={job.filamentId || ""} onChange={(e) => state.updateProductionJob(job.id, { filamentId: e.target.value || undefined })}>
                    <option value="">No filament selected</option>
                    {state.filament.map((item) => (
                      <option key={item.id} value={item.id}>{item.colorName} · {item.material}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantity">
                  <Input type="number" min={1} value={job.quantity} onChange={(e) => state.updateProductionJob(job.id, { quantity: Number(e.target.value) })} />
                </Field>
                <Field label="Grams / Unit">
                  <Input type="number" min={0} value={job.materialGrams ?? state.selectedDesignProject?.estimatedFilamentGrams ?? 0} onChange={(e) => state.updateProductionJob(job.id, { materialGrams: Number(e.target.value) })} />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => state.removeProductionJob(job.id)}>Remove Production Job</Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}


function DesignThumb({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-white/10 bg-black/30 text-[10px] uppercase tracking-wide text-slate-600 ${className}`}>
        No Image
      </div>
    );
  }
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-black/30 ${className}`}>
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    </div>
  );
}

function DesignImagePanel({ design, imageSrc, label = "Design Image" }: { design?: DesignProject; imageSrc?: string; label?: string }) {
  return (
    <div className="space-y-3">
      <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {imageSrc ? (
          <img src={imageSrc} alt={design?.name || label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.18em] text-slate-600">No Image</div>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <div className="mt-1 truncate text-sm text-slate-300">{design?.name || "Unassigned"}</div>
      </div>
    </div>
  );
}

function RealmVariantStrip({ variants }: { variants: RealmVariant[] }) {
  if (!variants.length) {
    return <div className="mt-4 text-sm text-slate-500">No realm variants assigned.</div>;
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {variants.map((realm) => (
        <span key={realm} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
          {realm}
        </span>
      ))}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">{text}</div>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111722] px-2 py-2">
      <div className="font-semibold text-slate-100">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function AssetLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[190px] text-right text-slate-200">{value}</span>
    </div>
  );
}

function StatusRow({ label, value, status }: { label: string; value: string; status?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0d131c] px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={status ? `rounded-full border px-3 py-1 text-xs ${pillClass(status)}` : "font-semibold text-slate-100"}>{status || value}</span>
    </div>
  );
}
