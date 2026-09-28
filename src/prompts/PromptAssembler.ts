import { ResolvedContext } from '../domain/context';
import { PromptDefinition } from '../domain/prompt';

export class PromptAssembler {
  assemble(prompt: PromptDefinition, context: ResolvedContext[]): string {
    const sections = ['# Task', prompt.body.trim()];
    const includedContext = context.filter(item => item.status !== 'excluded');

    if (includedContext.length > 0) {
      sections.push('# Context');
      for (const item of includedContext) {
        sections.push(`## ${item.title}`);
        sections.push(item.content.trim());
      }
    }

    return sections.join('\n\n').trim();
  }
}