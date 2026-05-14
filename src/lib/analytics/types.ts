export const GA_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "openid",
  "email",
  "profile",
] as const;
export const GA_READONLY_SCOPE = GA_OAUTH_SCOPES.join(" ");
export const GA_OAUTH_STATE_COOKIE = "ga_oauth_state";
export const GA_PENDING_TOKEN_COOKIE = "ga_pending_token";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

export type GoogleAnalyticsProperty = {
  property_id: string;
  property_name: string;
  measurement_id?: string | null;
};

export type PendingAnalyticsToken = {
  access_token: string;
  refresh_token?: string;
  scopes: string[];
  google_account_email: string;
  expires_at: string;
};
