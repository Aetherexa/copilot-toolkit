import { ChangeEvent } from 'react';
import { PromptDefinition, SkillSummary } from '../types';

interface PromptEditorProps {
  prompt: PromptDefinition;
  skills: SkillSummary[];
  dirty: boolean;
  onChange: (prompt: PromptDefinition) => void;
}

function updateTags(value: string): string[] {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

export function PromptEditor({ prompt, skills, dirty, onChange }: PromptEditorProps) {
  const update = (field: keyof PromptDefinition) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    if (field === 'tags') {
      onChange({ ...prompt, tags: updateTags(value) });
      return;
    }

    onChange({ ...prompt, [field]: value } as PromptDefinition);
  };

  const updateSkills = (event: ChangeEvent<HTMLSelectElement>) => {
    const skillIds = [...event.target.selectedOptions].map(option => option.value);
    onChange({ ...prompt, skillIds });
  };

  return (
    <section className="editor-panel">
      <div className="editor-header">
        <div>
          <h1>{prompt.name}</h1>
          <p>{dirty ? 'Unsaved changes' : 'Saved prompt definition'}</p>
        </div>
      </div>

      <div className="editor-form-grid">
        <label className="field">
          <span>Name</span>
          <input value={prompt.name} onChange={update('name')} />
        </label>
        <label className="field">
          <span>Category</span>
          <input value={prompt.category} onChange={update('category')} />
        </label>
      </div>

      <label className="field">
        <span>Description</span>
        <input value={prompt.description ?? ''} onChange={update('description')} />
      </label>

      <label className="field">
        <span>Tags</span>
        <input value={prompt.tags.join(', ')} onChange={update('tags')} placeholder="react, review, performance" />
      </label>

      <label className="field">
        <span>Skills</span>
        <select
          multiple
          value={prompt.skillIds ?? []}
          onChange={updateSkills}
          size={Math.min(Math.max(skills.length, 3), 6)}
          aria-describedby="prompt-skills-help"
        >
          {skills.map(skill => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </select>
        <small id="prompt-skills-help" className="field-help">
          {skills.length > 0
            ? 'Select one or more reusable skills from .copilot/skills/. Ctrl/Cmd-click to select multiple skills.'
            : 'No .copilot/skills/*.md files were found in this workspace.'}
          {' '}Project instructions from .github/copilot-instructions.md are applied automatically.
        </small>
      </label>

      <label className="field field-editor">
        <span>Prompt body</span>
        <textarea value={prompt.body} onChange={update('body')} spellCheck={false} />
      </label>
    </section>
  );
}
