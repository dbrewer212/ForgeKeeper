import type { ChangeEvent, ReactNode } from "react";
import { AssetLaunchpad } from "../../components/assets/AssetLaunchpad";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { money } from "../../lib/format";
import { inventoryState, pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { DepositStatus, DesignPackage, DesignPackageStatus, OrderStatus, OrderType, Product, ProductLine, ProductStatus, ProductTab, ProductPillar, ProductVariant, ProductVisibility, RealmVariant } from "../../types/domain";

const productTabs: ProductTab[] = ["overview", "stls", "concepts", "variants", "orders"];
const realmOptions: RealmVariant[] = ["Midgard", "Alfheim", "Svartalfheim", "Vanaheim", "Asgard", "Jotunheim", "Muspelheim", "Niflheim", "Helheim"];
const visibilityOptions: ProductVisibility[] = ["Internal", "Concept", "Preorder", "Available", "Commission Available", "Archived"];
const designPackageStatuses: DesignPackageStatus[] = ["Planning", "Concept Ready", "Modeling", "STL Ready", "Print Tested", "Catalog Ready", "Archived"];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleImageUpload(event: ChangeEvent<HTMLInputElement>, onLoad: (dataUrl: string, file: File) => void) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const dataUrl = await readFileAsDataUrl(file);
    onLoad(dataUrl, file);
  } catch (error) {
    console.error("ForgeKeeper image upload failed", error);
    window.alert("ForgeKeeper could not read that image file.");
  }
}

function handleStlUpload(event: ChangeEvent<HTMLInputElement>, onLoad: (file: File) => void) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  onLoad(file);
}

export function CatalogView({ state }: { state: ForgekeeperState }) {
  const product = state.selectedProduct;

  return (
    <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
      <CatalogRail state={state} />

      {!product ? (
        <Card title="Product Command Center">
          <Empty text="No product selected. Add or select a product to begin." />
        </Card>
      ) : (
        <ProductWorkspace state={state} product={product} />
      )}
    </div>
  );
}

