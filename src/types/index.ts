export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number | null;
  created_at?: string | null;
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
  stock_quantity: number;
  low_stock_threshold: number | null;
  is_available: boolean | null;
  is_featured: boolean | null;
  tags: string[] | null;
  specifications: unknown | null;
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
  url: string;
  alt_text: string | null;
  sort_order: number | null;
  created_at?: string | null;
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
  sort_order: number | null;
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
  email_marketing: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Address {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  label: string | null;
  is_default: boolean | null;
  created_at: string | null;
}

export interface Order {
  id: string;
  user_id: string | null;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: unknown;
  subtotal: number;
  shipping_cost: number | null;
  discount: number | null;
  total: number;
  status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  tracking_number: string | null;
  admin_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_info: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  sort_order: number | null;
  is_visible: boolean | null;
  created_at?: string | null;
}

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified: boolean | null;
  is_approved: boolean | null;
  created_at: string | null;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  is_active: boolean | null;
  created_at: string | null;
}

export interface FeedbackMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  order_ref: string | null;
  status: string | null;
  created_at: string | null;
}