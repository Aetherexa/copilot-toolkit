export interface SkillSummary {
  id: string;
  name: string;
  description?: string;
  sourcePath: string;
}

export interface SkillDefinition extends SkillSummary {
  content: string;
}

export interface ProjectInstructions {
  sourcePath: string;
  content: string;
}

export interface SkillContentProvider {
  list(): SkillSummary[];
  resolve(skillIds: string[]): SkillDefinition[];
  loadProjectInstructions(): ProjectInstructions | undefined;
}
