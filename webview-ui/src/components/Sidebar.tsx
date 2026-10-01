import { PromptCollection, PromptDefinition, Workflow } from '../types';

interface SidebarProps {
  prompts: PromptDefinition[];
  visiblePrompts: PromptDefinition[];
  collections: PromptCollection[];
  workflows: Workflow[];
  activePromptId?: string;
  activeWorkflowId?: string | null;
  activeNav: string;
  searchQuery: string;
  selectedCollectionId: string | null;
  activePromptForCollection?: PromptDefinition | null;
  getCollectionPrompts: (collectionId: string) => PromptDefinition[];
  onSelectPrompt: (prompt: PromptDefinition) => void;
  onSelectNav: (nav: string) => void;
  onSearchChange: (query: string) => void;
  onCreatePrompt: () => void;
  onImport: () => void;
  onCreateWorkflow: () => void;
  onImportWorkflow: () => void;
  onSelectWorkflow: (workflow: Workflow) => void;
  onCreateCollection: () => void;
  onRenameCollection: (collection: PromptCollection) => void;
  onDeleteCollection: (collection: PromptCollection) => void;
  onExportCollection: (collection: PromptCollection) => void;
  onSelectCollection: (collectionId: string | null) => void;
  onAddPromptToCollection: (collection: PromptCollection, prompt: PromptDefinition) => void;
  onRemovePromptFromCollection: (collection: PromptCollection, prompt: PromptDefinition) => void;
}

const navItems = [
  'All Prompts',
  'Favorites',
  'My Prompts',
  'Built-in Actions',
  'Collections',
  'Workflows',
  'Providers',
  'Context Builder',
  'Analytics',
  'Settings',
];

function titleForNav(activeNav: string): string {
  switch (activeNav) {
    case 'Favorites':
      return 'Favorites';
    case 'My Prompts':
      return 'My Prompts';
    case 'Built-in Actions':
      return 'Built-in Actions';
    case 'All Prompts':
      return 'All Prompts';
    default:
      return 'Prompt Library';
  }
}

