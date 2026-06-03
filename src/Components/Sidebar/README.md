# Sidebar

Reusable sidebar component variants inspired by the provided reference.

## Variants

- Expanded dark sidebar
- Compact rail sidebar
- Expanded light sidebar

## HTML/CSS Usage

Import is already included in `src/renderer/styles/input.css`.

```html
<aside class="epos-sidebar epos-sidebar-light">
  ...
</aside>
```

## JavaScript Usage

```html
<script src="src/Components/Sidebar/sidebar.js"></script>
<script>
  const sidebar = window.EposSidebar.createSidebar({
    variant: 'dark',
    compact: false,
    user: { name: 'Jackson D.', role: 'Manager' }
  });

  document.body.appendChild(sidebar);
</script>
```

Preview file:

```text
src/Components/Sidebar/index.html
```
