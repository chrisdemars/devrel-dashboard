// Tier 3 business-impact sources that DevRel doesn't have access to yet.
// Each is a placeholder that lists the config it will need, so the dashboard
// can show "not connected" cards and the gap is visible to leadership.

export const crm = {
  id: 'crm',
  name: 'CRM: DevRel-touched leads and deals',
  category: 'business',
  placeholder: 'No CRM access yet. Ask for read access (HubSpot or Salesforce) or a monthly report of leads and deals with a DevRel touchpoint. Until then, log deals in data/manual/sales-flagged-deals.csv.',
  env: [
    { name: 'CRM_PROVIDER', help: 'hubspot or salesforce' },
    { name: 'HUBSPOT_ACCESS_TOKEN', help: 'HubSpot private app token with read-only CRM scopes' },
    { name: 'SALESFORCE_INSTANCE_URL', help: 'e.g. https://yourcompany.my.salesforce.com' },
    { name: 'SALESFORCE_ACCESS_TOKEN', help: 'Read-only API token' },
  ],
};

export const cliTelemetry = {
  id: 'cli-telemetry',
  name: 'CLI usage: activation and active users',
  category: 'business',
  placeholder: 'Waiting on product: opt-in telemetry for first scan (activation) and weekly active users.',
  env: [
    { name: 'CLI_TELEMETRY_API_URL', help: 'Endpoint or export the product team provides' },
    { name: 'CLI_TELEMETRY_API_TOKEN', help: 'Read-only token' },
  ],
};

export const portal = {
  id: 'portal',
  name: 'Portal sign-ups and "How did you hear about us?"',
  category: 'business',
  placeholder: 'Waiting on product: portal sign-up analytics and the "How did you hear about us?" field.',
  env: [
    { name: 'PORTAL_ANALYTICS_API_URL', help: 'Endpoint or export the product team provides' },
    { name: 'PORTAL_ANALYTICS_API_TOKEN', help: 'Read-only token' },
  ],
};

export default [crm, cliTelemetry, portal];
