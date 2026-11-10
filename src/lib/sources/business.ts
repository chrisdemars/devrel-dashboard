// Business-impact sources that usually need access from other teams.
// Each is a placeholder that lists the config it will need, so the dashboard
// can show "access needed" cards and the gap is visible.

import type { Source } from './core';

export const crm: Source = {
  id: 'crm',
  name: 'CRM: DevRel-touched leads and deals',
  category: 'business',
  placeholder:
    'No CRM access yet. Ask for read access (HubSpot or Salesforce) or a monthly report of leads and deals with a DevRel touchpoint. Until then, log deals in data/manual/sales-flagged-deals.csv.',
  env: [
    { name: 'CRM_PROVIDER', help: 'hubspot or salesforce' },
    { name: 'HUBSPOT_ACCESS_TOKEN', help: 'HubSpot private app token with read-only CRM scopes' },
    { name: 'SALESFORCE_INSTANCE_URL', help: 'e.g. https://yourcompany.my.salesforce.com' },
    { name: 'SALESFORCE_ACCESS_TOKEN', help: 'Read-only API token' },
  ],
};

export const cliTelemetry: Source = {
  id: 'cli-telemetry',
  name: 'CLI usage: activation and active users',
  category: 'business',
  placeholder: 'Waiting on product: opt-in telemetry for first use (activation) and weekly active users.',
  env: [
    { name: 'CLI_TELEMETRY_API_URL', help: 'Endpoint or export the product team provides' },
    { name: 'CLI_TELEMETRY_API_TOKEN', help: 'Read-only token' },
  ],
};

export const portal: Source = {
  id: 'portal',
  name: 'Portal sign-ups and "How did you hear about us?"',
  category: 'business',
  placeholder: 'Waiting on product: portal sign-up analytics and the "How did you hear about us?" field.',
  env: [
    { name: 'PORTAL_ANALYTICS_API_URL', help: 'Endpoint or export the product team provides' },
    { name: 'PORTAL_ANALYTICS_API_TOKEN', help: 'Read-only token' },
  ],
};

const business: Source[] = [crm, cliTelemetry, portal];
export default business;
