import { ResolvedContext } from '../domain/context';
import { PromptDefinition } from '../domain/prompt';
import { SkillContentProvider } from '../domain/skill';

export class PromptAssembler {
  constructor(private readonly skillProvider?: SkillContentProvider) {}

  assemble(prompt: PromptDefinition, context: ResolvedContext[]): string {
    const sections: string[] = [];
    const projectInstructions = this.skillProvider?.loadProjectInstructions();
    if (projectInstructions?.content.trim()) {
      sections.push('# Project Instructions');
      sections.push(projectInstructions.content.trim());
    }

    const selectedSkills = this.skillProvider?.resolve(prompt.skillIds ?? []) ?? [];
    if (selectedSkills.length > 0) {
      sections.push('# Skills');
      for (const skill of selectedSkills) {
        sections.push(`## ${skill.name}`);
        sections.push(skill.content.trim());
      }
    }

    sections.push('# Task');
    sections.push(prompt.body.trim());

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
