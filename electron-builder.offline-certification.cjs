const packageJson = require('./package.json');

const offlineResources = packageJson.build.extraResources.map((entry) => {
  if (entry.to === 'postgres') {
    return {
      ...entry,
      filter: ['*.json', '*.md', '*.txt', '*.zip'],
    };
  }
  if (entry.to === 'prerequisites') {
    return {
      ...entry,
      filter: ['**/manifest.json', '**/*.md', '**/*.txt', '**/vc_redist.x64.exe'],
    };
  }
  if (entry.to === 'release-governance') {
    return {
      ...entry,
      filter: ['*.json', '*.md', '*.txt', '!*.exe', '!*.pfx', '!*.p12', '!*.pem', '!*.key'],
    };
  }
  return entry;
});

module.exports = {
  ...packageJson.build,
  artifactName: '${productName} Setup ${version} offline-certification-unsigned.${ext}',
  extraResources: offlineResources,
  nsis: {
    ...packageJson.build.nsis,
    oneClick: true,
    allowElevation: false,
    allowToChangeInstallationDirectory: false,
  },
};
