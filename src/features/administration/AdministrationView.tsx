import { FoundryLinkPanel } from "./FoundryLinkPanel";
import { SettingsView } from "../settings/SettingsView";
import { RecoveryAuditView } from "../recovery/RecoveryAuditView";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function AdministrationView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="space-y-8">
      <FoundryLinkPanel state={state} />
      <SettingsView state={state} />
      <RecoveryAuditView state={state} />
    </div>
  );
}