export function Sidebar({
  prompts,
  visiblePrompts,
  collections,
  workflows,
  activePromptId,
  activeWorkflowId,
  activeNav,
  searchQuery,
  selectedCollectionId,
  activePromptForCollection,
  getCollectionPrompts,
  onSelectPrompt,
  onSelectNav,
  onSearchChange,
  onCreatePrompt,
  onImport,
  onCreateWorkflow,
  onImportWorkflow,
  onSelectWorkflow,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onExportCollection,
  onSelectCollection,
  onAddPromptToCollection,
  onRemovePromptFromCollection,
}: SidebarProps) {
  const promptLibraryNav = ['All Prompts', 'Favorites', 'My Prompts'];
  const utilityNav = ['Providers', 'Context Builder', 'Analytics', 'Settings'];
  const showCreateTools = activeNav === 'Workflows' || promptLibraryNav.includes(activeNav) || activeNav === 'Collections';
  const showSearch = activeNav === 'Workflows' || activeNav === 'Built-in Actions' || promptLibraryNav.includes(activeNav);

  return (
    <aside className="studio-sidebar">
      {showCreateTools && <div className="sidebar-toolbar">
        <button type="button" className="button-secondary sidebar-button" onClick={activeNav === 'Workflows' ? onCreateWorkflow : onCreatePrompt}>
          {activeNav === 'Workflows' ? 'New Workflow' : 'New Prompt'}
        </button>
        <button type="button" className="button-secondary sidebar-button" onClick={activeNav === 'Workflows' ? onImportWorkflow : onImport}>
          Import JSON
        </button>
      </div>}

      {showSearch && <label className="field sidebar-search">
        <span>{activeNav === 'Workflows' ? 'Search Workflows' : 'Search Prompts'}</span>
        <input
          value={searchQuery}
          onChange={event => onSearchChange(event.target.value)}
          placeholder={activeNav === 'Workflows' ? 'Search by name or description' : 'Search by name, tag, category'}
        />
      </label>}

      <div className="sidebar-section">
        <div className="sidebar-title">Studio Navigation</div>
        <nav className="sidebar-nav" aria-label="Studio navigation">
          {navItems.map(item => (
            <button
              key={item}
              type="button"
              className={`sidebar-link${activeNav === item ? ' is-active' : ''}`}
              onClick={() => onSelectNav(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </div>

      {activeNav === 'Workflows' ? (
        <div className="sidebar-section sidebar-library">
          <div className="library-empty">Choose a workflow from the catalog in the main workspace.</div>
        </div>
      ) : activeNav === 'Collections' ? (
        <div className="sidebar-section sidebar-library">
          <div className="sidebar-title sidebar-title-row">
            <span>Collections</span>
            <button type="button" className="ghost-button" onClick={onCreateCollection}>New</button>
          </div>
          <div className="sidebar-list" role="tree" aria-label="Collections">
            {collections.length === 0 && <div className="library-empty">No collections yet.</div>}
            {collections.map(collection => {
              const collectionPrompts = getCollectionPrompts(collection.id);
              return (
                <div key={collection.id} className={`collection-card${selectedCollectionId === collection.id ? ' is-active' : ''}`}>
                  <div className="collection-card-head">
                    <button type="button" className="collection-title-button" onClick={() => onSelectCollection(collection.id)}>
                      {collection.name}
                    </button>
                    <div className="inline-actions">
                      <button type="button" className="ghost-button" onClick={() => onRenameCollection(collection)} title="Rename collection">Rename</button>
                      <button type="button" className="ghost-button" onClick={() => onExportCollection(collection)} title="Export collection">Export</button>
                      <button type="button" className="ghost-button danger-text" onClick={() => onDeleteCollection(collection)} title="Delete collection">Delete</button>
                    </div>
                  </div>
                  <div className="collection-card-body">
                    <div className="collection-meta">{collectionPrompts.length} prompt{collectionPrompts.length === 1 ? '' : 's'}</div>
                    {activePromptForCollection && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => onAddPromptToCollection(collection, activePromptForCollection)}
                      >
                        Add active prompt
                      </button>
                    )}
                    {collectionPrompts.length === 0 && <div className="library-empty">Collection is empty.</div>}
                    {collectionPrompts.map(prompt => (
                      <div key={`${collection.id}-${prompt.id}`} className="collection-item-row">
                        <button
                          type="button"
                          className={`library-item compact${activePromptId === prompt.id ? ' is-active' : ''}`}
                          onClick={() => onSelectPrompt(prompt)}
                        >
                          <span className="library-item-title">{prompt.name}</span>
                          <span className="library-item-meta">{prompt.category}</span>
                        </button>
                        <button
                          type="button"
                          className="ghost-button danger-text"
                          title="Remove from collection"
                          onClick={() => onRemovePromptFromCollection(collection, prompt)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeNav === 'Built-in Actions' ? (
        <div className="sidebar-section sidebar-library">
          <div className="library-empty">Built-in actions are grouped by category in the main workspace.</div>
        </div>
      ) : utilityNav.includes(activeNav) ? null : (
        <div className="sidebar-section sidebar-library">
          <div className="sidebar-title">{titleForNav(activeNav)}</div>
          <div className="sidebar-list" role="list">
            {visiblePrompts.length === 0 && (
              <div className="library-empty">
                {prompts.length === 0 ? 'No prompts available.' : 'No prompts match the current filter.'}
              </div>
            )}
            {visiblePrompts.map(prompt => (
              <button
                key={prompt.id}
                type="button"
                role="listitem"
                className={`library-item${activePromptId === prompt.id ? ' is-active' : ''}`}
                onClick={() => onSelectPrompt(prompt)}
              >
                <span className="library-item-title">{prompt.favorite ? '★ ' : ''}{prompt.name}</span>
                <span className="library-item-meta">{prompt.category}</span>
                <span className="library-item-badge">{prompt.source ?? 'workspace'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}