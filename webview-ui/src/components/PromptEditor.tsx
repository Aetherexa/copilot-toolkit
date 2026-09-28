import { ChangeEvent } from 'react';
import { PromptDefinition } from '../types';

interface PromptEditorProps {
  prompt: PromptDefinition;
  dirty: boolean;
  onChange: (prompt: PromptDefinition) => void;
}

function updateTags(value: string): string[] {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

export function PromptEditor({ prompt, dirty, onChange }: PromptEditorProps) {
  const update = (field: keyof PromptDefinition) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    if (field === 'tags') {
      onChange({ ...prompt, tags: updateTags(value) });
      return;
    }

    onChange({ ...prompt, [field]: value } as PromptDefinition);
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

      <label className="field field-editor">
        <span>Prompt body</span>
        <textarea value={prompt.body} onChange={update('body')} spellCheck={false} />
      </label>
    </section>
  );
}