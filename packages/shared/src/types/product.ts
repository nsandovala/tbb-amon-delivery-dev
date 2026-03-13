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