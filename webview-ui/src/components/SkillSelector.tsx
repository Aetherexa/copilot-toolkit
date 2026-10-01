import { SkillSummary } from '../types';

interface SkillSelectorProps {
  skills: SkillSummary[];
  selectedSkillIds: string[];
  recommendationText: string;
  onChange: (skillIds: string[]) => void;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isRecommended(skill: SkillSummary, recommendationText: string): boolean {
  const haystack = normalize(recommendationText);
  const candidates = [
    skill.id,
    skill.name,
    ...skill.name.split(/[-_\s]+/),
  ].map(normalize).filter(part => part.length >= 4);

  return candidates.some(candidate => haystack.includes(candidate));
}

export function SkillSelector({
  skills,
  selectedSkillIds,
  recommendationText,
  onChange,
}: SkillSelectorProps) {
  const selected = new Set(selectedSkillIds);
  const selectedSkills = skills.filter(skill => selected.has(skill.id));

  const toggle = (skillId: string) => {
    if (selected.has(skillId)) {
      onChange(selectedSkillIds.filter(id => id !== skillId));
      return;
    }

    onChange([...selectedSkillIds, skillId]);
  };

  return (
    <div className="skill-selector">
      <div className="skill-selector-heading">
        <span>Skills</span>
        <span className="skill-selector-count">{selectedSkills.length} selected</span>
      </div>

      {selectedSkills.length > 0 && (
        <div className="skill-chip-row">
          {selectedSkills.map(skill => (
            <button
              key={skill.id}
              type="button"
              className="skill-chip"
              onClick={() => toggle(skill.id)}
              title={`Remove ${skill.name}`}
            >
              <span>{skill.name}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <details className="skill-picker">
        <summary>+ Add Skill</summary>
        <div className="skill-picker-menu">
          {skills.length === 0 ? (
            <div className="skill-picker-empty">
              No skill files found. Add Markdown files under <code>.copilot/skills/</code>.
            </div>
          ) : skills.map(skill => {
            const recommended = isRecommended(skill, recommendationText);
            return (
              <button
                key={skill.id}
                type="button"
                className={`skill-option${selected.has(skill.id) ? ' is-selected' : ''}`}
                onClick={() => toggle(skill.id)}
                aria-pressed={selected.has(skill.id)}
              >
                <span className="skill-option-check" aria-hidden="true">{selected.has(skill.id) ? '✓' : ''}</span>
                <span className="skill-option-copy">
                  <strong>{skill.name}</strong>
                  <span>{skill.description || skill.sourcePath}</span>
                </span>
                {recommended && <em className="skill-recommended">Recommended</em>}
              </button>
            );
          })}
        </div>
      </details>

      <div className="field-help">
        Loaded from <code>.copilot/skills/</code>. Project instructions from <code>.github/copilot-instructions.md</code> are applied automatically.
      </div>
    </div>
  );
}
