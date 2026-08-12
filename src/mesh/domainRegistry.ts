import type { FoundryDomainServices } from "./domainServices";

export class FoundryDomainRegistry {
  private services?: FoundryDomainServices;

  register(services: FoundryDomainServices): void {
    this.services = services;
  }

  clear(): void {
    this.services = undefined;
  }

  isRegistered(): boolean {
    return Boolean(this.services);
  }

  get(): FoundryDomainServices {
    if (!this.services) {
      throw new Error("Foundry domain services have not been registered.");
    }
    return this.services;
  }
}
