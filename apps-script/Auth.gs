function authorizeNeon() {
  const requiredScopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.external_request'
  ];

  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, requiredScopes);

  const info = ScriptApp.getAuthorizationInfo(
    ScriptApp.AuthMode.FULL,
    requiredScopes
  );

  const result = {
    status: String(info.getAuthorizationStatus()),
    authorizedScopes: info.getAuthorizedScopes(),
    authorizationUrl: info.getAuthorizationUrl() || ''
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function resetAndAuthorizeNeon() {
  ScriptApp.invalidateAuth();
  return authorizeNeon();
}
