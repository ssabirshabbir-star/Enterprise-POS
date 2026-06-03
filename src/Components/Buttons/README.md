# Buttons

Reusable Enterprise POS button variants matching the shared UI palette.

## Variants

- `neutral`
- `primary`
- `secondary`
- `accent`
- `info`
- `success`
- `warning`
- `error`

## HTML Usage

```html
<button class="epos-btn epos-btn-primary">Primary</button>
<button class="epos-btn epos-btn-success">Success</button>
```

## JavaScript Usage

```js
const button = window.EposButtons.createButton({
  label: 'Save',
  variant: 'success',
  onClick: () => console.log('Saved')
});

document.body.appendChild(button);
```

The component CSS is imported by `src/renderer/styles/input.css`, so it is included in the normal Tailwind build.
