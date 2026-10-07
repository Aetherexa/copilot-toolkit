import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { TokenEstimator } from '../../services/TokenEstimator';

export type StackGenomeProfile = 'compact' | 'standard' | 'detailed';

interface StackGenomeApi {
  apiVersion: string;
  getAIContext(profile?: StackGenomeProfile): Promise<unknown>;
}

export type StackGenomeApiProvider = () => Promise<StackGenomeApi | undefined>;

export class StackGenomeContextResolver implements ContextResolver {
  readonly type = 'stackGenome' as const;

  constructor(
    private readonly tokenEstimator: TokenEstimator,
    private readonly apiProvider: StackGenomeApiProvider,
  ) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext | undefined> {
    try {
      const api = await this.apiProvider();
      if (!api || api.apiVersion !== '1.0') {
        return undefined;
      }

      const profile = binding.options?.stackGenomeProfile ?? 'standard';
      const context = await api.getAIContext(profile);
      if (!context) {
        return undefined;
      }

      const content = JSON.stringify(context, null, 2);
      if (!content || content === '{}') {
        return undefined;
      }

      const tokenEstimate = this.tokenEstimator.estimate(content);
      return {
        type: this.type,
        title: 'StackGenome Project Intelligence',
        content,
        tokenEstimate,
        originalTokenEstimate: tokenEstimate,
        truncated: false,
        relevanceScore: 78,
        reason: 'Installed project ecosystem, package capabilities, versions, and implementation guidance from StackGenome.',
        source: { label: 'StackGenome · aetherexa.stackgenome' },
        metadata: {
          stackGenomeProfile: profile,
          stackGenomeApiVersion: api.apiVersion,
        },
      };
    } catch {
      return undefined;
    }
  }
}
