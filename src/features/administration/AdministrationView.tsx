import { FoundryLinkPanel } from "./FoundryLinkPanel";
import { SettingsView } from "../settings/SettingsView";
import { RecoveryAuditView } from "../recovery/RecoveryAuditView";
import { isFoundryMobileRuntime } from "../../platform/runtime";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function AdministrationView({ state }: { state: ForgekeeperState }) {
  const mobile = isFoundryMobileRuntime();
  return (
    <div className="space-y-8">
      {!mobile ? <FoundryLinkPanel state={state} /> : null}
      <SettingsView state={state} />
      <RecoveryAuditView state={state} />
    </div>
  );
}
