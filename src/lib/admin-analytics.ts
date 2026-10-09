/** Reporting windows use UTC consistently, independent of the deployment timezone. */
export function reportingWindow(period: string, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  if (period === "all") return { start: null, end };
  if (period === "last_month") {
    end.setUTCDate(1);
    end.setUTCHours(0, 0, 0, 0);
    start.setTime(end.getTime());
    start.setUTCMonth(start.getUTCMonth() - 1);
  } else if (period === "this_month") {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCDate(start.getUTCDate() - ({ "7d": 7, "30d": 30, "90d": 90 }[period] ?? 30));
  }
  return { start, end };
}

export interface AnalyticsOrder {
  id: string;
  total: number;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;
  user_id: string | null;
  customer_email: string | null;
  order_items: {
    product_name: string;
    quantity: number;
    line_total: number;
    products: { cost_price: number | null } | null;
  }[];
}

export function summarizeOrders(orders: AnalyticsOrder[], visits: number, productName?: string) {
  const paid = orders.filter((o) => o.payment_status === "paid" && o.status !== "cancelled");
  const filtered = paid.filter(
    (o) =>
      !productName ||
      productName === "all" ||
      o.order_items.some((i) => i.product_name === productName),
  );
  const days = new Map<string, { date: string; revenue: number; orders: number }>();
  const statuses = new Map<string, { status: string; revenue: number; orders: number }>();
  const products = new Map<string, { product_name: string; quantity: number; revenue: number }>();
  const customers = new Map<string, number>();
  let revenue = 0,
    totalCost = 0,
    costTrackedRevenue = 0,
    itemsMissingCost = 0;
  for (const order of filtered) {
    const amount = Number(order.total);
    revenue += amount;
    const date = (order.created_at ?? "").slice(0, 10);
    const day = days.get(date) ?? { date, revenue: 0, orders: 0 };
    day.revenue += amount;
    day.orders++;
    days.set(date, day);
    const status = order.status ?? "ordered";
    const row = statuses.get(status) ?? { status, revenue: 0, orders: 0 };
    row.revenue += amount;
    row.orders++;
    statuses.set(status, row);
    const customer = order.user_id || order.customer_email?.trim().toLowerCase() || order.id;
    customers.set(customer, (customers.get(customer) ?? 0) + 1);
    for (const item of order.order_items) {
      if (productName && productName !== "all" && item.product_name !== productName) continue;
      const product = products.get(item.product_name) ?? {
        product_name: item.product_name,
        quantity: 0,
        revenue: 0,
      };
      product.quantity += Number(item.quantity);
      product.revenue += Number(item.line_total);
      products.set(item.product_name, product);
      if (item.products?.cost_price == null) itemsMissingCost++;
      else {
        totalCost += Number(item.products.cost_price) * Number(item.quantity);
        costTrackedRevenue += Number(item.line_total);
      }
    }
  }
  const returningCustomers = [...customers.values()].filter((n) => n > 1).length;
  return {
    totalRevenue: revenue,
    totalOrders: filtered.length,
    averageOrderValue: filtered.length ? revenue / filtered.length : 0,
    productNames: [
      ...new Set(paid.flatMap((o) => o.order_items.map((i) => i.product_name))),
    ].sort(),
    salesByDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    revenueByStatus: [...statuses.values()],
    bestProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    returningCustomers,
    totalCustomers: customers.size,
    returningCustomerRate: customers.size ? returningCustomers / customers.size : 0,
    totalVisits: visits,
    conversionRate: visits ? filtered.length / visits : null,
    profit: costTrackedRevenue - totalCost,
    profitRevenueBasis: costTrackedRevenue,
    itemsMissingCost,
  };
}
