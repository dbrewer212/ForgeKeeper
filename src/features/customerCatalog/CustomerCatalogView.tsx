import { useMemo, useState, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { money } from "../../lib/format";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { OrderType, Product, ProductPillar } from "../../types/domain";

const visibleStates = ["Available", "Commission Available", "Preorder"];
const pillars: Array<"All" | ProductPillar> = ["All", "Foundry", "Relics", "ForgeTech", "Reforged"];
const minimumDeposit = 25;
const companyEmailPlaceholder = "orders@fenrirforgeworks.com";

export function CustomerCatalogView({ state }: { state: ForgekeeperState }) {
  const [activePillar, setActivePillar] = useState<"All" | ProductPillar>("All");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("Catalog Order");
  const [customer, setCustomer] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [contact, setContact] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const visibleProducts = useMemo(() => {
    return state.products.filter((product) => {
      const customerVisible = visibleStates.includes(product.visibility);
      const pillarVisible = activePillar === "All" || product.tier === activePillar;
      return customerVisible && pillarVisible;
    });
  }, [activePillar, state.products]);

  const selectedProduct =
    visibleProducts.find((product) => product.id === selectedProductId) ?? visibleProducts[0];

  const trimmedCustomer = customer.trim();
  const trimmedEmail = customerEmail.trim();
  const trimmedPhone = customerPhone.trim();
  const trimmedContact = contact.trim();
  const trimmedNotes = notes.trim();
  const validQuantity = Number.isFinite(quantity) && quantity >= 1;
  const hasContactMethod = trimmedEmail.length > 0 || trimmedPhone.length > 0;
  const needsProduct = orderType === "Catalog Order";
  const hasProduct = !needsProduct || Boolean(selectedProduct?.id);
  const needsNotes = orderType === "Custom Request";

  const missingFields = [
    !trimmedCustomer ? "customer name" : "",
    !hasContactMethod ? "email or phone" : "",
    !trimmedContact ? "preferred contact / event notes" : "",
    !validQuantity ? "quantity" : "",
    !hasProduct ? "design / product reference" : "",
    needsNotes && !trimmedNotes ? "custom request notes" : "",
  ].filter(Boolean);

  const canSubmit = missingFields.length === 0 && (visibleProducts.length > 0 || orderType === "Custom Request");

  function submitRequest() {
    if (!canSubmit) {
      window.alert(`Please add the required information: ${missingFields.join(", ")}.`);
      return;
    }

    const productLabel = selectedProduct?.name ?? "Custom request to be reviewed";
    const depositTotal = minimumDeposit * quantity;
    const confirmation = [
      "Confirm Fenrir Forgeworks request:",
      "",
      `Request type: ${orderType}`,
      `Design / Product: ${productLabel}`,
      `Customer: ${trimmedCustomer}`,
      `Email: ${trimmedEmail || "Not provided"}`,
      `Phone: ${trimmedPhone || "Not provided"}`,
      `Preferred contact / notes: ${trimmedContact}`,
      `Quantity: ${quantity}`,
      `Minimum deposit due: ${money(depositTotal)}`,
      "",
      "Deposit must be finalized with Fenrir Forgeworks or an authorized representative before production begins.",
      "This submission records the request only and does not collect payment automatically.",
      "",
      "Submit this request to the Admin Orders queue?",
    ].join("\n");

    if (!window.confirm(confirmation)) return;

    state.createCustomerCatalogRequest({
      productId: orderType === "Custom Request" ? selectedProduct?.id : selectedProduct?.id,
      customer: trimmedCustomer,
      customerEmail: trimmedEmail,
      customerPhone: trimmedPhone,
      contact: trimmedContact,
      orderType,
      quantity,
      notes: trimmedNotes,
    });

    window.alert(
      `Request submitted. Minimum deposit due: ${money(depositTotal)}. Please finalize deposit with Fenrir Forgeworks before production begins.`
    );

    setCustomer("");
    setCustomerEmail("");
    setCustomerPhone("");
    setContact("");
    setQuantity(1);
    setNotes("");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),420px]">
      <div className="space-y-6">
        <Card title="Customer Catalog">
          <div className="rounded-2xl border border-amber-300/15 bg-amber-400/10 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-200">
              Browse the Forge
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-50">
              Fenrir Forgeworks Catalog Mode
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              This view is the customer-facing side of ForgeKeeper. Customers can browse visible designs,
              request catalog work, or submit custom commission requests. Requests enter the Admin Orders
              queue as inquiries and require a deposit before production begins.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {pillars.map((pillar) => {
              const active = activePillar === pillar;
              return (
                <button
                  key={pillar}
                  type="button"
                  onClick={() => setActivePillar(pillar)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-amber-300/35 bg-amber-400/15 text-amber-100"
                      : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-amber-300/20 hover:bg-white/[0.065]"
                  }`}
                >
                  {pillar}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {visibleProducts.length === 0 ? (
            <Card title="No Visible Products">
              <p className="text-sm leading-6 text-slate-400">
                No products are currently marked Available, Commission Available, or Preorder for this pillar.
              </p>
            </Card>
          ) : (
            visibleProducts.map((product) => (
              <ProductCatalogCard
                key={product.id}
                product={product}
                imageSrc={state.getProductDisplayImage(product)}
                selected={selectedProduct?.id === product.id}
                onSelect={() => {
                  setSelectedProductId(product.id);
                  setOrderType(product.visibility === "Commission Available" ? "Custom Request" : "Catalog Order");
                }}
              />
            ))
          )}
        </div>
      </div>

      <Card title="Request Work">
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 p-4 text-sm leading-6 text-slate-300">
            Minimum deposit starts at {money(minimumDeposit)} per requested item. This records the request only;
            payment must be finalized with Fenrir Forgeworks or an authorized representative before production begins.
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-xs leading-5 text-slate-400">
            Future communications email placeholder: <span className="text-slate-200">{companyEmailPlaceholder}</span>
          </div>

          <Field label="Request Type" required>
            <Select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
              <option value="Catalog Order">Catalog Order</option>
              <option value="Custom Request">Custom Request</option>
            </Select>
          </Field>

          <Field label="Design / Product Reference" required={orderType === "Catalog Order"}>
            <Select
              value={selectedProduct?.id ?? ""}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={visibleProducts.length === 0}
            >
              {visibleProducts.length === 0 ? <option value="">No visible products</option> : null}
              {visibleProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.visibility}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Customer Name" required>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" />
          </Field>

          <Field label="Email or Phone" required>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@email.com" />
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
            </div>
          </Field>

          <Field label="Preferred Contact / Event Notes" required>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Text preferred, event pickup, etc." />
          </Field>

          <Field label="Quantity" required>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </Field>

          <Field label="Request Notes" required={orderType === "Custom Request"}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Variant, color, finish, custom idea, deadline, or special request details"
            />
          </Field>

          <div className="rounded-2xl border border-amber-300/15 bg-amber-400/10 p-4 text-sm leading-6 text-slate-300">
            Deposit preview: <span className="font-bold text-amber-100">{money(minimumDeposit * quantity)}</span>
          </div>

          {missingFields.length > 0 ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
              Required before submission: {missingFields.join(", ")}.
            </div>
          ) : null}

          <Button className="w-full" onClick={submitRequest} disabled={!canSubmit}>
            Review and Submit Request
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ProductCatalogCard({
  product,
  imageSrc,
  selected,
  onSelect,
}: {
  product: Product;
  imageSrc?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`overflow-hidden rounded-3xl border text-left transition ${
        selected
          ? "border-amber-300/40 bg-amber-400/10 shadow-lg shadow-amber-950/25"
          : "border-white/10 bg-[#0d131c] hover:border-amber-300/20 hover:bg-white/[0.055]"
      }`}
    >
      <div className="aspect-[16/10] bg-black/30">
        {imageSrc ? (
          <img src={imageSrc} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.22em] text-slate-600">
            No Image
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">
            {product.tier}
          </span>
          <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-100">
            {product.visibility}
          </span>
        </div>

        <h3 className="mt-4 text-xl font-black tracking-tight text-slate-50">{product.name}</h3>
        <p className="mt-2 text-sm text-slate-400">{product.collection}</p>
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-300">
          {product.notes || "Design details, finish notes, and customer-facing story can be added from the Admin Catalog."}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
          <MiniMetric label="Price" value={product.targetPrice ? money(product.targetPrice) : "Quote"} />
          <MiniMetric label="Stock" value={product.available} />
          <MiniMetric label="Realms" value={product.supportedRealmVariants.length} />
        </div>
      </div>
    </button>
  );
}

function Field({ label, children, required = false }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label} {required ? <span className="text-amber-300">*</span> : null}
      </div>
      {children}
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2 py-2">
      <div className="font-semibold text-slate-100">{value}</div>
      <div className="mt-1 uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
