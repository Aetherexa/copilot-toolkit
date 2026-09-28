import { AIProvider } from '../domain/provider';
import { RegisteredProvider } from './RegisteredProvider';

export class ProviderRegistry {
  private readonly providers = new Map<string, RegisteredProvider>();

  register(provider: RegisteredProvider): void {
    this.providers.set(provider.definition.id, provider);
  }

  get(providerId: string): RegisteredProvider | undefined {
    return this.providers.get(providerId);
  }

  async refresh(): Promise<AIProvider[]> {
    const definitions = await Promise.all([...this.providers.values()].map(provider => provider.refreshDefinition()));
    return definitions.filter(provider => provider.enabled);
  }

  list(): AIProvider[] {
    return [...this.providers.values()].map(provider => provider.definition).filter(provider => provider.enabled);
  }

  getModel(providerId: string, modelId?: string) {
    const provider = this.get(providerId);
    if (!provider) {
      return undefined;
    }

    return provider.definition.models.find(model => model.id === modelId) ?? provider.definition.models[0];
  }
}