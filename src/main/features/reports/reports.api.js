(function ReportsApiModule() {
  'use strict';

  const api = () => window.posApi.reports;

  window.ReportsApi = {
    overview: (filters) => api().overview(filters || {}),
  };
})();
