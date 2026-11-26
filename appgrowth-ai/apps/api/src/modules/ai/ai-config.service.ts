import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import type { ProviderSelection } from './ai-client';

/** Resolves which provider/model an agent uses: agent override → platform default. Nothing is hard-coded. */
@Injectable()
export class AiConfigService {
  constructor(private prisma: PrismaService, private crypto: CryptoService) {}

  async select(opts: { agentKey?: string; purpose?: 'text' | 'image' | 'video' }): Promise<ProviderSelection> {
    const purpose = opts.purpose ?? 'text';
    const agent = opts.agentKey ? await this.prisma.aiAgentDefinition.findUnique({ where: { key: opts.agentKey } }) : null;
    const providers = await this.prisma.aiProvider.findMany({ where: { enabled: true }, include: { models: { where: { enabled: true, purpose } } } });
    let p = agent?.providerKey ? providers.find((x) => x.key === agent.providerKey) : undefined;
    if (!p) p = providers.filter((x) => x.models.length).sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0];
    if (!p) throw new AppError(purpose === 'text' ? 'No AI provider is enabled. A platform administrator must configure one.' : `No ${purpose} generation provider is enabled.`, 503, 'ai_not_configured');
    const model = (agent?.modelId && p.models.find((m) => m.modelId === agent.modelId)) || p.models[0];
    return {
      provider: p.key, model: model?.modelId ?? null, apiKey: p.apiKeyEnc ? this.crypto.decrypt(p.apiKeyEnc) : null,
      baseUrl: p.key === 'ollama' ? p.baseUrl || null : null,
      prices: { input_per_mtok: Number(model?.inputCostPerMTok ?? 0), output_per_mtok: Number(model?.outputCostPerMTok ?? 0), per_unit: Number(model?.unitCost ?? 0) },
    };
  }
}
