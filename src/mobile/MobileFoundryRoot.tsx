import { useState } from 'react';
import CoreFoundry from './CoreFoundry';
import MobileFoundryWorkspace from './MobileFoundryWorkspace';
import { BastionMobileOverlay } from './BastionMobileOverlay';

export default function MobileFoundryRoot() {
  const [legacy,setLegacy]=useState(false);
  if(!legacy)return <CoreFoundry onLegacy={()=>setLegacy(true)}/>;
  return <><MobileFoundryWorkspace/><BastionMobileOverlay/><button className="foundry-legacy-return" onClick={()=>setLegacy(false)}>← Foundry Core</button></>;
}
