/**
 * feature-gate.js
 *
 * RESPONSIBILITY: Central runtime enforcement for Phase 2 feature activation.
 * No UI rendering, no business logic, no persistence, no console logging.
 */
(function FeatureGateModule() {
  'use strict';

  const STATUS = Object.freeze({
    SAFE: 'safe',
    GUARDED: 'guarded',
    LOCKED: 'locked',
  });
  const CORE_RELEASE_MODE = true;

  const FEATURES = Object.freeze({
    'billing.reprint_receipt': {
      status: STATUS.SAFE,
      message: 'Receipt reprint is available.',
    },
    'billing.export_receipt_pdf': {
      status: STATUS.SAFE,
      message: 'Receipt PDF export is available.',
    },
    'dashboard.sales_chart': {
      status: STATUS.SAFE,
      message: 'Dashboard sales chart is available.',
    },
    'dashboard.payment_methods_chart': {
      status: STATUS.SAFE,
      message: 'Dashboard payment methods chart is available.',
    },
    'dashboard.category_sales_chart': {
      status: STATUS.SAFE,
      message: 'Dashboard category sales chart is available.',
    },
    'dashboard.top_products': {
      status: STATUS.SAFE,
      message: 'Dashboard top products widget is available.',
    },
    'products.catalog_management': {
      status: STATUS.GUARDED,
      message: 'Catalog management requires activation validation before use.',
    },
    'products.print_barcode': {
      status: STATUS.SAFE,
      message: 'Barcode printing is available.',
    },
    'billing.hold_sale': {
      status: STATUS.GUARDED,
      message: 'Held sales require activation validation before use.',
    },
    'billing.held_sales_resume_delete': {
      status: STATUS.GUARDED,
      message: 'Held sale restore/delete requires activation validation before use.',
    },
    'billing.whatsapp_receipt_share': {
      status: STATUS.GUARDED,
      message: 'Receipt WhatsApp sharing requires activation validation before use.',
    },
    'billing.retail_wholesale_mode_toggle': {
      status: STATUS.LOCKED,
      message: 'Wholesale billing mode is planned for a future phase.',
    },
    'customers.delete_inactive_customers': {
      status: STATUS.LOCKED,
      message: 'Deleting inactive customers is planned for a future phase.',
    },
    'customers.whatsapp_customer_message': {
      status: STATUS.GUARDED,
      message: 'Customer WhatsApp messaging requires activation validation before use.',
    },
    'suppliers.whatsapp_supplier_message': {
      status: STATUS.GUARDED,
      message: 'Supplier WhatsApp messaging requires activation validation before use.',
    },
    'billing.split_payment_placeholder': {
      status: STATUS.LOCKED,
      message: 'Split payment is planned for a future phase.',
    },
    'billing.return_placeholder': {
      status: STATUS.LOCKED,
      message: 'Return workflow is planned for a future phase.',
    },
    'billing.exchange_placeholder': {
      status: STATUS.LOCKED,
      message: 'Exchange workflow is planned for a future phase.',
    },
    'billing.sync_placeholder': {
      status: STATUS.LOCKED,
      message: 'POS sync is planned for a future phase.',
    },
    'products.import_products_placeholder': {
      status: STATUS.LOCKED,
      message: 'Product import is planned for a future phase.',
    },
    'products.export_products_placeholder': {
      status: STATUS.LOCKED,
      message: 'Product export is planned for a future phase.',
    },
    'customers.customer_groups_placeholder': {
      status: STATUS.LOCKED,
      message: 'Customer groups are planned for a future phase.',
    },
    'customers.bulk_actions_placeholder': {
      status: STATUS.LOCKED,
      message: 'Bulk customer actions are planned for a future phase.',
    },
    'customers.import_customers_placeholder': {
      status: STATUS.LOCKED,
      message: 'Customer import is planned for a future phase.',
    },
    'customers.export_customers_placeholder': {
      status: STATUS.LOCKED,
      message: 'Customer export is planned for a future phase.',
    },
    'dashboard.export_placeholder': {
      status: STATUS.LOCKED,
      message: 'Dashboard export is planned for a future phase.',
    },
  });

  const ACTIVATION_REASONS = Object.freeze({
    'billing.whatsapp_receipt_share':
      'External receipt sharing only; no database mutation and no core billing-flow dependency.',
    'customers.whatsapp_customer_message':
      'External customer messaging only; no database mutation and no core customer-record mutation.',
    'suppliers.whatsapp_supplier_message':
      'External supplier messaging only; no database mutation and no supplier-record mutation.',
  });

  const validatedFeatures = new Set(Object.keys(ACTIVATION_REASONS));
  const audit = {
    blocked_feature_attempts: [],
    guarded_feature_prompts: [],
    safe_feature_executions: [],
  };

  function stamp(featureId, status) {
    return {
      feature_id: featureId,
      status,
      reason: ACTIVATION_REASONS[featureId] || undefined,
      timestamp: new Date().toISOString(),
    };
  }

  function record(bucket, featureId, status) {
    if (!audit[bucket]) return;
    audit[bucket].push(stamp(featureId, status));
  }

  function check(featureId, options) {
    const entry = FEATURES[featureId];
    if (!entry) {
      record('blocked_feature_attempts', featureId, 'unregistered');
      return {
        ok: false,
        status: 'unregistered',
        message: 'This feature is not registered for activation.',
      };
    }

    if (entry.status === STATUS.SAFE) {
      record('safe_feature_executions', featureId, entry.status);
      return { ok: true, status: entry.status, message: entry.message };
    }

    if (entry.status === STATUS.GUARDED) {
      if (CORE_RELEASE_MODE) {
        record('guarded_feature_prompts', featureId, entry.status);
        return { ok: false, status: entry.status, message: entry.message };
      }
      const validated = Boolean(options?.validated || validatedFeatures.has(featureId));
      if (validated) {
        record('safe_feature_executions', featureId, entry.status);
        return { ok: true, status: entry.status, message: entry.message };
      }
      record('guarded_feature_prompts', featureId, entry.status);
      return { ok: false, status: entry.status, message: entry.message };
    }

    record('blocked_feature_attempts', featureId, entry.status);
    return {
      ok: false,
      status: entry.status,
      message: entry.message,
      visible: !CORE_RELEASE_MODE,
    };
  }

  function allow(featureId, options) {
    return check(featureId, options);
  }

  function setValidation(featureId, enabled) {
    if (!FEATURES[featureId] || FEATURES[featureId].status !== STATUS.GUARDED) return false;
    if (enabled) validatedFeatures.add(featureId);
    else validatedFeatures.delete(featureId);
    return true;
  }

  function getAudit() {
    return {
      blocked_feature_attempts: audit.blocked_feature_attempts.slice(),
      guarded_feature_prompts: audit.guarded_feature_prompts.slice(),
      safe_feature_executions: audit.safe_feature_executions.slice(),
    };
  }

  function getActivationReasons() {
    return { ...ACTIVATION_REASONS };
  }

  window.FeatureGate = Object.freeze({
    check,
    allow,
    setValidation,
    getAudit,
    getActivationReasons,
    isCoreReleaseMode: () => CORE_RELEASE_MODE,
    features: FEATURES,
  });
})();
