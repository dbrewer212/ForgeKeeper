import { CatalogView } from "../catalog/CatalogView";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function DesignLibraryView({ state }: { state: ForgekeeperState }) {
  return <CatalogView state={state} />;
}
