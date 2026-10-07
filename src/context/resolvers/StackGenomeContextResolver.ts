import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { TokenEstimator } from '../../services/TokenEstimator';

export type StackGenomeProfile = 'compact' | 'standard' | 'detailed';

interface StackGenomeApi {
  apiVersion: string;
  getAIContext(profile?: StackGenomeProfile): Promise<unknown>;
}

export type StackGenomeApiProvider = () => Promise<StackGenomeApi | undefined>;

const COMPACT_BUDGET_THRESHOLD = 1200;
const DETAILED_BUDGET_THRESHOLD = 3200;
const DEFAULT_BUDGET = 1800;

export function selectStackGenomeProfile(binding: ContextBinding): StackGenomeProfile {
  const requested = binding.options?.stackGenomeProfile ?? 'auto';
  if (requested !== 'auto') {
    return requested;
  }

  const budget = binding.options?.totalBudgetTokens ?? DEFAULT_BUDGET;
  if (budget <= COMPACT_BUDGET_THRESHOLD) {
    return 'compact';
  }
  if (budget >= DETAILED_BUDGET_THRESHOLD) {
    return 'detailed';
  }
  return 'standard';
}

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

      const requestedProfile = binding.options?.stackGenomeProfile ?? 'auto';
      const profile = selectStackGenomeProfile(binding);
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
          stackGenomeProfileMode: requestedProfile === 'auto' ? 'auto' : 'explicit',
          stackGenomeApiVersion: api.apiVersion,
        },
      };
    } catch {
      return undefined;
    }
  }
}
