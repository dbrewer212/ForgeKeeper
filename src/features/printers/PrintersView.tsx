import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { FilamentMaterial, PrinterConnectionType, PrinterStatus, SlicerKey } from "../../types/domain";

const statuses: PrinterStatus[] = ["Available", "Printing", "Maintenance", "Offline"];
const slicers: Array<{ value: SlicerKey; label: string }> = [
  { value: "orca", label: "OrcaSlicer" },
  { value: "anycubic", label: "Anycubic Slicer Next" },
];
const connectionTypes: PrinterConnectionType[] = ["Anycubic Cloud / LAN", "Moonraker / Fluidd", "Local / USB"];

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

      <Card
        title="Printers"
        right={(
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={state.restoreWorkshopPrinterProfiles}>Restore Workshop Profiles</Button>
            <Button variant="ghost" onClick={state.exportPrintersCsv}>Export CSV</Button>
          </div>
        )}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {state.printers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">No printers added yet.</div>
          ) : state.printers.map((printer) => (
            <div key={printer.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{printer.name}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {[printer.manufacturer, printer.model || "No model set", printer.buildVolume || "No volume set"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(printer.status)}`}>{printer.status}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <ProfilePill>{printer.preferredSlicer === "anycubic" ? "Anycubic Slicer Next" : "OrcaSlicer"}</ProfilePill>
                <ProfilePill>{printer.connectionType}</ProfilePill>
                <ProfilePill>{printer.motionSystem || "Motion not set"}</ProfilePill>
                {printer.maxColorCount > 1 ? <ProfilePill>{printer.includedColorCount} included / {printer.maxColorCount} colors max</ProfilePill> : null}
                {printer.heatedChamber ? <ProfilePill>Heated chamber {printer.maxChamberTemperatureC}°C</ProfilePill> : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Input value={printer.name} onChange={(e) => state.updatePrinter(printer.id, { name: e.target.value })} placeholder="Printer name" />
                <Input value={printer.model} onChange={(e) => state.updatePrinter(printer.id, { model: e.target.value })} placeholder="Model" />
                <Input value={printer.manufacturer} onChange={(e) => state.updatePrinter(printer.id, { manufacturer: e.target.value })} placeholder="Manufacturer" />
                <Select value={printer.status} onChange={(e) => state.updatePrinter(printer.id, { status: e.target.value as PrinterStatus })}>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
                <Input type="number" value={printer.watts} onChange={(e) => state.updatePrinter(printer.id, { watts: Number(e.target.value) })} placeholder="Costing watts estimate" />
                <Input type="number" min={0.1} step={0.1} value={printer.nozzleDiameter} onChange={(e) => state.updatePrinter(printer.id, { nozzleDiameter: Number(e.target.value) })} placeholder="Nozzle diameter (mm)" />
                <Input type="number" min={1} step={1} value={printer.maintenanceIntervalDays} onChange={(e) => state.updatePrinter(printer.id, { maintenanceIntervalDays: Number(e.target.value) })} placeholder="Maintenance interval days" />
                <Select value={printer.preferredSlicer} onChange={(e) => state.updatePrinter(printer.id, { preferredSlicer: e.target.value as SlicerKey })}>
                  {slicers.map((slicer) => <option key={slicer.value} value={slicer.value}>{slicer.label}</option>)}
                </Select>
                <Select value={printer.connectionType} onChange={(e) => state.updatePrinter(printer.id, { connectionType: e.target.value as PrinterConnectionType })}>
                  {connectionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </Select>
                <Input value={printer.connectionEndpoint} onChange={(e) => state.updatePrinter(printer.id, { connectionEndpoint: e.target.value })} placeholder="Connection URL / IP (optional)" className="md:col-span-2" />
                <Textarea value={printer.notes} onChange={(e) => state.updatePrinter(printer.id, { notes: e.target.value })} placeholder="Printer notes" className="min-h-[72px] md:col-span-2" />
              </div>

              <details className="mt-4 rounded-xl border border-white/10 bg-[#111722] p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-200">Machine profile and limits</summary>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <NumberField label="Build X (mm)" value={printer.buildVolumeX} onChange={(value) => state.updatePrinter(printer.id, { buildVolumeX: value, buildVolume: `${value} × ${printer.buildVolumeY} × ${printer.buildVolumeZ} mm` })} />
                  <NumberField label="Build Y (mm)" value={printer.buildVolumeY} onChange={(value) => state.updatePrinter(printer.id, { buildVolumeY: value, buildVolume: `${printer.buildVolumeX} × ${value} × ${printer.buildVolumeZ} mm` })} />
                  <NumberField label="Build Z (mm)" value={printer.buildVolumeZ} onChange={(value) => state.updatePrinter(printer.id, { buildVolumeZ: value, buildVolume: `${printer.buildVolumeX} × ${printer.buildVolumeY} × ${value} mm` })} />
                  <NumberField label="Nozzle max °C" value={printer.maxNozzleTemperatureC} onChange={(value) => state.updatePrinter(printer.id, { maxNozzleTemperatureC: value })} />
                  <NumberField label="Bed max °C" value={printer.maxBedTemperatureC} onChange={(value) => state.updatePrinter(printer.id, { maxBedTemperatureC: value })} />
                  <NumberField label="Chamber max °C" value={printer.maxChamberTemperatureC} onChange={(value) => state.updatePrinter(printer.id, { maxChamberTemperatureC: value })} />
                  <NumberField label="Recommended mm/s" value={printer.recommendedPrintSpeedMmS} onChange={(value) => state.updatePrinter(printer.id, { recommendedPrintSpeedMmS: value })} />
                  <NumberField label="Maximum mm/s" value={printer.maxPrintSpeedMmS} onChange={(value) => state.updatePrinter(printer.id, { maxPrintSpeedMmS: value })} />
                  <NumberField label="Max acceleration mm/s²" value={printer.maxAccelerationMmS2} onChange={(value) => state.updatePrinter(printer.id, { maxAccelerationMmS2: value })} />
                  <NumberField label="Printer rated W" value={printer.ratedPowerWatts} onChange={(value) => state.updatePrinter(printer.id, { ratedPowerWatts: value })} />
                  <NumberField label="Accessory rated W" value={printer.accessoryPowerWatts} onChange={(value) => state.updatePrinter(printer.id, { accessoryPowerWatts: value })} />
                  <NumberField label="Included colors" value={printer.includedColorCount} onChange={(value) => state.updatePrinter(printer.id, { includedColorCount: value })} />
                  <NumberField label="Maximum colors" value={printer.maxColorCount} onChange={(value) => state.updatePrinter(printer.id, { maxColorCount: value })} />
                  <Select value={printer.enclosed ? "yes" : "no"} onChange={(e) => state.updatePrinter(printer.id, { enclosed: e.target.value === "yes" })}>
                    <option value="yes">Enclosed</option>
                    <option value="no">Open frame</option>
                  </Select>
                  <Select value={printer.heatedChamber ? "yes" : "no"} onChange={(e) => state.updatePrinter(printer.id, { heatedChamber: e.target.value === "yes" })}>
                    <option value="yes">Heated chamber</option>
                    <option value="no">No heated chamber</option>
                  </Select>
                  <Select value={printer.filamentDrying ? "yes" : "no"} onChange={(e) => state.updatePrinter(printer.id, { filamentDrying: e.target.value === "yes" })}>
                    <option value="yes">Filament drying</option>
                    <option value="no">No filament drying</option>
                  </Select>
                  <Input value={printer.motionSystem} onChange={(e) => state.updatePrinter(printer.id, { motionSystem: e.target.value })} placeholder="Motion system" />
                  <Input value={printer.extruder} onChange={(e) => state.updatePrinter(printer.id, { extruder: e.target.value })} placeholder="Extruder" />
                  <Input value={printer.firmware} onChange={(e) => state.updatePrinter(printer.id, { firmware: e.target.value })} placeholder="Firmware" />
                  <Input value={printer.levelingSystem} onChange={(e) => state.updatePrinter(printer.id, { levelingSystem: e.target.value })} placeholder="Leveling system" />
                  <Input value={printer.multicolorSystem} onChange={(e) => state.updatePrinter(printer.id, { multicolorSystem: e.target.value })} placeholder="Multicolor system" />
                  <Input value={printer.camera} onChange={(e) => state.updatePrinter(printer.id, { camera: e.target.value })} placeholder="Camera" />
                  <Input value={printer.machineDimensions} onChange={(e) => state.updatePrinter(printer.id, { machineDimensions: e.target.value })} placeholder="Machine dimensions" className="md:col-span-3" />
                  <Input value={printer.nozzleMaterial} onChange={(e) => state.updatePrinter(printer.id, { nozzleMaterial: e.target.value })} placeholder="Nozzle material / notes" className="md:col-span-3" />
                  <Input
                    value={printer.nozzleOptions.join(", ")}
                    onChange={(e) => state.updatePrinter(printer.id, {
                      nozzleOptions: e.target.value.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0),
                    })}
                    placeholder="Nozzle sizes, comma separated"
                    className="md:col-span-3"
                  />
                  <Input
                    value={printer.supportedMaterials.join(", ")}
                    onChange={(e) => state.updatePrinter(printer.id, {
                      supportedMaterials: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) as FilamentMaterial[],
                    })}
                    placeholder="Supported materials, comma separated"
                    className="md:col-span-3"
                  />
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {printer.profileSource || "Custom printer profile"}
                  {printer.profileUpdatedAt ? ` · researched ${printer.profileUpdatedAt}` : ""}
                </div>
              </details>

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

function ProfilePill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">{children}</span>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <Input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
