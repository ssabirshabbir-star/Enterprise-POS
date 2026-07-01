/**
 * ui-primitives.js - Enterprise POS reusable UI primitive foundation.
 *
 * Renderer-only component helpers. No business logic, no IPC, no module state.
 * Produces semantic markup/classes only. Styling belongs to approved CSS/tokens.
 */
(function EposUIPrimitives() {
  'use strict';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function attrsToString(attrs) {
    return Object.entries(attrs || {})
      .filter(([, value]) => value !== false && value !== null && value !== undefined)
      .map(([key, value]) => (value === true ? esc(key) : `${esc(key)}="${esc(value)}"`))
      .join(' ');
  }

  function classNames(...values) {
    return values
      .flatMap((value) => String(value || '').split(/\s+/))
      .filter(Boolean)
      .join(' ');
  }

  function variantClass(base, variant) {
    return `${base}--${String(variant || 'neutral')
      .replace(/[^a-z0-9_-]/gi, '')
      .toLowerCase()}`;
  }

  function renderContent(props) {
    if (props?.trustedHtml !== undefined) return String(props.trustedHtml);
    if (props?.children !== undefined) return esc(props.children);
    return esc(props?.label || props?.text || '');
  }

  function renderComponent(tag, props, baseClass) {
    const attrs = { ...(props?.attrs || {}) };
    attrs.class = classNames(
      baseClass,
      props?.variant && variantClass(baseClass, props.variant),
      props?.className
    );
    return `<${tag} ${attrsToString(attrs)}>${renderContent(props)}</${tag}>`;
  }

  function updateElement(el, props) {
    if (!el || !props) return;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.trustedHtml !== undefined) el.innerHTML = String(props.trustedHtml);
    if (props.disabled !== undefined) el.disabled = Boolean(props.disabled);
    if (props.hidden !== undefined) el.classList.toggle('hidden', Boolean(props.hidden));
    if (props.className !== undefined) el.className = props.className;
    Object.entries(props.attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) el.removeAttribute(key);
      else el.setAttribute(key, value === true ? '' : String(value));
    });
  }

  function destroyElement(el) {
    if (el) el.innerHTML = '';
  }

  const Button = {
    render(state = {}) {
      return renderComponent(
        'button',
        {
          ...state,
          attrs: { type: 'button', ...(state.attrs || {}) },
        },
        'epos-ui-button'
      );
    },
    update: updateElement,
    destroy: destroyElement,
  };

  const Input = {
    render(state = {}) {
      const attrs = { class: classNames('epos-ui-input', state.className), ...(state.attrs || {}) };
      return `<input ${attrsToString(attrs)} />`;
    },
    update: updateElement,
    destroy(el) {
      if (el) el.value = '';
    },
  };

  const Table = {
    render(state = {}) {
      const attrs = { class: classNames('epos-ui-table', state.className), ...(state.attrs || {}) };
      return `<table ${attrsToString(attrs)}>${state.trustedHtml || ''}</table>`;
    },
    emptyRow({ columns, message }) {
      return `<tr class="epos-ui-table-empty-row"><td colspan="${Number(columns || 1)}">${esc(message)}</td></tr>`;
    },
    update: updateElement,
    destroy: destroyElement,
  };

  const Modal = {
    render(state = {}) {
      return renderComponent('div', state, 'epos-ui-modal');
    },
    update: updateElement,
    destroy: destroyElement,
  };

  const Dropdown = {
    render(state = {}) {
      const options = (state.options || [])
        .map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`)
        .join('');
      const attrs = {
        class: classNames('epos-ui-dropdown', state.className),
        ...(state.attrs || {}),
      };
      return `<select ${attrsToString(attrs)}>${options}</select>`;
    },
    update: updateElement,
    destroy: destroyElement,
  };

  const Badge = {
    render(state = {}) {
      return renderComponent('span', state, 'epos-ui-badge');
    },
    update: updateElement,
    destroy: destroyElement,
  };

  const Panel = {
    render(state = {}) {
      return renderComponent('div', state, 'epos-ui-panel');
    },
    update: updateElement,
    destroy: destroyElement,
  };

  // Explicitly trusted escape hatch for renderer-owned templates only.
  // Do not pass user or database values unless already escaped at the call site.
  const TrustedHtml = {
    render(value) {
      return String(value ?? '');
    },
  };

  window.EposUI = {
    Button,
    Input,
    Table,
    Modal,
    Dropdown,
    Badge,
    Panel,
    TrustedHtml,
    esc,
  };
})();
