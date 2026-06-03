(function registerBillingComponents(globalScope) {
  const components = {
    shell: 'epos-billing-shell',
    topbar: 'epos-billing-topbar',
    products: 'epos-billing-products',
    checkout: 'epos-billing-checkout',
    panel: 'epos-billing-panel',
    productCard: 'epos-billing-product-card',
    action: 'epos-billing-action'
  };

  function getClass(name) {
    return components[name] || '';
  }

  globalScope.EposBilling = {
    components,
    getClass
  };
})(window);