function CatalogRail({ state }: { state: ForgekeeperState }) {
  return (
    <Card
      title="Catalog"
      right={
        <div className="flex gap-2">
          <Input
            autoFocus={state.quickAction === "newProduct"}
            value={state.newProductName}
            onChange={(e) => state.setNewProductName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") state.addProduct();
            }}
            placeholder="New product"
            className="w-40"
          />
          <Button onClick={state.addProduct}>Add</Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#0d131c] p-3 text-xs text-slate-400">
        Catalog is the product source of truth. Orders, releases, STL records, and concept specs all connect back here.
      </div>

      <div className="space-y-3">
        {state.filteredProducts.length === 0 ? (
          <Empty text="No products match the current search." />
        ) : (
          state.filteredProducts.map((product) => {
            const stlCount = state.stls.filter((stl) => stl.productId === product.id).length;
            const conceptCount = state.concepts.filter((concept) => concept.productId === product.id).length;
            const orderCount = state.orders.filter((order) => order.productId === product.id).length;
            const variantCount = state.variants.filter((variant) => variant.productId === product.id).length;
            const selected = state.selectedProductId === product.id;

            return (
              <button
                key={product.id}
                onClick={() => state.setSelectedProductId(product.id)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  selected ? "border-amber-500/40 bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.08)]" : "border-white/10 bg-[#0d131c] hover:bg-white/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <ProductThumb src={state.getProductDisplayImage(product)} alt={product.name} className="h-14 w-14 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-100">{product.name}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{product.collection} · {product.visibility}</div>
                    {variantCount ? (
                      <div className="mt-2 text-[11px] text-amber-300">{variantCount} active variant records</div>
                    ) : (product.supportedRealmVariants?.length ?? 0) ? (
                      <div className="mt-2 text-[11px] text-amber-300">{product.supportedRealmVariants?.length ?? 0} planned realms</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${pillClass(product.status)}`}>{product.status}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] ${pillClass(product.visibility)}`}>{product.visibility}</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px] text-slate-400">
                  <MiniMetric label="STLs" value={stlCount} />
                  <MiniMetric label="Specs" value={conceptCount} />
                  <MiniMetric label="Variants" value={variantCount} />
                  <MiniMetric label="Orders" value={orderCount} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}

function ProductWorkspace({ state, product }: { state: ForgekeeperState; product: Product }) {
  const primaryStl = state.productStls.find((stl) => stl.isPrimary);
  const latestConcept = state.productConcepts[0];
  const inventory = inventoryState(product.available, product.reorderPoint);
  const costGuide = state.getProductCostGuide(product);

  return (
    <div className="space-y-6">
      <Card
        title="Product Command Center"
        right={
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(product.status)}`}>{product.status}</span>
            <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(product.visibility)}`}>{product.visibility}</span>
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[320px,1fr,360px]">
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-3">
            <ProductImagePanel product={product} imageSrc={state.getProductDisplayImage(product)} />
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-amber-400">{product.line}</div>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-3xl font-semibold text-slate-100">{product.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{product.category} · {product.collection}</p>
                <p className="mt-1 text-xs text-amber-300/80">Package: {state.selectedDesignPackage?.name || "Unassigned"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(inventory)}`}>{inventory}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{product.tier}</span>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(product.visibility)}`}>{product.visibility}</span>
              </div>
            </div>

            <RealmVariantStrip variants={product.supportedRealmVariants} />

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile label="Price" value={money(product.targetPrice)} />
              <SummaryTile label="Est. Cost" value={money(costGuide.total)} />
              <SummaryTile label="Suggested" value={money(costGuide.suggestedPrice)} />
              <SummaryTile label="Margin" value={`${costGuide.marginPercent.toFixed(1)}%`} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Connected Assets</div>
            <div className="mt-4 space-y-3 text-sm">
              <AssetLine label="Design Package" value={state.selectedDesignPackage?.name || "Unassigned"} />
              <AssetLine label="Package Family" value={state.selectedDesignPackage?.family || "No package family"} />
              <AssetLine label="Primary STL" value={primaryStl?.name || "None assigned"} />
              <AssetLine label="STL File" value={primaryStl?.filePath || primaryStl?.fileName || "No STL file path"} />
              <AssetLine label="Latest Concept" value={latestConcept?.title || "No concept spec"} />
              <AssetLine label="Variants" value={`${state.productVariants.length} configured`} />
              <AssetLine label="Release" value={state.productRelease?.name || "Unassigned"} />
              <AssetLine label="Material Cost" value={money(costGuide.material)} />
              <AssetLine label="Electricity Cost" value={money(costGuide.electricity)} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {productTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => state.setProductTab(tab)}
              className={`rounded-xl border px-4 py-2 text-sm transition ${
                state.productTab === tab ? "border-amber-500/35 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {tab === "concepts" ? "Concept Specs" : tab === "stls" ? "STL Files" : tab === "variants" ? "Variants" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </Card>

      {state.productTab === "overview" && <ProductEditor state={state} />}
      {state.productTab === "stls" && <StlPanel state={state} />}
      {state.productTab === "concepts" && <ConceptPanel state={state} />}
      {state.productTab === "variants" && <VariantPanel state={state} />}
      {state.productTab === "orders" && <ProductOrdersPanel state={state} />}
    </div>
  );
}

function ProductEditor({ state }: { state: ForgekeeperState }) {
  const product = state.selectedProduct;
  if (!product) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr,360px]">
      <Card title="Identity & Classification">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Product Name">
            <Input value={product.name} onChange={(e) => state.updateProduct(product.id, { name: e.target.value })} />
          </Field>
          <Field label="Category">
            <Input value={product.category} onChange={(e) => state.updateProduct(product.id, { category: e.target.value })} />
          </Field>
          <Field label="Pillar">
            <Select value={product.tier} onChange={(e) => state.updateProduct(product.id, { tier: e.target.value as ProductPillar })}>
              <option value="Foundry">Foundry</option>
              <option value="Relics">Relics</option>
              <option value="ForgeTech">ForgeTech</option>
              <option value="Reforged">Reforged</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={product.status} onChange={(e) => state.updateProduct(product.id, { status: e.target.value as ProductStatus })}>
              <option value="Concept">Concept</option>
              <option value="Prototype">Prototype</option>
              <option value="Active">Active</option>
              <option value="Production">Production</option>
              <option value="Archived">Archived</option>
            </Select>
          </Field>
          <Field label="Customer Visibility">
            <Select value={product.visibility} onChange={(e) => state.updateProduct(product.id, { visibility: e.target.value as ProductVisibility })}>
              {visibilityOptions.map((visibility) => (
                <option key={visibility} value={visibility}>{visibility}</option>
              ))}
            </Select>
          </Field>
          <Field label="Product Line">
            <Select value={product.line} onChange={(e) => state.updateProduct(product.id, { line: e.target.value as ProductLine })}>
              <option value="ForgeTech">ForgeTech</option>
              <option value="Foundry">Foundry</option>
              <option value="Relics of the Nine Realms">Relics of the Nine Realms</option>
              <option value="Runehallow Relics">Runehallow Relics</option>
            </Select>
          </Field>
          <Field label="Collection">
            <Select value={product.collection} onChange={(e) => state.updateProduct(product.id, { collection: e.target.value })}>
              <option value="Unassigned">Unassigned</option>
              {state.collections.map((collection) => (
                <option key={collection.id} value={collection.name}>{collection.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Design Package">
            <Select value={product.designPackageId || ""} onChange={(e) => state.updateProduct(product.id, { designPackageId: e.target.value || undefined })}>
              <option value="">Unassigned</option>
              {state.designPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.name} · {pkg.family}</option>
              ))}
            </Select>
            <Button variant="ghost" className="mt-2 h-8 px-3 text-xs" onClick={() => state.addDesignPackage(product)}>
              Create Package From Product
            </Button>
          </Field>
          <Field label="Product Image Path" className="md:col-span-2">
            <Input value={product.productImagePath} onChange={(e) => state.updateProduct(product.id, { productImagePath: e.target.value })} placeholder="/assets/products/product-image.png" />
            <input
              type="file"
              accept="image/*"
              className="mt-2 block w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400/15 file:px-3 file:py-1 file:text-amber-100"
              onChange={(e) => handleImageUpload(e, (dataUrl) => state.updateProduct(product.id, { productImagePath: dataUrl }))}
            />
          </Field>
          <Field label="Concept Image Path" className="md:col-span-2">
            <Input value={product.conceptImagePath} onChange={(e) => state.updateProduct(product.id, { conceptImagePath: e.target.value })} placeholder="/assets/concepts/product-concept.png" />
            <input
              type="file"
              accept="image/*"
              className="mt-2 block w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400/15 file:px-3 file:py-1 file:text-amber-100"
              onChange={(e) => handleImageUpload(e, (dataUrl) => state.updateProduct(product.id, { conceptImagePath: dataUrl }))}
            />
          </Field>
        </div>
      </Card>

      <DesignPackagePanel state={state} product={product} />

      <Card title="Production Snapshot">
        <div className="space-y-3">
          <StatusRow label="Visibility" value={product.visibility} status={product.visibility} />
          <StatusRow label="Inventory" value={`${product.available}`} status={inventoryState(product.available, product.reorderPoint)} />
          <StatusRow label="STL Files" value={`${state.productStls.length}`} />
          <StatusRow label="Concept Specs" value={`${state.productConcepts.length}`} />
          <StatusRow label="Realm Variants" value={`${state.productVariants.length}`} />
          <StatusRow label="Linked Orders" value={`${state.productOrders.length}`} />
        </div>
      </Card>

      <Card title="Realm Variant Planning">
        <div className="mb-3 text-sm text-slate-400">
          Pillar products can carry realm variants when the design supports them. Leave variants blank for simple products until they need them.
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {realmOptions.map((realm) => {
            const active = product.supportedRealmVariants.includes(realm);
            return (
              <button
                key={realm}
                onClick={() => {
                  const next = active
                    ? product.supportedRealmVariants.filter((item) => item !== realm)
                    : [...product.supportedRealmVariants, realm];
                  state.updateProduct(product.id, { supportedRealmVariants: next });
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
          <StatusRow label="Estimated Cost" value={money(state.getProductCostGuide(product).total)} />
          <StatusRow label="Suggested Price" value={money(state.getProductCostGuide(product).suggestedPrice)} />
          <StatusRow label="Material" value={money(state.getProductCostGuide(product).material)} />
          <StatusRow label="Electricity" value={money(state.getProductCostGuide(product).electricity)} />
        </div>
      </Card>

      <Card title="Pricing & Production" className="xl:col-span-2">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Target Price">
            <Input type="number" min={0} step="0.01" value={product.targetPrice} onChange={(e) => state.updateProduct(product.id, { targetPrice: Number(e.target.value) })} />
          </Field>
          <Field label="Inventory On Hand">
            <Input type="number" min={0} value={product.available} onChange={(e) => state.updateProduct(product.id, { available: Number(e.target.value) })} />
          </Field>
          <Field label="Reorder Point">
            <Input type="number" min={0} value={product.reorderPoint} onChange={(e) => state.updateProduct(product.id, { reorderPoint: Number(e.target.value) })} />
          </Field>
          <Field label="Estimated Print Hours">
            <Input type="number" min={0} step="0.1" value={product.estimatedPrintHours} onChange={(e) => state.updateProduct(product.id, { estimatedPrintHours: Number(e.target.value) })} />
          </Field>
          <Field label="Estimated Filament Grams">
            <Input type="number" min={0} value={product.estimatedFilamentGrams} onChange={(e) => state.updateProduct(product.id, { estimatedFilamentGrams: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="Product Notes" className="xl:col-span-2">
        <Textarea
          value={product.notes}
          onChange={(e) => state.updateProduct(product.id, { notes: e.target.value })}
          placeholder="Design notes, print notes, finish instructions, listing ideas, or reminders..."
          className="min-h-[130px] w-full"
        />
      </Card>

      <Card title="Danger Zone" className="border-rose-500/25 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-rose-200">Delete this product</div>
            <div className="mt-1 text-sm text-slate-400">This also removes linked STL records, concept specs, orders, and release links.</div>
          </div>
          <Button variant="danger" onClick={() => state.removeProduct(product.id)}>Delete Product</Button>
        </div>
      </Card>
    </div>
  );
}


function DesignPackagePanel({ state, product }: { state: ForgekeeperState; product: Product }) {
  const pkg = state.selectedDesignPackage;

  if (!pkg) {
    return (
      <Card title="Design Package">
        <div className="rounded-2xl border border-amber-300/15 bg-amber-400/10 p-4 text-sm leading-6 text-slate-300">
          This product is not linked to a design package yet. Create a package to centralize concept sheets, Meshy prompt notes, STL/3MF references, estimated metrics, and catalog assets.
        </div>
        <div className="mt-4">
          <Button onClick={() => state.addDesignPackage(product)}>Create Design Package From Product</Button>
        </div>
      </Card>
    );
  }

  const totalLaborMinutes = pkg.cleanupMinutes + pkg.assemblyMinutes + pkg.paintingMinutes + pkg.packagingMinutes;
  const packageDisplayImage = pkg.catalogDisplayImagePath || pkg.catalogHeroImagePath || "";
  const packageImportId = `package-folder-import-${product.id}`;
  const readiness = getDesignPackageReadiness(pkg, state);

  return (
    <Card
      title="Design Package"
      right={<span className={`rounded-full border px-3 py-1 text-xs ${pillClass(pkg.status)}`}>{pkg.status}</span>}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-100">{pkg.name}</div>
              <div className="mt-1 text-sm text-slate-400">{pkg.packageCode || "No code"} · {pkg.pillar} · {pkg.family}</div>
            </div>
            <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeDesignPackage(pkg.id)}>Remove Package</Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatusRow label="Package Readiness" value={`${readiness.score}%`} status={readiness.score >= 80 ? "Catalog Ready" : readiness.score >= 50 ? "Concept Ready" : "Planning"} />
            <StatusRow label="Package Filament Estimate" value={`${pkg.estimatedFilamentGrams}g`} />
            <StatusRow label="Package Print Estimate" value={`${pkg.estimatedPrintHours}h`} />
            <StatusRow label="Labor Estimate" value={`${totalLaborMinutes} min`} />
            <StatusRow label="Package Display Image" value={packageDisplayImage ? "Linked" : "Missing"} status={packageDisplayImage ? "Catalog Ready" : "Concept Ready"} />
          </div>
        </div>

        <div className="rounded-2xl border border-amber-300/15 bg-amber-400/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-100">Package Folder Import</div>
              <div className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
                Select a prepared package folder to build or refresh package source data. This first pass reads browser-safe file references, detects concepts, package display images, prompt/notes files, STL/3MF assets, and variant image candidates.
              </div>
            </div>
            
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-sm font-semibold text-slate-100">Import Design Package ZIP</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Upload a package ZIP to create the package shell. For full asset parsing, extract the ZIP into the ForgeKeeper Library folder and run folder import on the extracted folder.
            </div>
            <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-300/40">
              Upload Package ZIP
              <input
                id="package-zip-import"
                className="hidden"
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  await state.importDesignPackageZip?.(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

<div className="flex flex-wrap gap-2">
              <input
                id={packageImportId}
                type="file"
                multiple
                // @ts-expect-error webkitdirectory is supported by Chromium/Electron-style browsers and ignored elsewhere.
                webkitdirectory="true"
                className="hidden"
                onChange={(event) => {
                  state.importDesignPackageFolder(event.currentTarget.files, product);
                  event.currentTarget.value = "";
                }}
              />
              <Button variant="ghost" onClick={() => document.getElementById(packageImportId)?.click()}>
                Import Package Folder
              </Button>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-400">
            Recommended folders: concepts, variants, prompts, stl, 3mf, photos, catalog, notes. STLs/3MFs can be added later when Meshy/modeling work is complete.
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Package Readiness Checklist</div>
              <div className="mt-1 text-xs text-slate-500">Checks whether this package has enough structure to support catalog, production, and order workflows.</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${readiness.score >= 80 ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : readiness.score >= 50 ? "border-amber-300/25 bg-amber-400/10 text-amber-200" : "border-rose-300/25 bg-rose-400/10 text-rose-200"}`}>
              {readiness.score}% Ready
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {readiness.items.map((item) => {
              const isOptionalPending = !item.ready && !item.required;
              return (
                <div key={item.label} className={`rounded-xl border px-3 py-2 text-xs ${item.ready ? "border-emerald-300/15 bg-emerald-400/5 text-emerald-100" : isOptionalPending ? "border-sky-300/15 bg-sky-400/5 text-sky-100" : "border-amber-300/15 bg-amber-400/5 text-amber-100"}`}>
                  <div className="font-semibold">{item.ready ? "✓" : isOptionalPending ? "○" : "⚠"} {item.label}</div>
                  <div className="mt-1 text-slate-500">{item.detail}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Package Name">
            <Input value={pkg.name} onChange={(e) => state.updateDesignPackage(pkg.id, { name: e.target.value })} />
          </Field>

          <Field label="Package Code">
            <Input
              value={pkg.packageCode || ""}
              onChange={(e) => state.updateDesignPackage(pkg.id, { packageCode: e.target.value.toUpperCase() })}
              placeholder="FND-GOB-GRI"
            />
          </Field>

          <Field label="Pillar">
            <Select value={pkg.pillar} onChange={(e) => state.updateDesignPackage(pkg.id, { pillar: e.target.value as ProductPillar })}>
              <option value="Foundry">Foundry</option>
              <option value="Relics">Relics</option>
              <option value="ForgeTech">ForgeTech</option>
              <option value="Reforged">Reforged</option>
            </Select>
          </Field>

          <Field label="Family">
            <Select value={pkg.family} onChange={(e) => state.updateDesignPackage(pkg.id, { family: e.target.value })}>
              {state.packageFamilyOptions
                .filter((familyOption) => familyOption.pillar === pkg.pillar)
                .map((familyOption) => (
                  <option key={`${familyOption.pillar}-${familyOption.family}`} value={familyOption.family}>
                    {familyOption.family}
                  </option>
                ))}
              {!state.packageFamilyOptions.some((familyOption) => familyOption.pillar === pkg.pillar && familyOption.family === pkg.family) ? (
                <option value={pkg.family}>{pkg.family}</option>
              ) : null}
            </Select>
            <Input
              className="mt-2"
              value={pkg.family}
              onChange={(e) => state.updateDesignPackage(pkg.id, { family: e.target.value })}
              placeholder="Custom family name"
            />
          </Field>

          <Field label="Package Status">
            <Select value={pkg.status} onChange={(e) => state.updateDesignPackage(pkg.id, { status: e.target.value as DesignPackageStatus })}>
              {designPackageStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
          </Field>

          <Field label="Concept Sheet / Source Image" className="md:col-span-2">
            <Input value={pkg.conceptSheetPath} onChange={(e) => state.updateDesignPackage(pkg.id, { conceptSheetPath: e.target.value })} placeholder="Concept sheet path or uploaded image reference" />
          </Field>

          <Field label="Package Display Image" className="md:col-span-2">
            <Input
              value={packageDisplayImage}
              onChange={(e) =>
                state.updateDesignPackage(pkg.id, {
                  catalogDisplayImagePath: e.target.value,
                  catalogHeroImagePath: e.target.value,
                })
              }
              placeholder="Customer-facing display image for this package"
            />
          </Field>

          <Field label="Reference Folder">
            <Input value={pkg.referenceFolderPath} onChange={(e) => state.updateDesignPackage(pkg.id, { referenceFolderPath: e.target.value })} />
          </Field>
          <Field label="STL / 3MF Folder">
            <Input value={pkg.stlFolderPath} onChange={(e) => state.updateDesignPackage(pkg.id, { stlFolderPath: e.target.value })} />
          </Field>
          <Field label="Photo Folder">
            <Input value={pkg.photoFolderPath} onChange={(e) => state.updateDesignPackage(pkg.id, { photoFolderPath: e.target.value })} />
          </Field>
          <Field label="Estimated Filament Grams">
            <Input type="number" min={0} value={pkg.estimatedFilamentGrams} onChange={(e) => state.updateDesignPackage(pkg.id, { estimatedFilamentGrams: Number(e.target.value) })} />
          </Field>
          <Field label="Estimated Print Hours">
            <Input type="number" min={0} step="0.1" value={pkg.estimatedPrintHours} onChange={(e) => state.updateDesignPackage(pkg.id, { estimatedPrintHours: Number(e.target.value) })} />
          </Field>
          <Field label="Cleanup Minutes">
            <Input type="number" min={0} value={pkg.cleanupMinutes} onChange={(e) => state.updateDesignPackage(pkg.id, { cleanupMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Assembly Minutes">
            <Input type="number" min={0} value={pkg.assemblyMinutes} onChange={(e) => state.updateDesignPackage(pkg.id, { assemblyMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Painting Minutes">
            <Input type="number" min={0} value={pkg.paintingMinutes} onChange={(e) => state.updateDesignPackage(pkg.id, { paintingMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Packaging Minutes">
            <Input type="number" min={0} value={pkg.packagingMinutes} onChange={(e) => state.updateDesignPackage(pkg.id, { packagingMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Meshy Prompt / Generation Notes" className="md:col-span-2">
            <Textarea value={pkg.promptNotes} onChange={(e) => state.updateDesignPackage(pkg.id, { promptNotes: e.target.value })} className="min-h-[96px]" placeholder="Prompt, Meshy settings, generation notes, or revision notes" />
          </Field>
          <Field label="Package Notes" className="md:col-span-2">
            <Textarea value={pkg.notes} onChange={(e) => state.updateDesignPackage(pkg.id, { notes: e.target.value })} className="min-h-[96px]" placeholder="Package planning notes, status notes, or production concerns" />
          </Field>
        </div>
      </div>
    </Card>
  );
}

function getDesignPackageReadiness(pkg: DesignPackage, state: ForgekeeperState) {
  const packageDisplayImage = pkg.catalogDisplayImagePath || pkg.catalogHeroImagePath || "";
  const linkedProducts = state.products.filter((product) => product.designPackageId === pkg.id);
  const linkedProductIds = new Set(linkedProducts.map((product) => product.id));
  const linkedStls = state.stls.filter((stl) => linkedProductIds.has(stl.productId));
  const linkedConcepts = state.concepts.filter((concept) => linkedProductIds.has(concept.productId));
  const linkedVariants = state.variants.filter((variant) => linkedProductIds.has(variant.productId));
  const totalLaborMinutes = pkg.cleanupMinutes + pkg.assemblyMinutes + pkg.paintingMinutes + pkg.packagingMinutes;
  const variantCandidateMatch = pkg.notes.match(/Variant image candidates:\s*(\d+)/i);
  const variantCandidateCount = variantCandidateMatch ? Number(variantCandidateMatch[1]) : 0;
  const hasVariantSource = linkedVariants.length > 0 || variantCandidateCount > 0;
  const hasModelAssets = Boolean(pkg.stlFolderPath || linkedStls.length > 0);
  const hasMetrics = pkg.estimatedFilamentGrams > 0 && pkg.estimatedPrintHours > 0;
  const hasLabor = totalLaborMinutes > 0;
  const statusRank: Record<string, number> = {
    Planning: 0,
    "Concept Ready": 1,
    Modeling: 2,
    "STL Ready": 3,
    "Print Tested": 4,
    "Catalog Ready": 5,
    Archived: 6,
  };
  const rank = statusRank[pkg.status] ?? 0;

  const items = [
    {
      label: "Package code",
      ready: Boolean(pkg.packageCode?.trim()),
      required: true,
      detail: pkg.packageCode?.trim() ? pkg.packageCode : "Add a searchable package code.",
    },
    {
      label: "Pillar and family",
      ready: Boolean(pkg.pillar && pkg.family?.trim()),
      required: true,
      detail: pkg.family?.trim() ? `${pkg.pillar} / ${pkg.family}` : "Choose a pillar and family.",
    },
    {
      label: "Concept source",
      ready: Boolean(pkg.conceptSheetPath || linkedConcepts.length > 0),
      required: rank >= 1,
      detail: pkg.conceptSheetPath ? "Concept/spec sheet linked." : `${linkedConcepts.length} linked concept record(s).`,
    },
    {
      label: "Variant definitions",
      ready: hasVariantSource,
      required: rank >= 1,
      detail: linkedVariants.length > 0 ? `${linkedVariants.length} variant record(s) linked.` : `${variantCandidateCount} variant image candidate(s).`,
    },
    {
      label: "Package display image",
      ready: Boolean(packageDisplayImage),
      required: rank >= 1,
      detail: packageDisplayImage ? "Display image linked." : "Add a customer-facing package display image.",
    },
    {
      label: "Prompt / design notes",
      ready: Boolean(pkg.promptNotes.trim() || pkg.notes.trim()),
      required: rank >= 1,
      detail: pkg.promptNotes.trim() ? "Prompt/generation notes present." : "Add prompt, Meshy notes, or design notes.",
    },
    {
      label: "STL / 3MF assets",
      ready: hasModelAssets,
      required: rank >= 3,
      detail: hasModelAssets ? "STL/3MF assets linked." : rank >= 3 ? "Required for STL Ready or later." : "Not required until STL Ready.",
    },
    {
      label: "Estimated metrics",
      ready: hasMetrics,
      required: rank >= 5,
      detail: hasMetrics ? `${pkg.estimatedFilamentGrams}g / ${pkg.estimatedPrintHours}h` : rank >= 5 ? "Required before Catalog Ready." : "Can be added after model/export estimates exist.",
    },
    {
      label: "Labor profile",
      ready: hasLabor,
      required: rank >= 5,
      detail: hasLabor ? `${totalLaborMinutes} total labor minute(s).` : rank >= 5 ? "Required before final catalog readiness." : "Can be refined later.",
    },
    {
      label: "Catalog description",
      ready: Boolean(pkg.description.trim()),
      required: rank >= 1,
      detail: pkg.description.trim() ? "Description present." : "Add package/customer-facing description.",
    },
  ];

  const requiredItems = items.filter((item) => item.required);
  const readyRequiredCount = requiredItems.filter((item) => item.ready).length;
  const score = requiredItems.length > 0 ? Math.round((readyRequiredCount / requiredItems.length) * 100) : 100;

  return { score, items };
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
        Use this section for printable files. Link the STL path, assign the preferred printer/slicer, and keep version notes tied to the product.
      </div>

      <div className="space-y-4">
        {state.productStls.length === 0 ? (
          <Empty text="No STL records yet." />
        ) : (
          state.productStls.map((stl) => (
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
                  <Input value={stl.fileName} onChange={(e) => state.updateStl(stl.id, { fileName: e.target.value })} placeholder="product-v001.stl" />
                </Field>
                <Field label="Version">
                  <Input value={stl.version} onChange={(e) => state.updateStl(stl.id, { version: e.target.value })} placeholder="v001" />
                </Field>
                <Field label="Browse / Select STL" className="md:col-span-3">
                  <div className="rounded-2xl border border-amber-300/15 bg-amber-400/10 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-amber-300/30 bg-gradient-to-br from-amber-300 via-amber-500 to-orange-700 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-950/30 transition hover:from-amber-200 hover:via-amber-400 hover:to-orange-600">
                        Browse STL / 3MF
                        <input
                          type="file"
                          accept=".stl,.3mf,.obj"
                          className="hidden"
                          onChange={(e) =>
                            handleStlUpload(e, (file) => {
                              const displayName = file.name.replace(/\.(stl|3mf|obj)$/i, "");
                              state.updateStl(stl.id, {
                                name: stl.name || displayName,
                                fileName: file.name,
                                filePath: file.name,
                                assetStatus: "Linked",
                              });
                            })
                          }
                        />
                      </label>

                      <div className="min-w-0 flex-1 text-sm text-slate-300">
                        <div className="font-semibold text-slate-100">
                          {stl.fileName || "No STL selected yet"}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          Selecting a file fills the STL file reference automatically. Full Windows path capture can be upgraded later through Tauri; manual path fields remain available below.
                        </div>
                      </div>
                    </div>
                  </div>
                </Field>
                <Field label="Manual STL Path / Reference" className="md:col-span-2">
                  <Input value={stl.filePath || ""} onChange={(e) => state.linkStlPath(stl.id, e.target.value)} placeholder="Select a file above or paste a path/reference here" />
                </Field>
                <Field label="Asset Status">
                  <Select value={stl.assetStatus || "Planned"} onChange={(e) => state.updateStl(stl.id, { assetStatus: e.target.value as any })}>
                    <option value="Planned">Planned</option>
                    <option value="Linked">Linked</option>
                    <option value="Needs Update">Needs Update</option>
                    <option value="Archived">Archived</option>
                  </Select>
                </Field>
                <Field label="Library Folder / Working Folder" className="md:col-span-2">
                  <Input value={stl.folderPath || stl.libraryPath || ""} onChange={(e) => state.updateStl(stl.id, { folderPath: e.target.value, libraryPath: e.target.value })} placeholder="C:\Dev\Forgekeeper Library\STLs\Product\v001" />
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
                  <Select value={stl.defaultSlicer || state.getPreferredSlicerForStl(stl)} onChange={(e) => state.updateStl(stl.id, { defaultSlicer: e.target.value as any })}>
                    <option value="orca">OrcaSlicer</option>
                    <option value="anycubic">Anycubic Slicer Next</option>
                  </Select>
                </Field>
                <Field label="Linked Concept">
                  <Select value={stl.linkedConceptId || ""} onChange={(e) => state.updateStl(stl.id, { linkedConceptId: e.target.value || undefined })}>
                    <option value="">No linked concept</option>
                    {state.productConcepts.map((concept) => (
                      <option key={concept.id} value={concept.id}>{concept.title}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Launch Actions" className="md:col-span-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => state.copyText(stl.filePath || stl.fileName || "", "STL reference")}>Copy STL Reference</Button>
                    <Button variant="ghost" onClick={() => state.copyText(stl.folderPath || "", "Folder reference")}>Copy Folder Reference</Button>
                    <Button onClick={() => state.openExternalTool("meshy")}>Open Meshy.ai</Button>
                    <Button variant="ghost" disabled title="Native file opening requires the later Tauri shell permissions pass.">Open STL · Tauri Required</Button>
                    <Button variant="ghost" disabled title="Native folder opening requires the later Tauri shell permissions pass.">Open Folder · Tauri Required</Button>
                    <Button variant="ghost" disabled title="Launching slicers with file arguments requires the later Tauri shell permissions pass.">Launch Slicer · Tauri Required</Button>
                    <Button variant="ghost" disabled title="Launching Blender with file arguments requires the later Tauri shell permissions pass.">Launch Blender · Tauri Required</Button>
                  </div>
                    <div className="mt-3 rounded-xl border border-sky-300/15 bg-sky-400/10 p-3 text-xs leading-5 text-slate-300">
                      Browser mode can link files and copy references. Native opening of STLs, folders, Blender, and slicers will be enabled later through the Tauri shell/file-permission pass.
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
        Concept Specs are the product intelligence layer: image reference, measurements, listing content, design notes, and associated STL.
      </div>

      <div className="space-y-4">
        {state.productConcepts.length === 0 ? (
          <Empty text="No concept specs yet." />
        ) : (
          state.productConcepts.map((concept) => (
            <div key={concept.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{concept.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{concept.imageName || "No image path"}</div>
                </div>
                <Button variant="danger" onClick={() => state.removeConcept(concept.id)}>Remove Concept</Button>
              </div>

              <div className="mb-4 grid gap-4 xl:grid-cols-[260px,1fr]">
                <ProductImagePanel product={state.selectedProduct} imageSrc={concept.imagePath || concept.imageName || state.selectedProduct?.conceptImagePath || ""} label="Concept Art" />
                <div className="rounded-2xl border border-white/10 bg-[#111722] p-4 text-sm text-slate-400">
                  Use Concept Specs for measurements, listing content, visual identity, variant notes, and STL association. This is the product intelligence layer.
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Concept Title">
                  <Input value={concept.title} onChange={(e) => state.updateConcept(concept.id, { title: e.target.value })} />
                </Field>
                <Field label="Image Name">
                  <Input value={concept.imageName} onChange={(e) => state.updateConcept(concept.id, { imageName: e.target.value })} placeholder="product-front.png" />
                </Field>
                <Field label="Concept Image Path">
                  <Input value={concept.imagePath || ""} onChange={(e) => state.updateConcept(concept.id, { imagePath: e.target.value })} placeholder="C:\ForgekeeperLibrary\Concepts\Product\concept-art\front.png" />
                </Field>
                <Field label="Measurement Image Path">
                  <Input value={concept.measurementImagePath || ""} onChange={(e) => state.updateConcept(concept.id, { measurementImagePath: e.target.value })} placeholder="C:\ForgekeeperLibrary\Concepts\Product\measurements\dims.png" />
                </Field>
                <Field label="Reference Folder">
                  <Input value={concept.referenceFolderPath || ""} onChange={(e) => state.updateConcept(concept.id, { referenceFolderPath: e.target.value })} placeholder="C:\ForgekeeperLibrary\Concepts\Product\reference" />
                </Field>
                <Field label="Measurements">
                  <Textarea value={concept.measurements} onChange={(e) => state.updateConcept(concept.id, { measurements: e.target.value })} placeholder="Width, height, depth, tolerances, insert sizes..." className="min-h-[100px] w-full" />
                </Field>
                <Field label="Product Details / Listing Content">
                  <Textarea value={concept.description} onChange={(e) => state.updateConcept(concept.id, { description: e.target.value })} placeholder="Customer-facing description, features, design intent..." className="min-h-[100px] w-full" />
                </Field>
                <Field label="Primary Associated STL" className="lg:col-span-2">
                  <Select value={concept.linkedStlId || ""} onChange={(e) => state.updateConcept(concept.id, { linkedStlId: e.target.value || undefined, linkedStlIds: e.target.value ? Array.from(new Set([...(concept.linkedStlIds || []), e.target.value])) : concept.linkedStlIds })}>
                    <option value="">No linked STL</option>
                    {state.productStls.map((stl) => (
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
  const product = state.selectedProduct;
  if (!product) return null;

  const unusedRealms = realmOptions.filter((realm) => !state.productVariants.some((variant) => variant.realm === realm));

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

      {state.productVariants.length === 0 ? (
        <Empty text="No variant records yet. Add a realm variant to connect alternate art, STL notes, and pricing adjustments." />
      ) : (
        <div className="space-y-4">
          {state.productVariants.map((variant) => (
            <VariantCard key={variant.id} state={state} variant={variant} />
          ))}
        </div>
      )}
    </Card>
  );
}

function VariantCard({ state, variant }: { state: ForgekeeperState; variant: ProductVariant }) {
  const product = state.products.find((item) => item.id === variant.productId);
  const basePrice = product?.targetPrice ?? 0;
  const finalPrice = basePrice + variant.priceModifier;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <ProductThumb src={state.getVariantDisplayImage(variant)} alt={variant.name} className="h-16 w-16 shrink-0" />
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
        <ProductImagePanel product={product} imageSrc={state.getVariantDisplayImage(variant)} label={`${variant.realm} Preview`} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Variant Name">
            <Input value={variant.name} onChange={(e) => state.updateVariant(variant.id, { name: e.target.value })} />
          </Field>
          <Field label="Realm">
            <Select value={variant.realm} onChange={(e) => state.updateVariant(variant.id, { realm: e.target.value as RealmVariant })}>
              {realmOptions.map((realm) => <option key={realm} value={realm}>{realm}</option>)}
            </Select>
          </Field>
          <Field label="Product Image Path">
            <Input value={variant.productImagePath} onChange={(e) => state.updateVariant(variant.id, { productImagePath: e.target.value })} placeholder="/assets/products/variant.png" />
          </Field>
          <Field label="Concept Image Path">
            <Input value={variant.conceptImagePath} onChange={(e) => state.updateVariant(variant.id, { conceptImagePath: e.target.value })} placeholder="/assets/concepts/variant-concept.png" />
          </Field>
          <Field label="Associated STL">
            <Select value={variant.stlId || ""} onChange={(e) => state.updateVariant(variant.id, { stlId: e.target.value || undefined })}>
              <option value="">No STL selected</option>
              {state.productStls.map((stl) => <option key={stl.id} value={stl.id}>{stl.name} · {stl.version}</option>)}
            </Select>
          </Field>
          <Field label="Associated Concept">
            <Select value={variant.conceptId || ""} onChange={(e) => state.updateVariant(variant.id, { conceptId: e.target.value || undefined })}>
              <option value="">No concept selected</option>
              {state.productConcepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.title}</option>)}
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

function ProductOrdersPanel({ state }: { state: ForgekeeperState }) {
  return (
    <Card
      title="Orders for Selected Product"
      right={
        <div className="flex flex-wrap gap-2">
          <Input
            value={state.newOrderCustomer}
            onChange={(e) => state.setNewOrderCustomer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") state.addOrder();
            }}
            placeholder="Customer name"
            className="w-56"
          />
          <Button onClick={state.addOrder}>Add Order</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {state.productOrders.length === 0 ? (
          <Empty text="No orders for this product yet." />
        ) : (
          state.productOrders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{order.customer}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {order.orderType} · {order.depositStatus} · Quoted {money(order.quotedPrice)} · Cost {money(state.getCostBreakdownForOrder(order).total)} · Suggested {money(state.getCostBreakdownForOrder(order).suggestedPrice)}
                  </div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(order.paid ? "Paid" : order.status)}`}>{order.paid ? "Paid" : order.status}</span>
              </div>

              <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs leading-5 text-slate-300">
                Commission foundation: customer info, order type, deposit requirement, and request source are now tracked here. Production should not begin until the deposit status is ready.
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Field label="Order Type">
                  <Select value={order.orderType} onChange={(e) => state.updateOrder(order.id, { orderType: e.target.value as OrderType })}>
                    <option value="Catalog Order">Catalog Order</option>
                    <option value="Custom Request">Custom Request</option>
                  </Select>
                </Field>
                <Field label="Request Source">
                  <Select value={order.requestSource} onChange={(e) => state.updateOrder(order.id, { requestSource: e.target.value as any })}>
                    <option value="Admin">Admin</option>
                    <option value="Customer Catalog">Customer Catalog</option>
                    <option value="Event">Event</option>
                    <option value="Manual">Manual</option>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={order.status} onChange={(e) => state.updateOrder(order.id, { status: e.target.value as OrderStatus })}>
                    <option value="Inquiry">Inquiry</option>
                    <option value="Estimate">Estimate</option>
                    <option value="Awaiting Deposit">Awaiting Deposit</option>
                    <option value="Queued">Queued</option>
                    <option value="Production">Production</option>
                    <option value="Finishing">Finishing</option>
                    <option value="Completed">Completed</option>
                    <option value="Voided">Voided</option>
                    <option value="Printing">Printing</option>
                    <option value="Packed">Packed</option>
                    <option value="Shipped">Shipped</option>
                  </Select>
                </Field>
                <Field label="Deposit Status">
                  <Select value={order.depositStatus} onChange={(e) => state.updateOrder(order.id, { depositStatus: e.target.value as DepositStatus, depositPaid: e.target.value === "Deposit Received" || e.target.value === "Paid in Full" })}>
                    <option value="Not Requested">Not Requested</option>
                    <option value="Awaiting Deposit">Awaiting Deposit</option>
                    <option value="Deposit Received">Deposit Received</option>
                    <option value="Paid in Full">Paid in Full</option>
                    <option value="Waived">Waived</option>
                    <option value="Refunded">Refunded</option>
                  </Select>
                </Field>
                <Field label="Customer Contact">
                  <Input value={order.contact} onChange={(e) => state.updateOrder(order.id, { contact: e.target.value })} placeholder="Preferred contact" />
                </Field>
                <Field label="Customer Email">
                  <Input value={order.customerEmail || ""} onChange={(e) => state.updateOrder(order.id, { customerEmail: e.target.value })} placeholder="customer@email.com" />
                </Field>
                <Field label="Customer Phone">
                  <Input value={order.customerPhone || ""} onChange={(e) => state.updateOrder(order.id, { customerPhone: e.target.value })} placeholder="Phone number" />
                </Field>
                <Field label="Deposit Amount">
                  <Input type="number" min={0} step="0.01" value={order.depositAmount} onChange={(e) => state.updateOrder(order.id, { depositAmount: Number(e.target.value), depositRequired: Number(e.target.value) > 0 })} />
                </Field>
                <Field label="Printer">
                  <Select value={order.printerId || ""} onChange={(e) => state.updateOrder(order.id, { printerId: e.target.value || undefined })}>
                    <option value="">Unassigned printer</option>
                    {state.printers.map((printer) => (
                      <option key={printer.id} value={printer.id}>{printer.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Filament">
                  <Select value={order.filamentId || ""} onChange={(e) => state.updateOrder(order.id, { filamentId: e.target.value || undefined })}>
                    <option value="">No filament selected</option>
                    {state.filament.map((item) => (
                      <option key={item.id} value={item.id}>{item.colorName} · {item.material}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quoted Price">
                  <Input type="number" min={0} step="0.01" value={order.quotedPrice} onChange={(e) => state.updateOrder(order.id, { quotedPrice: Number(e.target.value) })} />
                </Field>
                <Field label="Quantity">
                  <Input type="number" min={1} value={order.quantity} onChange={(e) => state.updateOrder(order.id, { quantity: Number(e.target.value) })} />
                </Field>
                <Field label="Grams / Unit">
                  <Input type="number" min={0} value={order.materialGrams ?? state.selectedProduct?.estimatedFilamentGrams ?? 0} onChange={(e) => state.updateOrder(order.id, { materialGrams: Number(e.target.value) })} />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => state.updateOrder(order.id, { quotedPrice: Number(state.getCostBreakdownForOrder(order).suggestedPrice.toFixed(2)) })}>Use Suggested Price</Button>
                <Button variant="ghost" onClick={() => state.updateOrder(order.id, { depositPaid: !order.depositPaid })}>{order.depositPaid ? "Mark Deposit Pending" : "Mark Deposit Received"}</Button>
                <Button variant="ghost" onClick={() => state.updateOrder(order.id, { paid: !order.paid })}>{order.paid ? "Mark Unpaid" : "Mark Paid"}</Button>
                <Button variant="danger" onClick={() => state.removeOrder(order.id)}>Remove Order</Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}


function ProductThumb({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
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

function ProductImagePanel({ product, imageSrc, label = "Product Image" }: { product?: Product; imageSrc?: string; label?: string }) {
  return (
    <div className="space-y-3">
      <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {imageSrc ? (
          <img src={imageSrc} alt={product?.name || label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.18em] text-slate-600">No Image</div>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <div className="mt-1 truncate text-sm text-slate-300">{product?.name || "Unassigned"}</div>
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
