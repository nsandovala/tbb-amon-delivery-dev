export type Category = {
  id: string;
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
};