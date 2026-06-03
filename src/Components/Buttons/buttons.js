const BUTTON_VARIANTS = Object.freeze({
  neutral: 'epos-btn-neutral',
  primary: 'epos-btn-primary',
  secondary: 'epos-btn-secondary',
  accent: 'epos-btn-accent',
  info: 'epos-btn-info',
  success: 'epos-btn-success',
  warning: 'epos-btn-warning',
  error: 'epos-btn-error'
});

function getButtonClass(variant = 'primary', extraClass = '') {
  const variantClass = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  return ['epos-btn', variantClass, extraClass].filter(Boolean).join(' ');
}

function createButton({ label, variant = 'primary', type = 'button', disabled = false, className = '', onClick } = {}) {
  const button = document.createElement('button');
  button.type = type;
  button.className = getButtonClass(variant, className);
  button.textContent = label || variant;
  button.disabled = Boolean(disabled);

  if (typeof onClick === 'function') {
    button.addEventListener('click', onClick);
  }

  return button;
}

if (typeof module !== 'undefined') {
  module.exports = {
    BUTTON_VARIANTS,
    createButton,
    getButtonClass
  };
}

if (typeof window !== 'undefined') {
  window.EposButtons = {
    BUTTON_VARIANTS,
    createButton,
    getButtonClass
  };
}
