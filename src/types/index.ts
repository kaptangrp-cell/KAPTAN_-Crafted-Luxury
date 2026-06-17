export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  short_description: string | null;
  full_description: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  is_available: boolean | null;
  is_featured: boolean | null;
  tags: string[] | null;
  specifications: unknown;
  sold_count: number | null;
  average_rating: number | null;
  review_count: number | null;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string | null;
  alt_text: string | null;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_type: string;
  variant_value: string;
  price_modifier: number | null;
  stock_quantity: number | null;
  sku_override: string | null;
  is_available: boolean | null;
  sort_order: number;
}

export interface CartItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  product: Product;
  variant: ProductVariant | null;
  image_url?: string;
}

export interface Profile {
  id: string;
  role: "admin" | "customer";
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  email_marketing: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  sort_order: number;
  is_visible: boolean;
}

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified: boolean;
  is_approved: boolean;
  created_at: string;
}
