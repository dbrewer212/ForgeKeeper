import { OrdersView } from "../orders/OrdersView";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function ProductionView({ state }: { state: ForgekeeperState }) {
  return <OrdersView state={state} />;
}
