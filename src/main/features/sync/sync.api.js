(function SyncApiModule() {
  'use strict';

  const api = () => window.posApi?.sync;

  function unavailable(featureName) {
    return {
      ok: false,
      message: `${featureName} is unavailable until Sync workflow certification is complete.`,
    };
  }

  async function status() {
    return api().status();
  }

  async function queue() {
    return api().queue();
  }

  window.SyncApi = {
    queue,
    status,
    unavailable,
  };
})();
