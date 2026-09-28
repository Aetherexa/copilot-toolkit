import { ContextResolver, ContextType } from '../domain/context';

export class ContextRegistry {
  private readonly resolvers = new Map<ContextType, ContextResolver>();

  register(resolver: ContextResolver): void {
    this.resolvers.set(resolver.type, resolver);
  }

  get(type: ContextType): ContextResolver | undefined {
    return this.resolvers.get(type);
  }

  list(): ContextResolver[] {
    return [...this.resolvers.values()];
  }
}