import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { PrinterStatus } from "../../types/domain";

const statuses: PrinterStatus[] = ["Available", "Printing", "Maintenance", "Offline"];

export function PrintersView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="space-y-6">
      <Card title="Add Printer" right={<span className="text-xs text-slate-500">Machine Roster</span>}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
          <Input
            autoFocus={state.quickAction === "newPrinter"}
            value={state.newPrinterName}
            onChange={(e) => state.setNewPrinterName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") state.addPrinter(); }}
            placeholder="Printer name, example: Neptune 4 Max"
          />
          <Button onClick={state.addPrinter}>Add Printer</Button>
        </div>
      </Card>

      <Card title="Printers" right={<Button variant="ghost" onClick={state.exportPrintersCsv}>Export CSV</Button>}>
        <div className="grid gap-4 xl:grid-cols-2">
          {state.printers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">No printers added yet.</div>
          ) : state.printers.map((printer) => (
            <div key={printer.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{printer.name}</div>
                  <div className="mt-1 text-sm text-slate-400">{printer.model || "No model set"} · {printer.buildVolume || "No volume set"} · {printer.watts}W</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(printer.status)}`}>{printer.status}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Input value={printer.name} onChange={(e) => state.updatePrinter(printer.id, { name: e.target.value })} placeholder="Printer name" />
                <Input value={printer.model} onChange={(e) => state.updatePrinter(printer.id, { model: e.target.value })} placeholder="Model" />
                <Input value={printer.buildVolume} onChange={(e) => state.updatePrinter(printer.id, { buildVolume: e.target.value })} placeholder="Build volume" />
                <Input type="number" value={printer.watts} onChange={(e) => state.updatePrinter(printer.id, { watts: Number(e.target.value) })} placeholder="Watts while printing" />
                <Select value={printer.status} onChange={(e) => state.updatePrinter(printer.id, { status: e.target.value as PrinterStatus })}>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
                <Input value={printer.activeJob} onChange={(e) => state.updatePrinter(printer.id, { activeJob: e.target.value })} placeholder="Active job" className="md:col-span-2" />
                <Textarea value={printer.notes} onChange={(e) => state.updatePrinter(printer.id, { notes: e.target.value })} placeholder="Printer notes" className="min-h-[72px] md:col-span-2" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => state.addMaintenance(printer.id)}>Add Maintenance Log</Button>
                <Button variant="danger" onClick={() => state.removePrinter(printer.id)}>Remove Printer</Button>
              </div>

              <div className="mt-4 space-y-2">
                {state.maintenance.filter((m) => m.printerId === printer.id).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/10 bg-[#111722] p-3 text-sm text-slate-300">
                    <div className="grid gap-2 md:grid-cols-[1fr,150px,auto]">
                      <Input value={entry.title} onChange={(e) => state.updateMaintenance(entry.id, { title: e.target.value })} placeholder="Maintenance title" />
                      <Input value={entry.performedOn} onChange={(e) => state.updateMaintenance(entry.id, { performedOn: e.target.value })} placeholder="Date" />
                      <Button variant="danger" className="h-10" onClick={() => state.removeMaintenance(entry.id)}>Remove</Button>
                    </div>
                    <Textarea value={entry.notes} onChange={(e) => state.updateMaintenance(entry.id, { notes: e.target.value })} placeholder="Maintenance notes" className="mt-2 min-h-[60px] w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
