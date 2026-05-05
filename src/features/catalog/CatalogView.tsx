import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { money } from "../../lib/format";
import { inventoryState, pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { OrderStatus, Product, ProductLine, ProductStatus, ProductTab, ProductTier, ProductVariant, RealmVariant } from "../../types/domain";

const productTabs: ProductTab[] = ["overview", "stls", "concepts", "variants", "orders"];
const realmOptions: RealmVariant[] = ["Midgard", "Alfheim", "Svartalfheim", "Vanaheim", "Asgard", "Jotunheim", "Muspelheim", "Niflheim", "Helheim"];

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
                    <div className="mt-1 truncate text-xs text-slate-500">{product.collection}</div>
                    {variantCount ? (
                      <div className="mt-2 text-[11px] text-amber-300">{variantCount} active variant records</div>
                    ) : product.supportedRealmVariants.length ? (
                      <div className="mt-2 text-[11px] text-amber-300">{product.supportedRealmVariants.length} planned realms</div>
                    ) : null}
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${pillClass(product.status)}`}>{product.status}</span>
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
        right={<span className={`rounded-full border px-3 py-1 text-xs ${pillClass(product.status)}`}>{product.status}</span>}
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
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(inventory)}`}>{inventory}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{product.tier}</span>
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
              <AssetLine label="Primary STL" value={primaryStl?.name || "None assigned"} />
              <AssetLine label="STL File" value={primaryStl?.fileName || "No STL file path"} />
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
          <Field label="Tier">
            <Select value={product.tier} onChange={(e) => state.updateProduct(product.id, { tier: e.target.value as ProductTier })}>
              <option value="Hero">Hero</option>
              <option value="Utility">Utility</option>
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
          <Field label="Product Image Path" className="md:col-span-2">
            <Input value={product.productImagePath} onChange={(e) => state.updateProduct(product.id, { productImagePath: e.target.value })} placeholder="/assets/products/product-image.png" />
          </Field>
          <Field label="Concept Image Path" className="md:col-span-2">
            <Input value={product.conceptImagePath} onChange={(e) => state.updateProduct(product.id, { conceptImagePath: e.target.value })} placeholder="/assets/concepts/product-concept.png" />
          </Field>
        </div>
      </Card>

      <Card title="Production Snapshot">
        <div className="space-y-3">
          <StatusRow label="Inventory" value={`${product.available}`} status={inventoryState(product.available, product.reorderPoint)} />
          <StatusRow label="STL Files" value={`${state.productStls.length}`} />
          <StatusRow label="Concept Specs" value={`${state.productConcepts.length}`} />
          <StatusRow label="Realm Variants" value={`${state.productVariants.length}`} />
          <StatusRow label="Linked Orders" value={`${state.productOrders.length}`} />
        </div>
      </Card>

      <Card title="Realm Variant Planning">
        <div className="mb-3 text-sm text-slate-400">
          Hero products can carry realm variants. Utility products can stay blank unless you want variants later.
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
        Use this section for printable files. For now, enter file names or local paths manually. Later this becomes the upload/link system for your STL library.
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
                  <div className="mt-1 text-xs text-slate-500">{stl.fileName || "No file path"} · {stl.version || "No version"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stl.isPrimary ? <span className="rounded-full border border-amber-500/25 bg-amber-500/15 px-3 py-1 text-xs text-amber-100">Primary</span> : null}
                  <Button variant="ghost" onClick={() => state.markPrimaryStl(stl.id)}>Mark Primary</Button>
                  <Button variant="danger" onClick={() => state.removeStl(stl.id)}>Remove</Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Display Name">
                  <Input value={stl.name} onChange={(e) => state.updateStl(stl.id, { name: e.target.value })} />
                </Field>
                <Field label="File Name / Path">
                  <Input value={stl.fileName} onChange={(e) => state.updateStl(stl.id, { fileName: e.target.value })} placeholder="assets/stls/product-v1.stl" />
                </Field>
                <Field label="Version">
                  <Input value={stl.version} onChange={(e) => state.updateStl(stl.id, { version: e.target.value })} placeholder="v1" />
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
                <ProductImagePanel product={state.selectedProduct} imageSrc={concept.imageName || state.selectedProduct?.conceptImagePath || ""} label="Concept Art" />
                <div className="rounded-2xl border border-white/10 bg-[#111722] p-4 text-sm text-slate-400">
                  Use Concept Specs for measurements, listing content, visual identity, variant notes, and STL association. This is the product intelligence layer.
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Concept Title">
                  <Input value={concept.title} onChange={(e) => state.updateConcept(concept.id, { title: e.target.value })} />
                </Field>
                <Field label="Image File / Path">
                  <Input value={concept.imageName} onChange={(e) => state.updateConcept(concept.id, { imageName: e.target.value })} placeholder="assets/concepts/product-front.png" />
                </Field>
                <Field label="Measurements">
                  <Textarea value={concept.measurements} onChange={(e) => state.updateConcept(concept.id, { measurements: e.target.value })} placeholder="Width, height, depth, tolerances, insert sizes..." className="min-h-[100px] w-full" />
                </Field>
                <Field label="Product Details / Listing Content">
                  <Textarea value={concept.description} onChange={(e) => state.updateConcept(concept.id, { description: e.target.value })} placeholder="Customer-facing description, features, design intent..." className="min-h-[100px] w-full" />
                </Field>
                <Field label="Associated STL" className="lg:col-span-2">
                  <Select value={concept.linkedStlId || ""} onChange={(e) => state.updateConcept(concept.id, { linkedStlId: e.target.value || undefined })}>
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
                  <div className="mt-1 text-sm text-slate-400">Quoted {money(order.quotedPrice)} · Cost {money(state.getCostBreakdownForOrder(order).total)} · Suggested {money(state.getCostBreakdownForOrder(order).suggestedPrice)}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(order.paid ? "Paid" : order.status)}`}>{order.paid ? "Paid" : order.status}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Field label="Status">
                  <Select value={order.status} onChange={(e) => state.updateOrder(order.id, { status: e.target.value as OrderStatus })}>
                    <option value="Queued">Queued</option>
                    <option value="Printing">Printing</option>
                    <option value="Finishing">Finishing</option>
                    <option value="Packed">Packed</option>
                    <option value="Shipped">Shipped</option>
                  </Select>
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
