/* ──────────────────────────────────────────────
 * Tipos compartidos – Fase 1 TBB
 * ────────────────────────────────────────────── */

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  type: "food" | "pharmacy" | "veterinary";
  status: "draft" | "active" | "paused";
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
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  ui?: {
    badgeText?: string;
    icon?: string;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type Product = {
  id: string
  tenantId: string
  categoryId?: string

  name: string
  slug: string
  description: string

  price: number
  imageUrl?: string

  tags: string[]

  isActive: boolean
  isFeatured?: boolean

  modifierGroupIds?: string[]

  ui?: {
    likesCount?: number
    rating?: number
    badge?: string
  }

  commerce?: {
    allowAddons?: boolean
    stockMode?: "unlimited" | "limited"
  }

  createdAt?: unknown
  updatedAt?: unknown
}

export interface CartItem {
  product: Product;
  quantity: number;
}
