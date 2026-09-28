interface PromptTabItem {
  id: string;
  title: string;
  dirty: boolean;
}

interface PromptTabsProps {
  tabs: PromptTabItem[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function PromptTabs({ tabs, activeTabId, onSelectTab, onCloseTab }: PromptTabsProps) {
  return (
    <div className="prompt-tabs" role="tablist" aria-label="Prompt tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`prompt-tab${activeTabId === tab.id ? ' is-active' : ''}`}
          role="tab"
          aria-selected={activeTabId === tab.id}
          onClick={() => onSelectTab(tab.id)}
        >
          <span>{tab.title}{tab.dirty ? ' *' : ''}</span>
          <span
            aria-hidden="true"
            className="tab-close"
            onClick={event => {
              event.stopPropagation();
              onCloseTab(tab.id);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  );
}