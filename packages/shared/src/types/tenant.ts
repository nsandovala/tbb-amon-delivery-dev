export type TenantType = "food" | "pharmacy" | "veterinary";
export type TenantStatus = "draft" | "active" | "paused";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  type: TenantType;
  status: TenantStatus;
  country: "CL";
  currency: "CLP";

  branding: {
    logoUrl?: string;
    accentColor: string;
    backgroundColor?: string;
    themeMode: "dark" | "light";
    tone?: "epic" | "clinical" | "friendly" | "premium";
  };

  contact: {
    phone?: string;
    whatsapp?: string;
    instagram?: string;
  };

  location: {
    commune?: string;
    city?: string;
    address?: string;
    geo?: {
      lat: number;
      lng: number;
    };
  };

  capabilities: {
    pickup: boolean;
    delivery: boolean;
    chatAssistant: boolean;
    addons: boolean;
    reviews: boolean;
  };

  createdAt?: unknown;
  updatedAt?: unknown;
};