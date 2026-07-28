import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { ReleaseStatus } from "../../types/domain";

const statuses: ReleaseStatus[] = ["Planning", "Scheduled", "Live"];

export function ReleasesView({ state }: { state: ForgekeeperState }) {
  return (
    <Card title="Releases" right={<div className="flex gap-2"><Input value={state.newReleaseName} onChange={(e) => state.setNewReleaseName(e.target.value)} placeholder="Release name" className="w-44" /><Button onClick={state.addRelease}>Add</Button></div>}>
      <div className="grid gap-4 xl:grid-cols-2">
        {state.releases.map((release) => (
          <div key={release.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="flex items-center justify-between gap-3"><div className="font-semibold">{release.name}</div><span className={`rounded-full border px-3 py-1 text-xs ${pillClass(release.status)}`}>{release.status}</span></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input value={release.name} onChange={(event) => state.updateRelease(release.id, { name: event.target.value })} placeholder="Release name" />
              <Input value={release.wave} onChange={(event) => state.updateRelease(release.id, { wave: event.target.value })} placeholder="Wave" />
              <Input type="date" value={release.targetDate} onChange={(event) => state.updateRelease(release.id, { targetDate: event.target.value })} />
              <Select value={release.status} onChange={(event) => state.updateRelease(release.id, { status: event.target.value as ReleaseStatus })}>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
              <Textarea value={release.notes} onChange={(event) => state.updateRelease(release.id, { notes: event.target.value })} placeholder="Release notes" className="min-h-[64px] md:col-span-2" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{release.designProjectIds.map((designProjectId) => { const design = state.designProjects.find((p) => p.id === designProjectId); return <div key={designProjectId} className="rounded-xl border border-white/10 bg-[#111722] px-3 py-3"><div className="font-medium">{design?.name || designProjectId}</div><div className="mt-2"><Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeDesignFromRelease(release.id, designProjectId)}>Remove</Button></div></div>; })}</div>
            <div className="mt-3"><Select defaultValue="" onChange={(e) => e.target.value && state.addDesignToRelease(release.id, e.target.value)}><option value="">Add design</option>{state.designProjects.filter((p) => !release.designProjectIds.includes(p.id)).map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}</Select></div>
            <Button variant="danger" className="mt-3" onClick={() => state.removeRelease(release.id)}>Remove Release</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
