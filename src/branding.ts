import raw from "../branding.json";

export type AppBranding = {
  appName: string;
  productName: string;
  displayName: string;
  description: string;
};

export const branding = raw as AppBranding;
