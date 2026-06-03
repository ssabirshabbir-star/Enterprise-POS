const DEFAULT_NAV_ITEMS = Object.freeze([
  { id: 'dashboard', label: 'Dashboard', icon: '⌂', action: '≛' },
  { id: 'tasks', label: 'Tasks', icon: '▣', badge: '32', active: true, plus: true },
  { id: 'notifications', label: 'Notifications', icon: '☂', badge: '4' },
  { id: 'messages', label: 'Messages', icon: '●', action: '⊕' },
  { id: 'inbox', label: 'Inbox', icon: '✉', badge: '9' }
]);

const DEFAULT_TEAM = Object.freeze([
  { name: 'Peter Taylor', statusColor: '#20e854', action: '▣', actionColor: '#f472b6' },
  { name: 'Luvleen Lawrence', statusColor: '#facc15', action: '▭', actionColor: '#c084fc' },
  { name: 'Su Hua', statusColor: '#fb7185', action: '▣', actionColor: '#4ade80' }
]);

function sidebarItemTemplate(item) {
  return `
    <button type="button" class="epos-sidebar-item ${item.active ? 'epos-sidebar-item-active' : ''}" data-sidebar-item="${item.id}">
      <span class="epos-sidebar-icon">${item.icon || '•'}</span>
      <span class="epos-sidebar-label">${item.label}</span>
      ${item.badge ? `<span class="epos-sidebar-badge">${item.badge}</span>` : '<span></span>'}
      ${item.plus ? '<span class="epos-sidebar-plus">+</span>' : item.action ? `<span class="epos-sidebar-person-action">${item.action}</span>` : '<span></span>'}
    </button>
  `;
}

function teamTemplate(team) {
  return team.map((person) => `
    <div class="epos-sidebar-person">
      <span class="epos-sidebar-person-avatar" style="--status-color:${person.statusColor || '#22c55e'}"></span>
      <span class="epos-sidebar-person-name">${person.name}</span>
      <span class="epos-sidebar-person-action" style="--action-color:${person.actionColor || '#f472b6'}">${person.action || '▣'}</span>
    </div>
  `).join('');
}

function createSidebar({
  variant = 'dark',
  compact = false,
  user = { name: 'Jackson D.', role: 'Manager' },
  navItems = DEFAULT_NAV_ITEMS,
  team = DEFAULT_TEAM
} = {}) {
  const sidebar = document.createElement('aside');
  sidebar.className = [
    'epos-sidebar',
    variant === 'light' ? 'epos-sidebar-light' : '',
    compact ? 'epos-sidebar-rail' : ''
  ].filter(Boolean).join(' ');

  sidebar.innerHTML = `
    <div class="epos-sidebar-window">
      <span class="epos-sidebar-dot epos-sidebar-dot-red"></span>
      <span class="epos-sidebar-dot epos-sidebar-dot-yellow"></span>
      <span class="epos-sidebar-dot epos-sidebar-dot-green"></span>
    </div>
    <div class="epos-sidebar-profile">
      <span class="epos-sidebar-avatar"></span>
      <div>
        <p class="epos-sidebar-name">${user.name || 'User'}</p>
        <p class="epos-sidebar-role">${user.role || 'Member'}</p>
      </div>
      <button type="button" class="epos-sidebar-collapse" aria-label="Collapse sidebar">←</button>
    </div>
    <label class="epos-sidebar-search">
      <span>⌕</span>
      <input type="search" placeholder="Search" />
    </label>
    <nav class="epos-sidebar-nav">
      ${navItems.map(sidebarItemTemplate).join('')}
    </nav>
    <div class="epos-sidebar-section-title">
      <span>Teams</span>
      <span class="epos-sidebar-view-all">View all &nbsp; ◉</span>
    </div>
    <div class="epos-sidebar-team">
      ${teamTemplate(team)}
    </div>
    <div class="epos-sidebar-upload">
      <div>
        <strong>↥</strong>
        <span>Drag-n-Drop to Upload</span>
      </div>
    </div>
    <div class="epos-sidebar-theme">
      <button type="button" aria-pressed="${variant !== 'light'}">☀ <span>Light</span></button>
      <button type="button" aria-pressed="${variant === 'light'}">◖ <span>Dark</span></button>
    </div>
  `;

  return sidebar;
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_NAV_ITEMS,
    DEFAULT_TEAM,
    createSidebar
  };
}

if (typeof window !== 'undefined') {
  window.EposSidebar = {
    DEFAULT_NAV_ITEMS,
    DEFAULT_TEAM,
    createSidebar
  };
}
